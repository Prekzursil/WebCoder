# CI both-states proof - WebCoder - 2026-09-22

Branch: wave/nextjs-migration. Author: workflow subagent (CI unit).
Scope: .github/workflows/frontend.yml (new), .github/workflows/django.yml (update),
.coverage-thresholds.json (new, repo root). Proof method: run each gate command
locally in a known-failing state (temp failing test / broken file / missing file),
capture exit code, then clean state, capture exit code. All temp breakage deleted
and deletion verified by ls.

Sentinel: this file has been rewritten from its all-UNKNOWN skeleton with measured
values; the skeleton phase is complete.

## 1. Context measured before gates

- Repo: C:/Users/Prekzursil/Documents/GitHub/WebCoder, branch wave/nextjs-migration (git rev-parse).
- frontend/web is Next 15.5.25 + vitest 5, node_modules present, @vitest/coverage-v8 present (ls).
- Frontend test surface: 25 test files / 230 tests visible to vitest (measured in the
  red run: 1 failed | 24 passed files). Initial scoped ls only saw src/app/*.test.*.
- backend venv python 3.12.12, pytest 8.3.2; venv has NO pip module (python -m pip fails).
- node v24.16.0, npm 12.0.2, global pip 26.2.1 on Python 3.14 (command output).
- webcoder_api/test_settings.py overrides DB to sqlite; SECRET_KEY/DB_PASSWORD defaults set (file read).
- Free RAM at start: 1.7 GB (Win32_OperatingSystem.FreePhysicalMemory).
- Both workflow files parse as YAML (python yaml.safe_load, global python).

## 2. Gate: pytest --ds webcoder_api.test_settings (django.yml)

- Failing-state probe: temp backend/test_gate_probe_tmp.py with assert 1 == 2.
  Command: ./venv/Scripts/python.exe -m pytest --ds webcoder_api.test_settings test_gate_probe_tmp.py -p no:cacheprovider --no-cov -q
  Result: exit 1, output "1 failed in 0.17s" with the AssertionError on the probe test.
  Deviation note: probe scoped to one file and coverage disabled to avoid churning the
  already-dirty backend/.coverage; the exit code is driven purely by the test failure.
- Green probe (same command shape, probe flipped to assert 1 == 1): exit 0, "1 passed in 0.01s".
- Clean state, EXACT gate command over the full suite:
  ./venv/Scripts/python.exe -m pytest --ds webcoder_api.test_settings
  Result: exit 0, "195 passed, 1 warning in 90.69s". Coverage TOTAL 3180 stmts,
  1223 missed, 62 percent. Run block ~93 s wall clock.
- Verdict: NOT silent-pass. Confidence high (both exit codes measured).
- Honest finding: measured backend coverage is 62 percent against the 100 percent
  threshold in .coverage-thresholds.json; the tool does not fail on this because
  pytest.ini has no --cov-fail-under flag. The 100 percent floor is enforced only by
  the orchestrator reading the thresholds file.

## 3. Gate: npx vitest run --coverage (frontend.yml)

- Failing-state probe: temp frontend/web/src/gate-probe-tmp.test.ts with
  expect(true).toBe(false). Command: npx vitest run --coverage.
  Result: exit 1, "Test Files 1 failed | 24 passed (25)", "Tests 1 failed | 229 passed (230)".
- Clean state (probe deleted): exit 0, "Test Files 24 passed (24)",
  "Tests 229 passed (229)", 14.04 s. Coverage "All files" row: 90.94 stmts,
  91.34 branch, 86.03 funcs, 90.97 lines (percent).
- Verdict: NOT silent-pass. Confidence high.
- Honest finding: measured frontend coverage is 86-91 percent against the 100 percent
  threshold; vitest.config.ts has no coverage.thresholds block, so the tool exits 0
  below 100. Tool-level enforcement is not wired (owner decision, see section 7).

## 4. Gate: npm run build (frontend.yml)

- Failing-state probe: temp frontend/web/src/gate-probe-tmp-broken.tsx containing a
  type error. Command: npm run build (next build --turbopack).
  Result: exit 1, "Failed to compile." with the type error located at
  ./src/gate-probe-tmp-broken.tsx:2:36. The project-wide typecheck (tsconfig include
  covers all of src) means even unreferenced files gate the build.
- Clean state (probe deleted): exit 0, build completed with the chunk listing
  printed. Ran under 1.7 GB free RAM without OOM.
- Verdict: NOT silent-pass. Confidence high.

## 5. Gate: npm ci (frontend.yml)

- Failing-state probe: temp dir /tmp/npmci-probe with package.json but NO lockfile.
  Command: npm ci. Result: exit 1, npm error citing the lockfile requirement.
- Clean state (exit-code-equivalent): npm ci --dry-run in frontend/web.
  Result: exit 0 (lockfile validated as in sync with package.json; only postinstall
  warnings printed). Rationale: a real npm ci would delete and rebuild the working
  node_modules under 1.7 GB free RAM; the dry run proves the lockfile gate without
  destroying state. The authoritative full npm ci runs on the CI runner.
- Verdict: NOT silent-pass. Confidence high for the red state; the clean state is a
  dry-run equivalent, not a full install (UNVERIFIED as a full install locally).

## 6. Gate: pip install -r requirements.txt (django.yml)

- Failing-state probe: python -m pip install -r missing-requirements-probe.txt with
  global pip 26.2.1. Result: exit 1, ERROR: Could not open requirements file.
  First attempt with the venv python also exited 1 but for the WRONG reason (the venv
  has no pip module at all); that attempt is discarded as evidence and the probe was
  redone with a real pip so the non-zero exit is attributable to the missing file.
- Clean state: FAILED-TO-RUN locally. backend/venv contains no pip module and no
  pip.exe shim; repairing it (ensurepip) would mutate a venv already under in-flight
  modification by the orchestrator, and installing into the global Python 3.14 would
  pollute a different interpreter. Corroborating signal that the dependency set IS
  present and functional in the venv: the full Django suite ran 195 tests green
  through Django 5.2, DRF, pytest-django and pytest-cov (section 2), which resolve
  only if installed. The authoritative clean install check runs on the CI runner.
- Verdict: red state proven with real pip semantics; clean state deferred to CI.

## 7. Findings and caveats

1. The previous django.yml installed from webcoder_project/backend/requirements.txt,
   a path that does not exist in this repo (real layout is backend/), so the old
   workflow could never pass; it is now path-correct.
2. django_ci.yml was NOT modified (out of task scope) but is a silent-pass shape:
   flake8 runs with continue-on-error and the test step is commented out. Flagged
   for an owner decision.
3. Coverage reality vs threshold: backend 62 percent, frontend 86-91 percent,
   against the 100 percent threshold written in .coverage-thresholds.json. Wiring
   the floor into the tools (vitest coverage.thresholds, pytest --cov-fail-under)
   would turn both CI jobs permanently red today. Per the no-silent-downgrade rule
   this was NOT wired unilaterally; the thresholds file is the SSOT gate the
   orchestrator enforces.
4. backend/venv is committed to git (its files show as modified in git status) and
   currently lacks pip. CI is unaffected (the runner installs its own pytest) but
   the committed-venv pattern is heavyweight and worth an owner decision.
5. pytest.ini runs --cov=. from backend/ with no omit config; the printed coverage
   table tail showed only app files (TOTAL 3180 stmts) but the head of the table was
   not captured, so possible venv pollution of the coverage denominator is UNVERIFIED.
6. Temp breakage created and deleted (deletion verified by ls):
   backend/test_gate_probe_tmp.py, frontend/web/src/gate-probe-tmp.test.ts,
   frontend/web/src/gate-probe-tmp-broken.tsx, /tmp/npmci-probe.
   missing-requirements-probe.txt was never created on disk.
7. Git footprint of this unit (git status --porcelain, scoped):
   M .github/workflows/django.yml, new .coverage-thresholds.json,
   new .github/workflows/frontend.yml, new docs/ci-both-states-proof_2026-09-22.md.
   No commits made (the orchestrator commits).
