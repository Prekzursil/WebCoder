# WebCoder — Contribuții

> Rezumat într-un paragraf: WebCoder este un monorepo pe o singură ramură (`main`) — Next.js 16 la rădăcină, Django 6 sub `backend/` — în care orice modificare ajunge printr-un PR care ține VERZI ambele baterii de teste (frontend: vitest + tsc + lint fără warninguri + build + Playwright; backend: pytest cu 100 % acoperire de linii și fără warninguri). Ghidul explică porțile exacte, convențiile de PR, fluxul BACKLOG și cum au funcționat „valurile" de roadmap.

**Cui se adresează:** oricui contribuie cod, conținut sau documentație. Perechea în engleză: [`docs/guide-en/CONTRIBUTING.md`](../guide-en/CONTRIBUTING.md).

---

## 1. Regulile repository-ului

- **`main` este singura ramură de bază.** Vechiul split (ramura `backend`) a fost unificat în octombrie 2026; fiecare PR țintește `main`. Nu redeschideți splitul.
- Repo-ul e monorepo: frontend la rădăcină (`src/`, `package.json`), backend sub `backend/`, e2e sub `e2e/`, shell-ul mobil sub `mobile/`.
- Merge-ul implicit este **squash** (`gh pr merge --squash --delete-branch`); commit-urile de merge adevărate sunt rezervate operațiunilor care păstrează istoric.
- Lucrul se face în worktree-uri de unică folosință — niciodată nu se comite într-un checkout de deploy live.

## 2. Porțile de calitate (obligatorii înainte de push)

Frontend — din rădăcina repo-ului:

```bash
npm run test                      # vitest
npx tsc -p tsconfig.json --noEmit # typecheck
npm run lint                      # 0 erori ȘI 0 warninguri (politica zero-warninguri)
npm run build                     # next build
npx playwright test               # e2e, mod mock-api (ermetic)
```

Backend — orice interpretor cu `backend/deps.txt` instalat:

```bash
SECRET_KEY=x DB_PASSWORD=x python -m pytest -q    # profil CI sqlite, 100 % acoperire, 0 warninguri
```

Reguli de calitate aplicate peste:

- **Orice modul backend NOU atinge 100 % acoperire de linii** — bara repo-wide a fost 100 % înainte; mențineți-o.
- **Zero warninguri**: suita pytest rulează curat (rezolvați la sursă sau adăugați un ignore `filterwarnings` îngust, comentat individual); `npm run lint` raportează zero probleme.
- Ruff format + biome format rulează în CI; codul neformatat cade la poarta de calitate.
- Migrațiile nu trebuie să se colaboreze: valurile numerotează migrațiile independent — dacă două ramuri adaugă migrații cu același număr, renumerotați-o pe cea mai tânără înainte de merge (vezi PR-urile #360, #375).

## 3. Convențiile de PR

1. Ramifică din `origin/main` (`git worktree add <cale> -b <ramura> origin/main`).
2. Implementează **cu teste** — pytest backend pentru fiecare endpoint/comandă nouă; vitest pentru componente; acoperire Playwright pentru fluxurile vizibile pentru utilizator (extindeți fixture-urile `e2e/mock-api`; adăugați specificații real-stack când funcționalitatea atinge evaluatorul sau autentificarea).
3. Verifică local (porțile exacte de mai sus), push, deschide PR-ul către `main` cu `gh pr create`.
4. Urmărește check-urile până la verde (CI rulează `frontend.yml` pe căile din rădăcină, `django.yml` pe `backend/**`, CodeQL pe tot) — până la 20 × 30 s.
5. `gh pr merge --squash --delete-branch`, apoi șterge worktree-ul.
6. **Validare pe stack-ul live după merge-uri de backend** (RUNBOOK §convenții PR): `git -C <worktree live> pull --ff-only origin main`, rebuild `backend celery-worker judge-runner`, `manage.py migrate`.

Stil de commit: `tip(scop): rezumat` — ex. `feat(contests): …`, `fix(e2e): …`, `docs(guides): …`. PR-urile valurilor sunt o referință bună (`git log --oneline`).

## 4. Fluxul BACKLOG

`docs/BACKLOG.md` este tracker-ul de nivel element, de referință. Reguli (stated la începutul fișierului):

- statusuri: `shipped (PR #N)` · `in-flight (wave X)` · `planned (wave E/F/G)` · `someday`;
- **agentul valului care livrează un element îi actualizează statusul în același PR**;
- numerotarea e stabilă — nu renumerotați; retrageți cu `~`.

Deasupra stau `docs/SPEC-GAPS.md` (backlog-ul de platformă cu id-urile B/J/F/A/Q/SP/X) și `docs/ROADMAP-COMPETITIVE-2026-10-22.md` (catalogul de 78 gap-uri + secvențierea valurilor + corecțiunile binding din round-2). Ideile noi merg în parking lot-ul BACKLOG; gap-urile noi de platformă primesc un rând în SPEC-GAPS.

## 5. Cum au funcționat valurile

Programul de feature-uri 2026-11 a rulat ca valuri secvențiale (0 → A → B → C → D → E → F → G), fiecare un set de PR-uri care implementau o felie de roadmap:

1. Specificația valului se citea din ROADMAP §4 + adaosurile round-2 (ops-înainte-de-feature-uri, moderare-înainte-de-UGC, porți legale — acestea înving roadmap-ul când nu cad de accord pe ordine).
2. Elementele livrau ca grupuri coerente de PR-uri (ramură → teste → verificare locală → PR → check-uri → squash-merge), fiecare PR actualizând statusurile din BACKLOG.
3. Elementele care atingeau evaluatorul/autentificarea se validau suplimentar pe stack-ul compose live (RUNBOOK Mode A), inclusiv Playwright în mod real (`E2E_API_BASE=http://127.0.0.1:8010`).
4. Lucrul de conținut (importul de ~1 850 de probleme, generarea testelor ascunse) a rulat ca management commands comise în repo (`catalog_polish`, `boost_hidden_tests`, `export_catalog`/`import_catalog`) — astfel încât orice mutație de date e review-abilă și reproductibilă.

## 6. Contribuții de conținut

- Problemele se author-esc **bilingv**: enunțul în engleză e obligatoriu (fallback universal), româna e puternic recomandată; încă 10 limbi sunt opționale per problemă.
- Sarcinile de tip Bac „scrieți subprogramul" se rescriu la import ca sarcini cu program complet I/O (aceeași exercițiu, cuvintele noastre — vezi `problems/data/hidden_test_specs.py`).
- Suite de teste: nu importați date de test third-party fără drepturi; generați suite ascunse prin formatul de specificații comis (soluție de referință + inputuri + verificare de flip pe soluție greșită).
- Ledger-ul de permisiuni CNT-2 (`ImportSource`) înregistrează sursa, termenii și dovada pentru fiecare corpus importat.

## 7. Contribuții de documentație

Suita de docs e bilingvă (EN în `docs/guide-en/`, RO în `docs/guide-ro/`) și se build-uiește în PDF/DOCX/TEX prin `docs/build-docs.ps1` (pandoc + tectonic; outputurile se comit sub `docs/dist/`). Când schimbați un comportament documentat într-un ghid, actualizați ambele perechi lingvistice în același PR și rebuild-uiți artefactele:

```powershell
docs/build-docs.ps1    # regenerează docs/dist din sursele .md
```

Diagrame: sursele Mermaid stau în `docs/diagrams/*.mmd` cu PNG-uri randate lângă ele — editați `.mmd`, re-randați (mermaid-cli), comiteți ambele.
