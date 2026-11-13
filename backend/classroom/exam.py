"""Exam-mode site lockdown (EDU-4, pbinfo "mod examen" precedent).

While a student sits an OPEN ``is_exam`` teme, most site resources are
unavailable: their session is restricted to the exam's surfaces (the
assignment, its quiz/problems, their own submissions, notifications and
account basics). Teachers/admins are never locked; the exam ends with the
assignment window (soft-expiry semantics — once CLOSED the site reopens).
"""

import re

from django.utils.translation import gettext as _

#: API prefixes that stay reachable during an exam (account + classroom +
#: own submissions + notifications). Everything else under /api/ closes.
EXAM_ALLOWED_PREFIXES = (
    "/api/v1/classroom/",
    "/api/v1/submissions/",
    "/api/v1/notifications/",
    "/api/v1/users/me",
    "/api/v1/auth/",
    "/api/v1/token",
)

#: Regexes for path-shape rules the prefixes cannot express.
#: Problem sub-resources (editorial/hints/custom test) close entirely;
#: problem detail/detail pages stay open ONLY for the exam's own problems.
_PROBLEM_RE = re.compile(r"^/api/v1/problems/(?P<id>\d+)/")
_EDITORIAL_RE = re.compile(r"^/api/v1/problems/\d+/(editorial|hints)/")


def active_exam(user):
    """The OPEN is_exam assignment the user is sitting, or None.

    One exam at a time is assumed — a student in two overlapping exam teme
    gets the union of both problem allowlists via ``exam_problem_ids``.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return None
    if (
        user.is_staff
        or user.is_superuser
        or getattr(user, "role", "")
        in (
            "TEACHER",
            "ADMIN",
        )
    ):
        return None
    from django.utils import timezone

    from .models import Assignment

    now = timezone.now()
    return (
        Assignment.objects.filter(
            classroom__memberships__student=user,
            is_exam=True,
            available_from__lte=now,
            due_at__gt=now,
        )
        .order_by("due_at")
        .first()
    )


def exam_problem_ids(user) -> set[int]:
    """Problem ids visible to the sitting student (union over open exams)."""
    from django.utils import timezone

    from .models import Assignment

    now = timezone.now()
    return set(
        Assignment.objects.filter(
            classroom__memberships__student=user,
            is_exam=True,
            available_from__lte=now,
            due_at__gt=now,
        ).values_list("assignment_problems__problem_id", flat=True)
    ) - {None}


def exam_blocked_path(path: str, allowed_problem_ids: set[int]) -> str | None:
    """Why *path* is blocked during an exam (None = allowed).

    ``path`` is the request path (query string excluded). The caller has
    already established an active exam; this is the pure policy core so
    tests can sweep the matrix without HTTP.
    """
    if not path.startswith("/api/"):
        return None  # admin/accounts/media never lock
    if path.startswith(EXAM_ALLOWED_PREFIXES):
        # Sub-resources of problems close even though /problems/ is not in
        # the blanket allowlist — handled below via regexes.
        return None
    editorial = _EDITORIAL_RE.match(path)
    if editorial:
        return _("Editorials and hints are unavailable during exams.")
    problem = _PROBLEM_RE.match(path)
    if problem:
        problem_id = int(problem.group("id"))
        if problem_id in allowed_problem_ids:
            return None
        return _("Only the exam's problems are available during the exam.")
    if path.startswith("/api/v1/problems/"):
        # Catalog browsing closes (list/create/etc.).
        return _("Problem browsing is unavailable during exams.")
    return _("This resource is unavailable while you sit an exam.")


def _resolve_api_user(request):
    """The caller of an /api/ request: Django session user, else the JWT
    (header token or wc_access cookie) DRF would authenticate later.

    The middleware runs before DRF's authentication layer, so API-only
    sessions (SPA cookie-JWT) appear anonymous to session auth — resolve
    them here once instead of duplicating the lockdown inside every view.
    """
    if not request.path.startswith("/api/"):
        return None
    forced = getattr(request, "_force_auth_user", None)
    if forced is not None and forced.is_authenticated:
        return forced
    user = getattr(request, "user", None)
    if user is not None and user.is_authenticated:
        return user
    from users.authentication import WCCookieJWTAuthentication

    try:
        result = WCCookieJWTAuthentication().authenticate(request)
    except Exception:  # noqa: BLE001 - any auth failure == anonymous here
        return None
    return result[0] if result else None


class ExamModeMiddleware:
    """Request gate (EDU-4). Mounted last in MIDDLEWARE.

    Only touches authenticated non-staff users sitting an OPEN exam; every
    other request passes through untouched. Blocked requests get a JSON
    403 carrying the reason and the exam assignment id so the SPA can
    render its lockdown banner.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = _resolve_api_user(request)
        exam = active_exam(user)
        if exam is not None:
            reason = exam_blocked_path(request.path, exam_problem_ids(user))
            if reason is not None:
                import json

                from django.http import HttpResponse

                payload = json.dumps(
                    {
                        "detail": str(reason),
                        "exam_mode": True,
                        "assignment": exam.id,
                    }
                )
                return HttpResponse(
                    payload, status=403, content_type="application/json"
                )
        return self.get_response(request)
