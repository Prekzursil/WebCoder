"""Notification emission service (SPEC-GAPS D-B10).

Callers wrap ``notify`` in ``transaction.on_commit`` so a rolled-back
transaction never emits an event.
"""

import logging

from .models import Notification

logger = logging.getLogger(__name__)


def notify(recipient, verb, *, actor=None, target=None, data=None):
    """Create one Notification; silently skip self-notifies.

    Returns the created Notification, or None when actor == recipient
    (your own actions never notify you) or the input is unusable.
    """
    if recipient is None or recipient == actor:
        return None
    notification = Notification.objects.create(
        recipient=recipient,
        actor=actor,
        verb=verb,
        target=target,
        data=data or {},
    )
    logger.debug(
        "notification %s -> user %s (target=%s)",
        verb,
        recipient.pk,
        getattr(target, "pk", None),
    )
    return notification
