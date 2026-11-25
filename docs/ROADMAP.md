# WebCoder — Product Roadmap (layered)

Last updated: 2026-11-20 (waves E/F/G landed; polish & completeness sweep done). Layers are the platform's architecture; within each, items carry status: **SHIPPED** (with PR), **IN FLIGHT**, or **NEXT** (backlog item numbers from `BACKLOG.md`, e.g. "B-29"). The tracker of record for item-level status is `BACKLOG.md` — this file is the layer view.

## Layer 0 — Core judge & execution
- SHIPPED: sandboxed docker-exec judge; interactive problems — interactor protocol over piped stdio with own limits + pair wall-clock cap (JDG-2, Wave D #239); per-test partial scoring; custom checkers (5 modes); per-problem time/mem limits; MLE/TLE genuine detection; verdict-forging backdoors removed; submit-time language validation (#181–#183).
- SHIPPED (judge-fairness + waves A–G): per-language time+memory multipliers + per-problem overrides; 8 languages (C, C++17, Python 3, Java 21, JavaScript, Go, C#, Pascal) with pinned toolchains; per-problem library/feature policy; partial-code problems w/ locked regions; Blockly + Scratch engines (docs/BLOCK-PROGRAMMING.md); subtask groups (A-1, #206); output-only (A-3, #246); rich checkers exit-7 partial protocol (A-4, #221); WA diff viewer + hidden-test output gating (A-7); sample-run pre-submit + pre-submit lint + overflow warnings (A-8/9/10, #333); stress-test helper + Polygon/Kattis import (A-12, #307/#334); verifier rejudge + hidden-test preview + testcase strength (A-15/16/17, #334); language version pinning (A-18); memory profiling + closeness bands + TLE time-travel (A-19/21/25, #332); compile-error explainers + submission diffing + sandbox receipts (A-13/20, #333/#335); drag-drop files + random problem (A-23/24, #335).
- NEXT: nothing user-visible open in this layer.

## Layer 1 — Learning & curriculum
- SHIPPED: difficulty/tags catalog, hints + editorials with AFTER_AC gating (wave A, #203), bilingual seed pack + onboarding, teacher/classroom + assignments (wave B).
- SHIPPED (waves B/E): curriculum tree grades 5–12 complete (B-26, #336), admitere tracks (B-27), olympiad ladders (B-28), spaced-repeat review (B-29, #337), skill graph (B-30), guided first-solve ladder (B-31), algorithm visualizers (B-32, #343), theory cards (B-33), practice-plan generator (B-34), mistake-pattern profile (B-35), read-the-code/fill-line/complexity drills (B-36/37/38, #339), teacher collections (B-39), daily warmup katas (B-40), exam PDF export (B-41, #341), parent report cards (B-42), effort boards + failure heatmaps (B-43/44), structured courses incl. the Scratch→Python bridge (B-45, #342).
- NEXT: nothing user-visible open in this layer.

## Layer 2 — Contests & assessment
- SHIPPED: contest system — formats (IOI/ICPC/AtCoder), boards, freeze, clarifications, windowed personal-timer contests, ICS calendar (waves B/C); Glicko ratings + display suppression + color bands + divisions; integrity guards + AI policy + the numeric capacity gate (contest_replay).
- SHIPPED (wave F): virtual contests + upsolving mode (C-46/47), hacks/counter-tests (C-48), team contests (C-49), school cups (C-50), annotated rating graphs (C-51), percentiles (C-52), divisions w/ promotion events (C-53), long contests (C-54), self-prediction calibration (C-55), contest commentaries (C-56), replay scrubbers (C-57), frozen-board drama page (C-58).
- NEXT: nothing user-visible open in this layer.

## Layer 3 — Community, content & authoring
- SHIPPED: forum (threads/posts/votes/reports/moderation), notifications, translation proposals pipeline + AI curator (i18n wave; OFF by default); private 1:1 messaging COM-5 (owner reversal 2026-10-30 — shipped WITH its full moderation burden: per-message reporting, RO+EN content filter flag-not-block, blocks honored end-to-end, send/thread rate limits, minor-safety contact policy, admin audit metadata-only with report-gated transcripts); editorials + hint ladder (#203); per-problem discuss w/ spoiler gating (D-60); community editorials + article hub (wave C); moderation-before-UGC kit; legal pages + GDPR export.
- SHIPPED (wave F): solution licenses (D-61), user blogs (D-62), RO-first wiki (D-63), WA-help queue (D-64), following feeds (D-65), reputation tiers + privilege ladder (D-66), community awards (D-67), medalist AMAs (D-68), problem-request board (D-69), setter CVs (D-70), shareable solve cards (D-71), embeddable widgets (D-72); authoring: visual wizard (I-121), testcase generator DSL (I-122), statement linter (I-123), EN+translation sidecar (I-124), changelog + restore (I-125), variant families (I-126), Polygon legacy import (I-127), statement attachments (I-128), saved searches (I-129), source attribution + permission ledger (I-130, wave C), scheduled drops (I-131), author analytics (I-132), testcase bounties (I-133), readability scoring (I-134).
- NEXT: nothing user-visible open in this layer.

## Layer 4 — Client experiences (web / PWA / mobile)
- SHIPPED: responsive + a11y gates, viewport suites; PWA — manifest + service worker, offline problem browsing, install, notification deep links (OPS-6, Wave D #241; install icons #289); CodeMirror 6 editor + scratch console (E-73/74, wave A); KaTeX statements (E-77); bookmarks + tracks (E-83); .ics feed (E-85); print CSS (E-93); 12-language UI (i18n wave).
- SHIPPED (wave G): split view, dark/light toggle, Ctrl-K palette, keyboard map, guest try-it, feature tour (E-75/79/80/81/89/94, #361); cross-device drafts, statement annotations, localized sample comments, timezone support, offline statement packs (E-76/78/86/87/92, #362); federated search, notification digests, onboarding checklist, minor-safe profiles, a11y display modes (E-82/84/88/90/91, #364).
- SHIPPED (mobile, #370): push notifications, offline mode, streak widget, QR classroom join, tablet layout (F-95..99) — store submission remains owner-deferred (paid accounts).
- NEXT: F-100 (email/SMS fallback notices) rides the mail transport.

## Layer 5 — Data, analytics & insights
- SHIPPED: owner analytics — activation funnel, D1/D7, weekly snapshots + admin dashboard (ANA-1, #244); leaderboard aggregation; weekly boards + verdict feed (wave C); heat calendar + difficulty calibration (G-101/103); public API v1 read-only + personal tokens (wave C/D).
- SHIPPED (wave G, #365): per-problem language stats (G-102), time-of-day charts (G-104), org dashboards (G-105), public standings + profiles (G-106 expansion), webhooks (G-107), GDPR data export (G-108), A/B experiments (G-109), search analytics (G-110), funnel dashboards (G-111), season reports (G-112).
- NEXT: nothing user-visible open in this layer.

## Layer 6 — Integrity, safety & trust
- SHIPPED: sandbox receipts, throttles, moderation states, cookie-auth, CSRF; contest integrity guards + AI-cheating policy; certifications — leaderboard-derived atestats, public UUID verification, revocation ledger (H-120, wave D).
- SHIPPED (wave G, #367): plagiarism + boilerplate scans (H-113/114), multi-account IP heuristics (H-115), AI-declaration labeling (H-116), abuse queue + SLA (H-117), moderation appeals + audit trail (H-118), bug bounty page (H-119).
- NEXT: nothing user-visible open in this layer.

## Layer 7 — Platform ops & reliability
- SHIPPED: compose stack + overlays, CI gates, prod settings profile, socket-proxy default, backup strategy + sidecar execution, observability baseline (healthz/readyz, JSON logs, admin metrics), contest capacity gate.
- SHIPPED (wave G, #368): status page (J-139), judge queue transparency (J-135), autoscaling scripts (J-136), contest priority lanes (J-137), load-test harness (J-138), blue-green deploy (J-140), nightly prod-like e2e (J-141), restore drills (J-142), cost dashboard (J-143), edge protection (J-144), error tracking productized (J-145).
- NEXT: nothing user-visible open in this layer.

## Layer 8 — Sustainability & ecosystem
- DECIDED (wave D): open-source/self-host posture — docs/DECISION-OPEN-SOURCE.md (closed platform pre-traction; component-level OSS rolling; K-149 remains the backlog item for the first extraction).
- SHIPPED (wave G, #369): supporter tier (K-146), school partnerships (K-147), teacher certification (K-148), annual transparency report (K-150). Events shipped in wave F (D-67/68/70/71).
- NEXT: nothing user-visible open in this layer.

## Sequencing rule
Dependencies flow Layer 0 → 1/2 → 3/4 → 5/6 → 7/8. Program history: waves A–D (roadmap core) → parity audit → judge-fairness → i18n-10 → mobile → wave E (A+B backlog) → wave F (C+D+I backlog) → wave G (E+F+G+H+J+K backlog) → 7-gate battery → live verification → **2026-11-20 polish & completeness sweep** (bilingual docs suite, content hygiene + translations, hidden-test regeneration for the parked catalog, catalog reproducibility, live-stack probe). Production deployment remains owner-deferred, LAST.
