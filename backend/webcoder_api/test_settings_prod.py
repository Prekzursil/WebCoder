"""Env-driven settings tests: the DEBUG/ALLOWED_HOSTS/CORS trio in the base
module and the full production profile (SPEC-GAPS SP2 wave scope).

Re-executes the real settings source under controlled os.environ (same
pattern as webcoder_api/test_webcoder_api.py::_exec_settings) so every
branch is exercised without reloading Django's configured settings.
"""

import os
import pathlib

import pytest


def _exec_module(relpath, module_name):
    """Compile+exec a settings module source in a fresh namespace."""
    import webcoder_api.settings as project_settings

    src = pathlib.Path(project_settings.__file__).parent / relpath
    code = compile(src.read_text(encoding="utf-8"), str(src), "exec")
    namespace = {"__file__": str(src), "__name__": module_name}
    exec(code, namespace)
    return namespace


def _exec_settings():
    return _exec_module("settings.py", "webcoder_api.settings")


# ---------------------------------------------------------------------------
# Base settings: the env-driven trio (dev-safe defaults)
# ---------------------------------------------------------------------------


def test_base_defaults_dev_safe(monkeypatch):
    for var in ("DEBUG", "ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS"):
        monkeypatch.delenv(var, raising=False)
    ns = _exec_settings()
    assert ns["DEBUG"] is True
    assert ns["ALLOWED_HOSTS"] == []
    assert ns["CORS_ALLOWED_ORIGINS"] == ["http://localhost:3000"]


def test_base_debug_env_variants(monkeypatch):
    monkeypatch.setenv("DEBUG", "false")
    assert _exec_settings()["DEBUG"] is False
    monkeypatch.setenv("DEBUG", "TRUE")
    assert _exec_settings()["DEBUG"] is True
    monkeypatch.setenv("DEBUG", "1")
    assert _exec_settings()["DEBUG"] is True
    monkeypatch.setenv("DEBUG", "nope")
    assert _exec_settings()["DEBUG"] is False


def test_base_allowed_hosts_list_parsing(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", "api.example.com, .example.com ,,localhost")
    ns = _exec_settings()
    assert ns["ALLOWED_HOSTS"] == ["api.example.com", ".example.com", "localhost"]


def test_base_cors_env_overrides_default(monkeypatch):
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://app.example.com")
    assert _exec_settings()["CORS_ALLOWED_ORIGINS"] == ["https://app.example.com"]


def test_base_empty_env_vars_yield_empty_lists(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOSTS", "")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", ",,")
    ns = _exec_settings()
    assert ns["ALLOWED_HOSTS"] == []
    assert ns["CORS_ALLOWED_ORIGINS"] == []


# ---------------------------------------------------------------------------
# Production profile: settings_prod.py
# ---------------------------------------------------------------------------

import importlib

import webcoder_api.settings_prod as _prod_module


@pytest.fixture(autouse=True)
def _restore_prod_module():
    """Reload settings_prod with a clean env after each test so leaked env
    mutations never leave a non-default module state behind."""
    yield
    for var in ("DEBUG", "ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS",
                "JWT_SECRET_KEY", "SECURE_SSL_REDIRECT"):
        os.environ.pop(var, None)
    importlib.reload(_prod_module)


def _exec_prod(monkeypatch, **env):
    """Reload the real settings_prod module under controlled env vars.

    reload re-executes the module source in place, so its own env reads
    (DEBUG/ALLOWED_HOSTS/CORS/secure flags/JWT key) recompute; the
    ``from .settings import *`` base values come from the already-imported
    base module, which is exactly what production does too.
    """
    for var in ("DEBUG", "ALLOWED_HOSTS", "CORS_ALLOWED_ORIGINS",
                "JWT_SECRET_KEY", "SECURE_SSL_REDIRECT"):
        monkeypatch.delenv(var, raising=False)
    for k, v in env.items():
        monkeypatch.setenv(k, v)
    return vars(importlib.reload(_prod_module))


def test_prod_defaults_are_safe(monkeypatch):
    ns = _exec_prod(monkeypatch)
    assert ns["DEBUG"] is False
    assert ns["ALLOWED_HOSTS"] == []          # deny-all until set
    assert ns["CORS_ALLOWED_ORIGINS"] == []   # deny-all until set
    assert ns["CORS_ALLOW_CREDENTIALS"] is True
    assert ns["SECURE_PROXY_SSL_HEADER"] == ("HTTP_X_FORWARDED_PROTO", "https")
    assert ns["SECURE_SSL_REDIRECT"] is True
    assert ns["SECURE_HSTS_SECONDS"] == 31536000
    assert ns["SECURE_HSTS_INCLUDE_SUBDOMAINS"] is True
    assert ns["SECURE_HSTS_PRELOAD"] is True
    assert ns["SESSION_COOKIE_SECURE"] is True
    assert ns["CSRF_COOKIE_SECURE"] is True
    assert ns["SECURE_REFERRER_POLICY"] == "same-origin"
    assert ns["SECURE_CONTENT_TYPE_NOSNIFF"] is True


def test_prod_debug_opt_in_only(monkeypatch):
    ns = _exec_prod(monkeypatch, DEBUG="true")
    assert ns["DEBUG"] is True


def test_prod_hosts_and_cors_from_env(monkeypatch):
    ns = _exec_prod(
        monkeypatch,
        ALLOWED_HOSTS="api.example.com",
        CORS_ALLOWED_ORIGINS="https://app.example.com",
    )
    assert ns["ALLOWED_HOSTS"] == ["api.example.com"]
    assert ns["CORS_ALLOWED_ORIGINS"] == ["https://app.example.com"]


def test_prod_jwt_signing_key_dedicated_then_fallback(monkeypatch):
    ns = _exec_prod(monkeypatch, JWT_SECRET_KEY="dedicated-key")
    assert ns["SIMPLE_JWT"]["SIGNING_KEY"] == "dedicated-key"
    ns = _exec_prod(monkeypatch)
    assert ns["SIMPLE_JWT"]["SIGNING_KEY"] == ns["SECRET_KEY"]


def test_prod_github_scope_least_privilege(monkeypatch):
    ns = _exec_prod(monkeypatch)
    assert ns["SOCIALACCOUNT_PROVIDERS"]["github"]["SCOPE"] == ["user", "user:email"]


def test_prod_ssl_redirect_env_override(monkeypatch):
    ns = _exec_prod(monkeypatch, SECURE_SSL_REDIRECT="false")
    assert ns["SECURE_SSL_REDIRECT"] is False
