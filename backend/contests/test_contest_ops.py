"""Contest ops tests (Wave B: CON-4/CON-8/CON-10 + round-2 OPR-4 + JDG-12).

Pretest subset judging, end-of-contest staggered rejudge, rejudge endpoint,
clarifications + broadcast notifications + moderation hide, ICS feed, beat
tick idempotency, queue-depth lane metrics.
"""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.models import (
    CLARIFICATION_CANNED_ANSWERS,
    Clarification,
    Contest,
    ContestParticipation,
    ContestProblem,
)
from contests.tasks import (
    REJUDGE_BATCH_SIZE,
    contest_tick,
    finalize_contest,
    rejudge_submissions_batch,
)
from notifications.models import Notification
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from submissions.tasks import judge_submission_task
from users.models import User


@override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=0)
class ContestOpsBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.now = timezone.now()
        self.problem = self.mk_problem("Sum")
        self.client = APIClient()

    def mk_problem(self, title):
        p = Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=p,
            input_data="1",
            expected_output_data="2",
            points=50,
            order=0,
            is_sample=True,
            is_pretest=True,
        )
        ProblemTestCase.objects.create(
            problem=p,
            input_data="3",
            expected_output_data="4",
            points=50,
            order=1,
        )
        return p

    def mk_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Ops"},
            created_by=self.organizer,
            start_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=50),
            format=Contest.Format.IOI,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def mk_submission(self, contest, user, at=None, verdict="AC", score=100):
        sub = Submission.objects.create(
            user=user,
            problem=self.problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict=verdict,
            score=score,
        )
        if at is not None:
            Submission.objects.filter(pk=sub.pk).update(submission_time=at)
            sub.refresh_from_db()
        return sub

    def judge_mocks(self):
        compile_mock = mock.patch("submissions.tasks.compile_code_in_sandbox")
        run_mock = mock.patch("submissions.tasks.run_code_in_sandbox")
        cmp_mock = mock.patch("submissions.tasks.compare_outputs_detailed")
        lb_mock = mock.patch("submissions.tasks.update_user_entry_task")
        score_mock = mock.patch("submissions.tasks.record_verdict_task")
        notify_mock = mock.patch("submissions.tasks._notify_judged")
        return compile_mock, run_mock, cmp_mock, lb_mock, score_mock, notify_mock


class PretestJudgingTests(ContestOpsBase):
    def run_judge(self, submission):
        with (
            mock.patch("submissions.tasks.compile_code_in_sandbox") as compile_mock,
            mock.patch("submissions.tasks.run_code_in_sandbox") as run_mock,
            mock.patch("submissions.tasks.compare_outputs_detailed") as cmp_mock,
            mock.patch("submissions.tasks.update_user_entry_task"),
            mock.patch("submissions.tasks.record_verdict_task"),
            mock.patch("submissions.tasks._notify_judged"),
        ):
            compile_mock.return_value = (True, "", "/tmp/x")
            run_mock.return_value = ("AC", 5, 512, "ok", "")
            cmp_mock.return_value = (True, "")
            with self.captureOnCommitCallbacks(execute=True):
                judge_submission_task(submission.id)
        submission.refresh_from_db()
        return run_mock

    def test_contest_pretest_submission_runs_subset_only(self):
        contest = self.mk_contest(pretest_mode=True)
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        submission = self.mk_submission(
            contest, self.alice, score=None, verdict="PENDING"
        )
        run_mock = self.run_judge(submission)
        # Only the one pretest-flagged test ran.
        self.assertEqual(run_mock.call_count, 1)
        self.assertIn("Pretest run", submission.detailed_feedback)

    def test_pretest_contest_without_flags_runs_full_suite(self):
        contest = self.mk_contest(pretest_mode=True)
        # Strip the pretest flags: author opted into pretest_mode but flagged
        # no tests — the engine falls back to the full suite.
        ProblemTestCase.objects.update(is_pretest=False)
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        submission = self.mk_submission(contest, self.alice, verdict="PENDING")
        run_mock = self.run_judge(submission)
        self.assertEqual(run_mock.call_count, 2)
        self.assertNotIn("Pretest run", submission.detailed_feedback)

    def test_non_pretest_contest_runs_full_suite(self):
        contest = self.mk_contest(pretest_mode=False)
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        submission = self.mk_submission(contest, self.alice, verdict="PENDING")
        run_mock = self.run_judge(submission)
        self.assertEqual(run_mock.call_count, 2)

    def test_submission_after_end_runs_full_suite_even_in_pretest_contest(self):
        contest = self.mk_contest(
            pretest_mode=True,
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(minutes=1),
        )
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        submission = self.mk_submission(contest, self.alice, verdict="PENDING")
        run_mock = self.run_judge(submission)
        self.assertEqual(run_mock.call_count, 2)


