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

from .settings import *  # noqa: E402,F401,F403

_SQLITE_TMP_DIR = Path(tempfile.mkdtemp(prefix="webcoder_test_"))

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(_SQLITE_TMP_DIR / "webcoder_test.sqlite3"),
    }
}
