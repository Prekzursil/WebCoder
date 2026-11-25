"""Wave E learning-engine derivations (items 29/34/35).

Everything here is computed from the caller's own submission history —
no new per-user state, so nothing can drift:

- :func:`review_queue` (item 29, spaced-repeat): every problem the user
  attempted WITHOUT an AC is a flashcard that comes back at growing
  intervals since the last attempt (1 → 3 → 7 → 16 → 35 days — roughly
  doubling, the classic expanding-schedule shape). A solve removes the
  card permanently (the problem is learned).
- :func:`practice_plan` (item 34): a week-shaped plan. One focus per day
  chosen from (a) due review problems, (b) the user's weakest practiced
  tag (attempted, lowest AC rate), (c) the easiest unsolved APPROVED
  problem overall — in that priority, with rest days left empty.
- :func:`mistake_profile` (item 35): pattern analysis over the verdict
  history — the classic signatures: sample-pass-but-hidden-fail
  (edge cases), RE-heavy (indexing/None mistakes), TLE-heavy (complexity),
  WA-only-at-scale, first-test-fail (I/O contract misread).
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone
from problems.models import Problem
from submissions.models import Submission, SubmissionTestResult

# Plain string codes, matching Submission.VerdictStatus values ('AC',
# 'WA', …): the lean gate's type environment resolves TextChoices members
# to their tuple form, and these helpers are str-typed end to end. The
# test suite pins the equivalence (see test_learning).
AC = "AC"
WA = "WA"
TLE = "TLE"
RE = "RE"
CE = "CE"
MLE = "MLE"

#: The expanding review schedule, indexed by consecutive failed attempts.
REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35]


def _attempts_by_problem(user):
    rows = (
        Submission.objects.filter(user=user)
        .select_related("problem")
        .order_by("submission_time")
    )
    by_problem: dict[int, list[Submission]] = {}
    for row in rows:
        by_problem.setdefault(row.problem_id, []).append(row)
    return by_problem


def review_queue(user, limit: int = 20) -> list[dict]:
    """Item 29: due + upcoming spaced-repeat cards from the user's own
    misses. Each card carries the interval it's on and when it's due."""
    now = timezone.now()
    cards = []
    for problem_id, attempts in _attempts_by_problem(user).items():
        if any(a.verdict == AC for a in attempts):
            continue  # learned — never resurfaces
        misses = [a for a in attempts if a.verdict in (WA, TLE, RE, MLE)]
        if not misses:
            continue
        misses.sort(key=lambda a: a.submission_time)
        stage = min(len(misses) - 1, len(REVIEW_INTERVALS_DAYS) - 1)
        last = misses[-1]
        due_at = last.submission_time + timedelta(days=REVIEW_INTERVALS_DAYS[stage])
        problem = last.problem
        cards.append(
            {
                "problem_id": problem_id,
                "title_i18n": problem.title_i18n,
                "difficulty": problem.difficulty,
                "attempts": len(attempts),
                "misses": len(misses),
                "stage": stage + 1,
                "interval_days": REVIEW_INTERVALS_DAYS[stage],
                "due_at": due_at,
                "due": due_at <= now,
            }
        )
    cards.sort(key=lambda c: (not c["due"], c["due_at"]))
    return cards[:limit]


def practice_plan(user, days: int = 7) -> dict:
    """Item 34: the week-shaped plan (list of day entries; None = rest)."""
    now = timezone.now()
    cards = [c for c in review_queue(user, limit=50) if c["due"]]
    # Weakest practiced tag: attempted problems with the lowest AC rate.
    attempted = {}
    for attempts in _attempts_by_problem(user).values():
        problem = attempts[0].problem
        solved = any(a.verdict == AC for a in attempts)
        for tag in problem.tags.all():
            stat = attempted.setdefault(tag.slug, {"tag": tag, "n": 0, "ac": 0})
            stat["n"] += 1
            if solved:
                stat["ac"] += 1
    weak_tags = sorted(
        attempted.values(), key=lambda s: (s["ac"] / s["n"] if s["n"] else 1, -s["n"])
    )
    solved_ids = {
        attempts[0].problem_id
        for attempts in _attempts_by_problem(user).values()
        if any(a.verdict == AC for a in attempts)
    }
    fresh = list(
        Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
        .exclude(id__in=solved_ids)
        .order_by("difficulty", "id")[: days * 2]
    )

    plan = []
    card_i = fresh_i = tag_i = 0
    for day_offset in range(days):
        day = {
            "date": (now + timedelta(days=day_offset)).date().isoformat(),
            "kind": None,
            "problem_id": None,
            "title_i18n": None,
            "focus_tag": None,
        }
        if day_offset % 7 == 6:
            plan.append(day)  # scheduled rest day
            continue
        if card_i < len(cards):
            card = cards[card_i]
            card_i += 1
            day.update(
                kind="review",
                problem_id=card["problem_id"],
                title_i18n=card["title_i18n"],
            )
        elif tag_i < len(weak_tags):
            stat = weak_tags[tag_i]
            tag_i += 1
            candidate = (
                Problem.objects.filter(
                    status=Problem.ProblemStatus.APPROVED, tags=stat["tag"]
                )
                .exclude(id__in=solved_ids)
                .order_by("difficulty", "id")
                .first()
            )
            day.update(kind="weak_tag", focus_tag=stat["tag"].slug)
            if candidate is not None:
                day.update(problem_id=candidate.id, title_i18n=candidate.title_i18n)
        elif fresh_i < len(fresh):
            problem = fresh[fresh_i]
            fresh_i += 1
            day.update(kind="new", problem_id=problem.id, title_i18n=problem.title_i18n)
        plan.append(day)
    return {"days": plan, "due_reviews": len(cards)}


def mistake_profile(user) -> dict:
    """Item 35: the user's mistake-pattern profile over all attempts."""
    attempts = list(Submission.objects.filter(user=user).select_related("problem"))
    total = len(attempts)
    if total == 0:
        return {
            "total_submissions": 0,
            "patterns": [],
            "summary": "No submissions yet — the profile builds as you submit.",
        }
    counts: dict[str, int] = {}
    for a in attempts:
        counts[a.verdict] = counts.get(a.verdict, 0) + 1
    patterns: list[dict] = []

    def share(verdict: str) -> float:
        return counts.get(verdict, 0) / total

    # Sample-pass / hidden-fail: WA verdict with all SAMPLE tests green.
    sample_hidden = 0
    wa_rows = [a for a in attempts if a.verdict == WA]
    for a in wa_rows:
        results = list(
            SubmissionTestResult.objects.filter(submission=a, test_case__is_sample=True)
        )
        samples_green = results and all(r.verdict == AC for r in results)
        hidden_red = (
            SubmissionTestResult.objects.filter(
                submission=a, test_case__is_sample=False
            )
            .exclude(verdict=AC)
            .exists()
        )
        if samples_green and hidden_red:
            sample_hidden += 1
    # A PATTERN needs repeat evidence: at least two WA rows (one WA is
    # noise, not a signature).
    if len(wa_rows) >= 2 and sample_hidden / len(wa_rows) >= 0.5:
        patterns.append(
            {
                "pattern": "EDGE_CASES",
                "evidence": f"{sample_hidden}/{len(wa_rows)} WA submissions pass every sample but fail hidden tests.",
                "hint_en": "Your core idea works — probe the statement's extremes (n=0, n=max, ties, negatives).",
                "hint_ro": "Ideea merge — verifică extremele enunțului (n=0, n=max, egalități, negative).",
            }
        )
    if share(RE) >= 0.25:
        patterns.append(
            {
                "pattern": "RUNTIME_ERRORS",
                "evidence": f"{counts.get(RE, 0)}/{total} submissions die with RE.",
                "hint_en": "Check array bounds and None/zero cases before indexing; add a defensive assert while debugging.",
                "hint_ro": "Verifică limitele tablourilor și cazurile None/zero înainte de indexare; adaugă un assert defensiv la debug.",
            }
        )
    if share(TLE) >= 0.2:
        patterns.append(
            {
                "pattern": "TIME_LIMIT",
                "evidence": f"{counts.get(TLE, 0)}/{total} submissions time out.",
                "hint_en": "The complexity budget is blown — look for a nested loop over n or a sort inside the loop.",
                "hint_ro": "Bugetul de complexitate e depășit — caută o buclă imbricată pe n sau un sort în buclă.",
            }
        )
    first_test_fails = sum(
        1
        for a in wa_rows
        if SubmissionTestResult.objects.filter(submission=a)
        .order_by("test_case__order")
        .first()
        is not None
        and SubmissionTestResult.objects.filter(submission=a)
        .order_by("test_case__order")
        .first()
        .verdict
        != AC
    )
    if len(wa_rows) >= 2 and first_test_fails / len(wa_rows) >= 0.6:
        patterns.append(
            {
                "pattern": "IO_CONTRACT",
                "evidence": f"{first_test_fails}/{len(wa_rows)} WA submissions fail from the FIRST test.",
                "hint_en": "The output contract is misread — re-check separators, spacing and the exact output lines.",
                "hint_ro": "Contractul de ieșire e greșit citit — reverifică separatoarele, spațiile și liniile exacte de afișat.",
            }
        )
    if not patterns:
        patterns.append(
            {
                "pattern": "NO_DOMINANT_PATTERN",
                "evidence": f"{total} submissions with no dominant failure signature.",
                "hint_en": "No repeating failure pattern — keep solving and the profile will sharpen.",
                "hint_ro": "Niciun tipar dominant de greșeală — continuă și profilul se va contura.",
            }
        )
    return {
        "total_submissions": total,
        "verdict_counts": counts,
        "patterns": patterns,
        "summary": f"{total} submissions, {counts.get(AC, 0)} accepted ({int(100 * counts.get(AC, 0) / total)}% AC rate).",
    }
