"""Wave G PR8 tests that need the certificates app (items 148/149/150).

Lives under backend/certifications so the certificates package is on the
import path at collection time.
"""

from django.apps import apps
from django.test import TestCase
from rest_framework.test import APIClient

from certificates.teacher import grade_exam, seed_questions
from problems.models import Problem
from submissions.models import Submission
from users.models import User

# Resolved via the app registry (not top-level import) so collection is
# independent of sys.path timing in junctioned worktrees.
Certificate = apps.get_model("certificates", "Certificate")
TeacherCertAttempt = apps.get_model("certificates", "TeacherCertAttempt")
TeacherCertQuestion = apps.get_model("certificates", "TeacherCertQuestion")

EXAM = "/api/v1/certificates/teacher-exam/"
TRANSPARENCY = "/api/v1/public/transparency/"


def _problem():
    return Problem.objects.create(
        title_i18n={"en": "Sum"},
        statement_i18n={"en": "Add."},
        status=Problem.ProblemStatus.APPROVED,
    )


class TeacherCertTest(TestCase):
    """Item 148 — the exam, the pass threshold, the atestat."""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username="tch", password="pw", role="TEACHER"
        )
        self.admin = User.objects.create_user(
            username="tadm", password="pw", role="ADMIN"
        )
        self.student = User.objects.create_user(username="tstu", password="pw")
        self.client = APIClient()

    def test_seed_is_idempotent(self):
        first = seed_questions()
        self.assertGreater(first, 0)
        self.assertEqual(seed_questions(), 0)
        self.assertEqual(TeacherCertQuestion.objects.count(), first)

    def test_get_exam_requires_teacher_and_hides_answers(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(self.client.get(EXAM).status_code, 403)

        seed_questions()
        self.client.force_authenticate(self.teacher)
        data = self.client.get(EXAM).data
        self.assertEqual(data["pass_threshold"], 0.8)
        self.assertEqual(len(data["questions"]), TeacherCertQuestion.objects.count())
        # correct_index never ships.
        self.assertNotIn("correct_index", str(data))

    def test_exam_not_configured_503(self):
        self.client.force_authenticate(self.teacher)
        self.assertEqual(self.client.get(EXAM).status_code, 503)

    def test_pass_issues_certificate_and_repass_keeps_it(self):
        seed_questions()
        questions = list(TeacherCertQuestion.objects.order_by("id"))
        answers = {str(q.pk): q.correct_index for q in questions}
        self.client.force_authenticate(self.teacher)

        missing_body = self.client.post(EXAM, {"answers": []}, format="json")
        self.assertEqual(missing_body.status_code, 400)

        result = self.client.post(EXAM, {"answers": answers}, format="json").data
        self.assertTrue(result["passed"])
        self.assertEqual(result["score"], 1.0)
        self.assertIsNotNone(result["certificate_uuid"])
        self.assertTrue(
            Certificate.objects.filter(
                user=self.teacher, kind=Certificate.Kind.TEACHER
            ).exists()
        )
        # Re-passing: same certificate (get_or_create), no duplicate.
        again = self.client.post(EXAM, {"answers": answers}, format="json").data
        self.assertIsNone(again["certificate_uuid"])
        self.assertEqual(
            Certificate.objects.filter(
                user=self.teacher, kind=Certificate.Kind.TEACHER
            ).count(),
            1,
        )
        self.assertEqual(TeacherCertAttempt.objects.count(), 2)

    def test_fail_records_attempt_no_certificate(self):
        seed_questions()
        questions = list(TeacherCertQuestion.objects.order_by("id"))
        answers = {str(q.pk): (q.correct_index + 1) % len(q.choices) for q in questions}
        self.client.force_authenticate(self.teacher)
        result = self.client.post(EXAM, {"answers": answers}, format="json").data
        self.assertFalse(result["passed"])
        self.assertFalse(Certificate.objects.filter(user=self.teacher).exists())

    def test_grade_exam_handles_junk_answers(self):
        seed_questions()
        result = grade_exam(self.teacher, {"junk": "not-a-number"})
        self.assertEqual(result["correct"], 0)
        self.assertFalse(result["passed"])

    def test_models_str(self):
        seed_questions()
        question = TeacherCertQuestion.objects.first()
        self.assertIn("teme", str(question))
        attempt = TeacherCertAttempt.objects.create(
            user=self.teacher, score=0.9, passed=True
        )
        self.assertIn("90%", str(attempt))


class TransparencyTest(TestCase):
    """Item 150 — the aggregate data layer behind the report."""

    def test_report_is_public_and_aggregate(self):
        import json

        user = User.objects.create_user(username="tr_user", password="pw")
        _sub(user, _problem(), verdict="AC")
        seed_questions()
        grade_exam(
            User.objects.create_user(
                username="tr_teacher", password="pw", role="TEACHER"
            ),
            {str(q.pk): q.correct_index for q in TeacherCertQuestion.objects.all()},
        )
        client = APIClient()  # anonymous
        response = client.get(TRANSPARENCY)
        self.assertEqual(response.status_code, 200)
        payload = json.dumps(response.data, default=str)
        self.assertIn("problems_by_status", payload)
        self.assertIn("moderation", payload)
        self.assertIn("appeals_by_outcome", payload)
        # Aggregates only — no usernames in the public payload.
        self.assertNotIn("tr_user", payload)
        self.assertNotIn("tr_teacher", payload)
        self.assertEqual(response.data["activity"]["teacher_certificates"], 1)


class OpenSourcePackageTest(TestCase):
    """Item 149 — packages/webcoder-ui exists with MIT licensing, a
    CONTRIBUTING pinned to the quality gates, and the extracted
    component (contract-level; the component's behaviour test lives in
    the frontend suite)."""

    def test_package_scaffold(self):
        import pathlib

        root = pathlib.Path(__file__).resolve().parents[2]
        pkg = root / "packages" / "webcoder-ui"
        self.assertTrue((pkg / "LICENSE").exists(), "LICENSE missing")
        license_text = (pkg / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("MIT", license_text)
        readme = (pkg / "README.md").read_text(encoding="utf-8")
        self.assertIn("no self-host support", readme)
        contributing = (pkg / "CONTRIBUTING.md").read_text(encoding="utf-8")
        self.assertIn("100% coverage", contributing)
        self.assertTrue((pkg / "src" / "flush-notice.tsx").exists())


def _sub(user, problem, code="print(1)", verdict="AC"):
    return Submission.objects.create(
        user=user, problem=problem, language="python3", code=code, verdict=verdict
    )


def _sub(user, problem, code="print(1)", verdict="AC"):
    return Submission.objects.create(
        user=user, problem=problem, language="python3", code=code, verdict=verdict
    )
