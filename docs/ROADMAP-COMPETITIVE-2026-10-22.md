# WebCoder Competitive Roadmap — 2026-10-22

Synthesized from 10 competitor deep-crawl reports (HackerRank, Codeforces, LeetCode, Codewars, AtCoder, DMOJ, pbinfo.ro, infoarena.ro, .campion, CodeChef) and 6 cross-cutting lens reports (contests & assignments, progression & motivation, education & teachers, judge technical capabilities, community & content, platform-ops), read against this repo's `docs/SPEC-GAPS.md` (v2, 2026-10-21) and `docs/RUNBOOK.md`. Every gap row carries evidence URLs from that research; every design sketch is anchored in WebCoder's actual stack (Django/DRF backend, Next.js 15 frontend, Celery + docker-sandbox judge, RO/EN i18n with parity tests, BASIC/CREATOR/VERIFIER/ADMIN roles, DRAFT/PENDING/APPROVED/PRIVATE problem lifecycle).

**How to read this document.** §2 gives per-competitor snapshots. §3 is the capability matrix (68 capabilities × 11 platforms). §4 is the gap catalog — 78 gaps where WebCoder is `no`/`partial`, each with evidence, a stack-specific design sketch, impact (H/M/L), effort (S/M/L) and a suggested wave. §5 is the Romanian-market section. §6 lists quick wins and big bets. §7 sequences everything into Waves 0/A/B/C/D that a future implementation workflow can execute directly, with explicit dependencies on the existing SPEC-GAPS backlog (B4/B8/B9/B10/D-B11/J5–J9/X1/X2/X7…).

---

## 1. Executive Summary

**Where WebCoder stands.** The practice-judge core is real and, in two dimensions, ahead of the field: RO/EN bilingual UI + statements with CI parity tests (no Romanian competitor has any English; only global players localize), and an engineering-quality culture (vitest 298 / Playwright e2e + axe a11y gate / pytest 499, httpOnly-cookie JWT, rate limiting, socket-proxy hardening) that no competitor publicly matches. Per-test partial scoring with custom checkers, an approval workflow with roles, and per-problem limits match what pbinfo/infoarena offer today.

**Where WebCoder is behind — four missing engines.** Measured across 68 capabilities, WebCoder scores `no` on the four systems that make every successful judge grow:

1. **Contests & ratings** — 8 of 10 competitors run rated contests (Codeforces ~6 rounds/month, AtCoder weekly, CodeChef Div 1–4 Elo-MMR, LeetCode 889k-rated-contestant pool); even infoarena runs Glicko ratings and 5,070 user-created virtual contests. Neither pbinfo nor campion has them — which is exactly the whitespace: a Romanian judge with modern contests + ratings is uncontested locally.
2. **Classroom tools** — pbinfo's classes + 3-type homework (teme) + exam-mode lockdown + per-student tracking + Bac multiple-choice bank are why it is the default homework platform in Romanian schools. This is the single biggest *local* functional gap.
3. **The learning layer** — editorials, progressive hints, post-solve solutions: every serious judge ships them (AtCoder's editorial grid, DMOJ's per-subtask editorials, LeetCode's hints, CSES's locked analyses). WebCoder ships none; SPEC-GAPS X2/A7 already sketch the foundations.
4. **Community depth** — per-problem discussions, live activity feeds, contribution mechanics. D-B9's forum design already includes a nullable `problem` FK on threads — the competitive research says that FK must be a first-class surface, not an afterthought.

