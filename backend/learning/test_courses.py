"""Wave E item 45 — structured courses (Scratch→Python first)."""

import io

from django.core.management import call_command
from django.test import TestCase
from problems.models import Problem
from rest_framework.test import APIClient
from submissions.models import Submission
from users.models import User

from .courses import seed_courses
from .models import Course, Drill, Lesson


def _seed():
    call_command("seed_problems", stdout=io.StringIO())


class SeedCoursesTest(TestCase):
    def test_scratch_to_python_seeds_with_lessons(self):
        _seed()  # seed_problems itself seeds the course
        course = Course.objects.get(slug="scratch-to-python")
        self.assertEqual(course.lessons.count(), 6)
        # Lesson 1 carries a theory card, drills and problems.
        first = course.lessons.order_by("order").first()
        self.assertIsNotNone(first.theory_card)
        self.assertGreaterEqual(first.drills.count(), 1)
        self.assertEqual(first.problems.count(), 1)
        # Bilingual discipline.
        self.assertIn("ro", first.title_i18n)

    def test_seed_idempotent(self):
        _seed()
        again = seed_courses()
        self.assertEqual(again, (0, 0))
        self.assertEqual(Lesson.objects.count(), 6)
        self.assertEqual(Course.objects.count(), 1)


class CourseEndpointsTest(TestCase):
    def setUp(self):
        _seed()
        self.user = User.objects.create_user(username="u", password="p")

    def test_list_public_with_progress(self):
        client = APIClient()
        response = client.get("/api/v1/learning/courses/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        row = response.data["results"][0]
        self.assertEqual(row["slug"], "scratch-to-python")
        self.assertEqual(row["lesson_count"], 6)
        self.assertEqual(row["solved_count"], 0)
        self.assertGreater(row["problem_count"], 0)

    def test_detail_shape_and_solved_marks(self):
        lesson = Lesson.objects.order_by("id").first()
        problem = lesson.problems.first()
        Submission.objects.create(
            user=self.user,
            problem=problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/learning/courses/scratch-to-python/")
        self.assertEqual(response.status_code, 200)
        lessons = response.data["lessons"]
        self.assertEqual(len(lessons), 6)
        target = next(row for row in lessons if row["id"] == lesson.id)
        self.assertEqual(target["solved_count"], 1)
        self.assertTrue(target["problems"][0]["is_solved"])
        self.assertIsNotNone(target["theory"])
        listing = client.get("/api/v1/learning/courses/")
        self.assertEqual(listing.data["results"][0]["solved_count"], 1)

    def test_seed_tolerates_missing_drills_and_problems(self):
        from unittest import mock

        from learning import courses as courses_mod

        spec = {
            "slug": "sparse-course",
            "en": "S",
            "ro": "S",
            "desc_en": "d",
            "desc_ro": "d",
            "lessons": [
                {
                    "title_en": "L",
                    "title_ro": "L",
                    "theory_tag": "loops",
                    "drill_kinds": ["READ_CODE"],
                    "problem_slugs": ["ghost-problem", "hello-judge"],
                }
            ],
        }
        with (
            mock.patch.object(courses_mod, "SEED_COURSES", [spec]),
            mock.patch(
                "learning.models.Drill.objects.filter",
                return_value=Drill.objects.none(),
            ),
            # The title query misses even the real slug: the lesson keeps
            # going with zero problems (the problem-None arm).
            mock.patch(
                "problems.models.Problem.objects.filter",
                return_value=Problem.objects.none(),
            ),
        ):
            created, lessons = courses_mod.seed_courses()
        self.assertEqual((created, lessons), (1, 1))
        course = Course.objects.get(slug="sparse-course")
        lesson = course.lessons.first()
        self.assertEqual(lesson.drills.count(), 0)
        self.assertEqual(lesson.problems.count(), 0)

    def test_str_methods_and_anonymous_detail(self):
        course = Course.objects.get(slug="scratch-to-python")
        self.assertIn("blocks", str(course))
        lesson = course.lessons.order_by("order").first()
        self.assertIn("hello", str(lesson).lower())
        lp = lesson.lesson_problems.first()
        self.assertIn("problem", str(lp))
        ld = lesson.lesson_drills.first()
        self.assertIn("drill", str(ld))
        # Anonymous detail: no solved marks, but the shape is the same.
        client = APIClient()
        response = client.get("/api/v1/learning/courses/scratch-to-python/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(
            all(
                p["is_solved"] is False for p in response.data["lessons"][0]["problems"]
            )
        )

    def test_unknown_slug_404(self):
        client = APIClient()
        self.assertEqual(client.get("/api/v1/learning/courses/nope/").status_code, 404)
