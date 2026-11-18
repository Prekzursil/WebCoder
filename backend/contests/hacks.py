"""Open hacks: the lock-to-hack contract (backlog item 48, Codeforces
pattern shipped on the existing contest engine).

The flow, exactly as Codeforces runs it inside a round:

1. a participant fully solves a board problem, then LOCKS it
   (``lock_problem``) — from then on they cannot resubmit that problem
   (``contests.gating`` refuses locked problems);
2. in exchange they may read other participants' solutions for the locked
   problem (``hackable_targets``) and submit counter-tests against them;
3. ``judge_hack`` runs the hack input through BOTH the target submission
   and the problem's reference (model) solution in the judge sandbox:
   the hack is SUCCESSFUL when the target fails (WA/TLE/MLE/RE) while the
   reference still passes, UNSUCCESSFUL when the target survives, INVALID
   when the input breaks the reference itself (it is not a valid test).

Scoring: +100 per successful hack, −50 per unsuccessful one (floored at 0
per participation) — surfaced on the standings as a separate hacks column
next to the format score (the CF display: hack points are their own thing,
the format rank stays the format's).
"""

from __future__ import annotations

import logging
import pathlib
import tempfile

from django.db.models import Q
from django.utils import timezone

from submissions.judge_utils.comparison import compare_outputs_detailed
from submissions.judge_utils.compilation import compile_code_in_sandbox
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.models import Submission

from .models import Hack, Contest, ContestParticipation, ContestProblem, ContestScore

logger = logging.getLogger(__name__)

#: Sandbox budget for one hack run (each side of the pair) — hacks are
#: author-attended, low-volume runs; they do not inherit the problem's
#: (possibly huge) contest limits.
HACK_TIME_LIMIT_MS = 10_000
HACK_MEMORY_LIMIT_KB = 524_288


def hack_window_open(contest: Contest, now=None) -> bool:
    """Hacking is live while the contest runs, from the freeze boundary
    (or the start when no freeze is configured) until ``end_at``."""
    now = now or timezone.now()
    if contest.state(now) != Contest.State.RUNNING:
        return False
    opens_at = contest.freeze_at or contest.start_at
    return now >= opens_at


def lock_problem(
    contest: Contest,
    participation: ContestParticipation,
    contest_problem: ContestProblem,
) -> tuple[bool, str]:
    """Lock a fully-solved board problem for a participation.

    Returns (ok, error). Locking requires a full solve (``first_ac_at`` on
    the materialized score row) and is irreversible — that is the whole
    contract (you trade resubmission rights for hacking rights).
    """
    if contest_problem.contest_id != contest.id:
        return False, "That problem is not on this contest's board."
    row = ContestScore.objects.filter(
        participation=participation, contest_problem=contest_problem
    ).first()
    if row is None or row.first_ac_at is None:
        return False, "Lock a problem only after fully solving it."
    if participation.locked_problems.filter(pk=contest_problem.pk).exists():
        return False, "That problem is already locked."
    participation.locked_problems.add(contest_problem)
    return True, ""


def hackable_targets(contest: Contest, participation: ContestParticipation):
    """Submissions the hacker may read and hack: other OFFICIAL
    participants' latest submissions on problems this participation has
    locked. (Own submissions are excluded — you cannot hack yourself.)"""
    locked_ids = list(
        participation.locked_problems.values_list("problem_id", flat=True)
    )
    if not locked_ids:
        return Submission.objects.none()
    other_users = (
        ContestParticipation.objects.filter(contest=contest, is_virtual=False)
        .exclude(user_id=participation.user_id)
        .values_list("user_id", flat=True)
    )
    return (
        Submission.objects.filter(
            contest=contest,
            problem_id__in=locked_ids,
            user_id__in=other_users,
        )
        .select_related("user", "problem")
        .order_by("problem_id", "-submission_time")
    )


