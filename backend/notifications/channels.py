"""Multi-channel delivery for notifications (wave G items 95 + 100).

The in-app ``Notification`` row stays the source of truth; this module
adds the delivery fan-out around it:

- **Push (item 95)**: Expo push API v2 (``https://exp.host/--/api/v2/push/send``)
  to every registered ``PushToken`` of the recipient. Best-effort — the
  row exists regardless; a failed push falls through to email.
- **Email fallback (item 100)**: when there is no push token, or every
  push attempt failed, and the recipient opted into a digest-style
  channel (``notification_email=True``), a single short email goes out
  under the standard ``EMAIL_HOST`` transport guard.
- **SMS fallback (item 100)**: a pluggable ``SMS_BACKEND`` (default
  ``console`` — logs the message; production can point at any gateway).
  Only used when the recipient set ``notification_sms_phone`` AND the
  backend is configured; never on by default.

Everything is defensive: a channel failure never breaks the request that
triggered the notification.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail import send_mail

from .models import Notification

logger = logging.getLogger(__name__)

EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send"
PUSH_TIMEOUT_S = 5


def send_expo_push(tokens: list[str], title: str, body: str) -> tuple[int, int]:
    """POST one message per token to the Expo push service.

    Returns ``(attempted, delivered)`` — never raises; transport errors
    count as not-delivered so the caller can fall back to email.
    """
    if not tokens:
        return 0, 0
    try:
        import requests

        response = requests.post(
            EXPO_PUSH_ENDPOINT,
            json=[{"to": token, "title": title, "body": body} for token in tokens],
            timeout=PUSH_TIMEOUT_S,
        )
        if response.status_code != 200:
            logger.warning(
                "expo push rejected (%s): %s", response.status_code, response.text[:200]
            )
            return len(tokens), 0
        payload = response.json().get("data", [])
        delivered = sum(1 for row in payload if str(row.get("status")) == "ok")
        return len(tokens), delivered
    except Exception:  # noqa: BLE001 — delivery is best-effort by contract
        logger.warning("expo push failed", exc_info=True)
        return len(tokens), 0


def send_sms(phone: str, text: str) -> bool:
    """SMS through the configured backend (item 100).

    ``SMS_BACKEND=console`` (default) logs — there is no default paid
    gateway. A deployment can point at ``gateway`` with
    ``SMS_GATEWAY_URL`` + ``SMS_GATEWAY_TOKEN`` for any HTTP SMS API.
    """
    backend = getattr(settings, "SMS_BACKEND", "console")
    if not phone:
        return False
    if backend == "console":
        logger.info("SMS (console backend) to %s: %s", phone, text)
        return True
    if backend == "gateway":
        gateway_url = getattr(settings, "SMS_GATEWAY_URL", "")
        gateway_token = getattr(settings, "SMS_GATEWAY_TOKEN", "")
        if not gateway_url:
            logger.warning("SMS gateway backend set but SMS_GATEWAY_URL is empty.")
            return False
        try:
            import requests

            response = requests.post(
                gateway_url,
                json={"to": phone, "text": text},
                headers={"Authorization": f"Bearer {gateway_token}"},
                timeout=PUSH_TIMEOUT_S,
            )
            return response.status_code < 300
        except Exception:  # noqa: BLE001
            logger.warning("SMS gateway failed", exc_info=True)
            return False
    logger.warning("unknown SMS_BACKEND %r", backend)
    return False


def deliver_multichannel(notification: Notification) -> dict:
    """Fan a notification out: push → email → SMS (wave G items 95/100).

    Idempotent-ish and best-effort: safe to call from ``notify()`` inside
    ``transaction.on_commit``; every channel failure degrades to the next.
    """
    from users.models import User

    recipient: User = notification.recipient
    summary = {"push": 0, "email": False, "sms": False}

    title = f"WebCoder — {notification.verb}"
    body = (notification.data or {}).get("excerpt", "")

    tokens = list(recipient.push_tokens.values_list("token", flat=True))
    if tokens:
        # send_expo_push returns (attempted_count, delivered_count); only
        # the delivery count feeds the fallback chain decision.
        _, summary["push"] = send_expo_push(list(tokens), title, body)

    host = getattr(settings, "EMAIL_HOST", "")
    if summary["push"] == 0:
        if recipient.notification_email and host and recipient.email:
            try:
                send_mail(
                    subject=title,
                    message=body or title,
                    from_email=None,  # settings.DEFAULT_FROM_EMAIL
                    recipient_list=[recipient.email],
                    fail_silently=True,
                )
                summary["email"] = True
            except Exception:  # noqa: BLE001
                logger.warning("notification email failed", exc_info=True)

        phone = getattr(recipient, "notification_sms_phone", "") or ""
        if phone:
            summary["sms"] = send_sms(phone, f"{title}: {body}" if body else title)

    return summary
