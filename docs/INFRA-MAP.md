# INFRA-MAP — WebCoder infrastructure inventory

Generated: 2026-09-22 · Branch: `wave/nextjs-migration` (per orchestrator brief).
Method: direct file reads + measured command runs (Django venv check, psycopg2 probe). Every load-bearing claim carries an inline confidence band and an evidence anchor (`path:line` or command output). Claims not measured this run are tagged UNVERIFIED.

**Sentinel:** this file is complete (not a skeleton). If it still contained all-UNKNOWN sections, the unit died before measuring and no verdict in it could be cited.

---

## 0. Repo layout (measured)

Root `ls`: `backend/`, `celery_broker/`, `celery_broker_processed/`, `celery_broker_sent/`, `docs/`, `frontend/`, `start_webcoder.bat`, `tree.txt`. No `webcoder_project/` directory exists (Glob `webcoder_project/**` → no files) — load-bearing for §1.

`backend/` contains: `control/`, `htmlcov/`, `locale/`, `manage.py`, `problems/`, `pytest.ini`, `requirements.txt`, `submissions/`, `users/`, `venv/`, `webcoder_api/`. The working interpreter is `backend/venv/Scripts/python.exe` (Windows venv layout, measured present); ambient `python` on PATH has **no Django** (measured: `ModuleNotFoundError: No module named 'django'`, exit 1). `htmlcov/` present ⇒ the pytest html coverage report has been generated locally at some point (high).