class FinalizeTests(ContestOpsBase):
    def test_finalize_missing_and_early(self):
        self.assertEqual(finalize_contest(424242), "contest 424242 not found")
        contest = self.mk_contest()  # still running
        self.assertIn("not finished yet", finalize_contest(contest.id))

    def test_finalize_without_pretests_marks_only(self):
        contest = self.mk_contest(
            start_at=self.now - timedelta(hours=2),
            end_at=self.now - timedelta(minutes=1),
        )
        self.mk_submission(contest, self.alice)
        with mock.patch("contests.tasks.rejudge_submissions_batch") as batch_mock:
            result = finalize_contest(contest.id)
        batch_mock.apply_async.assert_not_called()
        self.assertIn("no pretests to re-judge", result)
        contest.refresh_from_db()
        self.assertIsNotNone(contest.finalized_at)
        # Idempotent.
        self.assertIn("already finalized", finalize_contest(contest.id))

    def test_finalize_pretest_contest_staggers_rejudge(self):
        contest = self.mk_contest(
            pretest_mode=True,
            start_at=self.now - timedelta(hours=2),
            end_at=self.now - timedelta(minutes=1),
        )
        for i in range(REJUDGE_BATCH_SIZE + 2):
            self.mk_submission(contest, self.alice)
        with mock.patch("contests.tasks.rejudge_submissions_batch") as batch_mock:
            result = finalize_contest(contest.id)
        self.assertIn("re-judging", result)
        self.assertEqual(batch_mock.apply_async.call_count, 2)
        first = batch_mock.apply_async.call_args_list[0]
        self.assertEqual(first.kwargs.get("countdown", 0), 0)
        second = batch_mock.apply_async.call_args_list[1]
        self.assertGreater(second.kwargs.get("countdown", 0), 0)
        # The race branch: finalize again with finalized_at unset but already
        # set by a concurrent worker is covered via the idempotent return.
        self.assertIn("already finalized", finalize_contest(contest.id))

    def test_contest_tick_finalizes_due_contests(self):
        due = self.mk_contest(
            start_at=self.now - timedelta(hours=2),
            end_at=self.now - timedelta(minutes=1),
        )
        future = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        result = contest_tick()
        due.refresh_from_db()
        future.refresh_from_db()
        self.assertIsNotNone(due.finalized_at)
        self.assertIsNone(future.finalized_at)
        self.assertIn(str(due.id), result)
        # Nothing due → quiet tick.
        self.assertEqual(contest_tick(), "no contests due")

    def test_rejudge_batch_resets_and_dispatches(self):
        contest = self.mk_contest()
        subs = [self.mk_submission(contest, self.alice) for _ in range(3)]
        for sub in subs:
            sub.verdict = "AC"
            sub.save()
        with mock.patch("submissions.tasks.judge_submission_task") as judge_mock:
            result = rejudge_submissions_batch([s.id for s in subs] + [424242])
        self.assertIn("3 submissions", result)
        self.assertEqual(judge_mock.apply_async.call_count, 3)
        for sub in subs:
            sub.refresh_from_db()
            self.assertEqual(sub.verdict, "PENDING")
            self.assertIsNone(sub.score)
            self.assertEqual(sub.test_results.count(), 0)
            self.assertEqual(
                judge_mock.apply_async.call_args_list[0].kwargs.get("queue"),
                "judge-contest",
            )


