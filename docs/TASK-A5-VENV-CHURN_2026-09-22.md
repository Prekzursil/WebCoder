# TASK A5 — venv churn resolution (index-only) — COMPLETE

- Date: 2026-09-22 (UTC timestamps inline)
- Repo: C:\Users\Prekzursil\Documents\GitHub\WebCoder — branch `wave/nextjs-migration`, HEAD `40fda96808817126072a26a4540c546e15c1fe96`
- Scope held: git index operation ONLY. No commit, no push — orchestrator commits.
- Verdict: SUCCESS:A5 — venv churn eliminated from the worktree classes; 8,724 staged deletions
  await the orchestrator commit (that staging IS the fix).

## What was wrong

Historically-tracked `backend/venv/**` (8,724 index entries) churned against the rebuilt venv:
6,805 porcelain lines at pre-state (`git status --porcelain` @ 2026-09-22T18:30:56Z:
3,685 ` M` + 3,120 ` D`; wave report said 6,803 / 3,118 D — drift +2, UNVERIFIED cause,
plausibly deletions after the report snapshot).

## Fix executed

1. `git rm -r -q --cached -- backend/venv` → exit 0 (staging only).
2. Post-op `git ls-files -- backend/venv | wc -l` → 0.

## .gitignore coverage — already present, no edit made

- `git check-ignore --no-index -v backend/venv/pyvenv.cfg` → `.gitignore:2:venv/  backend/venv/pyvenv.cfg` exit 0.
  The unanchored dir pattern `venv/` matches `backend/venv` at depth.
- Detector note (single-signal discipline): plain `git check-ignore backend/venv` exits 1 —
  that is the documented artifact for TRACKED paths (tracked files are never "ignored";
  `--no-index` exists precisely to debug this). The first probe alone would have implied a
  false "not covered" verdict.
- Live second signal: after `git rm --cached`, the venv did NOT reappear as `?? backend/venv/`
  in porcelain — the ignore rule held on the real untracked-state transition.
- Working-tree `.gitignore` is CRLF (core.autocrlf=true smudge); the index blob
  (`git show :.gitignore`) is clean LF and the pattern matches regardless (measured). No edit needed.

## Post-state (final delivery surface) @ 2026-09-22T18:31:38Z

`git status --porcelain` classes:

| class | venv | non-venv |
|---|---|---|
| `D ` staged deletion | 8,724 | 0 |
| ` M` worktree modified | 0 (was 3,685) | 7 |
| ` D` worktree deleted | 0 (was 3,120) | 0 |
| `??` untracked | 0 | 16 porcelain lines |

- Cross-check: `git diff --cached --name-only | wc -l` = 8,724 — equals pre-rm ls-files (8,724)
  and porcelain `D ` count (8,724). Three-way consistent.
- Non-venv untracked 17 → 16 between snapshots despite my receipt being written inside the
  already-untracked `docs/` (adds no porcelain line): net -1 is concurrent-lane drift,
  UNVERIFIED cause (pre-state captured class counts only, not the line list — lesson).
- Untracked lines understate file counts: `docs/` and `frontend/web/` collapse directories.

## Honest reading of "porcelain must show ZERO venv paths"

- Worktree churn classes (` M` / ` D` / `??`): ZERO venv lines — the churn defect is gone. This
  is the substantive acceptance.
- The 8,724 `D ` staged-deletion lines REMAIN in porcelain by construction: staging-only (no
  commit, per contract) means the index change is visible until the orchestrator commits it.
  Gitignore cannot and must not hide staged index changes. The literal zero-venv-porcelain
  state materializes immediately after that commit.

## Untracked set (16 lines, for fan-in reference)

.coverage-thresholds.json · .github/workflows/frontend.yml · backend/Dockerfile ·
backend/Dockerfile.judge · backend/control/test_wave.py · backend/problems/test_wave.py ·
backend/submissions/judge_utils/backend.py · backend/submissions/test_wave.py ·
backend/users/test_wave.py · backend/webcoder_api/test_settings.py · docker-compose.yml ·
docs/ (collapsed; includes WAVE-REPORT_2026-09-22.md and this receipt) · frontend/web/ (collapsed) ·
frontend/webcoder_ui/build-baseline.log · frontend/webcoder_ui/test-baseline.log · mitm_mcp_traffic.db

## Provenance

disk-verified — every number above was re-read from command output on this machine, same
session, timestamps inline. Concurrent lanes were live during measurement (18:30:56Z vs
18:31:38Z snapshots differ by one untracked path).
