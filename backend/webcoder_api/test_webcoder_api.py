"""
Unit tests for the webcoder_api project package itself (Wave-1 Task A2).

Scope: drive every module of the project package to full line coverage --
urls.py, asgi.py, wsgi.py, celery.py (plus the __init__.py celery re-export)
and the settings.py environment-loader branches: JUDGE_BACKEND default/env,
DB_NAME/DB_USER/DB_HOST/DB_PORT default/env, the fail-loud SECRET_KEY and
DB_PASSWORD lookups, and the optional backend/.env parser.

No database is needed: every test is a plain function (no TestCase and no
db fixture), so pytest-django never creates the test database.

How settings branches are re-executed in-process: _exec_settings() compiles
the REAL settings.py source under its REAL filename and runs it in a fresh
namespace, so coverage.py attributes the executed lines to
webcoder_api/settings.py while the test controls os.environ via monkeypatch.
The optional backend/.env parser is exercised by patching pathlib.Path.exists
and pathlib.Path.open for paths named ".env" only -- the repository itself is
never modified (backend/.env does not exist in this checkout; the False
branch is taken by the ordinary import, the True branch by the patch).

Run:
    cd backend
    SECRET_KEY=testkey DB_PASSWORD=x ./venv/Scripts/python.exe -m pytest \
        webcoder_api --ds webcoder_api.test_settings \
        --cov=webcoder_api --cov-report=term-missing
"""

import importlib
import io
import os
import pathlib
from datetime import timedelta

import pytest

_DOTENV_CONTENT = (
    "\n"
    "# a comment line (with=an=equals) that must be skipped\n"
    "NO_EQUALS_SIGN_HERE\n"
    "NEW_KEY_1=val1\n"
    "EXISTING_KEY=from_file\n"
    "NO_VALUE=\n"
)


def _exec_settings():
    """Re-execute settings.py in a fresh namespace, coverage-attributed."""
    import webcoder_api.settings as project_settings

    code = compile(
        pathlib.Path(project_settings.__file__).read_text(encoding="utf-8"),
        project_settings.__file__,
        "exec",
    )
    namespace = {
        "__file__": project_settings.__file__,
        "__name__": "webcoder_api.settings",
    }
    exec(code, namespace)
    return namespace


# ---------------------------------------------------------------------------
# Package bootstrap: __init__.py + celery.py (filesystem broker, no network)
# ---------------------------------------------------------------------------


def test_package_exports_celery_app():
    import webcoder_api
    import webcoder_api.celery

    assert webcoder_api.__all__ == ("celery_app",)
    assert webcoder_api.celery_app is webcoder_api.celery.app


def test_celery_app_configuration():
    import webcoder_api.celery as celery_mod

    app = celery_mod.app
    assert app.main == "webcoder_api"
    assert app.conf.broker_url == "filesystem://"
    opts = app.conf.broker_transport_options
    assert opts["data_folder_in"].endswith("celery_broker")
    assert opts["data_folder_out"].endswith("celery_broker_processed")
    assert opts["data_folder_processed"].endswith("celery_broker_sent")
    assert pathlib.Path(opts["data_folder_in"]).is_absolute()


def test_debug_task_runs_eagerly():
    from webcoder_api.celery import debug_task

    assert debug_task.name == "webcoder_api.celery.debug_task"
    result = debug_task.apply()
    assert result.successful()
    assert result.result is None


# ---------------------------------------------------------------------------
# ASGI / WGI entrypoints
# ---------------------------------------------------------------------------


def test_wsgi_application_is_wsgihandler():
    wsgi = importlib.import_module("webcoder_api.wsgi")
    from django.conf import settings as django_settings
    from django.core.handlers.wsgi import WSGIHandler

    assert isinstance(wsgi.application, WSGIHandler)
    assert callable(wsgi.application)
    assert django_settings.WSGI_APPLICATION == "webcoder_api.wsgi.application"


def test_asgi_application_is_asgihandler():
    asgi = importlib.import_module("webcoder_api.asgi")
    from django.core.handlers.asgi import ASGIHandler

    assert isinstance(asgi.application, ASGIHandler)
    assert callable(asgi.application)


# ---------------------------------------------------------------------------
# URLconf wiring
# ---------------------------------------------------------------------------


def test_urlpatterns_wiring():
    from django.urls import get_resolver, resolve, reverse
    from django.views.generic import RedirectView
    from webcoder_api import urls as project_urls

    assert len(project_urls.urlpatterns) == 13
    assert reverse("token_obtain_pair") == "/api/v1/token/"
    assert reverse("token_refresh") == "/api/v1/token/refresh/"
    assert reverse("token_verify") == "/api/v1/token/verify/"
    assert reverse("admin:index") == "/admin/"
    root_match = resolve("/")
    assert root_match.func.view_class is RedirectView
    namespaces = get_resolver().namespace_dict
    for ns in ("users_api_v1", "problems_api_v1", "submissions_api_v1"):
        assert ns in namespaces


# ---------------------------------------------------------------------------
# settings.py env loader: defaults, overrides, fail-loud keys, .env parser
# ---------------------------------------------------------------------------


