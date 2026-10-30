"""UXP-5b (competitive roadmap): the weekly practice digest — transport
guard (no SMTP -> no-op) and the send itself under the locmem backend."""

from datetime import timedelta

from django.core import mail
from django.test import TestCase, override_settings
from django.utils import timezone

from notifications.tasks import weekly_digest_task
from problems.models import Problem
from submissions.models import Submission
from users.models import User


def _problem(title, hints_ro=None):
    return Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "S"},
        status=Problem.ProblemStatus.APPROVED,
        hints_ro=hints_ro or [],
    )


class WeeklyDigestGuardTest(TestCase):
    def test_noop_without_smtp_transport(self):
        # The dev default: console backend, no EMAIL_HOST.
        sent = weekly_digest_task()
        self.assertEqual(sent, 0)


@override_settings(
    EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend",
    EMAIL_HOST="smtp.example.com",
)
class WeeklyDigestSendTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="u", password="p", email="u@example.com"
        )
        self.solved = _problem("solved-one")
        self.unsolved = _problem("unsolved-one", hints_ro=["sumează cifrele"])
        Submission.objects.create(
            user=self.user,
            problem=self.solved,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=10,
        )
        Submission.objects.create(
            user=self.user,
            problem=self.unsolved,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=0,
        )

    def test_sends_open_problems_with_first_hint(self):
        sent = weekly_digest_task()
        self.assertEqual(sent, 1)
        self.assertEqual(len(mail.outbox), 1)
        body = mail.outbox[0].body
        self.assertIn("unsolved-one", body)
        self.assertIn("sumează cifrele", body)
        # "- solved-one" (the line form) must be absent; the bare
        # substring is contained inside "unsolved-one".
        self.assertNotIn("- solved-one", body)

    def test_inactive_user_gets_nothing(self):
        # Push the submissions outside the 7-day window.
        Submission.objects.update(
            submission_time=timezone.now() - timedelta(days=10)
        )
        sent = weekly_digest_task()
        self.assertEqual(sent, 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_user_without_email_is_skipped(self):
        User.objects.filter(pk=self.user.pk).update(email="")
        sent = weekly_digest_task()
        self.assertEqual(sent, 0)

    def test_all_solved_user_gets_nothing(self):
        Submission.objects.filter(problem=self.unsolved).update(
            verdict=Submission.VerdictStatus.ACCEPTED
        )
        sent = weekly_digest_task()
        self.assertEqual(sent, 0)


    def test_problem_without_hints_yields_plain_line(self):
        # Drop the hint: the line carries the bare problem title.
        Problem.objects.filter(pk=self.unsolved.pk).update(hints_ro=[])
        sent = weekly_digest_task()
        self.assertEqual(sent, 1)
        self.assertNotIn("indiciu", mail.outbox[0].body)

    def test_attempted_problem_unavailable_skips_user(self):
        # The only unsolved problem leaves the readable catalog (deleted
        # rows would cascade the submission away; un-approve instead):
        # no lines, no email — the "if not lines: continue" guard.
        Problem.objects.filter(pk=self.unsolved.pk).update(
            status=Problem.ProblemStatus.DRAFT
        )
        sent = weekly_digest_task()
        self.assertEqual(sent, 0)
        self.assertEqual(len(mail.outbox), 0)
