"""Hidden-scoreboard tests (DMOJ hidden boards · campion teme-concurs).

Non-organizers see an explicitly empty envelope with ``hidden: true``
while the contest runs; organizers always see the live board; the reveal
is automatic at end_at (the virtual replay board stays post-contest
history and never hides).
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.models import (
    Contest,
    ContestProblem,
    ContestParticipation,
)
from problems.models import Problem, TestCase as ProblemTestCase
from users.models import User


class HiddenScoreboardBase(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(
            username="organizer", password="pw", role=User.Roles.TEACHER
        )
        self.student = User.objects.create_user(username="stud", password="pw")
        self.now = timezone.now()
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="2",
            points=100,
            order=1,
        )
        self.client = APIClient()

    def mk_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Hidden board", "ro": "Clasament ascuns"},
            created_by=self.organizer,
            start_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=50),
            format=Contest.Format.IOI,
            hide_scoreboard_until_end=True,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        ContestParticipation.objects.create(contest=contest, user=self.student)
        return contest


class HiddenScoreboardTests(HiddenScoreboardBase):
    def url(self, contest, section=""):
        suffix = f"?section={section}" if section else ""
        return f"/api/v1/contests/{contest.id}/standings/{suffix}"

    def test_participant_gets_hidden_envelope_while_running(self):
        contest = self.mk_contest()
        self.client.force_authenticate(self.student)
        response = self.client.get(self.url(contest))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["hidden"])
        self.assertEqual(response.data["results"], [])
        self.assertEqual(response.data["count"], 0)
        self.assertFalse(response.data["frozen"])
        self.assertEqual(response.data["section"], "official")

    def test_anonymous_viewer_also_gets_the_hidden_envelope(self):
        contest = self.mk_contest()
        response = self.client.get(self.url(contest))
        self.assertTrue(response.data["hidden"])

    def test_organizer_always_sees_the_live_board(self):
        contest = self.mk_contest()
        self.client.force_authenticate(self.organizer)
        response = self.client.get(self.url(contest))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("hidden", response.data)
        self.assertIsInstance(response.data["results"], list)

    def test_board_reveals_once_the_contest_ends(self):
        contest = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(minutes=10),
        )
        self.client.force_authenticate(self.student)
        response = self.client.get(self.url(contest))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("hidden", response.data)
        self.assertIsInstance(response.data["results"], list)

    def test_virtual_board_is_never_hidden(self):
        contest = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(minutes=10),
        )
        ContestParticipation.objects.create(
            contest=contest, user=self.organizer, is_virtual=True
        )
        response = self.client.get(self.url(contest, section="virtual"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("hidden", response.data)

    def test_flag_round_trips_through_the_serializer(self):
        self.client.force_authenticate(self.organizer)
        created = self.client.post(
            "/api/v1/contests/",
            {
                "title_i18n": {"en": "Exam contest", "ro": "Concurs examen"},
                "start_at": (self.now + timedelta(hours=1)).isoformat(),
                "end_at": (self.now + timedelta(hours=3)).isoformat(),
                "visibility": "PRIVATE",
                "access_code": "exam-2026",
                "is_rated": False,
                "hide_scoreboard_until_end": True,
                "problem_ids": [self.problem.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertTrue(created.data["hide_scoreboard_until_end"])

    def test_plain_contests_keep_the_open_board(self):
        contest = self.mk_contest(hide_scoreboard_until_end=False)
        self.client.force_authenticate(self.student)
        response = self.client.get(self.url(contest))
        self.assertNotIn("hidden", response.data)