**Structural bets the research validates:** a versioned curriculum taxonomy (grade → chapter → topic) as the catalog spine (pbinfo's 2,169 grade-9 problems organized by the national programme is the adoption mechanic to copy); file-I/O problem variants (`.in/.out`) as olympiad parity table stakes; and a public read-only API (Codeforces/DMOJ ecosystems prove the demand — AtCoder's lack of one spawned kenkoooo's shadow platform).

**Recommendation in one line:** execute Wave 0 (the existing SPEC-GAPS platform backlog) + Wave A quick wins immediately; make **Wave B = contests + ratings + classroom** the strategic center of gravity; deepen with Wave C (pretests/virtual, MCQ bank, exam mode, public API, plagiarism); reserve Wave D for big bets (interactive judge, PWA, certifications, hosted-contest monetization).

---

## 2. Competitor Snapshots

### 2.1 HackerRank — hackerrank.com
**Positioning:** Free consumer developer-skills community (28M+ devs: 13 practice domains, contests/hackathons, free skill certifications, AI mock interviews) whose real business is a B2B hiring suite (Screen, CodePair, Chakra AI interviewer, agentic IDE, plagiarism tooling, ATS integrations, REST API+MCP). Consumer platform web-only; no public classroom tooling.

**Standouts:**
1. Free skills certifications (13 skills × 3 levels + 3 role certs) with private-fail policy and employer highlighting — the strongest CV-value loop on any practice platform.
2. Full gamification stack: Elo from 1500, per-domain leaderboards, contest gold/silver/bronze medals, 6-star badge tiers.
3. Contests & 24h hackathons with cash/credit prizes, countdown registration, archive that becomes practice content.
4. AI-powered mock interviews in 7 formats with instant feedback + follow-up chat.
5. Enterprise hiring suite (Chakra, CodePair key-by-key replay, agentic IDE, AI plagiarism + device detection) funding the free consumer product.

### 2.2 Codeforces — codeforces.com
**Positioning:** World's largest free CP community: ~6 rated rounds/month (Div. 1–4, ICPC-style, sponsored), open hacking, Elo with color titles, virtual replay + Gym + mashups + groups, per-user blogs with voting comments, 10k-problem catalog with community-calibrated 800–3500 difficulty, EDU courses, public JSON API. Sponsor-funded; server-rendered EN/RU.

**Standouts:**
1. Open hacking: mid-contest breaking of locked solutions with points riding on hack success.
2. Elo ratings with color titles and divisions permeating every handle, filter and leaderboard.
3. Practice ecosystem around finished contests: virtual participation, Gym archive, user mashups.
4. Community as the product: blogs, contribution score, friends/messaging.
5. Fully public JSON API (18+ methods, signed keys, en/ru) over contests, standings, hacks, problems, users.

### 2.3 LeetCode — leetcode.com
**Positioning:** Self-described "gold standard for technical interviews": 4,087-problem catalog, $35/mo–$159/yr Premium, weekly rated contests (889k+ rated contestants), Daily Coding Challenge streaks/badges, Quest/Explore/study-plan gamified learning, Ask Leet AI agent, LeetCoin store, LeetCode Interview product, iOS/Android apps, separate leetcode.cn.

**Standouts:**
1. Rated weekly contests with Elo-style rating, Guardian-tier badges, 889k+ global ranking — the deepest competitive loop.
2. DCC ecosystem: daily problem, fire streak + heatmap, monthly badges, purchasable Time Travel Tickets.
3. Official editorials (video with chapters + multi-language code + complexity analysis) and company-tagged questions behind Premium.
4. Gamified learning: Quest level maps, Explore cards, Top Interview 150-style study plans.
5. LeetCode Interview: real-time collaborative interviewing with video/whiteboard and live-rendered frontend questions.

### 2.4 Codewars — codewars.com
**Positioning:** Free community "dojo" (3M+ users, 10,063 kata) for mastery through repetition: community-authored kata in 55+ languages, kyu/dan ranks, honor, 4 leaderboards; content is community-curated (beta process, weighted votes, auto-retirement). No contests, no classrooms, no certificates; English-only UI.

**Standouts:**
1. Honor-gated privilege ladder (25→10,000 honor unlocks voting → authoring → approving) — moderation as earned progression.
2. Kumite: forkable public code-sparring snippets that incubate new kata.
3. Beta process with weighted votes, per-rank satisfaction thresholds, auto-retirement of bad kata.
4. 55+ languages incl. Coq/Lean/Prolog/BF/RISC-V, with per-attempt runtime version selection.
5. Solutions economy: unlock on completion (or forfeit honor), dedup-grouped, Best-Practices vs Clever voting.

### 2.5 AtCoder — atcoder.jp
**Positioning:** Free world-class CP platform (~900k users, ~10k weekly contestants) built on weekly rated contests in two tracks — Algorithm (ABC/ARC/AGC) and Heuristic (AHC marathons, monotone rating) — plus a 5,000+ problem bilingual JA/EN archive, color-belt ratings with dan grades, deep editorial culture. Business model entirely B2B around the rating signal: sponsor contests (from ¥1M), PAST certification, AtCoderJobs, school/corporate leagues, and $100k+ AI-training data licensing.

**Standouts:**
1. Dual rating systems (performance-weighted Algorithm + never-decreasing Heuristic) made legible via colored usernames and crown icons.
2. A contest engine sellable as a recruiting funnel: sponsored naming, top-60 job events, team championships, corporate league.
3. PAST: paid proctored practical certification — "TOEIC for programming" built directly on the judge.
4. First-party AI-data licensing: hidden tests, 30M solutions, WA→AC trajectories at $100k+ budgets.
5. Editorial culture: official + user editorials + timestamped YouTube livestreams for essentially every contest.

### 2.6 DMOJ — dmoj.ca
**Positioning:** Free, open-source (AGPLv3) "modern online judge": contest platform + 5,275-problem archive mirroring CCC/IOI/JOI + the reference judging stack (75 languages, subtasks, interactive). 212k users, 7.97M submissions. Monetizes only private educational contests; retention via Elo ladder with colored usernames, weighted PP points, windowed virtual contests, per-problem editorials, school organizations.

**Standouts:**
1. Full virtual-contest machinery: windowed personal-timer contests, hidden scoreboards, IOI clarifications, Elo ladder.
2. Judge depth: 75 languages, subtask partial scoring, interactive first-class, mapped RE feedback (segfault/bad_alloc/syscall).
3. Per-problem markdown editorials structured by subtask, author credit, threaded comments, "has editorial" catalog filter.
4. Public JSON API v2 verified live: unauthenticated problems/submissions/users/contests reads, 1000-object pages, 90 req/min.
5. Open ecosystem: AGPL source, self-host clones, Crowdin translation (20+ locales), websocket submission feed.

### 2.7 pbinfo.ro
**Positioning:** Romania's de-facto classroom judge: donation/ad-funded personal project (since ~2014) with 5,000+ auto-evaluated problems mapped 1:1 onto the national informatics curriculum (grades 9–11), a Bacalaureat MCQ bank, and the teacher workflows (classes, 3-type teme, exam-mode lockdown) that make it the default homework platform. Culture of "100 de puncte"; Romanian-only; legacy stack (Pascal, PHP5, Python 2.7, file I/O).

**Standouts:**
1. Curriculum-mapped catalog (grade → chapter → subcategory) with per-node problem/exercise/article counts — the spine Romanian teachers actually navigate.
2. Full teacher stack: classes with self-join, 3 homework types (problem sets, MCQ sets, file uploads), lifecycles, per-student max-score tracking, exam-mode site lockdown.
3. Auto-evaluated Bac grile bank with discipline/class/Bac-year filters, shuffling, per-class statistics.
4. Test transparency after first submission (proposer-controlled) — judge data as a teaching resource.
5. County-level Top 100 leaderboards (42 counties + Moldova) + milestone medals, wiring Olympiad geography into motivation.

### 2.8 infoarena.ro
**Positioning:** Romania's oldest (2004) community-run, fully wiki-editable open-source CP platform: 2,377-problem archive, 63-problem educational track with open sources, real contest engine with Glicko ratings, 5,070 user-created virtual contests, 6-language judge incl. interactive problems, deep content layer (algorithm wiki + official editorials, SMF forum, blog), and 30 years of downloadable olympiad materials. Free, RO-only, dated UI.

**Standouts:**
1. User-created virtual contests — any member schedules a contest from the archive (5,070 run).
2. Glicko contest rating with a public 6,044-user leaderboard and per-user history.
3. Educational archive with open solutions, hints, and linked 100-point sources per topic.
4. Fully wiki-editable open-source platform with page history and attachments.
5. 30 years of downloadable OJI/ONI problems, tests and official solutions.

### 2.9 .campion (campion.edu.ro / Arhiva Educațională) — defunct
**Positioning:** Romania's national teacher-led informatics training program (2002–2012, SIVECO + Ministry of Education); the free Arhiva continued as a curated 1,564-problem classified olympiad archive with evaluator, articles, educational software, and teacher groups (disabled by June 2025). Site no longer resolves — all evidence from Wayback snapshots (2025-06-18).

**Standouts:**
1. Borderou evaluation sheet: per-test scores split example vs official, evaluator message per test, live queue states — all publicly viewable while code stays private.
2. Teacher classroom groups: co-coordinators, teme, per-student monitoring, teme-concurs hiding scores/hints until deadline.
3. Hint escalation: struggling students unlock solution indications (PDF) and the actual test data.
4. Whole-corpus editorial ecosystem: theory articles + educational software + keyword taxonomy, cross-recommended from every problem page.
5. Contest mechanics: training rounds alternating with contest rounds, YES/NO/NO-COMMENT clarifications, post-round solutions+tests publication, formal appeals with public score adjustments.

### 2.10 CodeChef — codechef.com
**Positioning:** 5M+-user CP + learn-to-code platform (Unacademy): weekly rated Starters with Divisions 1–4 and Elo-MMR stars, 5,000+ problem library, full education business (60+ courses, skill tests, certificates) at $124/yr Pro with 24/7 AI mentor; Discourse community doubling as editorial archive; problem-setting/hosting programs and a job board.

**Standouts:**
1. Elo-MMR star ratings with Division 1–4 parallel rated contests — the deepest ladder among judges.
2. Full learning platform on the judge: courses, roadmaps, timed MCQ skill tests, certificates.
3. AI Help + hints + 1,600 video solutions + visible WA test cases per problem.
4. Community editorial engine: every contest problem gets a tagged Discourse editorial; open Setter/Tester/Editorialist program.
5. Career funnel: recruiter-shareable profiles, star-gated job board, proctored DSA certification.

---

## 3. Feature-Presence Matrix

Legend: **Y** = yes · **P** = partial · **N** = no · **?** = unknown/not observed in the research. Columns: **Us** = WebCoder (current repo state, per SPEC-GAPS v2 — designed-but-unshipped counts as P at best), **HR** HackerRank, **CF** Codeforces, **LC** LeetCode, **CW** Codewars, **AC** AtCoder, **DM** DMOJ, **PB** pbinfo.ro, **IA** infoarena.ro, **CA** .campion (Wayback), **CC** CodeChef.

### 3.1 Catalog & discovery

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Hierarchical / curriculum problem taxonomy | P | Y | P | P | P | P | Y | Y | Y | P | P |
| 2 | Full-text problem search | P | ? | N | ? | Y | P | Y | Y | P | Y | Y |
| 3 | Solved/attempted status filter + list indicators | N | Y | P | Y | Y | P | P | P | P | P | P |
| 4 | Per-problem popularity stats (solve counts, AC%) | N | Y | Y | Y | Y | P | Y | Y | Y | P | Y |
| 5 | Community-calibrated numeric difficulty | N | P | Y | P | P | P | P | P | P | P | Y |
| 6 | Similar/related problem recommendations | N | N | N | Y | Y | N | N | N | N | Y | N |
| 7 | Daily problem rotation | N | N | N | Y | N | N | N | N | N | N | N |
| 8 | Curated study tracks / playlists | N | Y | Y | Y | Y | P | N | N | Y | P | Y |

### 3.2 Judge capabilities

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 9 | Per-test partial scoring | Y | Y | P | P | N | N | Y | Y | Y | Y | Y |
| 10 | Subtask groups w/ grouped points | N | N | Y | ? | N | N | Y | N | Y | N | Y |
| 11 | Interactive problems | N | N | Y | Y | N | Y | Y | N | Y | N | ? |
| 12 | Output-only problems | N | N | P | N | N | N | ? | N | N | N | N |
| 13 | Custom checkers / special judge | Y | Y | Y | P | Y | Y | Y | Y | Y | Y | Y |
| 14 | Checker partial-points protocol (testlib-style) | N | ? | Y | ? | N | ? | Y | P | P | P | Y |
| 15 | Run with custom input (scratch) | N | P | Y | Y | Y | ? | ? | N | N | N | Y |
| 16 | Two-phase pretests → system tests | N | N | Y | P | N | N | Y | N | P | N | P |
| 17 | Mapped runtime-error feedback (signals, exceptions) | P | P | P | P | P | P | Y | Y | Y | P | P |
| 18 | Per-language TL multipliers/overrides | N | Y | Y | P | N | N | Y | N | N | N | ? |
| 19 | Language breadth (15+) | P | Y | P | Y | Y | Y | Y | P | P | N | P |
| 20 | Modern toolchains (C++20/23, current Java/Python) | P | Y | Y | P | Y | Y | Y | N | P | N | P |
| 21 | Sandbox hardening (network-none, syscall limits) | Y | Y | Y | Y | Y | Y | Y | ? | Y | ? | Y |
| 22 | Plagiarism / similarity detection | N | Y | Y | P | N | N | P | N | N | N | Y |
| 23 | Rejudge + queue states (WJ/WR) as admin flows | P | ? | P | ? | N | Y | P | P | P | P | P |
| 24 | Per-problem I/O-mode variants (files vs stdin) | N | N | P | N | N | N | P | Y | Y | Y | N |

### 3.3 Contests

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 25 | Timed/rated contests | N | Y | Y | Y | N | Y | Y | N | Y | Y | Y |
| 26 | Pluggable formats (ICPC/IOI/CF/windowed) | N | P | P | P | N | P | Y | N | P | P | P |
| 27 | Live scoreboard w/ freeze | N | P | P | P | N | Y | Y | N | Y | Y | Y |
| 28 | In-contest clarification queue | N | ? | Y | ? | N | Y | Y | N | P | Y | P |
| 29 | Virtual participation / replay | N | P | Y | Y | N | Y | Y | N | Y | N | P |
| 30 | User-created contests / mashups | N | N | Y | N | N | N | P | N | Y | N | N |
| 31 | Divisions / rating bands / eligibility gates | N | N | Y | N | N | P | P | N | N | N | Y |
| 32 | Contest calendar + reminders/countdown | N | P | Y | P | N | P | Y | N | P | P | Y |

### 3.4 Ratings & gamification

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 33 | Elo/Glicko contest rating | N | Y | Y | Y | N | Y | Y | N | Y | N | Y |
| 34 | Color bands / titles on handles | N | P | Y | P | N | Y | Y | N | N | N | Y |
| 35 | Contest-free practice rank ladder | N | P | N | N | Y | N | N | N | N | N | N |
| 36 | Badges / achievements | N | Y | P | Y | P | P | P | P | N | N | P |
| 37 | Streaks + activity heatmap | N | N | P | Y | N | N | Y | N | N | N | Y |
| 38 | Per-skill/tag proficiency profile | N | Y | N | Y | Y | N | N | N | N | N | P |
| 39 | Contest medals / winner crowns | N | Y | P | P | N | P | N | N | N | N | P |

### 3.5 Education & teachers

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 40 | Classes / rosters (self-join) | N | P | P | N | N | N | P | Y | N | P | N |
| 41 | Assignments with publish windows + lifecycle | N | P | N | N | N | N | P | Y | N | P | N |
| 42 | Exam-mode site lockdown | N | N | N | N | N | N | P | Y | N | P | N |
| 43 | Per-student progress grid / monitoring | N | P | N | N | N | N | P | Y | N | Y | N |
| 44 | Auto-graded MCQ quiz bank | N | P | N | N | N | N | N | Y | N | N | Y |
| 45 | Gradebook export (CSV/XLSX) | N | P | N | N | N | N | N | N | N | P | N |
| 46 | County/country/school leaderboard segments | N | P | Y | Y | N | Y | P | Y | N | P | Y |

### 3.6 Editorials & learning content

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 47 | Per-problem editorials | N | Y | Y | Y | P | Y | Y | P | Y | Y | Y |
| 48 | Progressive hint ladder | N | P | N | Y | N | N | N | N | Y | Y | Y |
| 49 | Solutions locked until solved | N | P | P | P | Y | P | P | P | Y | P | N |
| 50 | Community-contributing editorials, credited | N | N | P | Y | P | Y | N | N | Y | N | Y |
| 51 | Algorithm articles / lecture hub | N | Y | P | P | N | Y | P | Y | Y | Y | Y |
| 52 | Math rendering in statements (KaTeX/LaTeX) | N | P | Y | P | Y | Y | Y | N | P | N | P |

### 3.7 Community

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 53 | Per-problem discussion threads | N | Y | N | Y | Y | N | Y | P | P | P | P |
| 54 | Forum w/ votes + reports + moderation | P | P | Y | Y | P | N | P | P | Y | P | Y |
| 55 | Live submission feed | N | N | P | N | N | N | Y | N | Y | N | N |
| 56 | Friends / follow graph + filtered views | N | N | Y | P | Y | N | N | N | N | N | N |
| 57 | Private messaging | N | N | Y | N | N | N | N | Y | N | N | N |
| 58 | Trust-weighted voting / community moderation | P | N | Y | N | Y | N | Y | N | N | N | N |

### 3.8 Profiles & stats

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 59 | Rich public profiles (rating graph, heatmap, bio) | N | P | Y | Y | Y | Y | Y | P | P | P | Y |
| 60 | Per-problem best-solutions ranking | N | Y | P | N | N | N | Y | N | Y | N | N |
| 61 | Runtime/memory percentile vs community | N | N | N | Y | N | N | N | N | P | N | N |

### 3.9 Platform & ops

| # | Capability | Us | HR | CF | LC | CW | AC | DM | PB | IA | CA | CC |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 62 | Public read-only API | N | P | Y | N | Y | N | Y | N | N | N | N |
| 63 | 2FA + personal API tokens | N | P | N | N | N | N | Y | N | N | N | N |
| 64 | Bilingual UI + statements (site-level) | Y | N | Y | N | N | Y | Y | N | N | N | N |
| 65 | SEO'd public problem pages (sitemap/SSR/hreflang) | P | P | P | Y | P | P | P | Y | P | N | P |
| 66 | Published accessibility commitment | P | N | N | N | N | N | N | N | N | N | N |
| 67 | Mobile app / PWA | N | N | N | Y | N | N | N | N | N | N | N |
| 68 | Sustainable monetization rails (sponsors/paid hosting) | N | Y | Y | Y | P | Y | P | P | N | N | Y |

Matrix totals for WebCoder across all 68 rows: **4 yes** (per-test partial scoring; custom checkers; sandbox hardening; RO/EN bilingual site), **10 partial**, **54 no**. Competitor `?` cells are capabilities the crawl could not confirm either way — treated as `no` for gap-counting purposes only when a direct competitor explicitly lacks them.

---

## 4. The Gap Catalog

Every capability where WebCoder is `no` or `partial`. Format per gap: **what** · **evidence** (URLs) · **design sketch for our stack** · **Impact / Effort / Wave**. Effort assumes the SPEC-GAPS Wave-0 platform items (B4 pagination, B8 leaderboard, B9 forum, B10 notifications, D-B11 celery/beat) land first — they are prerequisites, not repeated here.

### 4.1 Contests (CON)

**CON-1 · Contest entity + timed rounds (the structural gap).** What: scheduled contests with registration, problem set, submission gating, standings. Evidence: https://codeforces.com/contests · https://atcoder.jp/contests/abc480 · https://www.infoarena.ro/runda/jc2021-runda2 · https://www.codechef.com/contests · https://dmoj.ca/contests/. Design: implement X1 as specced — `Contest` (title_i18n, start_at/end_at, visibility PUBLIC/PRIVATE, is_rated, format), `ContestProblem` ordered M2M, `ContestRegistration`; submission create-gate extends D-J3's APPROVED queryset gate with "registered + window open"; Celery beat start/end/freeze tasks reuse D-B11; scoreboard endpoint reuses D-B8's window-rank aggregation; Next.js `/contests` + `/contests/[id]` (problem list during, standings after). Pin problem edits while referenced by an active contest. **Impact H · Effort L · Wave B.**

**CON-2 · Pluggable contest formats (ICPC / IOI / CF-style).** What: format is per-contest config, not a fork. Evidence: https://www.domjudge.org/docs/manual/main/scoring.html (pass-fail vs score boards) · https://github.com/DMOJ/online-judge (IOI/ICPC/AtCoder/ECOO formats) · https://atcoder.jp/contests/abc480/rules (score + 5-min penalty formula with worked examples) · https://leetcode.com/contest/weekly-contest-517/ (5-min penalty, hidden tests). Design: `Contest.format` enum + strategy module: ICPC = binary AC + penalty minutes (configurable `penalty_time`, CE-free like DOMjudge); IOI = sum of best per-problem points (our per-test engine already computes this); AtCoder-style = points + 5-min penalty on solved. One ranking function per format, selected at scoring time. **Impact H · Effort M · Wave B.**

**CON-3 · Scoreboard freeze + organizer live view.** What: public board locks at freeze_at; staff see live; unfreeze is deliberate. Evidence: https://www.domjudge.org/docs/manual/main/config-basic.html (freezetime milestone, jury always sees real board, unfreeze-now). Design: `Contest.freeze_at`; scoreboard query filters `submission_time <= freeze_at` for non-staff; `POST /contests/{id}/unfreeze/` (ADMIN); live-recompute leaderboard infra (D-B8) makes this a boolean on the query. **Impact M · Effort S · Wave B.**

**CON-4 · Contest clarification queue.** What: participant→jury questions, private or broadcast answers, canned responses. Evidence: https://codeforces.com/blog/entry/4088 · https://atcoder.jp/contests/abc480/clarifications · https://dmoj.ca/contest/bts26 (IOI-style clarifications) · http://web.archive.org/web/20250618121041/http://campion.edu.ro/rules.php (YES/NO/NO COMMENT). Design: `Clarification` (contest FK, problem FK nullable, asker, question, answer, answered_by, is_broadcast, created_at); jury view in contest admin; broadcast publishes to all participants via D-B10 notifications; canned-answer presets ("Read the statement again", "Yes", "No", "No comment"). **Impact M · Effort S · Wave B.**

**CON-5 · Virtual participation + upsolving archive.** What: replay any finished contest under a personal clock; problems stay submittable after. Evidence: https://codeforces.com/contest/2261/virtual · https://codeforces.com/gyms · https://atcoder.jp/contests/abc480/standings/virtual · https://leetcode.com/contest/weekly-contest-517/ · https://www.infoarena.ro/concursuri-virtuale. Design: `ContestParticipation(virtual_start)`; scoreboard computed per participation window (same window-rank aggregation, partitioned by participation); after `end_at` + editorial delay, contest problems revert to normal practice (archive mode). AtCoder's own improvement guide centers upsolving — keep full judge feedback post-contest. **Impact H · Effort M · Wave C.**

**CON-6 · Windowed contests with personal timers (the school fit).** What: multi-day window; each participant gets one timed sitting. Evidence: https://usaco.org/index.php?page=instructions ("startable during any block of time you want within the larger contest window") · https://dmoj.ca/contest/bts26 (Sep 9–16 window, personal 3h countdown). Design: `Contest.is_window + window_start/window_end + per_user_duration`; effective deadline = min(virtual_start + duration, window_end); countdown component on the contest page. This is the format ONI-style selections and a class of students actually need — ship before Divisions. **Impact H · Effort M · Wave B.**

**CON-7 · Divisions / rating bands / eligibility gates.** What: separate pools by rating or cohort. Evidence: https://codeforces.com/ratings (Div 1–4 + 1900–2099 overlap) · https://www.codechef.com/START261 (Div1 ≥2000 … Div4 ≤1399) · https://usaco.org/index.php?page=details (Bronze→Silver promotion by cutoff). Design: start USACO-style static divisions (junior/senior, or class-grade cohorts once EDU-1 lands — `Contest.allowed_cohorts`); add `rated_range` (min/max rating) once RAT-1 exists; the CF overlap trick (one band may rate in both) matters at small user volume. **Impact M · Effort S · Wave C.**

**CON-8 · Pretests during contest, full system tests after.** What: cheap visible subset live; full hidden suite re-judged at end. Evidence: https://codeforces.com/blog/entry/103654 (After a Round FAQ) · https://codeforces.com/blog/entry/107753 (hack tests merged into systest) · https://dmoj.ca/help/pretests (pretest subset, score scaled ×1/10). Design: `TestCase.is_pretest` flag; during contest the judge runs the pretest subset only (score scaled); at `end_at` a Celery task re-judges locked submissions on the full suite via J12's rejudge. Honor CodeChef's lesson — persist per-test outcomes from first execution and swap cached scores rather than re-executing when possible. **Impact H · Effort M · Wave C.**

**CON-9 · User/teacher-created contests and mashups.** What: verified users assemble private contests from the APPROVED pool. Evidence: https://codeforces.com/mashups · https://codeforces.com/groups · https://www.infoarena.ro/concursuri-virtuale (5,070 user contests). Design: contest creation permission for CREATOR/TEACHER roles; visibility PRIVATE (reuses problem PRIVATE semantics + D-J3 gating); pairs with EDU-2 (an assignment can literally be a private un-rated windowed contest — X1 already folds "assignments = private un-rated contests"). **Impact M · Effort M · Wave C.**

**CON-10 · Contest calendar, reminders, countdowns.** Evidence: https://codeforces.com/calendar (month grid + ICS) · https://www.codechef.com/contests ("Starts in 12 Min 30 Sec" + bell reminders). Design: `/contests` calendar view + Django `text/calendar` ICS feed route; countdown component; D-B10 notification + optional email at T-24h/T-1h once SP5 mail lands. **Impact M · Effort S · Wave B.**

**CON-11 · Contest medals / awards.** Evidence: https://www.hackerrank.com/scoring (top 25% → gold 4% / silver 8% / bronze 13%) · https://atcoder.jp/posts/1032 (crown icons). Design: post-contest Celery task computes top-% awards into an `Award` table feeding RAT-5 badges and profile medals; fixed-percentage thresholds are simple and beloved. **Impact M · Effort S · Wave C.**

### 4.2 Ratings & gamification (RAT)

**RAT-1 · Elo/Glicko contest rating.** Evidence: https://codeforces.com/ratings · https://www.infoarena.ro/documentatie/rating (Glicko, open-source impl, 6,044-user clasament) · https://info.atcoder.jp/overview/contest/rating (performance-weighted) · https://www.codechef.com/ratings (Elo-MMR) · https://www.hackerrank.com/scoring (Elo from 1500). Design: start **Glicko** (infoarena precedent; rating deviation handles sparse activity on a small platform); post-contest Celery task computes pairwise outcomes → `RatingHistory(user, contest, rating, rd, delta)`; profile rating graph (recharts) + leaderboard column. The RO audience already expects this — infoarena has run a public rating clasament for 15+ years; a Romanian judge without rating reads as incomplete locally. **Impact H · Effort M · Wave B** (immediately after first rated contest).

**RAT-2 · Rating display engineering from day one.** What: newcomer suppression + inactivity decay, so first contests don't tank beginners. Evidence: https://atcoder.jp/posts/16 (suppression: <5 contests −400+, <9 −200+, <14 −100+) · https://codeforces.com/blog/entry/82401 (color-band recalibration reform). Design: store `internal_rating` and derive `display_rating` with AtCoder's suppression curve; parameters are cheap at launch, painful retrofits, and protect a learner audience from demotivating early drops. **Impact M · Effort S · Wave B** (ship inside RAT-1).

**RAT-3 · Color bands/titles on handles.** Evidence: https://atcoder.jp/users/chokudai (class="user-red") · https://dmoj.ca/about/ (Newbie→Target tiers) · https://codeforces.com/ratings. Design: band thresholds table + a single `<UserChip>` component (Next.js) rendering username + color everywhere — forum posts, leaderboards, standings, comments. Colored handles are the cheapest identity mechanic once a rating exists. **Impact M · Effort S · Wave B.**

**RAT-4 · Contest-free practice rank ladder (kyu/dan style).** Evidence: https://docs.codewars.com/gamification/ranks (ranks rise only by solving; steep per-level thresholds) · https://docs.codewars.com/curation/references/kata-ranks (+10% for +1-kyu solve, ~5% same rank). Design: pure derivation over data we already store — weighted-solve ladder: each AC contributes weight by problem difficulty (e.g. easy 1 / medium 3 / hard 6), levels at exponential thresholds; expose in B5's `/users/me/statistics/` + profile. Works for users who never touch contests; cheapest high-yield gamification available. **Impact H · Effort S · Wave A** (rides B5).

**RAT-5 · Badge/achievement catalog.** Evidence: https://leetcode.com/discuss/post/6104178/All-LeetCode-Badges (30/100-day, annual, contest-tier badges) · https://www.hackerrank.com/scoring (6-star tiers per track) · https://www.pbinfo.ro/profil/silviu (milestone medals). Design: extend B5's planned threshold badges (First AC, 10/50/100 solved, first AC per difficulty) with per-tag mastery badges (needs RAT-7), streak badges (RAT-6), and contest awards (CON-11); event-sourced from submissions — no new write path. **Impact M · Effort S · Wave A.**

**RAT-6 · Streaks + heatmap + active-days (pressure-calibrated).** Evidence: https://leetcode.com/discuss/post/6363316/ (max streak + total active days) · https://help.codecademy.com/hc/en-us/articles/360056218734-Weekly-Targets (weekly targets on web precisely because daily streaks churn-shame) · https://www.codechef.com/users/potato167 (heatmap) · https://www.codechef.com/pro (streak freezes as a paid perk). Design: B5 already plans the 90-day heatmap + 7-day streak — add max-streak + total-active-days counters (LeetCode's anti-shame pairing), and frame the student-facing target as weekly ("active days this week") per Codecademy's explicit design judgment. **Impact M · Effort S · Wave A.**

**RAT-7 · Per-tag skill proficiency profile.** Evidence: https://www.hackerrank.com/scoring (per-domain star badges) · https://help.codecademy.com/hc/en-us/articles/26497354279195-Skill-XP-FAQ (per-skill XP) · https://leetcode.com/u/EndlessCheng/ (per-topic proficiency tiers). Design: aggregate AC points per tag family (join submissions × problems × tags — the exact join B5/D-B8 already build); render bars/radar on profile + "what to practice next" strip; dovetails with the curriculum taxonomy (EDU-9) where tag families = syllabus chapters. **Impact H · Effort S · Wave A/B.**

**RAT-8 · Honor for contributors (separate from skill).** Evidence: https://docs.codewars.com/gamification/honor (authored kata, translations, upvoted answers → honor) · https://codeforces.com/top (contribution leaderboards). Design: creator-honor points for approved problems, editorial authorship, upvoted forum posts; display on profile + (later) an earned-trust ladder toward self-service privileges (Codewars' honor-gates). Rewards exactly the behaviors a small judge depends on: RO/EN authoring and verification. **Impact M · Effort S · Wave C.**

**RAT-9 · Leaderboard variants: county/school + weekly reset.** Evidence: https://www.pbinfo.ro/top100 (national + 43 county boards, periodic recompute) · https://leetcode.com/discuss/post/538337/New-Global-Ranking-and-Updated-Contest-Rules-Have-Arrived! (global + country) · https://www.hackerearth.com/docs/wiki/developers/points-and-badges-on-hackerearth (weekly reset boards). Design: optional `county`/`school` profile fields (B7 already plans bio/country), leaderboard filter params on D-B8's endpoint, and a weekly-reset board derived from submission dates — gives mid-tier users a realistic top-100 while the global board is frozen by power users. See also RO-3. **Impact M · Effort S · Wave C.**

**RAT-10 · Trust-weighted voting + anti-brigading (day-one rules).** Evidence: https://codeforces.com/blog/entry/76361 (votes count only above a rating floor, weight scales with rating) · https://codeforces.com/blog/entry/8963 (votes halve every 180 days; small negatives render 0; fade at −10, hide at −25) · https://dmoj.ca/problem/acc5p2/editorial ("hidden due to too much negative feedback — show anyway"). Design: when B9's PostVote ships, count votes only from accounts with ≥1 AC (existing data); render small negatives as 0; auto-hide at threshold with reveal toggle. Ship with the forum, not after — a naive lifetime karma counter breeds drama. **Impact M · Effort S · Wave C** (with forum polish).

### 4.3 Education & teachers (EDU)

**EDU-1 · TEACHER role + classes with student self-join.** Evidence: https://www.pbinfo.ro/ajutor/16/cum-se-adauga-elevi-intr-o-clasa ("adding a student is done by the student, not the teacher, to avoid abuse") · https://www.pbinfo.ro/ajutor/15/cum-gestionez-clasele · http://web.archive.org/web/20240728073748/http://campion.edu.ro/arhiva/index.php (groups later disabled — see caution below). Design: new `TEACHER` role granted after verification (teacher email/school check — better than pbinfo's unchecked checkbox); `ClassRoom` (teacher FK, name, join_code, join_password, is_open) + `ClassMembership`; students self-join with code+password; teacher gets a member list linking to public profiles and class-scoped submission views. Caution from campion: its flagship class-groups feature was quietly DISABLED by 2025 — keep the classroom loop minimal (rosters + teme + export), don't build an LMS. **Impact H · Effort M · Wave B.**

**EDU-2 · Assignments (teme) with publish windows + lifecycle.** Evidence: https://www.pbinfo.ro/ajutor/17/cum-dau-teme-elevilor (states nepublicată/în curs de rezolvare/expirată; availability + expiry moments; optional mod examen) · https://codehs.com/grading (due dates + access controls). Design: `Assignment` (class FK, title_i18n, description, problems M2M, available_from, due_at, optional late_until, is_exam); teacher grid = students × problems matrix of best score / verdict / attempts, aggregated over submissions inside the window; student side = nav badge via D-B10 (pbinfo's persistent "you have homework" signal). Problem-set teme first; MCQ and file-drop types are EDU-7. **Impact H · Effort M · Wave B.**

**EDU-3 · Soft-expiry semantics (late ≠ blocked).** Evidence: https://www.pbinfo.ro/ajutor/17/cum-dau-teme-elevilor verbatim — "the student can submit but those submissions will not be associated with the temă". Design: no hard lock. Association rule is a pure join condition: a submission counts for the assignment iff `available_from <= submission_time <= due_at` (or `late_until` when set, flagged late). The judge never punishes learning; the gradebook simply ignores late work; expiry doubles as built-in upsolving. One column on the association query — copy this exactly. **Impact H · Effort S · Wave B.**

**EDU-4 · Exam-mode lockdown + conduct/AI policy.** Evidence: https://www.pbinfo.ro/ajutor/21/ce-este-mod-examen (most site resources unavailable during exam teme) · http://web.archive.org/web/20250618121041/http://campion.edu.ro/rules.php (teme-concurs hiding scores/hints) · https://usaco.org/index.php?page=instructions (bans teamwork, generative AI, multi-accounting; lifetime bans). Design: `Assignment.is_exam` → Django middleware/request-context flag restricting that student's session to the assignment's problems + own-submission views (forum, editorials, hints, other problems blocked); publish an explicit RO/EN conduct + generative-AI policy page before it becomes a moderation problem (AtCoder publishes versioned AI rules at https://atcoder.jp/posts/algorithm_rules_20261014_en). **Impact M · Effort M · Wave C.**

**EDU-5 · Per-student progress grid + monitoring.** Evidence: https://www.pbinfo.ro/ajutor/14/ce-pot-sa-fac-ca-profesor (single-place view of profiles + sources) · https://codehs.com/progress_tracking (progress by assignment, time-on-task, attempts, code history) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/guides/competitor.pdf (per-student monitoring). Design: students × problems matrix (max score, verdict, attempts, last attempt) computed on demand from existing per-test-scored submissions; a lightweight per-student detail drawer with their submission history in the class. Skip CodeHS-style time tracking and code history v1. **Impact H · Effort S · Wave B.**

**EDU-6 · Gradebook CSV/XLSX export.** Evidence: https://codehs.com/grading ("export grades to an external platform"). Design: teacher action serializing EDU-5's grid (per-student max score per problem + total) to CSV/XLSX — the single feature converting judge data into Romanian school bureaucracy (catalog electronic). Pure serialization over data already computed. **Impact M · Effort S · Wave B.**

**EDU-7 · Assignment types beyond problems: MCQ sets + file-upload tasks.** Evidence: https://www.pbinfo.ro/ajutor/17/cum-dau-teme-elevilor (type 3: arbitrary files, teacher-set extensions + max size) · https://www.pbinfo.ro/ajutor/37/cum-gestionez-o-tema-alcatuita-din-exercitii (answer shuffling, per-student correctness stats). Design: v2 after problem-set teme: quiz assignments pull from the MCQ bank (EDU-8) with optional variant shuffling; file-drop assignments = `UploadedDeliverable` (assignment FK, student FK, file, uploaded_at) validated against teacher-set extension/size policy (reuse SP4 throttle class). Scope-creep guard: ship problem teme first. **Impact M · Effort M · Wave C/D.**

**EDU-8 · Auto-graded MCQ bank (Bacalaureat grile).** Evidence: https://www.pbinfo.ro/?pagina=itemi-evaluare-lista&disciplina=0&clasa=9&tag=8 (250 grade-9 items; C++/Python/Pseudocod filters; discipline/class/Bac-year tags) · https://www.codechef.com/skill-tests (timed MCQ assessments). Design: `MCQItem` (discipline, grade, chapter link to taxonomy, question RO/EN, 4 variants, correct index, source/Bac-year tag, author via approval workflow); auto-grading in the assignment view; per-class correctness statistics for teachers. Directly serves Bac exam prep — pbinfo's moat; ours adds EN variants + modern UX. **Impact H (RO market) · Effort M · Wave C.**

**EDU-9 · Versioned curriculum taxonomy (grade → chapter → topic).** Evidence: https://www.pbinfo.ro/probleme-categorii (grade 9 alone: 2,169 problems under chapter names like "Algoritmi elementari" → "Căutare binară") · https://www.pbinfo.ro/probleme-categorii?clasa=10 · https://www.edu.ro/sites/default/files/_fi%C8%99iere/Minister/2025/programe_scolare_cons_pub/Informatica_CS_IX_Real_Matematica_informatica.pdf (2025 public-consultation draft — programmes mid-revision) · https://rocnee.eu/images/rocnee/fisiere/curriculum/programe-scolare-liceu-transparenta-02-23-2026/Anexa_nr_49_Informatic%C4%83_IX_CS_MI_INT.pdf (Anexa 49). Design: `CurriculumNode` (parent FK, kind GRADE/CHAPTER/TOPIC, name RO/EN, version FK) — a versioned tree problems reference via M2M, so a new programme edition adds a taxonomy version instead of a migration; per-node problem counts (pbinfo's signature); a second catalog axis beside flat tags; teacher teme-building becomes chapter-picking. This is the single highest-impact education feature for the RO market. **Impact H · Effort M · Wave A/B.**

**EDU-10 · Gimnaziu (grades 5–8) coverage.** Evidence: https://www.pbinfo.ro/probleme-categorii?clasa=5 renders empty while IX–XI are full (verified 2026-10-24) — yet gymnasium "informatică și TIC" is trunchi comun under the new framework (same edu.ro draft; gimnaziu programmes per OMEN 3393/2017). Design: extend the taxonomy to grades 5–12 + a beginner problem ladder (X4's seed pack doubles as content); beginner-friendly difficulty band + simpler statements. An under-served segment pbinfo doesn't categorize. **Impact M · Effort M (content-led) · Wave C.**

**EDU-11 · Authoring-as-teacher-training loop.** Evidence: https://ioinformatics.org/journal/INFOL027.pdf (Campion: teachers author to published specs; committee reviews problem+solutions+tests+checkers and iterates by email — authoring IS professional development). Design: we already have the skeleton (DRAFT→PENDING→APPROVED with verifier feedback + notifications): publish RO/EN authoring specs + per-problem feedback templates so teacher-authors level up while the bank grows; formalize as a "contributor program" page. **Impact M · Effort S · Wave C.**

### 4.4 Judge capabilities (JDG)

**JDG-1 · Subtask groups with grouped points.** Evidence: https://raw.githubusercontent.com/DMOJ/docs/master/docs/problem_format/problem_format.md (batched cases, per-batch points, dependencies, points:0 short-circuit) · https://dmoj.ca/problem/ccc21s2 (1/4/5/5 subtask marks) · https://www.codechef.com/problemsetting (10 "partially graded" problems per Long Challenge) · https://www.infoarena.ro/documentatie/borderoul-de-evaluare (grouped tests). Design: J6 as already specced — `Problem.scoring_mode` (BINARY/PARTIAL_PER_TEST/SUBTASKS) + `TestCase.subtask` group key + cached `full_score`; subtask points only when every member passes (DMOJ rule); UI shows score/max_score with PARTIAL state. Romanian olympiad problems are traditionally written with subtasks. **Impact H · Effort M · Wave A.**

**JDG-2 · Interactive problems (interactor protocol).** Evidence: https://codeforces.com/blog/entry/45307 (flush semantics) · https://raw.githubusercontent.com/DMOJ/docs/master/docs/problem_format/custom_graders.md (InteractiveGrader; interactor sandboxed with own limits; interactor stdin ↔ submission stdout; pty `unbuffered` mode removes flush requirement) · https://atcoder.jp/contests/abc299/tasks/abc299_d · https://www.infoarena.ro/documentatie/evaluator (interactive with mandatory flushing). Design: `Problem.problem_type = INTERACTIVE`; interactor authored in any registry language, compiled once and run in the sandbox with its own time/memory limits; judge runner switches from "write input → run → compare" to "spawn pair with piped stdio + wall-time cap" (J2's docker-exec path is the natural host). The single biggest judge-architecture gap for problem variety — schedule after contests. **Impact H · Effort L · Wave D.**

**JDG-3 · Output-only problems.** Evidence: https://codeforces.com/problemsets/acmsguru (*special problems) · https://dmoj.ca/problems/?search=output-only (no confirmation on DMOJ — honestly unknown) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=problem&action=view&id=1704 (batch-only, no output-only). Design: J9 as specced — `problem_type=OUTPUT_ONLY` skips compile/run; `submission.code` (or uploaded answer file) compared/checked directly per test; frontend swaps editor for textarea. Cheap, enables heavy-compute/translation-proof tasks. **Impact M · Effort M · Wave B.**

**JDG-4 · Checker protocol v2: partial points + feedback + testlib compatibility.** Evidence: https://raw.githubusercontent.com/DMOJ/docs/master/docs/problem_format/custom_checkers.md (CheckerResult with arbitrary points + feedback; bridged testlib type semantics: 7 + "points X" partial) · https://github.com/MikeMirzayanov/testlib (reference) · https://www.codechef.com/challenge-problem-configuration (master judge scoring 20% visible). Design: J7 as specced (exit 7 + `POINTS <0..1>` + optional `MSG`; compile checker once per submission, not per test) — plus map testlib exit codes (0/1/2/7) so the enormous testlib checker corpus and Polygon-authored checkers work unmodified. **Impact H · Effort M · Wave A.**

**JDG-5 · Per-language time-limit multipliers + overrides.** Evidence: https://codeforces.com/blog/entry/45228 (per-language factor lists, worked Python example) · https://dmoj.ca/api/v2/problem/ccc21s2 (`language_resource_limits` + `short_circuit`) · https://support.hackerrank.com/hc/en-us/articles/6693750503-Execution-Environment (documented per-language defaults: C 2s, Python 10s, Go 4s). Design: J5 as specced — LanguageSpec multipliers (python 3.0, java 2.0, node 2.0; JVM/Node memory floor) + `Problem.limit_overrides` JSON; effective limits resolved once in tasks.py and surfaced per selected language on the problem page. A fairness gap today: Java 11 sits under C++'s 1000ms. **Impact H · Effort M · Wave A.**

**JDG-6 · Custom invocation / scratch run.** Evidence: https://codeforces.com/blog/entry/45307 (Custom Invocation) · https://leetcode.com/problems/two-sum/ (Code/Testcase/Test Result tabs) · https://www.codechef.com/problems/FLOW001 (Test against Custom Input) · https://docs.codewars.com/references/kata-trainer (editable sample-tests pane). Design: X7 as specced — `POST /api/v1/scratch/` (IsAuthenticated, own scoped throttle — it is the judge-DoS surface SP4 worries about; must land WITH the throttle), fixed 5s/256MB, truncated output, audit-log persistence; frontend "Custom Test" tab beside Submit sharing the A6 editor. Also feeds JDG-11 (expected-output generation). **Impact H · Effort S–M · Wave A.**

**JDG-7 · Mapped runtime-error feedback + verdict polish (OLE, Wall-TLE, priority order).** Evidence: https://dmoj.ca/about/codes/ (IR/OLE + priority ordering; mapped messages: segfault, floating point exception, bad_alloc, "'{} syscall disallowed", "opening files is not allowed") · https://www.pbinfo.ro/ajutor/36/despre-testele-de-evaluare ("Killed by signal n", "Nonzero exit status n") · https://www.infoarena.ro/documentatie/evaluator (Wall-TLE for idle waits; blocked system call; SIGSEGV/SIGFPE distinction). Design: on top of J4's real MLE ladder, map exit signals to actionable RO/EN messages (SIGSEGV→"Segmentation fault", SIGFPE→"Floating point exception (division by zero?)", 137+high-RSS→MLE), add OLE (output-size cap) and Wall-TLE (idle/sleep detection via wall vs CPU time — we already wrap `/usr/bin/time`), and document the verdict priority order publicly like DMOJ. The single biggest debuggability gap between judges. **Impact M · Effort S · Wave B.**

**JDG-8 · Language additions via the registry (C, JavaScript, Go, C#) + honest naming.** Evidence: https://support.hackerrank.com/hc/en-us/articles/6693750503-Execution-Environment (55+ current toolchains) · https://atcoder.jp/contests/abc480/rules (116 entries) · https://dmoj.ca/submissions/ (75) · https://docs.codewars.com/languages (59 + per-attempt versions). Design: J11a–e as specced (C/JS are S; Go/C# M; `java11`→honest `java21` rename). Don't chase 50 languages — the school-relevant set is C/C++/Java/Python/JS (+Pascal, see RO-5). **Impact M · Effort S each · Wave A/B.**

**JDG-9 · Published toolchain docs + per-attempt version choice (later).** Evidence: http://web.archive.org/web/20250618121041/http://campion.edu.ro/rules.php (exact compilers + flags + hardware published) · https://docs.codewars.com/references/kata-trainer (pick Node v8…v22 / Python 3.8–3.11 per attempt) · https://support.hackerrank.com/hc/en-us/articles/6693750503-Execution-Environment. Design: static `/help/judge` page listing exact images, compile commands and limits per language (from the J1 registry — single source of truth); version selection only if a real need appears. **Impact L–M · Effort S · Wave C.**

**JDG-10 · Token/case-insensitive comparison + diff hints.** Evidence: https://raw.githubusercontent.com/DMOJ/docs/master/docs/problem_format/custom_checkers.md (sorted/unordered/identical checker library) · gap J8. Design: TOKEN mode + `case_insensitive` flag + first-mismatching-line diff hint for sample tests, exactly as J8 specced. **Impact M · Effort S · Wave A.**

**JDG-11 · Problem-preparation tooling: validators, generators, stress tests, batch import.** Evidence: https://quangloc99.github.io/posts/polygon-codeforces-tutorial (validators + stress testing) · https://github.com/MikeMirzayanov/testlib · https://www.codechef.com/hostyourcontest (mandatory test data + validators + two independent solutions) · https://ioinformatics.org/journal/INFOL027.pdf (committee reviewed problem + solutions + tests + checkers). Design: X10 expanded — author-side validator/generator runner through the sandbox (same mechanics as X7 scratch); Kattis/Polygon problem-package import for admins (also the cheapest executor for X4's seed pack); expected-output generation from a reference solution. Test quality is the top determinant of judge credibility. **Impact M · Effort M · Wave C.**

**JDG-12 · Rejudge, queue states (WJ/WR), judge-parity harness.** Evidence: https://atcoder.jp/contests/abc480/glossary (WJ/WR first-class) · https://www.codechef.com/challenge-problem-configuration ("we will be saving the score of all testcases in a temporary table and swap" — never re-execute to reveal) · X11 parity harness. Design: J12's rejudge action + stuck-submission monitor; add WJ/WR display states; persist per-test outcomes at first execution (CodeChef's quick-rejudge lesson); X11's golden-corpus CI asserting local-vs-container verdict agreement. **Impact M · Effort S–M · Wave B.**

**JDG-13 · Plagiarism / similarity detection (advisory, then batch).** Evidence: https://codeforces.com/blog/entry/132796 (detector runs days after each contest; ratings recalculated after DQs) · https://theory.stanford.edu/~aiken/moss/ (language-aware standard) · https://www.codechef.com/codeofconduct (suspension risk; AI-similarity warning) · https://www.hackerrank.com/blog/how-plagiarism-detection-works-at-hackerrank/ (flags are advisory; "refrain from auto-rejecting"). Design: X6 expanded — v1 admin diff view (two submissions side-by-side in the shipped Prism viewer); v2 Celery MOSS/Dolos batch per problem/contest/teme surfaced as advisory badges for VERIFIER/TEACHER review, never auto-punish; "download all solutions for this homework" button (the #1 teacher pain point; a weekend of work). **Impact H (with contests+classes) · Effort S→M · Wave B/C.**

### 4.5 Community & content (COM)

**COM-1 · Per-problem discussion threads.** Evidence: https://leetcode.com/problems/two-sum/ (2.2K-post Discussion) · https://www.hackerrank.com/challenges/solve-me-first/problem (Discussions tab) · https://dmoj.ca/problem/ccc21s2 (comments with votes + threaded replies) · https://docs.codewars.com/community (per-kata discourse, Question/Suggestion/Issue labels, Spoiler flag). Design: D-B9 already models `Thread.problem` (nullable FK) — make it a first-class surface: problem page "Discussions" tab filtering threads by problem; spoiler flag on posts inside problem-scoped threads; forum category labels. Mostly wiring once B9 lands. **Impact H · Effort S · Wave A/B.**

**COM-2 · Editorial comment threads + vote-based moderation.** Evidence: https://dmoj.ca/problem/acc5p2/editorial (editorial comments, vote scores, hidden-at-threshold) · https://codeforces.com/blog/entry/8963. Design: editorials (EDT-1) accept comments via the same problem-scoped threads; auto-hide thresholds per RAT-10. **Impact M · Effort S · Wave C.**

**COM-3 · Live submission feed / site activity.** Evidence: https://dmoj.ca/submissions/ (websocket live feed, partial scores inline) · https://www.infoarena.ro/monitor (auto-refresh global evaluation monitor) · https://dmoj.ca/ (home activity stream). Design: public recent-verdicts endpoint (user, problem, language, verdict, score — code never shown) + polling feed on home/problems sidebar ("hot this week" per DMOJ's sidebar is a sibling feature); SSE/WebSocket upgrade later (D-B10 kept the model delivery-agnostic deliberately). **Impact L–M · Effort S · Wave C.**

**COM-4 · Friends/follow graph + filtered boards.** Evidence: https://codeforces.com/profile/tourist (friends-only standings/rating views) · https://docs.codewars.com/community/following (allies, clans). Design: deliberately deferred in SPEC-GAPS — keep deferred until ratings + moderation mature; the payoff feature is friends-filtered standings once contests exist. **Impact L · Effort M · Wave D.**

**COM-5 · Private messaging.** Evidence: https://www.pbinfo.ro/profil/silviu (conversatii) · https://codeforces.com/profile/tourist (Talks). Design: skip v1 — moderation burden without learning value; D-B10 notifications cover reply loops. Recorded to close the matrix honestly. **Impact L · Effort M · Wave D (recommend: don't).**

**COM-6 · News/blog + release notes.** Evidence: https://dmoj.ca/ (admin news posts with comment threads) · https://www.infoarena.ro/blog · https://codeforces.com/ (MikeMirzayanov posts). Design: `is_announcement` flag on forum threads + home panel + (later) contest recaps/editorial announcements — cheap community heartbeat. **Impact M · Effort S · Wave B.**

**COM-7 · Post-solve AC-solution browsing (policy + toggle).** Evidence: https://codeforces.com/help (public submission sources for study) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=sources&action=view (public borderoux feed, code private) · https://docs.codewars.com/concepts/kata/solutions (unlock on completion). Design: per-problem visibility policy (default: after the viewer's own AC, browse others' AC sources — we already store them); contest-fresh problems locked until contests end; submission serializer gains a scoped "others' solutions" endpoint. Turns every solve into a code-style lesson. **Impact M · Effort S · Wave C.**

### 4.6 Editorials & the learning layer (EDT)

**EDT-1 · Editorial model with gating (X2, evidence-loaded).** Evidence: https://leetcode.com/problems/two-sum/editorial/ (video + multi-language code + complexity) · https://atcoder.jp/contests/abc478/editorial (per-problem grid, official + user + livestream) · https://dmoj.ca/problem/ccc21s2/editorial (per-subtask breakdown, author credit) · https://cses.fi/blog/text/3613 (model solutions unlock after solving) · https://www.hackerrank.com/scoring (editorial unlock before solve = score doesn't count for badges) · https://www.codechef.com/problems/FLOW001 (Solution tab). Design: X2 as specced — `ProblemEditorial` (markdown RO/EN mirroring statement_i18n, author credit, `publish_policy` PUBLIC/AFTER_AC/MANUAL); AFTER_AC checks distinct AC for the requester (submission table already supports the predicate); optional HackerRank-style penalty: pre-solve unlock marks the problem "solved-with-editorial" and excludes it from RAT-4 ladder credit. Renders via A7's markdown+KaTeX work. **Impact H · Effort M · Wave A/B.**

**EDT-2 · Progressive hints ladder.** Evidence: https://leetcode.com/problems/two-sum/ (Hint 1/2/3) · https://www.codechef.com/problems/FLOW001 (Hints tab) · https://www.infoarena.ro/problema/adunare ("Indicii de rezolvare" collapsible) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/ (indicaţii de rezolvare for struggling students). Design: `Problem.hints_ro / hints_en` (ordered text array), collapsible `<details>` reveal UI on the problem page; track "hints viewed" (no penalty v1). The pedagogical middle ground between silence and full spoiler; works even for problems that never get an editorial. **Impact H · Effort S · Wave A.**

**EDT-3 · Community editorials, credited, multiple per problem.** Evidence: https://atcoder.jp/contests/abc478/editorial (User Editorial by named handles) · https://www.codechef.com/problemsetting/editorials (paid editorialist program, quality duties). Design: editorials are author-attributed rows, not singleton fields; CREATORs submit via the existing approval queue; feeds RAT-8 honor. **Impact M · Effort S · Wave C.**

**EDT-4 · Language-flagged content + toggle.** Evidence: https://atcoder.jp/contests/abc478/editorial ("Show editorials in other languages" toggle; per-entry language). Design: every editorial/comment/thread carries a `lang` tag (ro/en) with filtering — extends our RO/EN parity discipline to user-generated content before comments ship, so RO students aren't force-fed EN commentary. **Impact M · Effort S · Wave C** (with COM-1/COM-2).

**EDT-5 · Editorial etiquette banner + anti-copy norms.** Evidence: https://dmoj.ca/problem/acc5p2/editorial ("use only when stuck… submitting an official solution before solving is a bannable offence") · https://www.codechef.com/problemsetting/editorials. Design: static banner component on editorial pages + a line in the rules page. Near-zero cost; sets norms before misuse appears. **Impact L · Effort S · Wave B.**

**EDT-6 · Article/lecture layer tied to tags.** Evidence: https://info.atcoder.jp/entry/algorithm_lectures/index (official lectures hub) · https://www.infoarena.ro/articole (six categories: algorithms, official editorials, data structures, math…) · https://www.pbinfo.ro/articole/64/pbinfo-bug-report (articles with view counts + threaded replies) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=paper&action=view&id=46 (curated PDF article library). Design: `Article` (title_i18n, markdown body, tags M2M, author, approval flow reuse) cross-linked from problem pages by shared tags ("related reading"); seeds the RO-language algorithm content moat. **Impact M · Effort M · Wave C.**

### 4.7 UX polish (UXP)

**UXP-1 · Real code editor.** Evidence: https://leetcode.com/problems/two-sum/ · https://docs.codewars.com/references/kata-trainer (vim/emacs modes, shortcuts) — the biggest perceived-quality gap vs every major judge. Design: A6 as specced — CodeMirror 6 via next/dynamic, per-language packs, dark theme from tokens, Tab-indent, Ctrl+Enter submit, starter templates; keep textarea fallback. **Impact H · Effort M · Wave A.**

**UXP-2 · Statement rendering: markdown + KaTeX + sample copy buttons.** Evidence: https://atcoder.jp/contests/abc480/tasks/abc480_a (KaTeX site-wide) · https://dmoj.ca/problem/ccc21s2 (MathJax in statements incl. tables). Design: A7 as specced — react-markdown + rehype-katex (sanitized) over `statement_i18n`; copy buttons on sample blocks. Table stakes for algorithmic statements; prerequisite for editorials (EDT-1). **Impact H · Effort S–M · Wave A.**

**UXP-3 · Statement PDF export + downloadable samples.** Evidence: https://www.hackerrank.com/challenges/solve-me-first/problem (PDF statement + sample files) · https://dmoj.ca/problem/ccc21s2 ("View as PDF"). Design: print-CSS statement route (browser PDF) v1; server-side render optional later; sample testcase download endpoint (public, sample-flagged only). Small wins for offline/olympiad use. **Impact L–M · Effort S · Wave C.**

**UXP-4 · Statement revision history + change notice.** Evidence: https://codeforces.com/problemset/problem/2276/G ("The problem statement has recently been changed — View the changes") · https://www.infoarena.ro/problema/adunare (wiki Istoria + attachments). Design: audit table on statement edits (we already gate edits through approval); diff view for verifiers; public "statement changed" banner post-approval — cheap transparency that the approval workflow earns for free. **Impact M · Effort S–M · Wave C.**

**UXP-5 · Problem of the day + weekly digest email.** Evidence: https://leetcode.com/problemset/all/ (dated DCC, envId=2026-10-23) · https://leetcode.com/discuss/post/655704 + https://leetcode.com/discuss/feedback/141055 (weak built-in email → third-party mailers: demand real, supply poor). Design: deterministic daily pick over the APPROVED pool (`hash(date) % count`, difficulty-rotating); weekly Celery digest ("problems you failed + first hint") once SP5 mail transport lands — no small RO judge currently offers this. **Impact M · Effort S · Wave B/C.**

**UXP-6 · Bookmarks + public collections.** Evidence: https://docs.codewars.com/concepts/kata/collections (bookmarks + public playlists) · pairs with X12 tracks. Design: `ProblemStar` (user, problem) private list — a small high-utility addition; public collections ride X12's ProblemList model. **Impact M · Effort S · Wave B.**

**UXP-7 · Problem-page metadata: solve counter, acceptance rate, rate-this-problem.** Evidence: https://www.hackerrank.com/challenges/solve-me-first/problem (5.1M counter, rate widget) · https://leetcode.com/problems/two-sum/ (Acceptance 58.0%) · https://dmoj.ca/kata stats pattern (Codewars per-kata stats + satisfaction) — satisfaction rating evidence: https://docs.codewars.com/curation/references/approval-retirement-criteria. Design: B8's catalog add-on already annotates tried/solved per problem — surface on the detail page + a 3-level satisfaction vote giving verifiers signal beyond solve rates (X9 statistics tab completes this). **Impact M · Effort S · Wave A.**

### 4.8 Platform & ops (OPS)

**OPS-1 · Public read-only API.** Evidence: https://codeforces.com/apiHelp (+/methods: 18+ methods, 1 req/2s) · https://dmoj.ca/api/ (v2 verified live: unauthenticated 1000-object pages, filters, 90 req/min) · https://dev.codewars.com/ · https://support.hackerrank.com/articles/2067417637-api-overview (Enterprise-gated) · AtCoder's absence spawning https://kenkoooo.com/atcoder + https://github.com/online-judge-tools/api-client — proof API demand exceeds supply even at the top. Design: DRF read-only namespace `/api/v1/public/` (problems, problem detail, submissions stream, user public profile, leaderboard; contest standings later) + personal tokens + SP4-style throttles; enables RO club dashboards, mirror sites, and companion tooling from day one. **Impact H · Effort S–M · Wave C.**

**OPS-2 · 2FA for privileged roles + API tokens.** Evidence: https://dmoj.ca/about/ (setting problems requires 2FA; personal API tokens). Design: django-otp TOTP required for CREATOR/VERIFIER/ADMIN (progressive enforcement: warn → require at next login); tokens double as OPS-1 auth. **Impact M · Effort M · Wave D.**

**OPS-3 · Microsoft/Azure AD (school) SSO.** Evidence: https://github.com/DMOJ/online-judge README ("OAuth login with Google, Facebook, and Github… Two-factor authentication") — the school-relevant breadth; RO schools commonly run Office 365 (market fact). Design: add Microsoft as an allauth social provider beside Google/GitHub (F15 fixes the SPA flow for all); removes the largest classroom onboarding friction. **Impact M · Effort S–M · Wave C.**

**OPS-4 · SEO completion (sitemap, hreflang, schema).** Evidence: https://leetcode.com/problems/two-sum/ ranks #1 for its name (verified via search this research); https://www.pbinfo.ro dominates RO school queries with an orbit of solution sites (https://solinfo.ro). Design: A17 (sitemap entries for /leaderboard, /forum, per-problem URLs) + Q5 leftovers (og:locale, hreflang RO/EN via `alternates.languages`) + keep per-problem generateMetadata/ISR; Romanian-language algorithmic content is scarce — our public RO/EN statements are a genuine acquisition moat if mechanically invested. **Impact H · Effort S · Wave A.**

**OPS-5 · Published accessibility statement.** Evidence: targeted searches found no accessibility statements for Codeforces/LeetCode/Kattis/DMOJ (negative result, this research); underlying editor gap documented at https://github.com/codemirror/CodeMirror/issues/4604. Design: we already run the axe gate — claim it: `/accessibility` WCAG 2.1 AA statement, keyboard-complete submission flow, screen-reader-tested problem pages. A differentiator every incumbent ignores, and it plays into school procurement. **Impact M · Effort S · Wave B.**

**OPS-6 · PWA (before any native app).** Evidence: https://leetcode.com/app (native iOS/Android; launch celebrated at https://www.reddit.com/r/leetcode/comments/1skeoxl/) · Codeforces has only third-party apps (https://play.google.com/store/apps/details?id=com.ethosforces) built on its API. Design: manifest + service worker for offline problem browsing + notification deep links, after A1 responsive lands; no major judge ships an official PWA — cheap differentiation. **Impact M · Effort M · Wave D.**

**OPS-7 · Monetization rails: sponsors, paid private contests, donations.** Evidence: https://codeforces.com/blog/entry/98770 + /104544 (sponsor rounds; "important source of income, but not the main goal") · https://info.atcoder.jp/entry/official-contest-sponsor (championships from ¥1M) · https://dmoj.ca/about/ (small fee for private educational contests) · https://www.kattis.com (paid university contest hosting; https://open.kattis.com/problem-sources) · https://www.pbinfo.ro/?pagina=donatii (donor wall). Design: sponsor/donation page any time; once CON-9 exists, `Contest.sponsor_name/logo` + a paid private-hosting tier for schools/county olympiads is the most plausible RO revenue line (Kattis model). Consumer paywalls are explicitly NOT recommended (LC/CC Premium works only on interview-prep demand we don't have). **Impact M · Effort S (rails) → M (tier) · Wave C/D.**

### 4.9 RO-market specifics (RO)

**RO-1 · Curriculum alignment as the catalog spine (Bac + gimnaziu).** Evidence: https://www.pbinfo.ro/probleme-categorii (the tree IS the programme's table of contents; 2,169 problems for grade 9 alone) · https://www.edu.ro/sites/default/files/_fi%C8%99iere/Minister/2025/programe_scolare_cons_pub/Informatica_CS_IX_Real_Matematica_informatica.pdf (2025 drafts; programmes versioned and mid-revision) · https://rocnee.eu/.../Anexa_nr_49_Informatic%C4%83_IX_CS_MI_INT.pdf · https://www.isj.gl.edu.ro/html/sub_linkuri/INFO/2022-2023/... (gimnaziu programmes OMEN 3393/2017). Design: EDU-9/EDU-10 is the canonical design (versioned CurriculumNode tree, grades 5–12, per-node counts, teme-building by chapter). Positioning: pbinfo's tree starts at grade IX — grades 5–8 (now trunchi comun) are open ground. **Impact H · Effort M · Wave A/B.**

**RO-2 · Bacalaureat MCQ bank (grile).** Canonical design EDU-8. Evidence: https://www.pbinfo.ro/?pagina=itemi-evaluare-lista&disciplina=0&clasa=9&tag=8. **Impact H · Effort M · Wave C.**

**RO-3 · County/school identity + segmented leaderboards.** Evidence: https://www.pbinfo.ro/top100 (national + 43 county boards + Moldova) · https://www.pbinfo.ro/creare-cont (real-name registration with county/school) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=competitors&action=view (boards filterable by county/group; public profiles show school+county). Design: optional county/school fields (B7) with a privacy-conscious default (real names NOT required — differentiate from pbinfo's real-name policy), leaderboard segments (RAT-9), role/category boards. Culturally resonant in the Olympiad geography. **Impact M–H · Effort S · Wave B/C.**

**RO-4 · File-I/O problem variants (`*.in`/`*.out`).** Evidence: https://www.pbinfo.ro/?pagina=probleme-lista&clasa=9 (console vs files as a filter axis) · https://www.pbinfo.ro/ajutor/36/despre-testele-de-evaluare · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=problem&action=view&id=1704 (b210.in/b210.out convention) · https://www.infoarena.ro/documentatie/evaluator (file I/O the norm except interactive). Design: `Problem.io_mode` (STDIO | FILES) + configurable in/out filenames; judge writes the input file into the sandbox dir and reads the output file (trivial on the docker-exec path); statement metadata displays filenames; catalog filter. Olympiad-parity table stakes for the RO market. **Impact H · Effort S · Wave A.**

**RO-5 · Pascal (+C) for school parity.** Evidence: https://www.pbinfo.ro/ajutor/1/care-sunt-limbajele-de-programare-acceptate (8 langs incl. Pascal, C#) · https://www.infoarena.ro/documentatie/evaluator (FreePascal 3.0.0) · http://web.archive.org/web/20250618121041/http://campion.edu.ro/rules.php (Pascal/C published). Design: `pascal` LanguageSpec (fpc toolchain in Dockerfile.judge; no compile quirks beyond `-O2`); RO schools still teach Pascal — cheap via the J1 registry. Deprioritize pbinfo's truly legacy set (Python 2.7, PHP5). **Impact M · Effort S · Wave B.**

**RO-6 · Olympiad archive: provenance metadata + import + downloadable bundles.** Evidence: https://www.infoarena.ro/downloads (30 years of OJI/ONI problems+tests+official solutions) · https://www.pbinfo.ro/?pagina=concursuri-lista (contest archive by year/level/grade-group) · http://web.archive.org/web/20250618121443/http://campion.edu.ro/arhiva/index.php?page=location&action=view&id=29 (contests as first-class provenance entities). Design: provenance fields on problems (source_contest, year, grade_group) + archive browse axis; a rights-checked import pipeline (many OJI/ONI materials are public; verify per-source licensing before import — flagged as a content-ops task, not assumed); PDF bundle downloads for offline study. Infoarena's 30-year archive is the local content moat to match. **Impact H · Effort M (content) + S (code) · Wave B/C.**

---

## 5. Romanian-Market Section

**The competitive terrain.** Three local platforms define what Romanian teachers and olympiad students expect, and none of them combines modern engineering with bilingual content:

- **pbinfo.ro** is the classroom incumbent: curriculum tree (grade→chapter→subcategory), classes + 3-type teme + exam mode + per-student tracking, Bac grile bank, county Top-100s, 0–100 culture with success-rate metric, test transparency after first submission. Weaknesses we beat today: Romanian-only, legacy languages (Pascal-era toolchains, PHP5/Py2.7), no contests/ratings/interactive/subtasks/certificates/API, dated UI, no editorials (only gated official solutions at 100p and user articles).
- **infoarena.ro** is the community/contest incumbent: real contest engine, Glicko rating clasament (6,044 users), 5,070 user-created virtual contests, educational archive with open solutions, algorithm wiki + official editorials, 30-year olympiad downloads, open source. Weaknesses: RO-only, dated SMF/wiki stack, login-gated discussion, small active dev capacity.
- **.campion (defunct)** is the cautionary tale and the feature library: borderou transparency, teme-concurs, YES/NO/NO-COMMENT clarifications, post-round solutions+tests publication, formal appeals — and its teacher class-groups were **disabled** by 2025. Lesson: classroom tooling must stay minimal (rosters + teme + export), never an LMS.

**The wedge.** No RO platform has: English statements (international-grade practice for RO students + diaspora + Moldova EN streams), a modern accessible UI, or contests+ratings+classroom in one place. infoarena proves RO users want ratings/contests; pbinfo proves teachers need teme/curriculum; nobody serves both. WebCoder's RO/EN parity discipline (CI-tested) is a structural moat — extend it to UGC (EDT-4) and the curriculum tree (RO names canonical, EN mirrors).

**Curriculum alignment (the adoption mechanic).** pbinfo's tree is the national programme's table of contents — teachers navigate by chapter, not by tag. Under Ordinul 4.350/2025 the liceu programmes are being re-written (2025–2026 public-consultation drafts; CNEE Anexa 49 set), so alignment must be **data, not code**: a versioned `CurriculumNode` tree (EDU-9) where a new programme edition adds a taxonomy version. Gimnaziu (5–8) is now trunchi comun with practical hours and pbinfo's graded tree starts at IX — an under-served segment (EDU-10). The Bac MCQ bank (EDU-8/RO-2) with discipline/class/Bac-year filters replicates pbinfo's exam-prep moat with a better UX.

**Olympiad-parity specifics:** file-I/O variants (RO-4) and Pascal (RO-5) are table stakes for ONI/OJI-style practice; subtasks (JDG-1) match how RO olympiad problems are written; windowed contests (CON-6) match how selection rounds actually run; the 30-year archive play (RO-6) is the content moat.

**Go-to-market notes from the research:** county/school leaderboards (RO-3) wire Olympiad geography into motivation (pbinfo's model); "free for teachers" positioning + CSV grade export into catalog electronic (EDU-6) is the conversion loop; SEO in Romanian (OPS-4) is wide open — pbinfo dominates with an orbit of unofficial solution sites, meaning demand-side search volume exists.

---

## 6. Quick Wins (S effort, high impact) and Big Bets

### Quick wins (ship inside Wave A/B; all S effort)

| # | Item | Gap IDs | Why now |
|---|---|---|---|
| QW-1 | Progressive hints on problem pages | EDT-2 | RO+EN array field + `<details>` UI; highest learning-value per hour |
| QW-2 | Practice rank ladder + badges + heatmap/streak off B5 | RAT-4/5/6 | Pure derivation from submissions; gamification without contests |
| QW-3 | Per-tag skill profile + "practice next" strip | RAT-7 | Same join as B5; the "what should I solve next" surface |
| QW-4 | File-I/O problem mode (`.in/.out`) | RO-4 | Olympiad parity; small judge change, big RO credibility |
| QW-5 | C + JavaScript languages | JDG-8 (J11a/b) | Already specced S; JS especially for a learn-to-code brand |
| QW-6 | Scratch run (custom input) | JDG-6 | X7 specced; must land with its own throttle |
| QW-7 | Subtasks + checker protocol v2 + token compare + per-language limits | JDG-1/4/5/10 (J6/J7/J8/J5) | Already specced in SPEC-GAPS; evidence confirms they're the standard model |
| QW-8 | Editorial model v1 (AFTER_AC gating) | EDT-1 | X2 specced; renders via A7 markdown |
| QW-9 | Problem-page metadata: solve counter, AC%, satisfaction vote | UXP-7 | B8 add-on already plans the aggregates |
| QW-10 | Bookmarks + problem-of-the-day rotation | UXP-5/6 | Deterministic daily pick; habit loop with zero infra |
| QW-11 | Per-problem discussions wiring (thread.problem FK surfaced) | COM-1 | Rides B9; spoiler flag included |
| QW-12 | Curriculum taxonomy v1 (grades 9–12, versioned) | EDU-9/RO-1 | Data + one browse axis; the teacher adoption spine |
| QW-13 | SEO completion (sitemap entries, hreflang, og:locale) | OPS-4 | A17 + Q5 leftovers; RO-language algorithmic SEO is wide open |
| QW-14 | ICS contest calendar + countdown (pre-back-end of CON-1) | CON-10 | Tiny; makes contests visible before the engine ships |
| QW-15 | Late-decoupling rule for assignments (the pbinfo semantic) | EDU-3 | One join condition; the most-copied single line in this document |
| QW-16 | Gradebook CSV export | EDU-6 | Serializes EDU-5; converts judge data into school bureaucracy |

### Big bets (L effort or strategic)

| # | Bet | Gap IDs | Thesis |
|---|---|---|---|
| BB-1 | Contests + ratings stack | CON-1/2/6, RAT-1/2/3 | The engagement engine every major judge runs on; whitespace in the RO market (neither pbinfo nor campion has it; infoarena's is 2004-era) |
| BB-2 | Classroom stack (TEACHER role, teme, exam mode, gradebook) | EDU-1..6 | pbinfo's moat; the school adoption loop; must stay minimal per campion's cautionary tale |
| BB-3 | Bac MCQ bank + exam-mode lockdown | EDU-4/7/8 | Exam prep inside the same judge; defensible RO niche |
| BB-4 | Interactive-problem judge (interactor protocol) | JDG-2 | Unlocks games/adaptive/communication problems; the deepest judge investment; IA/CF/AC/DM all have it |
| BB-5 | Public API + ecosystem | OPS-1 | CF/DMOJ ecosystems vs AtCoder's scraper shadow-platform — capture companion tooling early |
| BB-6 | 30-year olympiad archive import + gimnaziu content push | RO-6, EDU-10 | Content moat nobody can copy quickly; rights-checking is the gating work |
| BB-7 | Hosted private contests for schools/county olympiads (paid) | CON-9, OPS-7 | The Kattis revenue model localized; only after BB-1 |

---

## 7. Recommended Wave Sequencing

Waves are executable work packages. Each lists its gap IDs, the SPEC-GAPS backlog items it consumes (marked SG-), dependencies, and rough effort. A future implementation workflow should take waves in order; items inside a wave are parallelizable unless noted.

### Wave 0 — Platform backbone (pre-existing backlog, prerequisite for nearly everything)
**SG items:** B1/SP7/F1/J4 (P1 kills) → J1 → J2 → J3 → B4 → D-B11 (celery/beat) → B2/B3 → B8 (leaderboard) → B9 (forum) → B10 (notifications) → B5/B6/B7 (stats/public profiles/profile fields) → their F-wiring (F8–F17) → SP2/SP5 before public exposure.
No competitive item starts before its Wave-0 dependency exists (e.g. no RAT before B8; no COM-1 before B9).

### Wave A — Quick wins on the foundation (≈2–4 weeks of parallel small items)
1. **Editor upgrade + statement rendering** (UXP-1, UXP-2 — A6/A7).
2. **Judge scoring package** (JDG-1 subtasks, JDG-4 checker v2 + testlib mapping, JDG-5 per-language limits, JDG-10 token compare — J6/J7/J5/J8).
3. **Languages C + JS** (JDG-8a/b — J11a/b).
4. **Scratch run with own throttle** (JDG-6 — X7).
5. **Hints ladder** (EDT-2) + **editorial model v1 with AFTER_AC gating** (EDT-1 — X2).
6. **Gamification derivation pack** (RAT-4/5/6/7 riding B5; heatmap, streaks-with-active-days, badges, per-tag profile, rank ladder).
7. **File-I/O mode** (RO-4) + **curriculum taxonomy v1 grades 9–12** (EDU-9 first pass).
8. **Catalog honesty pack** (UXP-7 solve counters/AC%/satisfaction; SG-F3/F4/F5 already scheduled — count/sort/solved indicators).
9. **SEO completion** (OPS-4) + **bookmarks/daily problem** (UXP-6, UXP-5a).
Exit criteria: a learner can find (taxonomy+search), practice (editor+scratch+hints), score (subtasks+limits), and see progress (ladder+badges+profile) — the full practice loop.

### Wave B — Contests + classroom (the strategic wave; ~1–2 months)
Order inside the wave:
1. **Contest core** (CON-1 — X1): model, registration, gating, Celery start/end, basic standings (reuse D-B8 aggregation). Effort L.
2. **Formats + freeze + clarifications + calendar** (CON-2, CON-3, CON-4, CON-10) — formats are strategy classes over the same engine; freeze is one boolean; clarifications reuse D-B10.
3. **Windowed personal-timer contests** (CON-6) — the school/selection format; needed before classroom contests.
4. **Ratings launch** (RAT-1 Glicko + RAT-2 display engineering + RAT-3 colors) — ship together, after the first rated contest is scheduled; per-contest rating-change page (CF pattern).
5. **Classroom core** (EDU-1 classes/self-join → EDU-2 teme with EDU-3 soft-expiry → EDU-5 progress grid → EDU-6 CSV export). Runs parallel to 1–4 (different models, same PR train).
6. **Judge polish for contest load** (JDG-7 mapped RE feedback; JDG-12 rejudge/WJ/WR; CON-8 pretests begins here if capacity allows).
7. **RO pack** (RO-3 county/school fields + segments; RO-5 Pascal; UXP-5 digest email once SP5 mail exists; COM-6 news posts; EDT-5 etiquette banner; OPS-5 accessibility statement).
Exit criteria: a teacher runs a class contest on the platform, students get rated, marks export to the catalog electronic.

### Wave C — Depth & ecosystem (~parallelizable menu)
- **CON-8 pretests/system tests** → **CON-5 virtual participation + upsolving archive** → **CON-9 mashups/private contests** → **CON-7 divisions** → **CON-11 medals**.
- **EDU-8 MCQ bank** → **EDU-4 exam mode** → **EDU-7 quiz/file teme** (in that order).
- **EDT-3/4/6** community editorials + language flags + article layer; **COM-2/3/7** editorial comments, live feed, post-solve solutions; **RAT-8/9/10** honor, leaderboard variants, vote weighting.
- **OPS-1 public API v1** (+ tokens); **OPS-3 Microsoft SSO**; **JDG-11** import/validator tooling; **JDG-13** plagiarism batch (MOSS/Dolos) once contests+teme generate the pairwise corpus; **UXP-3/4** PDF export + statement history; **RO-6** archive import begins (content ops).
Exit criteria: the platform is defensible on contests, classroom, content and ecosystem — every §3 row either Y or consciously N.

### Wave D — Big bets (choose by traction)
**JDG-2 interactive problems** (after CON-8's judge extensions), **OPS-6 PWA**, **OPS-2 2FA**, **COM-4/5 social graph/messaging** (only if community demands), **EDU-10 gimnaziu content push**, **OPS-7b paid hosted contests** (after CON-9), certifications/attestations (HackerRank/PAST pattern — only with brand recognition; a leaderboard-derived "atestat" is the honest variant), open-source/self-host decision (DMOJ/infoarena precedent vs maintenance cost).

**Cross-wave guardrails:** (1) every wave ships RO+EN strings with the Q1 parity test from day one; (2) every new list endpoint paginates (D-B4) and every new write path throttles (SP4 pattern); (3) nothing marked "skip" in §4 (COM-5 messaging, DB-engine problems, bot games, ATS/B2B) gets built without an explicit owner reversal; (4) campion's lesson — classroom features stay minimal; (5) evidence URLs in this document are the acceptance references: a gap is "closed" when its who-has-it behavior is demonstrably matched or consciously exceeded.

---

*Sources: all evidence URLs inline (competitor crawl reports + lens reports, 2026-10-22/24). Repo state from `docs/SPEC-GAPS.md` v2 (2026-10-21) and `docs/RUNBOOK.md` (2026-10-21); SPEC-GAPS items consumed by this roadmap are cited by their IDs (B4–B11, J1–J12, F1–F21, A1–A18, Q1–Q13, SP1–SP7, X1–X12).*

---

## Round-2 additions (challenge)

### Roadmap challenge — under-scoped, omitted, over-scoped

**Grounding.** Judged from the roadmap document supplied in the ask, plus one keyword grep against `spec-gaps-v2.md` (the SPEC-GAPS v2 the roadmap claims to be read against — cited below by line) and one web search (Romania GDPR Art. 8 age). The repo was otherwise not read; RUNBOOK.md was not present in the workspace to check. Checks actually run: `grep -inE "backup|restore|monitoring|sentry|alerting|deploy|uptime|GDPR|terms of|privacy|cookie|onboard|first-hour|load test|capacity|plagiar" spec-gaps-v2.md` (results cited inline) and the GDPR search above.

### A. Baseline accuracy — the starting point is flattered

**BASE-1 · §1 strength claims outrun the backlog.** What: the executive summary sells "httpOnly-cookie JWT" as a present-tense strength and matrix row 21 marks sandbox hardening **Y**; SPEC-GAPS v2 says JWTs currently live in localStorage with the cookie migration (SP1) an open **P1/L** item (`spec-gaps-v2.md:238`, design at `:246-252`), and J3/SP3 exist because judging has an open network/mount hole (`spec-gaps-v2.md:264`). Evidence: roadmap §1 and §3.2 row 21 vs `spec-gaps-v2.md:238,:264`. Design: correct §1 prose and row 21 to "P (SP1/SP3 pending)"; restate the 4Y/10P/54N totals. Impact M · Effort S · Wave 0 (doc fix, but it changes every priority argument built on the baseline).

### B. Dropped by the synthesis — already specced in SPEC-GAPS v2, absent from the roadmap

The footer claims "SPEC-GAPS items consumed by this roadmap are cited by their IDs (… SP1–SP7, X1–X12)", yet four items were silently dropped and two pre-exposure gates vanished from the Wave-0 chain (§7 lists only "SP2/SP5 before public exposure"; the backlog's gate chain is SP2→SP1→SP4→SP5→**SP6**→**SP3**, `spec-gaps-v2.md:264`). This is the clearest case of the synthesis rationalizing away what it claims to have consumed.

**OPR-1 · Backups & restore drill (reinstate SP6 as a Wave-0 gate).** What: daily pg_dump + off-host copy + restore runbook + quarterly restore test. Evidence: `spec-gaps-v2.md:243` (full design, P2) — the roadmap's §7 Wave 0 and §4.8 OPS-1..7 contain no backup item. Design: reinsert SP6 into the §7 Wave-0 tail exactly as specced. **Impact H · Effort M · Wave 0.**

**OPR-2 · Judge network hardening (SP3) restored to the pre-exposure chain.** Evidence: `spec-gaps-v2.md:264` ("SP3 (socket-proxy, strictly after J2)") — roadmap omits it while its own JDG-2 design leans on J2's docker-exec path. **Impact H · Effort S–M · Wave 0.**

**OPR-3 · Observability (X3, dropped).** What: Sentry/GlitchTip for both apps, /healthz + /readyz, judge queue-depth and duration metrics, structured logs, output-size caps + retention. Evidence: `spec-gaps-v2.md:278` — full design exists; the roadmap's 68-capability matrix has no observability row (competitor crawls can't see ops, so a competitor-derived matrix structurally omits it — that is how it fell out). **Impact H · Effort M · Wave 0/A.**

**ONB-1 · Onboarding & first-run flow (X4, reduced to a parenthetical).** What: X4 speccs both `seed_problems` (~15–25 RO/EN classics) **and a first-run "make your first submission" flow** (`spec-gaps-v2.md:280`); the roadmap keeps only the seed-pack aside (EDU-10, JDG-11) and places no onboarding item in any wave — Wave A's exit criterion ("a learner can … practice") has no first-hour path. Design: reinstate the full X4 in Wave A and extend: guided `/start` trio (one easy problem per paradigm), localized empty states (profile/forum/class), verified password-reset E2E once SP5 lands, activation metric (ANA-1). **Impact H · Effort M · Wave A.**

**LEG-1 · Terms / privacy / GDPR account control (X5, dropped).** What: X5 already designs /terms + /privacy, `POST /users/me/export/`, soft-delete + purge, cookie notice (`spec-gaps-v2.md:282`); the roadmap contains **zero legal rows among its 78 gaps** and never mentions X5 — while planning UGC surfaces (COM-1, EDT-3), publishing users' AC sources (COM-7), teacher identity verification (EDU-1), and student-grade exports (EDU-6). Design: reinstate X5 as the public-exposure gate and extend it: license grant for submissions/forum posts/editorials (e.g. CC BY-SA for editorial text; code stays the author's with a platform-display right for COM-7), and a school-facing data-processing agreement template for the classroom stack. **Impact H (school-adoption blocker) · Effort S–M · Wave 0/A.**

### C. Genuinely new — in neither the roadmap nor the backlog

**OPR-4 · Contest-scale capacity: throughput targets, backpressure, in-contest throttles, load test.** What: rated contests synchronize submissions; CON-8's end-of-contest full re-judge of locked submissions is a designed load spike (roadmap §4.1); CON-1 leans on D-B8 live recompute. Nothing sets a capacity number: X3 gives metrics but no target or test (`spec-gaps-v2.md:278`); SP4 throttles are practice-side. Design: numeric gate (e.g. 50 concurrent submitters, p95 judge wait < 20 s), worker/sandbox-pool sizing note, per-user in-contest submission cooldown (30–60 s — also anti-brute-force), queue-depth alert, Celery priority lanes (contest > practice > scratch), and a synthetic 30-user submission replay as the first-rated-contest exit gate. **Impact H · Effort S–M · Wave B gate.**

**PRF-1 · Standings materialization for live scoreboards.** What: CON-1/CON-3 reuse D-B8 "window-rank aggregation" per request over per-test scores. Design: materialized standings row per (contest, user, problem) updated on verdict commit; scoreboard reads never recompute; freeze stays a query filter as CON-3 designs. Fold into CON-1 acceptance criteria. **Impact M · Effort S · Wave B.**

**CNT-1 · Launch content plan with numeric gates.** What: a judge is empty without problems — X4's 15–25 seed pack is fixture-grade, while pbinfo shows 5,000+, infoarena 2,377, .campion 1,564 (roadmap §2.7–2.9); the roadmap's only seeding references are parentheticals, and guardrail 1 (RO+EN parity from day one) doubles per-problem statement cost. Design: a content workstream owned like a wave, with a launch bar (e.g. ≥150 APPROVED problems at public launch, every EDU-9 v1 chapter ≥ 15 problems, editorial coverage ≥ 30%), an authoring/translation capacity plan (who, hours/week), and bilingual-completion tracked in ANA-1. **Impact H · Effort M ongoing (content, not code) · Wave A/B — launch-blocking.**

**CNT-2 · Import/licensing as a first-class pipeline with a permission ledger.** What: RO-6 relegates rights to a parenthetical ("verify per-source licensing before import — flagged as a content-ops task, not assumed"); JDG-11 imports packages, not rights. Design: per-source permission ledger (source, contact, terms, date, evidence), re-author-vs-verbatim policy (statements can be copyrighted even where tests are public), translation workflow, attribution surfaced on problem pages; slice BB-6 to one pilot archive (one OJI edition) before any "30-year" commitment. **Impact H · Effort S (ledger) + M (pilot) · Wave B/C.**

**CNT-3 · Difficulty calibration & tag-coverage gates.** What: §3.1 row 5 (community-calibrated difficulty, Us=N) never becomes a gap; RAT-4's ladder weights (easy 1 / medium 3 / hard 6) and RAT-7's per-tag bars silently assume calibrated difficulty and populated tags. Design: author-assigned difficulty + provenance at creation; recalibrate from AC-rate once UXP-7 aggregates exist; minimum tag-coverage rule before RAT-7 ships. **Impact M · Effort S · Wave A (data-quality gate for RAT-4/7).**

**ANA-1 · Owner product analytics.** What: §7 Wave D is explicitly "choose by traction" with nothing measuring traction; X3 covers ops metrics only (`spec-gaps-v2.md:278`). Design: server-side derivations over existing models (signup → first submission → first-AC activation, D1/D7 active, submission funnel, per-wave exit metrics), self-hosted/cookie-light to keep the X5/GDPR story clean; weekly owner dashboard. **Impact H · Effort S · Wave 0/A — must precede Wave B/C/D sequencing decisions.**

**LEG-2 · Minors: consent age & safeguarding defaults.** What: EDU-10 targets grades 5–8 (≈ ages 10–14) while Romania kept the GDPR Art. 8 information-society consent age at 16 (Legea 190/2018; [Art. 8 GDPR](https://gdpr-info.eu/art-8-gdpr); [Westlaw EEA age-of-consent chart](https://content.next.westlaw.com/practical-law/document/I117f2abca84011e9adfea82903531a62/GDPR-Age-of-Child-Consent-Chart-EEA-Overview); [EUConsent](https://euconsent.eu/digital-age-of-consent-under-the-gdpr)) — so self-serve consent-based accounts for the gimnaziu cohort are not lawful without parental authorization. Design: school-mediated enrollment for <16 (teacher-created class accounts under the school's lawful basis) or a parental-consent flow; minors' profiles default non-public with county/school fields hidden (interacts with RO-3's identity fields); hard gate before EDU-10. **Impact H (RO market) · Effort M · Wave B, gate before EDU-10.**

**SAF-1 · Moderation kit ships with the first UGC surface (roadmap-internal inconsistency).** What: RAT-10's own text says "Ship with the forum, not after" yet is labeled Wave C "(with forum polish)" while B9 (forum) is Wave 0 and COM-1 (problem threads) is Wave A/B; EDT-4 says UGC language flags should exist "before comments ship" yet sits in Wave C. Design: minimum kit (report button, hide-at-threshold, mod queue, audit log, abuse contact) as COM-1 acceptance criteria; re-wave RAT-10 basics and EDT-4's lang flag to ride B9/COM-1. **Impact M · Effort S · Wave 0/A.**

**SAF-2 · Contest integrity: AI-assisted cheating & multi-accounting.** What: the roadmap cites USACO's AI/multi-account lifetime bans and AtCoder's versioned AI rules (EDU-4 evidence) but scopes rules to exam teme only; RAT-1 turns the rating ladder into the platform's core asset with no enforcement row — LLM-assisted solves of easy contest problems are the existential threat to a small rated ladder. Design: RO/EN rated-contest AI policy at the first rated contest, verified-email registration, post-contest review via JDG-13 v1's diff view + solve-pattern anomalies, rating-rollback/discard tooling; no proctoring. **Impact H · Effort S (policy) → M (tooling) · Wave B.**

**OPR-5 · Email deliverability.** What: SP5 is mail transport; DNS authentication (SPF/DKIM/DMARC) and sending-domain warmup appear nowhere, yet password reset, D-B10 notifications, EDU-2 homework badges and UXP-5's digest all depend on mail — reset mails in spam means locked-out classrooms. **Impact M · Effort S · Wave 0 (with SP5).**

### D. Over-scoped for a solo maintainer — slice thinner or mark later

1. **Wave A "≈2–4 weeks"** carries nine parallel groups (editor, judge scoring package, two languages, scratch, hints+editorials, gamification pack, file-I/O+taxonomy, catalog pack, SEO+bookmarks) — realistically 2–3 months solo. Slice: editor + judge scoring + file-I/O first; taxonomy v1 and most gamification can slip a wave without breaking Wave A's own exit criterion.
2. **Wave B "~1–2 months"** is the headline over-scope: contest core + formats + freeze + clarifications + calendar + windowed + ratings + the 5-part classroom stack + judge polish + RO pack. Slice into **B1** (windowed, IOI-scored, **unrated** contest + teme EDU-1/2/3/5/6 — teachers unblocked) and **B2** (rated RAT-1/2/3 + extra formats + CON-4 clarifications + CON-3 freeze). The roadmap's own design notes imply CON-3/CON-4 add nothing for unrated class contests.
3. **CON-2 three pluggable formats at once:** ship exactly one strategy (IOI sum-of-best — the engine already computes it, per CON-2's own design); add ICPC penalty math when an ICPC-format event actually exists.
4. **RAT-4/5/6/7 as one Wave-A pack:** ladder + streak/heatmap first (pure B5 derivations); badge breadth (5 badges, not 30) and the per-tag radar wait on CNT-3 tag/difficulty coverage.
5. **EDU-8 MCQ bank:** the engine is S; the content is the real L (pbinfo's 250 grade-9 items, §2.7, took years). Split the row: engine Wave C, content pilot (30 items, one chapter) before building per-class statistics.
6. **EDU-9 grades 9–12 at once:** data-entry-heavy against a 2,169-problem comparator (§2.7). Slice grades 9–10 with per-chapter minimum problem counts (CNT-1) before extending.
7. **OPS-1 public API:** design text says "from day one" while sequencing says Wave C — keep Wave C, slice to read-only problems + leaderboard, and resolve the OPS-2 (2FA/token) interplay before personal tokens.
8. **JDG-13 v2 batch plagiarism:** O(n²) per contest/teme on Celery; keep the v1 diff view + "download all solutions" (the roadmap's own weekend estimate); defer the batch runner until contest volume justifies it.
9. **OPS-7/BB-7 paid tiers:** any payment rail implies Romanian fiscal setup (invoicing/registration) absent from the document; donations page first, paid hosted contests only after legal + fiscal groundwork exists.

**Verification status:** every `spec-gaps-v2.md:line` citation above comes from the grep run this session; §/§-references point at the roadmap text in the ask; the GDPR age claim is sourced to the search results linked in LEG-2. RUNBOOK.md could not be checked (not present in the workspace) — OPR-1's restore-runbook reference is the backlog's own plan, not a verified existing runbook.

## How to use this

This document is the strategy layer above `docs/SPEC-GAPS.md` (v2, 2026-10-21), which remains the authoritative backlog for platform items (B/J/F/A/Q/SP/X ids); every gap row in §4 cites the SPEC-GAPS items it consumes, and every design sketch is written to be dropped into a SPEC-GAPS-style implementation ticket. Future implementation workflows should enter through §7's wave structure and take the waves in order: Wave 0 consumes the SPEC-GAPS backbone (B4/B8/B9/B10/D-B11 and the full SP2→SP1→SP4→SP5→SP6→SP3 pre-exposure gate chain), Wave A ships the quick wins that complete the practice loop, Wave B is the contests + ratings + classroom center of gravity, and Waves C/D add depth and big bets — pulling each item's design sketch, Impact/Effort estimate and evidence URLs from §4 as the acceptance references, honoring the Round-2 additions (ops, onboarding, legal, content, analytics and integrity gates) as hard gates inside the wave that names them rather than optional polish, and re-reading `docs/SPEC-GAPS.md` before starting any wave to confirm which backbone items have since shipped.
