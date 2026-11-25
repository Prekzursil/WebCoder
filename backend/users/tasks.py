"""Users-app Celery tasks (LEG-1 purge + ANA-1 weekly capture)."""

from celery import shared_task


@shared_task
def purge_deleted_users_task():
    """Daily: purge side content of soft-deleted accounts past their date."""
    from .account import purge_deleted_users

    purged = purge_deleted_users()
    return f"purged {purged} deleted user(s)"


@shared_task
def snapshot_owner_metrics_task():
    """Weekly (ANA-1): freeze the activation derivations for the owner
    dashboard's trend strip. Idempotent per ISO week."""
    from .analytics import capture_weekly_snapshot

    snapshot = capture_weekly_snapshot()
    return f"owner metrics captured for {snapshot.week}"
