# WebCoder — Product Roadmap (layered)

Last updated: 2026-10-30 · This is the master plan. Layers are the platform's architecture; within each, items carry status: **SHIPPED** (with PR), **IN FLIGHT** (current program: waves A–D → parity audit → judge-fairness → i18n-10 → mobile → waves E/F/G), or **NEXT** (backlog item numbers from `BACKLOG.md`, e.g. "B-29"). Work top-down within dependencies; the tracker of record for item-level status is `BACKLOG.md`.

## Layer 0 — Core judge & execution
- SHIPPED: sandboxed docker-exec judge; 5 languages; per-test partial scoring; custom checkers (5 modes); per-problem time/mem limits; MLE/TLE genuine detection; verdict-forging backdoors removed; submit-time language validation (#181–#183).
- IN FLIGHT: per-language time+memory multipliers; language expansion (Pascal+8); per-problem library/feature policy (Boost bans, stdlib bans, string-bypass class); partial-code problems w/ locked regions; Scratch/block editor (judge-fairness wave).
- NEXT: subtask groups (A-1), interactive problems (A-2), output-only (A-3), rich checkers (A-4), diff viewer (A-7), sample-run pre-submit (A-8), stress-test helper (A-12), rejudge tooling (A-15/16/17), test strength analysis, time-travel TLE analysis (A-25).

## Layer 1 — Learning & curriculum
- SHIPPED: difficulty/tags catalog, hints-free problem pages (hints = NEXT), skeleton onboarding pages.
- IN FLIGHT: first-run onboarding flow + bilingual seed pack + study UX (wave A); teacher/classroom + assignments (wave B).
- NEXT: curriculum tree RO grades 5–12 (B-26), admitere tracks (B-27), olympiad ladder (B-28), spaced-repeat review (B-29), skill graph (B-30), guided first-solve (B-31), visualizers (B-32), theory cards (B-33), practice plans (B-34), mistake-pattern profile (B-35), micro-exercises (B-37/38), collections (B-39), PDFs (B-41), parent reports (B-42), class analytics deep-dive (B-44), courses (B-45).

## Layer 2 — Contests & assessment
- IN FLIGHT: contest system (formats, boards, penalties, upsolving), ratings/Elo ladder + integrity, performance-at-scale guards (wave B).
- NEXT: virtual contests (C-46), upsolving mode (C-47), hacks/counter-tests (C-48), teams (C-49), school cups (C-50), rating graphs (C-51), percentiles (C-52), divisions (C-53), long contests (C-54), replay (C-57), frozen-board drama (C-58).

## Layer 3 — Community, content & authoring
- SHIPPED: forum (threads/posts/votes/reports/moderation), notifications, translation proposals pipeline + AI curator (in flight with i18n wave); private 1:1 messaging COM-5 (owner reversal 2026-10-30 — the roadmap's skip was overridden and the feature shipped WITH its full moderation burden: per-message reporting, RO+EN content filter flag-not-block, blocks honored end-to-end, send/thread rate limits, minor-safety contact policy, admin audit view metadata-only with transcripts behind an explicit report).
- IN FLIGHT: editorials/hints patterns (wave A/C), moderation-before-UGC sequencing, legal groundwork (wave C), per-problem discuss (parity audit scope).
- NEXT: editorials system (D-59), per-problem discuss (D-60), solution sharing (D-61/11), blogs (D-62), wiki (D-63), WA-help queue (D-64), follow/feeds (D-65), reputation (D-66), problem-request board (D-69), embeds (D-72); authoring: wizard (I-121), generator DSL (I-122), statement linter (I-123), versioning (I-125), variants (I-126), Polygon import (I-127), attachments (I-128), advanced search (I-129), source attribution (I-130), author analytics (I-132).

## Layer 4 — Client experiences (web / PWA / mobile)
- SHIPPED: responsive+a11y gates, dark tokens base, RO/EN, viewport suites.
- IN FLIGHT: PWA install, Expo iOS+Android apps w/ store package (mobile wave); 10-language UI everywhere (i18n wave).
- NEXT: CodeMirror 6 editor + console (E-73/74), split layout (E-75), drafts (E-76), KaTeX statements (E-77), annotations (E-78), full dark mode (E-79), palette (E-80), federated search (E-82), lists/pinning (E-83), digests (E-84), .ics (E-85), timezones (E-87), onboarding checklist (E-88), guest try-it (E-89), minor-safe profiles (E-90), a11y+ mode (E-91), offline packs (E-92/93), tour (E-94); mobile: push (F-95), offline mode (F-96), widget (F-97), tablet mode (F-98), QR join (F-99), fallbacks (F-100).

## Layer 5 — Data, analytics & insights
- IN FLIGHT: owner analytics instrumentation (wave D); leaderboard aggregation (shipped).
- NEXT: heat calendar (G-101), per-problem language stats (G-102), difficulty calibration (G-103), time-of-day (G-104), org dashboards (G-105), API v1 expansion (G-106), webhooks (G-107), data export (G-108), A/B framework (G-109), search analytics (G-110), funnel dashboards (G-111), season reports (G-112).

## Layer 6 — Integrity, safety & trust
- SHIPPED: sandbox receipts, throttles, moderation states, cookie-auth, CSRF.
- IN FLIGHT: contest integrity guards + AI-cheating policy (wave B/C).
- NEXT: plagiarism detection MOSS/JPlag (H-113), boilerplate detection (H-114), multi-account heuristics (H-115), AI-solution labeling (H-116), abuse queue + SLA (H-117), moderation appeals + audit (H-118), bug bounty (H-119), verifiable participation certs (H-120).

## Layer 7 — Platform ops & reliability
- SHIPPED: compose stack + overrides, CI gates, prod settings profile, socket-proxy variant, backup strategy doc.
- IN FLIGHT: ops-first items (wave A: backups execution, observability baseline); load-test before rated contests (wave B).
- NEXT: judge queue transparency (J-135), autoscaling workers (J-136), priority lanes (J-137), load harness (J-138), status page (J-139), blue-green (J-140), nightly prod-like e2e (J-141), restore drills (J-142), cost dashboard (J-143), edge protection (J-144), error tracking productized (J-145).

## Layer 8 — Sustainability & ecosystem
- NEXT: supporter tier (K-146), school partnerships (K-147), teacher certification (K-148), open-source client components (K-149), transparency report (K-150). Events: community awards (D-67), AMAs (D-68), setter CVs (D-70), share cards (D-71).

## Sequencing rule
Dependencies flow Layer 0 → 1/2 → 3/4 → 5/6 → 7/8. Within the current program: waves A–D (roadmap core) → parity audit → judge-fairness → i18n-10 → mobile → **wave E (A+B backlog)** → **wave F (C+D+I backlog)** → **wave G (E+F+G+H+J+K backlog)** → 7-gate battery → live verification. Production deployment remains owner-deferred, LAST.
