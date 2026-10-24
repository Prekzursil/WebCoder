"""Users-app Celery tasks (round-2 LEG-1 purge; ANA-1 needs none)."""

from celery import shared_task


@shared_task
def purge_deleted_users_task():
    """Daily: purge side content of soft-deleted accounts past their date."""
    from .account import purge_deleted_users

    purged = purge_deleted_users()
    return f"purged {purged} deleted user(s)"
