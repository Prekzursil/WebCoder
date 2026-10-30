"""OPR-4: the contest_replay management command (the replay-gate tool)."""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from contests.models import Contest, ContestProblem
from problems.models import Problem, TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User

REPLAY = "submissions.management.commands.contest_replay"


class _Base(TransactionTestCase):
    """TransactionTestCase: the command writes from worker-thread
    connections, which a wrapped TestCase transaction would lock out on
    sqlite."""
    def setUp(self):
        self.organizer = User.objects.create_user(
            username="organizer", password="p", role=User.Roles.ADMIN
        )
        now = timezone.now()
        self.contest = Contest.objects.create(
            created_by=self.organizer,
            title_i18n={"en": "C"},
            description_i18n={"en": "D"},
            start_at=now - timedelta(hours=1),
            end_at=now + timedelta(hours=1),
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "A+B"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.organizer,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1 2",
            expected_output_data="3",
            points=10,
            order=1,
        )
        ContestProblem.objects.create(
            contest=self.contest, problem=self.problem, order=1
        )

    def run_cmd(self, **overrides):
        out, err = StringIO(), StringIO()
        args = {
            "contest": self.contest.id,
            "users": 2,
            "per_user": 1,
            "poll_interval": 0.01,
            "concurrency": 1,
            "timeout": 5.0,
            **overrides,
        }
        call_command("contest_replay", stdout=out, stderr=err, **args)
        return out.getvalue(), err.getvalue()


class ReplayGatePassTest(_Base):
    def test_pass_run_reports_gate(self):
        from submissions.tasks import judge_submission_task

        class EagerTask:
            @staticmethod
            def delay(submission_id):
                return judge_submission_task.run(submission_id)

        with (
            mock.patch(f"{REPLAY}.judge_submission_task", EagerTask),
            # The filesystem broker's .delay pulls kombu -> pywintypes on
            # Windows (documented in notifications/test_notifications.py);
            # the leaderboard/contest-score dispatches are covered by their
            # own suites.
            mock.patch("submissions.tasks.update_user_entry_task"),
            mock.patch("submissions.tasks.record_verdict_task"),
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "3", ""),
            ),
        ):
            out, err = self.run_cmd()
        self.assertIn("GATE: PASS", out)
        self.assertIn("rehearsal scale", out)
        # Probe users + participations exist for later cleanup.
        self.assertTrue(
            User.objects.filter(username__startswith="replay_").exists()
        )
        self.assertEqual(
            Submission.objects.filter(contest=self.contest).count(), 2
        )


class ReplayGateFailTest(_Base):
    def test_missing_contest_raises_command_error(self):
        with self.assertRaises(Exception) as ctx:
            self.run_cmd(contest=99999)
        self.assertIn("does not exist", str(ctx.exception))

    def test_no_problems_raises_command_error(self):
        ContestProblem.objects.all().delete()
        with self.assertRaises(Exception) as ctx:
            self.run_cmd()
        self.assertIn("no problems", str(ctx.exception))

    def test_wrong_verdicts_fail_the_gate(self):
        from submissions.tasks import judge_submission_task

        class EagerTask:
            @staticmethod
            def delay(submission_id):
                return judge_submission_task.run(submission_id)

        with (
            mock.patch(f"{REPLAY}.judge_submission_task", EagerTask),
            # The filesystem broker's .delay pulls kombu -> pywintypes on
            # Windows (documented in notifications/test_notifications.py);
            # the leaderboard/contest-score dispatches are covered by their
            # own suites.
            mock.patch("submissions.tasks.update_user_entry_task"),
            mock.patch("submissions.tasks.record_verdict_task"),
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.WRONG_ANSWER, 5, 512, "9", ""),
            ),
        ):
            with self.assertRaises(SystemExit):
                self.run_cmd()

    def test_verdict_timeout_fails_with_no_completed_submissions(self):
        class StuckTask:
            @staticmethod
            def delay(submission_id):  # never judges
                return None

        with mock.patch(f"{REPLAY}.judge_submission_task", StuckTask):
            with self.assertRaises(SystemExit):
                self.run_cmd()


class ReplayGateFullScaleTest(_Base):
    def test_full_scale_run_omits_the_rehearsal_note(self):
        from submissions.tasks import judge_submission_task

        class EagerTask:
            @staticmethod
            def delay(submission_id):
                return judge_submission_task.run(submission_id)

        with (
            mock.patch(f"{REPLAY}.judge_submission_task", EagerTask),
            mock.patch("submissions.tasks.update_user_entry_task"),
            mock.patch("submissions.tasks.record_verdict_task"),
            mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/exe"),
            ),
            mock.patch(
                "submissions.tasks.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 512, "3", ""),
            ),
        ):
            out, err = self.run_cmd(users=50, per_user=1)
        self.assertIn("GATE: PASS", out)
        self.assertNotIn("rehearsal scale", out)
        # p95 over >=20 waits reads the true percentile line, not max.
        self.assertIn("judge wait p50", out)