class RejudgeEndpointTests(ContestOpsBase):
    def test_admin_rejudge(self):
        contest = self.mk_contest()
        submission = self.mk_submission(contest, self.alice)
        self.client.force_authenticate(user=self.admin)
        with mock.patch("submissions.views.judge_task") as judge_mock:
            response = self.client.post(
                f"/api/v1/submissions/submissions/{submission.id}/rejudge/"
            )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(
            judge_mock.apply_async.call_args.kwargs.get("queue"), "judge-contest"
        )
        submission.refresh_from_db()
        self.assertEqual(submission.verdict, "PENDING")

    def test_rejudge_in_flight_conflict_and_permissions(self):
        contest = self.mk_contest()
        running = self.mk_submission(contest, self.alice, verdict="RUNNING")
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            f"/api/v1/submissions/submissions/{running.id}/rejudge/"
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        finished = self.mk_submission(contest, self.alice, verdict="AC")
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            f"/api/v1/submissions/submissions/{finished.id}/rejudge/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_practice_rejudge_uses_default_lane(self):
        submission = Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict="AC",
        )
        self.client.force_authenticate(user=self.admin)
        with mock.patch("submissions.views.judge_task") as judge_mock:
            response = self.client.post(
                f"/api/v1/submissions/submissions/{submission.id}/rejudge/"
            )
        self.assertEqual(response.status_code, 200)
        judge_mock.delay.assert_called_once()


