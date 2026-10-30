"""Retention task (SPEC-GAPS D-B10): purge read notifications older
than 90 days. Daily beat scheduling is D-B11 (no beat infra yet); the
task is safe to run manually or from any scheduler.
"""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import Notification

RETENTION_DAYS = 90


@shared_task
def purge_old_notifications():
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    deleted, _ = Notification.objects.filter(
        read_at__isnull=False, read_at__lt=cutoff
    ).delete()
    return deleted


@shared_task
def weekly_digest_task():
    """UXP-5b (competitive roadmap): the weekly practice digest email.

    For every user who submitted in the last 7 days: the problems they
    attempted but have NOT solved, each with its first hint — the
    roadmap's "problems you failed + first hint" nudge. Bilingual
    subject; body lists problem titles (RO preferred) + hint.

    SP5/OPR-5 transport guard: the task is a no-op (logged, exit 0)
    unless the deployment configured a mail host (``EMAIL_HOST``). The
    console backend + empty host is the local default, so a dev stack
    never "sends" digests by accident; the test suite runs the send path
    under the locmem backend.
    """
    import logging

    from django.conf import settings as dj_settings
    from django.core.mail import send_mail

    from problems.models import Problem
    from submissions.models import Submission

    logger = logging.getLogger(__name__)

    host = getattr(dj_settings, "EMAIL_HOST", "")
    if not host:
        logger.info(
            "weekly_digest: skipped — no mail host configured "
            "(EMAIL_HOST=%r).",
            host,
        )
        return 0

    since = timezone.now() - timedelta(days=7)
    active_user_ids = (
        Submission.objects.filter(submission_time__gte=since)
        .order_by()
        .values_list("user_id", flat=True)
        .distinct()
    )
    from django.contrib.auth import get_user_model

    User = get_user_model()
    users = {
        u.id: u
        for u in User.objects.filter(
            id__in=list(active_user_ids), is_active=True
        ).exclude(email="")
    }
    sent = 0
    for user_id in users:
        attempted = set(
            Submission.objects.filter(user_id=user_id)
            .order_by()
            .values_list("problem_id", flat=True)
        )
        solved = set(
            Submission.objects.filter(
                user_id=user_id, verdict=Submission.VerdictStatus.ACCEPTED
            )
            .order_by()
            .values_list("problem_id", flat=True)
        )
        open_ids = [pid for pid in attempted if pid not in solved]
        if not open_ids:
            continue
        problems = Problem.objects.filter(
            id__in=open_ids, status=Problem.ProblemStatus.APPROVED
        )
        lines = []
        for problem in problems:
            hints = problem.hints_ro or problem.hints_en or []
            title = (problem.title_i18n or {}).get("ro") or (
                problem.title_i18n or {}
            ).get("en", f"#{problem.id}")
            first_hint = hints[0] if hints else ""
            line = f"- {title}"
            if first_hint:
                line += f" — indiciu/hint: {first_hint}"
            lines.append(line)
        if not lines:
            continue
        user = users[user_id]
        send_mail(
            subject="WebCoder — problema săptămânii / your week in practice",
            message=(
                "Probleme la care lucrezi / problems you are working on:\n\n"
                + "\n".join(lines)
                + "\n\n— WebCoder"
            ),
            from_email=None,  # settings.DEFAULT_FROM_EMAIL
            recipient_list=[user.email],
            fail_silently=True,
        )
        sent += 1
    logger.info("weekly_digest: sent %d emails.", sent)
    return sent
