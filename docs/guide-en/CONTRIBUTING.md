# WebCoder — Contributing

> One-paragraph summary: WebCoder is a single-branch (`main`) monorepo — Next.js 16 at the root, Django 6 under `backend/` — where every change lands through a PR that keeps BOTH test batteries green (frontend: vitest + tsc + zero-warning lint + build + Playwright; backend: pytest at 100 % line coverage and warning-clean). This guide explains the exact gates, the PR conventions, the BACKLOG workflow, and how the roadmap "waves" operated.

**Who it's for:** anyone contributing code, content, or docs. Romanian twin: [`docs/guide-ro/CONTRIBUIE.md`](../guide-ro/CONTRIBUIE.md).

---

## 1. Repository rules

- **`main` is the only base branch.** The old split (`backend` branch) was unified in October 2026; every PR targets `main`. Never reopen the split.
- The repo is a monorepo: frontend at the root (`src/`, `package.json`), backend under `backend/`, e2e under `e2e/`, mobile shell under `mobile/`.
- Default merge is **squash** (`gh pr merge --squash --delete-branch`); true merge commits are reserved for history-preserving operations.
- Work happens in disposable worktrees — never commit inside a live deployment checkout.

## 2. The gates (must pass before you push)

Frontend — run from the repo root:

```bash
npm run test                      # vitest
npx tsc -p tsconfig.json --noEmit # typecheck
npm run lint                      # 0 errors AND 0 warnings (zero-warnings policy)
npm run build                     # next build
npx playwright test               # e2e, mock-api mode (hermetic)
```

Backend — any interpreter with `backend/deps.txt` installed:

```bash
SECRET_KEY=x DB_PASSWORD=x python -m pytest -q    # sqlite CI profile, 100 % line cov, 0 warnings
```

Quality rules enforced on top:

- **Every NEW backend module reaches 100 % line coverage** — the repo-wide bar was 100 % before; keep it.
- **Zero warnings**: the pytest suite runs warning-clean (fix at the source, or add a narrowly-scoped, individually-commented `filterwarnings` ignore); `npm run lint` reports zero problems.
- Ruff format + biome format run in CI; unformatted code fails the quality gate.
- Migrations must not collide: waves number their migrations independently — if two branches add the same-numbered migration, renumber the younger one before merge (see PRs #360, #375).

## 3. PR conventions

1. Branch from `origin/main` (`git worktree add <path> -b <branch> origin/main`).
2. Implement **with tests** — backend pytest for every new endpoint/command; frontend vitest for components; Playwright coverage for user-visible flows (extend `e2e/mock-api` fixtures; add real-stack specs when the feature touches the judge or auth).
3. Verify locally (the exact gates above), push, and open the PR against `main` with `gh pr create`.
4. Poll checks to green (CI runs `frontend.yml` on root-source paths, `django.yml` on `backend/**`, CodeQL on everything) — up to 20 × 30 s.
5. `gh pr merge --squash --delete-branch`, then remove the worktree.
6. **Live-stack validation after backend merges** (RUNBOOK §PR conventions): `git -C <live worktree> pull --ff-only origin main`, rebuild `backend celery-worker judge-runner`, `manage.py migrate`.

Commit style: `type(scope): summary` — e.g. `feat(contests): …`, `fix(e2e): …`, `docs(guides): …`. The wave PRs are a good reference (`git log --oneline`).

## 4. The BACKLOG workflow

`docs/BACKLOG.md` is the item-level tracker of record. Rules (stated at the top of the file):

- statuses: `shipped (PR #N)` · `in-flight (wave X)` · `planned (wave E/F/G)` · `someday`;
- **the wave agent that ships an item updates its status in the same PR**;
- numbering is stable — never renumber; retire with `~`.

Above it sits `docs/SPEC-GAPS.md` (the platform backlog with B/J/F/A/Q/SP/X ids) and `docs/ROADMAP-COMPETITIVE-2026-10-22.md` (the 78-gap catalog + wave sequencing + the binding round-2 corrections). New ideas go to the BACKLOG parking lot; new platform gaps get a SPEC-GAPS row.

## 5. How the waves worked

The 2026-11 feature program ran as sequential waves (0 → A → B → C → D → E → F → G), each a set of PRs implementing a roadmap slice:

1. The wave's spec was read from ROADMAP §4 + the round-2 additions (ops-before-features, moderation-before-UGC, legal gates — these override the roadmap when they disagree on order).
2. Items shipped as coherent PR groups (branch → tests → local verify → PR → checks → squash-merge), each PR updating BACKLOG statuses.
3. Judge/auth-touching items additionally validated on the live compose stack (RUNBOOK Mode A), including real-mode Playwright (`E2E_API_BASE=http://127.0.0.1:8010`).
4. Content work (the ~1 850-problem import, hidden-test generation) ran as content-ops commands committed to the repo (`catalog_polish`, `boost_hidden_tests`, `export_catalog`/`import_catalog`) so every data mutation is reviewable and reproducible.

## 6. Content contributions

- Problems are authored **bilingually**: English statement mandatory (universal fallback), Romanian strongly preferred; 10 further locales optional per problem.
- Bac-style "write the subprogram" tasks are rewritten as whole-program I/O tasks when imported (same exercise, our own words — see `problems/data/hidden_test_specs.py`).
- Test suites: never import third-party test data you don't have rights to; generate hidden suites via the committed spec format (reference solution + inputs + wrong-solution flip check).
- The CNT-2 permission ledger (`ImportSource`) records source, terms and evidence for every imported corpus.

## 7. Documentation contributions

The docs suite is bilingual (EN under `docs/guide-en/`, RO under `docs/guide-ro/`) and built into PDF/DOCX/TEX by `docs/build-docs.ps1` (pandoc + tectonic; outputs committed under `docs/dist/`). When you change behavior documented in a guide, update both language twins in the same PR and rebuild the artifacts:

```powershell
docs/build-docs.ps1    # regenerates docs/dist from the .md sources
```

Diagrams: Mermaid sources live in `docs/diagrams/*.mmd` with rendered PNGs beside them — edit the `.mmd`, re-render (mermaid-cli), commit both.
