# Wave decisions (orchestrator log) — 2026-09-22

Binding decisions for all wave units. Units that already hold a conflicting instruction from their original prompt: THIS file wins.

## D1 — `control` is NOT a Django app
Verified independently by the reporting unit (ls / git ls-files / INSTALLED_APPS grep / pytest exit 5) and confirmed by orchestrator against `backend/webcoder_api/settings.py` INSTALLED_APPS: real apps are **users, problems, submissions** only. `backend/control/` holds celery artifacts.

**Retask:** the 4th backend coverage unit drives the **`webcoder_api` project package** instead — `urls.py`, `asgi.py`, `wsgi.py` (all 0% in the measured baseline table) and `celery.py` (92%). Cover the settings env-loader branches if cheap; do not chase 100% on env-gated code — report it as blocked-by-env honestly.

## D2 — test filename contract: `test_wave.py`, never `tests_wave.py`
`backend/pytest.ini` `python_files = tests.py test_*.py *_tests.py` does NOT collect `tests_wave.py` (proven by detector control: `problems/tests_wave.py` exists, reports 0%, never runs).

**Binding:** every new backend test file MUST match `test_*.py` (e.g. `test_wave.py`). If a unit already wrote `tests_wave.py`, rename it in place. Explicit-path pytest invocation also bypasses `python_files` (measured) — acceptable for iteration, but the committed filename must still be `test_*.py` so directory scans and CI collect it.

**Do NOT edit `pytest.ini`** to widen `python_files` — that file is owned by the test-settings unit; filename compliance is the fix, not config loosening.

## D3 — orchestrator fan-in sweep (post-wave)
At fan-in the orchestrator will mechanically: rename any stray `tests_wave.py` → `test_wave.py`, delete the dead `problems/tests_wave.py` if unreferenced, re-run per-app coverage, and record actuals in the wave report. Units should self-fix at write time; the sweep is the safety net, not the plan.
