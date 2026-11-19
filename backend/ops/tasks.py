"""Item 145 — error-event retention (the D-B10 purge pattern): keep 30
days of 5xx history; the grouped view only needs recent signal."""

from datetime import timedelta

from celery import shared_task
from django.utils import timezone

from .models import RETENTION_DAYS, ErrorEvent


@shared_task
def purge_old_error_events():
    cutoff = timezone.now() - timedelta(days=RETENTION_DAYS)
    deleted, _ = ErrorEvent.objects.filter(created_at__lt=cutoff).delete()
    return deleted