`frontend/` contains only `webcoder_ui/` (CRA app). **No Next.js skeleton exists on this branch yet** (no `next.config.*` anywhere under `frontend/`; measured via Glob). Relevant sibling doc: `docs/PORT-MAP.md` (another unit's CRA→Next port map, still skeleton at time of writing).

---

## 1. CI workflows — `.github/workflows/` (2 files)

### 1.1 `django.yml` ("Django CI") — BROKEN, high confidence

- Triggers: push + PR to `main` only (`.github/workflows/django.yml:3-7`).
- Matrix: Python 3.9 / 3.10 / 3.11, `max-parallel: 4` (`django.yml:14-16`).
- Install step runs `pip install -r webcoder_project/backend/requirements.txt` (`django.yml:27`) and tests run `cd webcoder_project/backend && pytest` (`django.yml:29-31`).
- **Breakage 1 (path):** `webcoder_project/backend/` does not exist — the repo root holds `backend/` directly (§0). The install step fails on a nonexistent requirements path. High — measured via Glob + root ls.
- **Breakage 2 (Python floor):** `requirements.txt` pins `Django==5.2.1` (`backend/requirements.txt:10`); Django 5.2 requires Python >= 3.10, so the 3.9 matrix leg cannot install it even after the path is fixed. Likely — version-support fact not re-verified against Django docs this run.
- **Breakage 3 (env contract):** pytest loads `webcoder_api.settings` (`backend/pytest.ini:2`), which fail-loud requires `SECRET_KEY` + `DB_PASSWORD` (§5). The workflow defines no env/secrets — the run dies at settings import. High — see §5 anchors.

### 1.2 `django_ci.yml` ("Django Backend CI") — gate step fails today, high confidence

- Triggers: push + PR on `main`/`develop`, filtered to `backend/**` (`django_ci.yml:3-11`).
- Matrix: Python 3.11 only (`django_ci.yml:19`); `working-directory: ./backend` (`django_ci.yml:21-23`).
- Flake8 lint: two passes, `continue-on-error: true` — advisory, never blocks (`django_ci.yml:45-52`).
- `python manage.py check` gate (`django_ci.yml:54-55`) fails today for **two stacked reasons**:
  1. No `SECRET_KEY`/`DB_PASSWORD` provided (no `env:` block anywhere in the file) and `backend/.env` is gitignored (`.gitignore:7`), so settings import raises `KeyError: 'SECRET_KEY'` (`backend/webcoder_api/settings.py:34`). High.
  2. Even with env supplied, `manage.py check` exits 1 on the allauth CRITICAL today (§6, measured).
- Test step is commented out (`django_ci.yml:57-58`).
- Minor wart: the "Create and activate virtual environment" step activates the venv inside that step only; each later step is a fresh shell, so `pip install` / `flake8` / `manage.py` run against the `setup-python` interpreter and the venv is dead weight (`django_ci.yml:34-38`). High — standard GH Actions step isolation.

**Gap:** neither workflow builds/lints the frontend at all (only these 2 files exist in `.github/workflows/` — measured). For a public SEO-facing platform this means no CRA→Next build gate in CI today.

---

## 2. `backend/pytest.ini` (4 lines, full file read)

```ini
[pytest]
DJANGO_SETTINGS_MODULE = webcoder_api.settings
python_files = tests.py test_*.py *_tests.py
addopts = --nomigrations --cov=. --cov-report=html
```

- `--nomigrations` avoids migration replay; `--cov=. --cov-report=html` needs `pytest-cov` — present (`backend/requirements.txt:31`); pytest 8.3.2 + pytest-django 4.8.0 pinned (`requirements.txt:29-30`). High.
- **Env coupling:** via `DJANGO_SETTINGS_MODULE`, every pytest run inherits the fail-loud `SECRET_KEY`/`DB_PASSWORD` requirement (§5). With `backend/.env` currently MISSING on disk (measured, §5) a bare `pytest` dies at settings import unless the shell exports both vars. High.
- **DB coupling:** `DATABASES["default"]` is always Postgres (`settings.py:115-125`) — there is no sqlite/test-DB override anywhere in settings. Any test touching the ORM will need a real Postgres (or an override). This is the constraint behind "unit tests must not depend on Postgres": today they unavoidably would. High for the settings side; no `conftest.py` exists to override it (no `backend/conftest.py` in the backend listing — measured §0).
- **Test inventory (measured):** the only `test_*.py` files under `backend/` are inside `venv/Lib/site-packages/` (dj_rest_auth, certifi). The three Django app files `backend/problems/tests.py`, `backend/submissions/tests.py`, `backend/users/tests.py` exist but contain **zero** `def test_` / `class *Test` definitions (Grep → no matches). ⇒ the project currently has **0 real backend tests**; a fixed CI would collect 0 tests (pytest exit code 5). High.
- `--cov=.` from `backend/` also instruments anything imported under `.` including `venv/` site-packages (django, DRF, …) — the html report balloons with third-party modules. Likely — standard pytest-cov source-path behavior, not measured this run.

---

## 3. `package.json` scripts

- **No root `package.json` exists** (measured MISSING at repo root). The only project package.json is `frontend/webcoder_ui/package.json`.
- Scripts (`frontend/webcoder_ui/package.json:28-33`): `start` = `react-scripts start`, `build` = `react-scripts build`, `test` = `react-scripts test`, `eject` = `react-scripts eject`. No lint/typecheck script.
- Stack: CRA `react-scripts` 5.0.1, React 18.2, TypeScript 4.9.5, MUI 5, react-router-dom 6.23, i18next, plus Node-polyfill deps (`crypto-browserify`, `stream-http`, …) — the classic CRA polyfill baggage a Next 15 migration sheds (`package.json:5-27,52-65`).
- Frontend dir also holds `build/`, `coverage/`, `build-baseline.log`, `test-baseline.log`, `scripts/`, `config/`, `tsconfig.json` (measured ls) — baseline artifacts already captured by earlier wave units.

---

## 4. `start_webcoder.bat` (local-up script, 32 lines, full file read)

Sequence (all anchors `start_webcoder.bat:N`):
1. Kills every PID listening on `:8000` and `:3000` via netstat+taskkill (`:8-16`).
2. Django: `start ... cmd /c "cd backend && python manage.py runserver"` (`:19`) — uses **ambient** `python`, not `backend/venv`. Measured: ambient python has no Django ⇒ this line fails on this box unless the owner shell's PATH differs. Likely (PATH-dependent).
3. `mkdir celery_broker`, `celery_broker_processed`, `celery_broker_sent` at repo root (`:21-24`) — cmd `mkdir` on existing dirs errors but the script continues; all three already exist (§0). Redundant with the settings-level `os.makedirs` auto-create (`settings.py:280-282`).
4. Celery worker: `cd backend && celery -A webcoder_api worker -l info` (`:27`) — ambient `celery`, same venv concern as (2).
5. Frontend: `cd frontend/webcoder_ui && npm start` (`:30`) — CRA dev server on :3000.

**Env coupling:** the bat sets no env vars; it relies on `settings.py`'s `backend/.env` loader — and `backend/.env` is MISSING right now (§5, measured) ⇒ `runserver` crashes with `KeyError: 'SECRET_KEY'` before serving. High. Net: the local-up path is currently broken end-to-end on this checkout (env missing = certain; interpreter PATH = likely).

---

## 5. Env-var contract — `backend/webcoder_api/settings.py`

**Loader:** minimal dependency-free `.env` reader at import time — reads `backend/.env`, `KEY=VALUE` lines, `os.environ.setdefault` so real env wins (`settings.py:16-24`). No python-dotenv in requirements.

| Var | Requirement | Default | Anchor |
|---|---|---|---|
| `SECRET_KEY` | **REQUIRED** (KeyError, fail-loud) | none | `settings.py:34` |
| `DB_PASSWORD` | **REQUIRED** (KeyError, fail-loud) | none | `settings.py:120` |
| `DB_NAME` | optional | `webcoder_db` | `settings.py:118` |
| `DB_USER` | optional | `webcoder_user` | `settings.py:119` |
| `DB_HOST` | optional | `localhost` | `settings.py:121` |
| `DB_PORT` | optional | **`5433`** (comment: local PG18 listens there, "measured") | `settings.py:122-123` |
| `JUDGE_BOOST_HEADERS_PATH` | optional | `/opt/boost_headers` | `settings.py:295` |
| `JUDGE_JAVA_LIBS_DIR_HOST` | optional | `/opt/java_libs` | `settings.py:302` |

- DB engine is always `django.db.backends.postgresql` (`settings.py:117`).
- `backend/.env` is gitignored (`.gitignore:7-8`) and **currently MISSING on disk** (measured) ⇒ every manage.py/pytest/celery invocation on this checkout fails at settings import until it is recreated or the vars are exported. High.
- `DEBUG = True`, `ALLOWED_HOSTS = []` (`settings.py:37-39`); `CORS_ALLOWED_ORIGINS = ["http://localhost:3000"]` only (`settings.py:88-90`) — the Next dev server must stay on :3000 (or CORS must grow the new port). High.
- Import side effects: settings import auto-creates the three `celery_broker*` dirs at repo root (`settings.py:275-282`).

## 6. `manage.py check` — 3 issues (measured run, exit code 1)

Command: `backend/venv/Scripts/python.exe manage.py check` with dummy `SECRET_KEY`/`DB_PASSWORD` exported (check does not touch Postgres). Output verbatim summary:

1. **CRITICAL** — `?: 'password' is not a valid field for ACCOUNT_SIGNUP_FIELDS, use 'password1'` — caused by dict-form `ACCOUNT_SIGNUP_FIELDS` using a `"password"` key (`settings.py:197-201`).
2. **WARNING `account.W001`** — `ACCOUNT_LOGIN_METHODS conflicts with ACCOUNT_SIGNUP_FIELDS` (`settings.py:196` vs `:197`).
3. **WARNING** — `settings.ACCOUNT_SIGNUP_PASSWORD_ENTER_TWICE is deprecated` (`settings.py:193`).

"System check identified 3 issues (0 silenced)", exit 1. All three are django-allauth 65.x (`requirements.txt:15`) config modernizations; the CRITICAL makes any `manage.py check` CI gate red today. High — direct command output.

## 7. Local Postgres state (probe measured)

psycopg2 probe (via project venv) to `localhost:5433`, db `webcoder_db`, user `webcoder_user`, dummy password →
`OperationalError: connection to server at "localhost" (::1), port 5433 failed: FATAL: password authentication failed for user "webcoder_user"`.

- Proven by probe (high): a PG server IS listening on 5433 (IPv6 ::1), the role `webcoder_user` is known to it, and the auth path rejects.
- The orchestrator brief states real-credential auth for `webcoder_user` also fails — my probe used a dummy password, so the *real-password* failure is UNVERIFIED by me (consistent with, not proof of, the brief).

## 8. Consequences for the Next.js migration wave

1. **Unit tests must not depend on Postgres** (brief constraint). Today they structurally would: settings has no sqlite/test override and no `backend/conftest.py` exists (§2, §5). Needed: test settings module or conftest DB override + `SECRET_KEY`/`DB_PASSWORD` injection (env or CI secrets) so pytest can even import settings.
2. Both CI workflows need repair before they can gate anything: `django.yml` dead path + py3.9 leg + env; `django_ci.yml` env + the allauth CRITICAL (§1, §6).
3. No frontend CI exists; when the Next app lands, add a build/lint job (§1 gap).
4. Local-up (`start_webcoder.bat`) needs `backend/.env` recreated and the venv activated to work (§4).
5. Recreating `backend/.env` requires the owner's real DB password — do NOT invent credentials; the PG auth failure (§7) is an owner-side fix (password/`pg_hba.conf` on the PG18 instance). NEVER-ROTATE applies.
