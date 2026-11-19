"""Item 145 — productized error tracking (no external SaaS dependency).

The platform runs self-hosted with no Sentry/GlitchTip account, so the
error pipeline is a first-class product surface instead: a middleware
records every 5xx response into ``ErrorEvent``, admins browse the stream
at ``/api/v1/ops/errors/``, and a daily beat task keeps 30 days of
history (the D-B10 purge pattern).
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class ErrorEvent(models.Model):
    """One captured 5xx response (server fault, not client error)."""

    created_at = models.DateTimeField(_("created at"), auto_now_add=True, db_index=True)
    path = models.CharField(_("path"), max_length=300)
    method = models.CharField(_("method"), max_length=8)
    status_code = models.PositiveSmallIntegerField(_("status code"))
    message = models.TextField(_("message"), blank=True)
    # Nullable on purpose: anonymous faults are as interesting as
    # authenticated ones, and the stream must never fail to record.
    user_id = models.BigIntegerField(_("user id"), null=True, blank=True)
    digest = models.CharField(
        _("dedup digest"),
        max_length=64,
        db_index=True,
        help_text=_("sha256 of method+path+status — groups repeats."),
    )

    class Meta:
        verbose_name = _("error event")
        verbose_name_plural = _("error events")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.status_code} {self.method} {self.path} ({self.created_at:%Y-%m-%d %H:%M})"


RETENTION_DAYS = 30


def event_digest(method: str, path: str, status_code: int) -> str:
    """Stable grouping key: the same fault from N users is one line."""
    import hashlib

    raw = f"{method}|{path}|{status_code}".encode()
    return hashlib.sha256(raw).hexdigest()


class ErrorCaptureMiddleware:
    """Records 5xx responses. MUST NOT alter the response or swallow the
    exception — the handler chain stays authoritative; this is an
    observer only. ``django.utils.log`` already has the traceback; the
    product surface here carries the request-shaped fields admins need.

    Registered LAST in MIDDLEWARE so it wraps the full stack (only the
    outermost middleware sees exceptions raised below it).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code >= 500 and not getattr(
            settings, "ERROR_CAPTURE_DISABLED", False
        ):
            ErrorEvent.objects.create(
                path=request.path[:300],
                method=request.method[:8],
                status_code=response.status_code,
                message=str(getattr(response, "reason_phrase", ""))[:2000],
                user_id=getattr(request.user, "id", None)
                if getattr(request, "user", None) and request.user.is_authenticated
                else None,
                digest=event_digest(
                    request.method[:8], request.path[:300], response.status_code
                ),
            )
        return response
