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
