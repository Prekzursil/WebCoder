"""Wave E items 26/27/28/31/39 — full 5-12 curriculum tree, seeded study
tracks (admitere/OJI/first-solve ladder) and the track→assignment bridge."""

from django.core.management import call_command
from django.test import TestCase
from problems.models import (
    CurriculumNode,
    Problem,
    ProblemList,
    ProblemListItem,
)
from rest_framework.test import APIClient
from users.models import User

from .models import Assignment, ClassMembership, ClassRoom


def _seed():
    import io

    call_command("seed_problems", stdout=io.StringIO())


class SeededTracksTest(TestCase):
    """Items 27/28/31: the study tracks seed with the pack, idempotently."""

    def test_tracks_and_ladder_seed(self):
        _seed()
        slugs = set(ProblemList.objects.values_list("slug", flat=True))
        for expected in (
            "first-solve-ladder",
            "oji-ladder-gimnaziu",
            "oji-ladder-liceu",
            "admitere-basics",
            "admitere-algorithms",
            "admitere-math",
        ):
            self.assertIn(expected, slugs)
        ladder = ProblemList.objects.get(slug="first-solve-ladder")
        titles = [
            item.problem.title_i18n["en"]
            for item in ladder.items.select_related("problem").order_by("position")
        ]
        self.assertEqual(
            titles,
            [
                "Hello, Judge!",
                "Sum of Two Numbers",
                "Sum 1..N",
                "The Biggest Number",
                "Sort Three Values",
                "Binary Search Position",
            ],
        )
        # Every seeded track carries both locales + public flag.
        for track in ProblemList.objects.filter(
            slug__in=["oji-ladder-gimnaziu", "admitere-basics"]
        ):
            self.assertTrue(track.is_public)
            self.assertIn("ro", track.title_i18n)

    def test_seed_is_idempotent_for_tracks(self):
        _seed()
        _seed()
        self.assertEqual(
            ProblemListItem.objects.filter(list__slug="first-solve-ladder").count(),
            6,
        )

    def test_seed_tracks_skip_unknown_slugs_and_missing_problems(self):
        from unittest import mock

        from problems.management.commands.seed_problems import Command

        _seed()
        fake_tracks = [
            {
                "slug": "weird-track",
                "en": "Weird",
                "ro": "Ciudat",
                "desc_en": "d",
                "desc_ro": "d",
                # First slug is unknown to the pack (entry None); the
                # second exists in seed data but its problem row was
                # never created (title lookup misses).
                "problems": ["does-not-exist", "sum-a-b"],
            }
        ]
        command = Command()
        with mock.patch.object(
            Command, "_seed_curriculum", return_value={}
        ), mock.patch(
            "problems.seed_data.STUDY_TRACKS", fake_tracks
        ), mock.patch(
            "problems.models.Problem.objects.filter", return_value=Problem.objects.none()
        ):
            created = command._seed_tracks(dry_run=False)
        # The track row is created but zero items attach (both arms skip).
        self.assertEqual(created, 1)
        self.assertFalse(
            ProblemListItem.objects.filter(list__slug="weird-track").exists()
        )

    def test_grades_11_12_chapters_exist(self):
        _seed()
        chapters = set(
            CurriculumNode.objects.filter(
                kind=CurriculumNode.NodeKind.CHAPTER,
                parent__slug__in=["g11", "g12"],
            ).values_list("slug", flat=True)
        )
        self.assertEqual(
            chapters,
            {
                "g11-stacks-queues",
                "g11-graphs",
                "g11-dynamic-programming",
                "g12-advanced-algorithms",
                "g12-backtracking",
                "g12-exam-prep",
            },
        )


class AssignTrackTest(TestCase):
    """Item 39: teacher collections → class assignments in one call."""

    def setUp(self):
        _seed()
        self.teacher = User.objects.create_user(
            username="t", password="p", role=User.Roles.TEACHER
        )
        self.other_teacher = User.objects.create_user(
            username="t2", password="p", role=User.Roles.TEACHER
        )
        self.klass = ClassRoom.objects.create(
            name="IX-A", teacher=self.teacher, join_code="ABC123"
        )
        self.student = User.objects.create_user(username="s", password="p")
        ClassMembership.objects.create(classroom=self.klass, student=self.student)

    def _post(self, user, payload):
        client = APIClient()
        client.force_authenticate(user=user)
        return client.post(
            "/api/v1/classroom/assignments/from-track/", payload, format="json"
        )

    def test_teacher_turns_a_track_into_an_assignment(self):
        with self.captureOnCommitCallbacks(execute=True) as callbacks:
            response = self._post(
                self.teacher,
                {"classroom": self.klass.pk, "track_slug": "oji-ladder-gimnaziu"},
            )
        self.assertEqual(response.status_code, 201, getattr(response, "data", None))
        # Every member got the ASSIGNED notification inside on_commit.
        self.assertTrue(len(callbacks) > 0)
        from notifications.models import Notification

        self.assertTrue(
            Notification.objects.filter(
                recipient=self.student,
                verb=Notification.Verb.ASSIGNMENT_PUBLISHED,
            ).exists()
        )
        assignment = Assignment.objects.get(pk=response.data["id"])
        self.assertEqual(assignment.classroom, self.klass)
        problems = assignment.assignment_problems.order_by("order")
        # The ladder's problems arrive in ladder order with labels A, B, …
        self.assertEqual(problems.count(), 8)
        self.assertEqual(
            [p.label for p in problems],
            ["A", "B", "C", "D", "E", "F", "G", "H"],
        )
        # Window defaulted to now → +14d with due after available.
        self.assertGreater(assignment.due_at, assignment.available_from)

    def test_other_teacher_and_unknown_track_refused(self):
        response = self._post(
            self.other_teacher,
            {"classroom": self.klass.pk, "track_slug": "oji-ladder-gimnaziu"},
        )
        self.assertEqual(response.status_code, 404)
        response = self._post(
            self.teacher, {"classroom": self.klass.pk, "track_slug": "nope"}
        )
        self.assertEqual(response.status_code, 404)

    def test_students_cannot_assign(self):
        client = APIClient()
        client.force_authenticate(user=self.student)
        response = client.post(
            "/api/v1/classroom/assignments/from-track/",
            {"classroom": self.klass.pk, "track_slug": "admitere-basics"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_empty_track_rejected(self):
        ProblemListItem.objects.filter(list__slug="admitere-math").delete()
        response = self._post(
            self.teacher, {"classroom": self.klass.pk, "track_slug": "admitere-math"}
        )
        self.assertEqual(response.status_code, 400)
