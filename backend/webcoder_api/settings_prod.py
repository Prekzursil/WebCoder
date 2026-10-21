"""Production settings profile (SPEC-GAPS SP2; wave scope: DEBUG /
ALLOWED_HOSTS / CORS env-driven with safe defaults).

Select with ``DJANGO_SETTINGS_MODULE=webcoder_api.settings_prod`` (compose
passes ``${DJANGO_SETTINGS_MODULE:-webcoder_api.settings}`` so the local dev
stack is unchanged; a production deployment flips one env var).

Safe defaults: DEBUG defaults to False here (True only when explicitly set),
ALLOWED_HOSTS/CORS default to empty (deny-all) and MUST be provided via env,
and the standard secure-transport headers/cookies Django ships are switched
on. All of the trio remain env-overridable:

    DEBUG=false
    ALLOWED_HOSTS=api.example.com,.example.com
    CORS_ALLOWED_ORIGINS=https://app.example.com
    JWT_SECRET_KEY=<dedicated signing key>   (falls back to SECRET_KEY)
    SECURE_SSL_REDIRECT=false                (only behind a plain-HTTP hop)

Acceptance gate (from the SP2 design):
    DJANGO_SETTINGS_MODULE=webcoder_api.settings_prod SECRET_KEY=x DB_PASSWORD=x \
        python manage.py check --deploy
must exit 0 (warnings about env-dependent values — e.g. missing
DJANGO_SECRET_KEY — are informational; errors fail the gate).
"""

import os

from .settings import *  # noqa: F401,F403
from .settings import _env_bool, _env_list

# --- The wave trio: env-driven, prod-safe defaults -------------------------

# Prod default OFF. Setting DEBUG=true in production requires an explicit
# opt-in through the environment (and never survives a forgotten default).
DEBUG = _env_bool("DEBUG", default="false")

# No wildcard default: an unset ALLOWED_HOSTS in prod serves nothing (safe).
ALLOWED_HOSTS = _env_list("ALLOWED_HOSTS")

# CORS deny-all by default in prod; the browser origin must be allowlisted.
CORS_ALLOWED_ORIGINS = _env_list("CORS_ALLOWED_ORIGINS")
CORS_ALLOW_CREDENTIALS = True

# --- Secure transport / headers (SP2) ---------------------------------------

# Behind the TLS-terminating proxy the original scheme arrives in this
# header; SECURE_SSL_REDIRECT + request.is_secure() rely on it.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = _env_bool("SECURE_SSL_REDIRECT", default="true")

SECURE_HSTS_SECONDS = 31536000  # 1 year
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_REFERRER_POLICY = "same-origin"
SECURE_CONTENT_TYPE_NOSNIFF = True

# --- Dedicated JWT signing key (SP2) ----------------------------------------
# A dedicated secret so rotating the web SECRET_KEY does not invalidate
# issued tokens (and vice versa). Falls back to SECRET_KEY only when the
# dedicated env var is absent — set JWT_SECRET_KEY in production.
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY") or SECRET_KEY
SIMPLE_JWT = {
    **SIMPLE_JWT,  # type: ignore[name-defined]  # imported via * above
    "SIGNING_KEY": JWT_SECRET_KEY,
    "VERIFYING_KEY": JWT_SECRET_KEY,
}

# --- Cookie-JWT prod posture (SP1) -------------------------------------------
# HTTPS everywhere in prod: the wc_access/wc_refresh cookies are Secure-only.
# SameSite stays env-driven ('Lax' same-site; cross-site frontends set
# JWT_AUTH_SAMESITE=None which the browser only honors together with Secure).
REST_AUTH = {
    **REST_AUTH,  # type: ignore[name-defined]  # imported via * above
    "JWT_AUTH_SECURE": _env_bool("JWT_AUTH_SECURE", "true"),
}

# Rate limiting behind a reverse proxy: trust exactly one X-Forwarded-For
# hop so throttling keys on the real client IP, not the proxy's (SP4).
REST_FRAMEWORK = {
    **REST_FRAMEWORK,  # type: ignore[name-defined]  # imported via * above
    "NUM_PROXIES": 1,
}

# --- Least-privilege OAuth scopes (SP2) -------------------------------------
# GitHub 'repo' grants private-repo WRITE — massively over-scoped for login.
# Needs only re-consent from already-connected users.
SOCIALACCOUNT_PROVIDERS = {
    **SOCIALACCOUNT_PROVIDERS,  # type: ignore[name-defined]
    "github": {
        "SCOPE": [
            "user",
            "user:email",
        ],
    },
}