class ClarificationTests(ContestOpsBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest()
        ContestParticipation.objects.create(contest=self.contest, user=self.alice)
        ContestParticipation.objects.create(contest=self.contest, user=self.bob)

    def test_participant_asks_and_sees_own_plus_broadcasts(self):
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/clarifications/",
            {"question": "Is the array sorted?"},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        clarification_id = response.data["id"]
        # Bob sees only broadcasts (none yet).
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"]), 0)
        # Organizer answers + broadcasts.
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(
            f"/api/v1/contests/clarifications/{clarification_id}/answer/",
            {"canned": "No comment", "broadcast": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["answer"], "No comment")
        self.assertTrue(response.data["is_broadcast"])
        # Both participants were notified.
        self.assertEqual(
            Notification.objects.filter(
                verb="SYSTEM", data__clarification_id=clarification_id
            ).count(),
            2,
        )
        # Bob now sees the broadcast.
        self.client.force_authenticate(user=self.bob)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/"
        )
        self.assertEqual(len(response.data["results"]), 1)

    def test_organizer_cannot_ask_and_stranger_cannot(self):
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/clarifications/",
            {"question": "why"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        stranger = User.objects.create_user(username="stranger", password="pw")
        self.client.force_authenticate(user=stranger)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/clarifications/",
            {"question": "why"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        # Bogus contest id.
        response = self.client.post(
            "/api/v1/contests/424242/clarifications/", {"question": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.get("/api/v1/contests/424242/clarifications/")
        self.assertEqual(response.status_code, 404)

    def test_not_running_rejects_new_questions(self):
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(minutes=1),
        )
        ContestParticipation.objects.create(contest=finished, user=self.alice)
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            f"/api/v1/contests/{finished.id}/clarifications/",
            {"question": "late?"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_answer_requires_text_or_canned(self):
        clarification = Clarification.objects.create(
            contest=self.contest, asker=self.alice, question="q?"
        )
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(
            f"/api/v1/contests/clarifications/{clarification.id}/answer/",
            {},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            f"/api/v1/contests/clarifications/{clarification.id}/answer/",
            {"answer": "Yes, sorted."},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["is_broadcast"])

    def test_answer_permissions_and_missing(self):
        clarification = Clarification.objects.create(
            contest=self.contest, asker=self.alice, question="q?"
        )
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(
            f"/api/v1/contests/clarifications/{clarification.id}/answer/",
            {"answer": "self help"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(
            "/api/v1/contests/clarifications/424242/answer/",
            {"answer": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_hide_moderation(self):
        clarification = Clarification.objects.create(
            contest=self.contest, asker=self.alice, question="rude question"
        )
        # Participant cannot hide.
        self.client.force_authenticate(user=self.alice)
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/clarifications/{clarification.id}/hide/",
                {},
                format="json",
            ).status_code,
            403,
        )
        # Organizer hides; participant lists exclude it.
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(
            f"/api/v1/contests/clarifications/{clarification.id}/hide/",
            {"reason": "abuse"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        clarification.refresh_from_db()
        self.assertTrue(clarification.is_hidden)
        self.assertEqual(clarification.hidden_reason, "abuse")
        self.client.force_authenticate(user=self.alice)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/"
        )
        self.assertEqual(len(response.data["results"]), 0)
        # Organizer default list hides it too, include_hidden shows it.
        self.client.force_authenticate(user=self.organizer)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/"
        )
        self.assertEqual(len(response.data["results"]), 0)
        self.assertIn("canned_answers", response.data)
        self.assertEqual(response.data["canned_answers"], CLARIFICATION_CANNED_ANSWERS)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/?include_hidden=1"
        )
        self.assertEqual(len(response.data["results"]), 1)
        # Hide on a bogus id.
        response = self.client.post(
            "/api/v1/contests/clarifications/424242/hide/", {}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_anonymous_clarifications_denied(self):
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/clarifications/"
        )
        self.assertEqual(response.status_code, 401)


class CalendarTests(ContestOpsBase):
    def test_ics_feed_lists_public_only(self):
        public = self.mk_contest(title_i18n={"en": "Alpha; Cup, 2026"})
        self.mk_contest(
            title_i18n={"en": "Secret"},
            visibility=Contest.Visibility.PRIVATE,
            access_code="x",
        )
        response = self.client.get("/api/v1/contests/calendar.ics")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/calendar; charset=utf-8")
        body = response.content.decode()
        self.assertIn("BEGIN:VCALENDAR", body)
        self.assertIn(f"UID:contest-{public.id}@webcoder", body)
        # Title escaping: ';' and ',' are backslash-escaped.
        self.assertIn("Alpha\\; Cup\\, 2026", body)
        self.assertNotIn("Secret", body)
        self.assertIn("DTSTART:", body)
        self.assertTrue(body.endswith("END:VCALENDAR"))

    def test_ics_feed_drops_old_contests(self):
        fresh = self.mk_contest()
        stale = self.mk_contest(
            title_i18n={"en": "Ancient"},
            start_at=self.now - timedelta(days=90),
            end_at=self.now - timedelta(days=90) + timedelta(hours=2),
        )
        response = self.client.get("/api/v1/contests/calendar.ics")
        body = response.content.decode()
        self.assertIn(f"contest-{fresh.id}", body)
        self.assertNotIn(f"contest-{stale.id}", body)


class LaneMetricsTests(ContestOpsBase):
    def test_queue_depth_lanes(self):
        contest = self.mk_contest()
        self.mk_submission(contest, self.alice, verdict="PENDING")
        Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict="PENDING",
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/admin/metrics/")
        self.assertEqual(response.status_code, 200)
        lanes = response.json()["submissions"]["queue_depth_lanes"]
        self.assertEqual(lanes["contest"], 1)
        self.assertEqual(lanes["practice"], 1)


class ModelEdgeTests(ContestOpsBase):
    def test_clarification_str(self):
        contest = self.mk_contest()
        clarification = Clarification.objects.create(
            contest=contest, asker=self.alice, question="q?"
        )
        self.assertIn("clarification", str(clarification))
