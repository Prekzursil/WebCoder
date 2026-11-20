# WebCoder — Teacher Guide

> One-paragraph summary: WebCoder gives teachers the pbinfo-style classroom loop — classes with student self-join, assignments (teme) with publish windows and soft expiry, exam-mode lockdown, MCQ sets from the Bac bank, per-student progress grids, heatmaps, effort boards, report cards and CSV/PDF exports — on top of a real bilingual judge. This guide walks the whole classroom workflow.

**Who it's for:** teachers, club coordinators, county olympiad trainers. Romanian twin: [`docs/guide-ro/GHID-PROFESOR.md`](../guide-ro/GHID-PROFESOR.md).

---

## 1. Get the TEACHER role

Ask an administrator to upgrade your account to **TEACHER** (verification via school email / the school-partnership program; `docs/RUNBOOK.md` §Wave C). The role unlocks `/teach`, class creation, assignment authoring and the analytics surfaces.

## 2. Create a class

1. `/teach` → **New class** → name it (e.g. "IX-A Informatică").
2. You get a **join code + join password**. Students join themselves from their profile (pbinfo's anti-abuse model — you never create student accounts):
   - share the code, students enter it on `/classroom` join;
   - or share the **QR code** (mobile-friendly join);
   - batch import by username list is also available (missing usernames reported).
3. Members list links to public profiles and class-scoped submission views.

## 3. Assignments (teme)

Create an assignment on a class:

- **problems** picked individually, from curriculum chapters, or from any track in one click ("turn this track into a tema");
- **availability window** (`available from` → `due at`, optional `late until`);
- optional **exam mode**: while a student is inside an exam temă, the rest of the site (forum, other problems, hints) is locked down for them, with a published conduct/AI policy;
- **MCQ sets** pulled from the Bacalaureat grile bank (discipline/class/Bac-year filters, shuffle option).

Soft expiry (the pbinfo semantic): after the deadline students can still submit — those submissions simply don't count for the temă. The judge never punishes learning; upsolving doubles as revision.

## 4. Track the class

The class page's tabs:

- **Grid** — students × problems matrix of best score / verdict / attempts, aggregated over submissions inside the window; per-student drawer with their full history in the class.
- **Insights** — class failure heatmap (which problems block whom), per-problem failure rates.
- **Effort board** — attempts + active days + solves ranking (the grind board).
- **Report card** — per-student PDF: every temă's per-problem scores, totals, late flags. Printable for the catalog electronic.
- **Exam PDF** — assignments export as a printable statements+points booklet.

## 5. Exports & grades

- CSV gradebook (per-student max score per problem + totals) for any external catalog;
- per-class report-card PDFs;
- "download all solutions" per temă (the #1 teacher request on every judge) for offline plagiarism review (plus the platform's own advisory similarity flags).

## 6. Curriculum tree

`/problems` curriculum axis maps the national programme (grades 5–12 → chapters → topics) with per-node problem counts. Teme-building is chapter-picking: filter the catalog by your chapter, select, assign. The tree is versioned data (a new programme edition adds a taxonomy version, not a migration).

## 7. Run a class contest

Windowed contests fit a school schedule: one multi-day window, each student gets one timed sitting (personal countdown). Create it from `/contests` (TEACHER/CREATOR can create private contests), attach the class's problems, share the registration. Rated or unrated — unrated is the default for practice rounds. The replay page shows any student's minute-by-minute timeline for post-mortem teaching.

## 8. Authoring your own problems

CREATOR/TEACHER accounts can author:

- the 7-step **visual wizard** (basics → limits → samples → tests → reference solution → translation → review) with the statement linter and readability score;
- hidden tests via the generator DSL or the testcase bounty board (community pledges);
- Polygon/Kattis package import (permission-ledger gated).

Every problem goes through DRAFT → PENDING → APPROVED with verifier feedback; authoring IS professional development (the contributor program page documents the specs and feedback templates).

## 9. Certifications & partnerships

- Teacher certification (the program page explains requirements and the exam);
- school partnerships (DPA template in `docs/DPA-TEMPLATE.md`);
- data-processing: classroom data follows the GDPR section of the legal pages; minors' consent is school-mediated (teacher-created accounts under the school's lawful basis) or parental.

## 10. FAQ

**A student forgot their password** — self-service reset by email; without email, a school-mediated account is the robust pattern.
**Can I see students' code?** Yes — class-scoped submission views per student (the gradebook links them).
**Do contest ratings affect class grades?** No — ratings and teme scores are separate systems; export what you need.
