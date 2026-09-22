"""Sentinel for the wave/nextjs-migration coverage fan-out unit "control".

MEASURED FINDINGS (2026-09-22, this unit's probes - see StructuredOutput evidence):

1. There is NO `control` Django app in this repo. backend/control/ contains only
   Celery runtime artifacts (celery.exchange, celery.pidbox.exchange). Verified by
   four independent probes: directory listing, `git ls-files backend/control/`,
   `git log -- backend/control/` (single initial-import commit), and a grep for
   "control" across backend/*.py (only an unrelated comment in users/models.py:16).
   The real local apps are: users, problems, submissions (settings.py INSTALLED_APPS).

2. `pytest control --ds webcoder_api.test_settings` exits 5 (no tests collected).
   The commanded coverage gate is therefore vacuous on its stated target.

3. The wave's prescribed artifact name `<app>/tests_wave.py` is INVISIBLE to
   directory-scan collection in this repo: backend/pytest.ini sets
   `python_files = tests.py test_*.py *_tests.py` and "tests_wave.py" matches none
   of those globs. Proven with a detector control (control/test_zz_detector.py was
   collected; control/tests_wave.py was not, in the same run). Corroborated live:
   problems/tests_wave.py (written by a sibling unit mid-run) reports 0% coverage
   because it is never executed. FIX for siblings: rename to `test_wave.py`, add
   `*_wave.py` to python_files, or pass explicit file paths to pytest (explicit
   file args bypass python_files - measured).

This file is intentionally runnable ONLY via an explicit path
(`pytest control/tests_wave.py`) and exists so the finding is executable.
If a real `control` app is ever added, delete this sentinel.
"""

from fnmatch import fnmatch
from pathlib import Path

import pytest

_BACKEND = Path(__file__).resolve().parent.parent


def test_prescribed_wave_filename_is_not_collected_by_directory_scan():
    """Guard: documents that tests_wave.py does NOT match this repo's python_files.

    If this ever FAILS, the collection pattern was fixed and sibling wave files
    named tests_wave.py are now collected - update the wave notes accordingly.
    """
    ini = _BACKEND / "pytest.ini"
    assert ini.is_file(), "backend/pytest.ini missing - cannot verify patterns"
    patterns = []
    in_section = False
    for line in ini.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if stripped.startswith("["):
            in_section = stripped == "[pytest]"
            continue
        if in_section and stripped.startswith("python_files"):
            patterns = stripped.split("=", 1)[1].split()
    assert patterns, "python_files not found in backend/pytest.ini"
    assert not any(fnmatch("tests_wave.py", p) for p in patterns), (
        f"tests_wave.py unexpectedly MATCHES python_files {patterns} - "
        "the collection gap documented in this sentinel has been fixed elsewhere"
    )


def test_control_is_not_an_installed_django_app():
    """Guard: no app labelled 'control' exists, so 'pytest control' can only ever
    collect this sentinel. Fails loudly if a real control app appears."""
    pytest.importorskip("django")
    from django.apps import apps
    from django.core.exceptions import AppRegistryNotReady

    try:
        app_config = apps.get_app_config("control")
    except LookupError:
        return  # expected: no control app
    except AppRegistryNotReady:
        pytest.skip("django apps not populated in this context")
    raise AssertionError(
        f"a Django app labelled 'control' now exists ({app_config.name}); "
        "this sentinel is stale - replace it with real tests"
    )
