"""Users-app Celery tasks (LEG-1 purge + ANA-1 weekly capture)."""

from typing import Any, Protocol, cast

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


# Structural-task aliases (see submissions.tasks._CeleryTask): celery.shared_task
# is untyped in the type-check environment, so the decorated tasks read as plain
# functions and lose .run/.delay; the aliases restore that surface. At runtime
# they are the very same Task objects.
class _CeleryTask(Protocol):
    def delay(self, *args: Any, **kwargs: Any) -> Any: ...

    def apply_async(self, *args: Any, **kwargs: Any) -> Any: ...

    def apply(self, *args: Any, **kwargs: Any) -> Any: ...

    def run(self, *args: Any, **kwargs: Any) -> Any: ...

    def __call__(self, *args: Any, **kwargs: Any) -> Any: ...


purge_deleted_users: _CeleryTask = cast(_CeleryTask, purge_deleted_users_task)
snapshot_owner_metrics: _CeleryTask = cast(_CeleryTask, snapshot_owner_metrics_task)
