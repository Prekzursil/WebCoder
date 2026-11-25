"""Incremental test-unlock tests (problem-page wave, item C).

Covers at the 100% bar:
- ``problems.unlocks`` — state folding (monotone, zero-pass no-op),
  per-viewer unlock summaries, the per-test status board, the raw
  download gate;
- the judge-task hook (a judged submission advances the user's index;
  a worse later submission does not regress it);
- the ``GET /problems/{id}/tests/status/`` endpoint for every viewer
  class (anonymous / solver / privileged);
- the ``unlock_state`` field on the problem detail serializer.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import (
    Problem,
    ProblemUnlockState,
    TestCase as ProblemTestCase,
)
from problems import unlocks
from problems.unlocks import (
    may_view_test,
    unlock_state_for,
    update_unlock_state,
)
from users.models import User


def _problem(**kwargs):
    defaults = {
        "title_i18n": {"en": "P"},
        "statement_i18n": {"en": "S"},
        "difficulty": "MEDIUM",
        "target_points": 100,
        "status": Problem.ProblemStatus.APPROVED,
    }
    defaults.update(kwargs)
    problem = Problem.objects.create(**defaults)
    for i in range(1, 5):
        ProblemTestCase.objects.create(
            problem=problem,
            input_data=f"in{i}",
            expected_output_data=f"out{i}",
            points=25,
            order=i,
            is_sample=(i == 1),
        )
    return problem


class UnlockStateFoldingTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = _problem()

    def test_zero_pass_is_noop(self):
        self.assertFalse(update_unlock_state(self.user.id, self.problem.id, 0))
        self.assertEqual(ProblemUnlockState.objects.count(), 0)

    def test_first_advancement_creates_row(self):
        self.assertTrue(update_unlock_state(self.user.id, self.problem.id, 2))
        row = ProblemUnlockState.objects.get(user=self.user, problem=self.problem)
        self.assertEqual(row.passed_count, 2)

    def test_monotone_only_better_counts_write(self):
        update_unlock_state(self.user.id, self.problem.id, 3)
        self.assertFalse(update_unlock_state(self.user.id, self.problem.id, 2))
        row = ProblemUnlockState.objects.get(user=self.user, problem=self.problem)
        self.assertEqual(row.passed_count, 3)
        self.assertTrue(update_unlock_state(self.user.id, self.problem.id, 4))

    def test_str(self):
        update_unlock_state(self.user.id, self.problem.id, 2)
        row = ProblemUnlockState.objects.get(user=self.user, problem=self.problem)
        self.assertIn("unlocked 2 tests", str(row))

    def test_unlock_state_for_viewer_classes(self):
        update_unlock_state(self.user.id, self.problem.id, 2)
        state = unlock_state_for(self.user, self.problem)
        self.assertEqual(
            state,
            {
                "passed_count": 2,
                "unlocked_index": 3,
                "total": 4,
                "solved_all": False,
            },
        )
        anon = unlock_state_for(None, self.problem)
        self.assertEqual(anon["passed_count"], 0)
        self.assertEqual(anon["unlocked_index"], 1)

    def test_solved_all_clamps_index(self):
        update_unlock_state(self.user.id, self.problem.id, 4)
        state = unlock_state_for(self.user, self.problem)
        self.assertEqual(state["unlocked_index"], 4)
        self.assertTrue(state["solved_all"])

    def test_empty_problem_state(self):
        empty = Problem.objects.create(
            title_i18n={"en": "E"},
            statement_i18n={"en": "S"},
            difficulty="EASY",
            target_points=30,
            status=Problem.ProblemStatus.APPROVED,
        )
        state = unlock_state_for(self.user, empty)
        self.assertEqual(
            (state["unlocked_index"], state["total"], state["solved_all"]),
            (0, 0, False),
        )


class StatusBoardTest(TestCase):
    def setUp(self):
        self.solver = User.objects.create_user(username="s", password="p")
        self.author = User.objects.create_user(username="a", password="p")
        self.problem = _problem(author=self.author)
        update_unlock_state(self.solver.id, self.problem.id, 2)

    def test_solver_board_reveals_exactly_one_test(self):
        rows = unlocks.test_status_for(self.solver, self.problem)
        by_pos = {row["position"]: row for row in rows}
        # Solved prefix: passed but judge-only (data hidden beyond samples).
        self.assertEqual(by_pos[1]["status"], "solved")
        self.assertEqual(by_pos[1]["input_data"], "in1")  # sample => public
        self.assertEqual(by_pos[2]["status"], "solved")
        self.assertIsNone(by_pos[2]["input_data"])
        # The unlocked boundary test reveals input + expected.
        self.assertEqual(by_pos[3]["status"], "unlocked")
        self.assertEqual(by_pos[3]["input_data"], "in3")
        self.assertEqual(by_pos[3]["expected_output_data"], "out3")
        # Beyond the earned index: locked, no data.
        self.assertEqual(by_pos[4]["status"], "locked")
        self.assertIsNone(by_pos[4]["input_data"])

    def test_anonymous_board_only_sample(self):
        rows = unlocks.test_status_for(None, self.problem)
        by_pos = {row["position"]: row for row in rows}
        self.assertEqual(by_pos[1]["status"], "unlocked")
        self.assertEqual(by_pos[2]["status"], "locked")

    def test_author_sees_everything(self):
        rows = unlocks.test_status_for(self.author, self.problem)
        self.assertTrue(all(row["input_data"] is not None for row in rows))
        # Privileged viewers see every test's data (status marks the
        # unlocked-everything view).
        self.assertEqual(
            [row["status"] for row in rows],
            ["unlocked", "unlocked", "unlocked", "unlocked"],
        )

    def test_may_view_test_no_state_row(self):
        fresh = User.objects.create_user(username="f", password="p")
        tests = list(self.problem.test_cases.order_by("order", "id"))
        self.assertFalse(may_view_test(fresh, tests[2]))

    def test_may_view_test_gates(self):
        tests = list(self.problem.test_cases.order_by("order", "id"))
        self.assertTrue(may_view_test(None, tests[0]))  # sample
        self.assertFalse(may_view_test(None, tests[2]))
        self.assertFalse(may_view_test(self.solver, tests[1]))  # solved prefix: no data
        self.assertTrue(may_view_test(self.solver, tests[2]))  # the unlocked boundary
        self.assertFalse(may_view_test(self.solver, tests[3]))  # beyond
        self.assertTrue(may_view_test(self.author, tests[3]))


class StatusEndpointTest(TestCase):
    def setUp(self):
        self.solver = User.objects.create_user(username="s", password="p")
        self.client = APIClient()
        self.problem = _problem()

    def test_anonymous_shape(self):
        resp = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/tests/status/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        data = resp.json()
        self.assertEqual(data["unlock_state"]["passed_count"], 0)
        self.assertEqual(len(data["tests"]), 4)

    def test_solver_unlock_shows_next_test(self):
        update_unlock_state(self.solver.id, self.problem.id, 1)
        self.client.force_authenticate(self.solver)
        resp = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/tests/status/"
        )
        rows = resp.json()["tests"]
        self.assertEqual(rows[1]["status"], "unlocked")
        self.assertEqual(rows[1]["input_data"], "in2")
        self.assertEqual(rows[2]["status"], "locked")

    def test_detail_serializer_unlock_state(self):
        self.client.force_authenticate(self.solver)
        update_unlock_state(self.solver.id, self.problem.id, 3)
        resp = self.client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        self.assertEqual(resp.json()["unlock_state"]["unlocked_index"], 4)


class JudgeHookTest(TestCase):
    """The task-time hook folds judged results into the unlock state."""

    def test_judged_submission_advances_index(self):
        from unittest import mock

        from submissions.models import Submission
        from submissions.tasks import judge_task

        TASKS = "submissions.tasks"
        user = User.objects.create_user(username="j", password="p")
        problem = _problem()
        submission = Submission.objects.create(
            user=user, problem=problem, language="python3", code="pass"
        )
        calls = {"n": 0}

        def fake_run(*args, **kwargs):
            calls["n"] += 1
            # Program output matches only the first two tests (k=2).
            output = f"out{calls['n']}" if calls["n"] <= 2 else "wrong"
            return (Submission.VerdictStatus.ACCEPTED, 5, 100, output, "")

        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(f"{TASKS}.run_code_in_sandbox", side_effect=fake_run),
            mock.patch(
                f"{TASKS}.compare_outputs_detailed",
                side_effect=lambda out, exp, *a, **k: (
                    out.strip() == exp.strip(),
                    None,
                ),
            ),
        ):
            judge_task(submission.id)

        row = ProblemUnlockState.objects.get(user=user, problem=problem)
        self.assertEqual(row.passed_count, 2)

    def test_worse_submission_does_not_regress(self):
        user = User.objects.create_user(username="w", password="p")
        problem = _problem()
        update_unlock_state(user.id, problem.id, 3)
        update_unlock_state(user.id, problem.id, 1)
        row = ProblemUnlockState.objects.get(user=user, problem=problem)
        self.assertEqual(row.passed_count, 3)
