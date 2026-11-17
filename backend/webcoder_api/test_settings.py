"""
Test-only Django settings for a DB-independent unit-test baseline.

Usage (no PostgreSQL needed):

    SECRET_KEY=testkey DB_PASSWORD=x \
    ./venv/Scripts/python.exe -m pytest --ds webcoder_api.test_settings

Inherits everything from ``webcoder_api.settings`` and replaces the
PostgreSQL default with a SQLite file in a per-run temp directory.
For test runs Django's SQLite backend defaults TEST["NAME"] to an
in-memory database, so the pytest suite never touches the file on disk
(and never touches Postgres).

The ``os.environ.setdefault`` calls below exist so this module can be
imported even without SECRET_KEY/DB_PASSWORD in the environment; real
environment variables always win, and ``settings.py`` keeps its
fail-loud behavior for dev/prod.
"""

import os
import tempfile
from pathlib import Path

# Must run BEFORE importing .settings: settings.py reads these fail-loud
# (``os.environ[...]``) at import time.
os.environ.setdefault("SECRET_KEY", "test-only-secret-key")
os.environ.setdefault("DB_PASSWORD", "test-only-db-password")

from .settings import (  # noqa: E402,F401  (explicit list: no wildcard)
    ACCOUNT_ADAPTER,
    ACCOUNT_EMAIL_VERIFICATION,
    ACCOUNT_LOGIN_METHODS,
    ACCOUNT_LOGIN_ON_EMAIL_CONFIRMATION,
    ACCOUNT_LOGIN_ON_PASSWORD_CHANGE,
    ACCOUNT_LOGIN_ON_PASSWORD_RESET,
    ACCOUNT_LOGOUT_ON_PASSWORD_CHANGE,
    ACCOUNT_LOGOUT_REDIRECT_URL,
    ACCOUNT_SESSION_REMEMBER,
    ACCOUNT_SIGNUP_FIELDS,
    ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE,
    ACCOUNT_UNIQUE_EMAIL,
    ALLOWED_HOSTS,
    AUTHENTICATION_BACKENDS,
    AUTH_PASSWORD_VALIDATORS,
    AUTH_USER_MODEL,
    BASE_DIR,
    CELERY_ACCEPT_CONTENT,
    CELERY_BEAT_SCHEDULE,
    CELERY_BROKER_URL,
    CELERY_TASK_SERIALIZER,
    CELERY_TIMEZONE,
    CONTEST_SUBMIT_COOLDOWN_SECONDS,
    CORS_ALLOWED_ORIGINS,
    CORS_ALLOW_CREDENTIALS,
    CSRF_TRUSTED_ORIGINS,
    DEBUG,
    DEFAULT_AUTO_FIELD,
    DEFAULT_FROM_EMAIL,
    EMAIL_BACKEND,
    EMAIL_HOST,
    EMAIL_HOST_PASSWORD,
    EMAIL_HOST_USER,
    EMAIL_PORT,
    EMAIL_USE_TLS,
    FRONTEND_ORIGIN,
    INSTALLED_APPS,
    JUDGE_BACKEND,
    JUDGE_BOOST_HEADERS_PATH,
    JUDGE_JAVA_LIBS_DIR_HOST,
    JUDGE_OUTPUT_LIMIT_BYTES,
    JUDGE_PIP_NETWORK,
    JUDGE_PYPI_INDEX_URL,
    JUDGE_SANDBOX_ROOT,
    JUDGE_SANDBOX_VOLUME,
    LANGUAGES,
    LANGUAGE_CODE,
    LOCALE_PATHS,
    LOGGING,
    LOGIN_REDIRECT_URL,
    MEDIA_ROOT,
    MEDIA_URL,
    MIDDLEWARE,
    RATED_CONTESTS_REQUIRE_VERIFIED_EMAIL,
    REDIS_URL,
    REST_AUTH,
    REST_FRAMEWORK,
    ROOT_URLCONF,
    SECRET_KEY,
    SIMPLE_JWT,
    SITE_ID,
    SOCIALACCOUNT_ADAPTER,
    SOCIALACCOUNT_PROVIDERS,
    SOCIALACCOUNT_QUERY_EMAIL,
    STATIC_URL,
    TEMPLATES,
    TIME_ZONE,
    TWO_FACTOR_ENFORCE,
    USE_I18N,
    USE_TZ,
    WSGI_APPLICATION,
    _ENV_PATH,
    _env_bool,
    _env_list,
)

# Names settings.py assigns only under runtime conditions:
# inherit them when present, exactly like `import *` did.
from . import settings as _base_settings

for _cond_name in [
    "CACHES",
    "CELERY_BROKER_FOLDER_MAIN",
    "CELERY_BROKER_FOLDER_PROCESSED",
    "CELERY_BROKER_FOLDER_SENT",
    "_celery_broker_root",
    "_line",
]:
    if hasattr(_base_settings, _cond_name):
        globals()[_cond_name] = getattr(_base_settings, _cond_name)


_SQLITE_TMP_DIR = Path(tempfile.mkdtemp(prefix="webcoder_test_"))

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(_SQLITE_TMP_DIR / "webcoder_test.sqlite3"),
    }
}