def test_settings_defaults_when_env_unset(monkeypatch):
    monkeypatch.delenv("JUDGE_BACKEND", raising=False)
    monkeypatch.delenv("JUDGE_BOOST_HEADERS_PATH", raising=False)
    monkeypatch.delenv("JUDGE_JAVA_LIBS_DIR_HOST", raising=False)
    monkeypatch.delenv("DB_NAME", raising=False)
    monkeypatch.delenv("DB_USER", raising=False)
    monkeypatch.delenv("DB_HOST", raising=False)
    monkeypatch.delenv("DB_PORT", raising=False)
    monkeypatch.setenv("SECRET_KEY", "testkey")
    monkeypatch.setenv("DB_PASSWORD", "x")

    ns = _exec_settings()

    assert ns["JUDGE_BACKEND"] == "local"
    assert ns["JUDGE_BOOST_HEADERS_PATH"] == "/opt/boost_headers"
    assert ns["JUDGE_JAVA_LIBS_DIR_HOST"] == "/opt/java_libs"
    db = ns["DATABASES"]["default"]
    assert db["NAME"] == "webcoder_db"
    assert db["USER"] == "webcoder_user"
    assert db["PASSWORD"] == "x"
    assert db["HOST"] == "localhost"
    assert db["PORT"] == "5433"
    assert ns["CORS_ALLOWED_ORIGINS"] == ["http://localhost:3000"]
    assert ns["AUTH_USER_MODEL"] == "users.User"
    assert ns["SITE_ID"] == 1
    local_apps = (
        "users.apps.UsersConfig",
        "problems.apps.ProblemsConfig",
        "submissions.apps.SubmissionsConfig",
    )
    for app in local_apps:
        assert app in ns["INSTALLED_APPS"]
    assert ns["CELERY_BROKER_FOLDER_MAIN"].endswith("celery_broker")
    assert ns["CELERY_BROKER_FOLDER_PROCESSED"].endswith("celery_broker_processed")
    assert ns["CELERY_BROKER_FOLDER_SENT"].endswith("celery_broker_sent")
    jwt = ns["SIMPLE_JWT"]
    assert jwt["ALGORITHM"] == "HS256"
    assert jwt["SIGNING_KEY"] == ns["SECRET_KEY"] == "testkey"
    assert jwt["ACCESS_TOKEN_LIFETIME"] == timedelta(minutes=5)
    assert jwt["REFRESH_TOKEN_LIFETIME"] == timedelta(days=1)


def test_settings_env_overrides(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "testkey")
    monkeypatch.setenv("DB_PASSWORD", "x")
    monkeypatch.setenv("JUDGE_BACKEND", "container")
    monkeypatch.setenv("JUDGE_BOOST_HEADERS_PATH", "/custom/boost")
    monkeypatch.setenv("JUDGE_JAVA_LIBS_DIR_HOST", "/custom/javalibs")
    monkeypatch.setenv("DB_NAME", "other_db")
    monkeypatch.setenv("DB_USER", "other_user")
    monkeypatch.setenv("DB_HOST", "db.internal")
    monkeypatch.setenv("DB_PORT", "7000")

    ns = _exec_settings()

    assert ns["JUDGE_BACKEND"] == "container"
    assert ns["JUDGE_BOOST_HEADERS_PATH"] == "/custom/boost"
    assert ns["JUDGE_JAVA_LIBS_DIR_HOST"] == "/custom/javalibs"
    db = ns["DATABASES"]["default"]
    assert db["NAME"] == "other_db"
    assert db["USER"] == "other_user"
    assert db["HOST"] == "db.internal"
    assert db["PORT"] == "7000"


def test_settings_fail_loud_missing_secret_key(monkeypatch):
    monkeypatch.setenv("DB_PASSWORD", "x")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(KeyError) as excinfo:
        _exec_settings()
    assert "SECRET_KEY" in str(excinfo.value)


def test_settings_fail_loud_missing_db_password(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "testkey")
    monkeypatch.delenv("DB_PASSWORD", raising=False)
    with pytest.raises(KeyError) as excinfo:
        _exec_settings()
    assert "DB_PASSWORD" in str(excinfo.value)


def test_env_loader_parses_dotenv(monkeypatch, request):
    for key in ("NEW_KEY_1", "NO_VALUE"):
        os.environ.pop(key, None)
    request.addfinalizer(
        lambda: [os.environ.pop(key, None) for key in ("NEW_KEY_1", "NO_VALUE")]
    )
    monkeypatch.setenv("SECRET_KEY", "testkey")
    monkeypatch.setenv("DB_PASSWORD", "x")
    monkeypatch.setenv("EXISTING_KEY", "from_env")

    real_exists = pathlib.Path.exists
    real_open = pathlib.Path.open

    def _fake_exists(self):
        return self.name == ".env" or real_exists(self)

    def _fake_open(self, *args, **kwargs):
        return (
            io.StringIO(_DOTENV_CONTENT)
            if self.name == ".env"
            else real_open(self, *args, **kwargs)
        )

    monkeypatch.setattr(pathlib.Path, "exists", _fake_exists)
    monkeypatch.setattr(pathlib.Path, "open", _fake_open)

    ns = _exec_settings()

    assert os.environ["NEW_KEY_1"] == "val1"
    assert os.environ["NO_VALUE"] == ""
    assert os.environ["EXISTING_KEY"] == "from_env"
    assert ns["SECRET_KEY"] == "testkey"
