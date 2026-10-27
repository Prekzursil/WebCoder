"""Leaderboard tests (SPEC-GAPS D-B8): scoring rule, aggregation
idempotency, endpoint rank arithmetic + tie-breaks, catalog stats, and
the post-AC incremental recompute hook in the judge task."""

from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from leaderboard.aggregation import recompute_all_leaderboards, update_user_entry
from leaderboard.models import LeaderboardEntry
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User


def _mk_problem(status_=Problem.ProblemStatus.APPROVED, points=10):
    p = Problem.objects.create(
        title_i18n={"en": "P"},
        statement_i18n={"en": "S"},
        status=status_,
    )
    ProblemTestCase.objects.create(
        problem=p, input_data="i", expected_output_data="o", points=points, order=1
    )
    return p


def _sub(user, problem, verdict, language="python3"):
    return Submission.objects.create(
        user=user,
        problem=problem,
        language=language,
        code="pass",
        verdict=verdict,
    )


class AggregationTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")

    def test_double_ac_on_same_problem_credits_once(self):
        p = _mk_problem(points=10)
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        recompute_all_leaderboards()
        entry = LeaderboardEntry.objects.get(user=self.alice)
        self.assertEqual(entry.solved_count, 1)
        self.assertEqual(entry.total_points, 10)

    def test_wa_and_ce_never_credit(self):
        p = _mk_problem()
        _sub(self.alice, p, Submission.VerdictStatus.WRONG_ANSWER)
        _sub(self.alice, p, Submission.VerdictStatus.COMPILE_ERROR)
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        recompute_all_leaderboards()
        entry = LeaderboardEntry.objects.get(user=self.alice)
        self.assertEqual(entry.solved_count, 1)
        # success-rate inputs: 3 submissions to APPROVED, 1 AC
        self.assertEqual(entry.total_submissions, 3)
        self.assertEqual(entry.ac_submissions, 1)

    def test_private_problem_excluded(self):
        p = _mk_problem(status_=Problem.ProblemStatus.PRIVATE, points=50)
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        recompute_all_leaderboards()
        # No AC on an APPROVED problem -> no entry at all (the full pass
        # deletes/omits rows not in the result), and the per-user recompute
        # confirms zeros.
        self.assertFalse(LeaderboardEntry.objects.filter(user=self.alice).exists())
        entry = update_user_entry(self.alice.pk)
        self.assertEqual(entry.solved_count, 0)
        self.assertEqual(entry.total_points, 0)
        self.assertEqual(entry.total_submissions, 0)  # PRIVATE attempts not counted

    def test_points_sum_across_problems(self):
        p1, p2 = _mk_problem(points=10), _mk_problem(points=30)
        _sub(self.alice, p1, Submission.VerdictStatus.ACCEPTED)
        _sub(self.alice, p2, Submission.VerdictStatus.ACCEPTED)
        recompute_all_leaderboards()
        self.assertEqual(
            LeaderboardEntry.objects.get(user=self.alice).total_points, 40
        )

    def test_recompute_idempotent(self):
        p = _mk_problem()
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        recompute_all_leaderboards()
        recompute_all_leaderboards()
        self.assertEqual(LeaderboardEntry.objects.filter(user=self.alice).count(), 1)
        entry = LeaderboardEntry.objects.get(user=self.alice)
        self.assertEqual(entry.total_points, 10)

    def test_recompute_deletes_stale_entries(self):
        LeaderboardEntry.objects.create(user=self.bob, total_points=999)
        recompute_all_leaderboards()
        self.assertFalse(LeaderboardEntry.objects.filter(user=self.bob).exists())

    def test_update_user_entry_is_idempotent_and_scoped(self):
        p = _mk_problem()
        _sub(self.alice, p, Submission.VerdictStatus.ACCEPTED)
        _sub(self.bob, p, Submission.VerdictStatus.WRONG_ANSWER)
        update_user_entry(self.alice.pk)
        update_user_entry(self.alice.pk)
        self.assertEqual(
            LeaderboardEntry.objects.filter(user=self.alice).count(), 1
        )
        # bob was never recomputed -> no row yet; the full pass also omits
        # him (no solves), but the per-user recompute (what /me/ uses)
        # backfills totals for the success-rate column.
        self.assertFalse(LeaderboardEntry.objects.filter(user=self.bob).exists())
        recompute_all_leaderboards()
        self.assertFalse(LeaderboardEntry.objects.filter(user=self.bob).exists())
        bob = update_user_entry(self.bob.pk)
        self.assertEqual(bob.solved_count, 0)
        self.assertEqual(bob.total_submissions, 1)
        self.assertEqual(bob.ac_submissions, 0)


class LeaderboardEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")
        self.carol = User.objects.create_user(username="carol", password="p")

    def _seed(self):
        p10, p30 = _mk_problem(points=10), _mk_problem(points=30)
        # alice: 40 points (both solved) — rank 1
        _sub(self.alice, p10, Submission.VerdictStatus.ACCEPTED)
        _sub(self.alice, p30, Submission.VerdictStatus.ACCEPTED)
        # bob: 30 points, 1 solved — rank 2
        _sub(self.bob, p30, Submission.VerdictStatus.ACCEPTED)
        # carol: 10 points, 1 solved, one extra WA — rank 3
        _sub(self.carol, p10, Submission.VerdictStatus.ACCEPTED)
        _sub(self.carol, p30, Submission.VerdictStatus.WRONG_ANSWER)
        recompute_all_leaderboards()

    def test_list_ranks_match_ordering(self):
        self._seed()
        resp = self.client.get("/api/v1/leaderboard/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        rows = body["results"]
        self.assertEqual([r["username"] for r in rows], ["alice", "bob", "carol"])
        self.assertEqual([r["rank"] for r in rows], [1, 2, 3])
        self.assertEqual(rows[0]["total_points"], 40)
        self.assertEqual(rows[0]["solved_count"], 2)

    def test_list_is_public_and_paginated_shape(self):
        self._seed()
        resp = self.client.get("/api/v1/leaderboard/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertIn("count", body)
        self.assertEqual(body["count"], 3)

    def test_success_rate_column(self):
        self._seed()
        body = self.client.get("/api/v1/leaderboard/").json()
        by_name = {r["username"]: r for r in body["results"]}
        self.assertEqual(by_name["alice"]["success_rate"], 1.0)
        self.assertEqual(by_name["carol"]["success_rate"], 0.5)
        self.assertEqual(by_name["bob"]["success_rate"], 1.0)

    def test_me_rank_and_tie_break(self):
        self._seed()
        # bob and carol both have 1 solved; bob has more points -> better rank.
        self.client.force_authenticate(self.bob)
        me = self.client.get("/api/v1/leaderboard/me/").json()
        self.assertEqual(me["rank"], 2)
        self.assertEqual(me["solved_count"], 1)
        self.assertEqual(me["total_points"], 30)
        self.assertEqual(me["success_rate"], 1.0)
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.get("/api/v1/leaderboard/me/").json()["rank"], 1)

    def test_me_requires_auth(self):
        resp = self.client.get("/api/v1/leaderboard/me/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_creates_entry_for_user_without_submissions(self):
        self.client.force_authenticate(self.bob)
        me = self.client.get("/api/v1/leaderboard/me/").json()
        self.assertEqual(me["rank"], 1)
        self.assertEqual(me["solved_count"], 0)
        self.assertEqual(me["total_points"], 0)
        self.assertEqual(me["success_rate"], 0.0)


class CatalogStatsTest(TestCase):
    """D-B8 catalog add-on: problems list exposes tried/solved counts."""

    def test_problem_list_carries_submission_and_solved_counts(self):
        client = APIClient()
        author = User.objects.create_user(username="auth", password="p")
        p = _mk_problem()
        _sub(author, p, Submission.VerdictStatus.ACCEPTED)
        _sub(author, p, Submission.VerdictStatus.WRONG_ANSWER)
        resp = client.get("/api/v1/problems/problems/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        row = resp.json()["results"][0]
        self.assertEqual(row["submission_count"], 2)
        self.assertEqual(row["solved_count"], 1)  # one AC submission row


class JudgeTaskHookTest(TestCase):
    """Terminal AC in judge_submission_task schedules the incremental
    recompute on commit; non-AC terminal verdicts do not."""

    def setUp(self):
        from users.models import User

        self.user = User.objects.create_user(username="hooku", password="p")
        self.problem = _mk_problem()
        self.sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="print(1)",
        )

    def _judge(self, run_result):
        from submissions.tasks import judge_submission_task

        with (
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "", str("/tmp/x")),
            ),
            mock.patch(
                "submissions.tasks.run_code_in_sandbox",
                return_value=run_result,
            ),
        ):
            return judge_submission_task.run(self.sub.id)

    def test_ac_dispatches_update_on_commit(self):
        # output must match the seeded test case's expected_output ("o")
        # or the judge's comparison downgrades the verdict to WA.
        ok_run = (
            Submission.VerdictStatus.ACCEPTED,
            10,
            1024,
            "o",
            "",
        )
        with mock.patch("submissions.tasks.update_user_entry_task") as task:
            with self.captureOnCommitCallbacks(execute=True):
                self._judge(ok_run)
        task.delay.assert_called_once_with(self.user.pk)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.verdict, Submission.VerdictStatus.ACCEPTED)

    def test_wa_does_not_dispatch_update(self):
        wa_run = (
            Submission.VerdictStatus.WRONG_ANSWER,
            10,
            1024,
            "nope",
            "",
        )
        with mock.patch("submissions.tasks.update_user_entry_task") as task:
            with self.captureOnCommitCallbacks(execute=True):
                self._judge(wa_run)
        task.delay.assert_not_called()


class CoverageClosureTest(TestCase):
    """Task wrappers, model __str__ and the zero-submission success rate
    (single-branch 100% coverage gate, 2026-10-27)."""

    def test_task_wrappers_execute_synchronously(self):
        from leaderboard.aggregation import (
            recompute_all_leaderboards_task,
            update_user_entry_task,
        )

        user = User.objects.create_user(username="cc-task", password="p")
        result = update_user_entry_task.run(user.id)  # type: ignore[attr-defined]
        self.assertIsInstance(result, (int, LeaderboardEntry))
        total = recompute_all_leaderboards_task.run()  # type: ignore[attr-defined]
        self.assertIsInstance(total, int)

    def test_leaderboard_entry_str(self):
        user = User.objects.create_user(username="cc-str", password="p")
        entry = LeaderboardEntry(user=user, total_points=42, solved_count=3)
        self.assertEqual(
            str(entry), f"LeaderboardEntry(user={user.id}, points=42)"
        )

    def test_success_rate_zero_without_submissions(self):
        from leaderboard.serializers import LeaderboardEntrySerializer

        user = User.objects.create_user(username="cc-rate", password="p")
        entry = LeaderboardEntry(user=user, total_submissions=0, ac_submissions=0)
        self.assertEqual(LeaderboardEntrySerializer().get_success_rate(entry), 0.0)