def _run_pair(problem, target: Submission, hack_input: str):
    """Compile + run reference and target on the hack input.

    Returns ``(status, detail)`` where status is one of
    ``invalid`` (reference failed — not a usable test), ``crash``
    (target failed by verdict) or ``compared`` (both ran; detail carries
    the outputs). Raises ``ValueError`` on compile failures.
    """
    if not problem.reference_solution_code or not problem.reference_language:
        raise ValueError(
            "This problem has no reference solution — hacking is unavailable."
        )
    with tempfile.TemporaryDirectory(prefix=f"hack_{target.id}_") as tmp:
        workspace = pathlib.Path(tmp)
        ok_ref, out_ref, exe_ref = compile_code_in_sandbox(
            problem.reference_solution_code, problem.reference_language, workspace
        )
        if not ok_ref:
            raise ValueError(f"Reference solution failed to compile: {out_ref[:200]}")
        ok_tgt, out_tgt, exe_tgt = compile_code_in_sandbox(
            target.code, target.language, workspace
        )
        if not ok_tgt:
            raise ValueError(f"Target solution failed to compile: {out_tgt[:200]}")

        ref_verdict, _t, _m, ref_out, ref_err = run_code_in_sandbox(
            exe_ref,
            problem.reference_language,
            hack_input,
            HACK_TIME_LIMIT_MS,
            HACK_MEMORY_LIMIT_KB,
            workspace,
        )
        tgt_verdict, _t2, _m2, tgt_out, tgt_err = run_code_in_sandbox(
            exe_tgt,
            target.language,
            hack_input,
            HACK_TIME_LIMIT_MS,
            HACK_MEMORY_LIMIT_KB,
            workspace,
        )

    if str(ref_verdict) != str(Submission.VerdictStatus.ACCEPTED):
        return (
            "invalid",
            f"Reference solution fails on this input ({ref_verdict}) — "
            "the hack input is not a valid test.",
        )
    if str(tgt_verdict) != str(Submission.VerdictStatus.ACCEPTED):
        return (
            "crash",
            f"Target submission fails on this input ({tgt_verdict}).",
        )
    return "compared", {"reference": ref_out or "", "target": tgt_out or ""}


def judge_hack(hack: Hack) -> Hack:
    """Judge one pending hack (synchronous, sandboxed, idempotent-safe:
    re-judging a decided hack is refused)."""
    if hack.verdict != Hack.Verdict.PENDING:
        return hack
    problem = hack.contest_problem.problem
    target = hack.target
    try:
        status, detail = _run_pair(problem, target, hack.input_data)
    except ValueError as exc:
        hack.verdict = Hack.Verdict.INVALID
        hack.feedback = str(exc)
        hack.judged_at = timezone.now()
        hack.save(update_fields=["verdict", "feedback", "judged_at"])
        return hack

    if status == "invalid":
        hack.verdict = Hack.Verdict.INVALID
        hack.feedback = detail
    elif status == "crash":
        hack.verdict = Hack.Verdict.SUCCESSFUL
        hack.feedback = detail
    else:
        ok, hint = compare_outputs_detailed(
            detail["target"],
            detail["reference"],
            problem.comparison_mode,
            problem.float_comparison_epsilon,
        )
        if ok:
            hack.verdict = Hack.Verdict.UNSUCCESSFUL
            hack.feedback = "The target solution survives this input."
        else:
            hack.verdict = Hack.Verdict.SUCCESSFUL
            hack.feedback = f"Wrong answer on the hack input ({hint})."
    hack.judged_at = timezone.now()
    hack.save(update_fields=["verdict", "feedback", "judged_at"])
    return hack


def hack_tallies(contest: Contest) -> dict[int, dict]:
    """Per-hacker point tally over decided hacks: ``{user_id: {successful,
    unsuccessful, invalid, points}}`` (points floored at 0, CF model — the
    floor applies to the FINAL total so row order cannot change it)."""
    from .models import HACK_FAIL_PENALTY, HACK_SUCCESS_POINTS

    tallies: dict[int, dict] = {}
    rows = Hack.objects.filter(
        contest=contest,
        verdict__in=[Hack.Verdict.SUCCESSFUL, Hack.Verdict.UNSUCCESSFUL],
    ).values_list("hacker_id", "verdict")
    for hacker_id, verdict in rows:
        entry = tallies.setdefault(
            hacker_id,
            {"successful": 0, "unsuccessful": 0, "invalid": 0, "raw_points": 0},
        )
        if verdict == Hack.Verdict.SUCCESSFUL:
            entry["successful"] += 1
            entry["raw_points"] += HACK_SUCCESS_POINTS
        else:
            entry["unsuccessful"] += 1
            entry["raw_points"] -= HACK_FAIL_PENALTY
    for entry in tallies.values():
        entry["points"] = max(0, entry.pop("raw_points"))
    return tallies


def visible_hacks_queryset(contest: Contest, user):
    """Who sees what: organizers see every hack, participants see their own
    plus every SUCCESSFUL hack (the Codeforces public-hack feed — you learn
    a solution broke, you do not read pending attempts), everyone else
    (after the contest) the successful ones only."""
    qs = Hack.objects.filter(contest=contest).select_related(
        "hacker", "target", "target__user", "contest_problem"
    )
    if (
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or user.role == "ADMIN"
            or contest.created_by_id == user.id
        )
    ):
        return qs
    if user and user.is_authenticated:
        return qs.filter(Q(hacker=user) | Q(verdict=Hack.Verdict.SUCCESSFUL))
    return qs.filter(verdict=Hack.Verdict.SUCCESSFUL)
