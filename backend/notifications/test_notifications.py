"""Notifications tests (SPEC-GAPS D-B10): service semantics, endpoint
scoping, mark-read idempotency, unread counts, judge/approve/reject
emission points, retention task."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from notifications.models import Notification
from notifications.services import notify
from notifications.tasks import purge_old_notifications
from problems.models import Problem
from submissions.models import Submission
from users.models import User


def _mk_problem(status_=Problem.ProblemStatus.PENDING_APPROVAL, author=None):
    return Problem.objects.create(
        title_i18n={"en": "P"},
        statement_i18n={"en": "S"},
        status=status_,
        author=author,
    )


class NotifyServiceTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")

    def test_creates_notification(self):
        n = notify(
            self.alice,
            Notification.Verb.THREAD_REPLY,
            actor=self.bob,
            target=None,
            data={"post_id": 5},
        )
        self.assertIsNotNone(n)
        self.assertEqual(n.recipient, self.alice)
        self.assertEqual(n.actor, self.bob)
        self.assertEqual(n.data, {"post_id": 5})
        self.assertIsNone(n.read_at)

    def test_actor_equals_recipient_short_circuits(self):
        self.assertIsNone(
            notify(self.alice, Notification.Verb.SYSTEM, actor=self.alice)
        )
        self.assertEqual(Notification.objects.count(), 0)

    def test_default_data_is_dict(self):
        n = notify(self.bob, Notification.Verb.SYSTEM)
        self.assertEqual(n.data, {})


class NotificationEndpointTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")

    def _notify_alice(self, verb=Notification.Verb.SYSTEM, read=False):
        return Notification.objects.create(
            recipient=self.alice,
            verb=verb,
            data={"x": 1},
            read_at=timezone.now() if read else None,
        )

    def test_list_strictly_scoped(self):
        self._notify_alice()
        Notification.objects.create(recipient=self.bob, verb=Notification.Verb.SYSTEM)
        self.client.force_authenticate(self.alice)
        body = self.client.get("/api/v1/notifications/").json()
        rows = body["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["data"], {"x": 1})

    def test_other_users_notification_404(self):
        a = self._notify_alice()
        self.client.force_authenticate(self.bob)
        resp = self.client.get(f"/api/v1/notifications/{a.id}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_unread_filter(self):
        self._notify_alice(read=True)
        self._notify_alice(read=False)
        self.client.force_authenticate(self.alice)
        body = self.client.get("/api/v1/notifications/?unread=true").json()
        self.assertEqual(len(body["results"]), 1)
        self.assertIsNone(body["results"][0]["read_at"])

    def test_list_requires_auth(self):
        resp = self.client.get("/api/v1/notifications/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_mark_read_idempotent(self):
        n = self._notify_alice()
        self.client.force_authenticate(self.alice)
        first = self.client.post(f"/api/v1/notifications/{n.id}/mark-read/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(first.json()["read_at"])
        read_at = first.json()["read_at"]
        second = self.client.post(f"/api/v1/notifications/{n.id}/mark-read/")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(second.json()["read_at"], read_at)  # unchanged

    def test_mark_all_read_bulk(self):
        self._notify_alice()
        self._notify_alice()
        self.client.force_authenticate(self.alice)
        resp = self.client.post("/api/v1/notifications/mark-all-read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["marked"], 2)
        self.assertEqual(
            Notification.objects.filter(recipient=self.alice, read_at=None).count(), 0
        )

    def test_unread_count(self):
        self._notify_alice()
        self._notify_alice(read=True)
        self._notify_alice()
        Notification.objects.create(recipient=self.bob, verb=Notification.Verb.SYSTEM)
        self.client.force_authenticate(self.alice)
        resp = self.client.get("/api/v1/notifications/unread-count/")
        self.assertEqual(resp.json(), {"count": 2})

    def test_serializer_shape(self):
        self._notify_alice(verb=Notification.Verb.THREAD_REPLY)
        self.client.force_authenticate(self.alice)
        row = self.client.get("/api/v1/notifications/").json()["results"][0]
        for key in ("id", "verb", "actor", "target_type", "target_id", "data",
                    "read_at", "created_at"):
            self.assertIn(key, row)


class JudgeEmissionTest(TestCase):
    """Terminal verdict -> exactly one SUBMISSION_JUDGED; intermediates
    never emit. Judge internals mocked like submissions/test_tasks.py."""

    def setUp(self):
        self.user = User.objects.create_user(username="ju", password="p")
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
        )
        from problems.models import TestCase as ProblemTestCase

        ProblemTestCase.objects.create(
            problem=problem,
            input_data="i",
            expected_output_data="o",
            points=10,
            order=1,
        )
        self.sub = Submission.objects.create(
            user=self.user, problem=problem, language="python3", code="x"
        )

    def _judge(self, run_result=None, compile_ok=True):
        from submissions.tasks import judge_submission_task

        # The AC path also dispatches the leaderboard recompute task; its
        # .delay would hit the filesystem broker (kombu -> pywintypes on
        # Windows) and is covered by leaderboard/test_leaderboard.py.
        with mock.patch("submissions.tasks.update_user_entry_task"):
            with mock.patch(
                "submissions.tasks.compile_code_in_sandbox",
                return_value=(compile_ok, "", "/tmp/x" if compile_ok else None),
            ):
                with mock.patch(
                    "submissions.tasks.run_code_in_sandbox",
                    return_value=run_result,
                ):
                    with self.captureOnCommitCallbacks(execute=True):
                        judge_submission_task.run(self.sub.id)

    def test_terminal_ac_produces_exactly_one_notification(self):
        self._judge(
            run_result=(Submission.VerdictStatus.ACCEPTED, 10, 512, "o", "")
        )
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.verdict, Submission.VerdictStatus.ACCEPTED)
        notes = Notification.objects.filter(recipient=self.user)
        self.assertEqual(notes.count(), 1)
        self.assertEqual(notes.get().verb, Notification.Verb.SUBMISSION_JUDGED)
        self.assertEqual(notes.get().data["verdict"], "AC")
        self.assertEqual(notes.get().data["submission_id"], self.sub.id)

    def test_compile_error_produces_one_notification(self):
        self._judge(compile_ok=False)
        notes = Notification.objects.filter(recipient=self.user)
        self.assertEqual(notes.count(), 1)
        self.assertEqual(notes.get().data["verdict"], "CE")

    def test_intermediate_states_not_notified_directly(self):
        # A task crash mid-run (exception) -> INTERNAL_ERROR notification,
        # not a COMPILING/RUNNING one: only terminal saves emit.
        with mock.patch(
            "submissions.tasks.compile_code_in_sandbox",
            side_effect=RuntimeError("boom"),
        ):
            with self.captureOnCommitCallbacks(execute=True):
                from submissions.tasks import judge_submission_task

                judge_submission_task.run(self.sub.id)
        self.sub.refresh_from_db()
        self.assertEqual(self.sub.verdict, Submission.VerdictStatus.INTERNAL_ERROR)
        notes = Notification.objects.filter(recipient=self.user)
        self.assertEqual(notes.count(), 1)
        self.assertEqual(notes.get().data["verdict"], "IE")


class ApproveRejectEmissionTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.verifier = User.objects.create_user(
            username="verifier", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.problem = _mk_problem(author=self.author)

    def _act(self, verifier):
        self.client.force_authenticate(verifier)

    def test_approve_notifies_author(self):
        self.client.force_authenticate(self.verifier)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                f"/api/v1/problems/problems/{self.problem.id}/approve/"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        n = Notification.objects.get(recipient=self.author)
        self.assertEqual(n.verb, Notification.Verb.PROBLEM_APPROVED)
        self.assertEqual(n.actor, self.verifier)
        self.assertEqual(n.target_id, self.problem.id)

    def test_reject_notifies_author_with_feedback(self):
        self.client.force_authenticate(self.verifier)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                f"/api/v1/problems/problems/{self.problem.id}/reject/",
                {"feedback": "unclear statement"},
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        n = Notification.objects.get(recipient=self.author)
        self.assertEqual(n.verb, Notification.Verb.PROBLEM_REJECTED)
        self.assertEqual(n.data["feedback"], "unclear statement")

    def test_self_approval_does_not_self_notify(self):
        # A verifier approving their own problem: actor == recipient -> skip.
        self.problem.author = self.verifier
        self.problem.save()
        self.client.force_authenticate(self.verifier)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                f"/api/v1/problems/problems/{self.problem.id}/approve/"
            )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(Notification.objects.count(), 0)


class PurgeTaskTest(TestCase):
    def test_purges_old_read_only(self):
        user = User.objects.create_user(username="pu", password="p")
        old_read = Notification.objects.create(
            recipient=user,
            verb=Notification.Verb.SYSTEM,
            read_at=timezone.now() - timedelta(days=91),
        )
        fresh_read = Notification.objects.create(
            recipient=user,
            verb=Notification.Verb.SYSTEM,
            read_at=timezone.now() - timedelta(days=10),
        )
        old_unread = Notification.objects.create(
            recipient=user,
            verb=Notification.Verb.SYSTEM,
            read_at=None,
            created_at=timezone.now() - timedelta(days=120),
        )
        deleted = purge_old_notifications()
        self.assertGreaterEqual(deleted, 1)
        self.assertFalse(Notification.objects.filter(pk=old_read.pk).exists())
        self.assertTrue(Notification.objects.filter(pk=fresh_read.pk).exists())
        self.assertTrue(Notification.objects.filter(pk=old_unread.pk).exists())
