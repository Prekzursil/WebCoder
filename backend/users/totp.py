"""RFC 6238 TOTP (time-based one-time passwords) — stdlib only.

Competitive roadmap OPS-2 (2FA for privileged roles): TOTP enrollment and
verification without a django-otp dependency — the pinned ``deps.txt``
stays untouched and the protocol surface (secret generation, ±1-step
drift, ``otpauth://`` provisioning URI) is exactly what authenticator
apps (Google Authenticator, Aegis, 1Password) speak.

Implementation notes:

- HMAC-SHA1, 30-second step, 6-digit codes (the authenticator default —
  SHA-1 here is the TOTP spec's interoperability choice, not a password
  hash).
- :func:`verify_code` accepts the current step plus one step of drift on
  each side (clock skew tolerance, the django-otp default window).
- Secrets are 20 random bytes, base32-encoded (32 chars) — 160 bits of
  entropy, the RFC 4226 recommendation.
"""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote

#: TOTP parameters every authenticator app defaults to.
TIME_STEP_S = 30
DIGITS = 6
DRIFT_STEPS = 1

#: Issuer label in the otpauth:// provisioning URI.
ISSUER = "WebCoder"


def generate_secret() -> str:
    """A fresh 160-bit base32 secret (32 chars, no padding)."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def totp_code(secret: str, at_time: float | None = None, step_offset: int = 0) -> str:
    """The 6-digit code for *secret* at a point in time (test seam)."""
    counter = int((at_time if at_time is not None else time.time()) // TIME_STEP_S)
    counter += step_offset
    # Restore base32 padding before decoding (secrets are stored unpadded).
    padded = secret + "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode(padded, casefold=True)
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    return str(binary % (10**DIGITS)).zfill(DIGITS)


def verify_code(secret: str, code: str, at_time: float | None = None) -> bool:
    """True when *code* matches within the drift window (±1 step).

    A constant-time comparison per candidate step — verification never
    leaks how many digits matched.
    """
    if not secret or not code or not code.isdigit() or len(code) != DIGITS:
        return False
    for offset in range(-DRIFT_STEPS, DRIFT_STEPS + 1):
        expected = totp_code(secret, at_time=at_time, step_offset=offset)
        if hmac.compare_digest(expected, code):
            return True
    return False


def provisioning_uri(username: str, secret: str, issuer: str = ISSUER) -> str:
    """The ``otpauth://`` URI authenticator apps import (a QR code's
    payload — the frontend renders it as a scannable string v1)."""
    label = quote(f"{issuer}:{username}")
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret}&issuer={quote(issuer)}"
        f"&algorithm=SHA1&digits={DIGITS}&period={TIME_STEP_S}"
    )
