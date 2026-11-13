"""Full coverage for the submissions app: models, serializers, views, admin."""

from unittest import mock

from django.contrib.admin.sites import AdminSite
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem, TestCase as ProblemTestCase
from submissions.admin import SubmissionAdmin
from submissions.models import Submission, SubmissionTestResult
from submissions.serializers import (
    SubmissionSerializer,
    SubmissionTestResultSerializer,
)
from users.models import User


class SubmissionModelStrTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def test_submission_str(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        self.assertIn(f"Submission {sub.id}", str(sub))

    def test_submission_test_result_str(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        tc = ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        result = SubmissionTestResult.objects.create(
            submission=sub, test_case=tc, verdict=Submission.VerdictStatus.ACCEPTED
        )
        self.assertIn(f"Result for Sub {sub.id}", str(result))


class SubmissionAdminTest(TestCase):
    def setUp(self):
        self.admin = SubmissionAdmin(Submission, AdminSite())
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "Hello"}, statement_i18n={"en": "S"}
        )

    def test_user_link(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        html = self.admin.user_link(sub)
        self.assertIn(self.user.username, html)

    def test_user_link_none(self):
        # A FK with no related object: accessing Submission().user raises, so use
        # a stand-in object exposing user=None to drive the falsey branch.
        self.assertEqual(self.admin.user_link(mock.Mock(user=None)), "N/A")

    def test_problem_link_with_dict_title(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        html = self.admin.problem_link(sub)
        self.assertIn("Hello", html)

    def test_problem_link_non_dict_title(self):
        problem = Problem.objects.create(title_i18n="x", statement_i18n={"en": "S"})
        sub = Submission.objects.create(
            user=self.user, problem=problem, language="python3", code="x"
        )
        html = self.admin.problem_link(sub)
        self.assertIn(f"ID: {problem.id}", html)

    def test_problem_link_none(self):
        self.assertEqual(self.admin.problem_link(mock.Mock(problem=None)), "N/A")


class SubmissionSerializerTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def test_to_representation_includes_problem(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        data = SubmissionSerializer(sub).data
        self.assertEqual(data["problem"]["id"], self.problem.id)

    def test_test_result_details(self):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            order=3,
            is_sample=True,
            points=20,
        )
        result = SubmissionTestResult.objects.create(
            submission=sub, test_case=tc, verdict=Submission.VerdictStatus.ACCEPTED
        )
        data = SubmissionTestResultSerializer(result).data
        self.assertEqual(data["test_case_details"]["order"], 3)

    def test_test_result_details_none_when_no_test_case(self):
        serializer = SubmissionTestResultSerializer()
        obj = mock.Mock(test_case=None)
        self.assertIsNone(serializer.get_test_case_details(obj))

    def test_to_representation_without_problem(self):
        # instance.problem is falsey -> the `if instance.problem:` branch is
        # skipped (covers the 84->91 branch arm).
        serializer = SubmissionSerializer()
        with mock.patch.object(
            SubmissionSerializer.__bases__[0],
            "to_representation",
            return_value={"id": 1},
        ):
            rep = serializer.to_representation(mock.Mock(problem=None))
        self.assertEqual(rep, {"id": 1})


class SubmissionViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="owner", password="p")
        self.other = User.objects.create_user(username="other", password="p")
        self.admin = User.objects.create_user(
            username="adm", password="p", role=User.Roles.ADMIN
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def _sub(self, user):
        return Submission.objects.create(
            user=user, problem=self.problem, language="python3", code="x"
        )

    def test_user_sees_only_own(self):
        self._sub(self.user)
        self._sub(self.other)
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/submissions/submissions/")
        self.assertEqual(len(resp.json()["results"]), 1)

    def test_admin_sees_all(self):
        self._sub(self.user)
        self._sub(self.other)
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/v1/submissions/submissions/")
        self.assertEqual(len(resp.json()["results"]), 2)

    def test_owner_can_retrieve_own(self):
        sub = self._sub(self.user)
        self.client.force_authenticate(self.user)
        resp = self.client.get(f"/api/v1/submissions/submissions/{sub.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_create_dispatches_judge_task(self):
        self.client.force_authenticate(self.user)
        with mock.patch("submissions.views.judge_task") as task:
            resp = self.client.post(
                "/api/v1/submissions/submit/",
                {"problem": self.problem.id, "language": "python3", "code": "print(1)"},
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        task.delay.assert_called_once()
        sub = Submission.objects.get()
        self.assertEqual(sub.user, self.user)

    def test_create_requires_auth(self):
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {"problem": self.problem.id, "language": "python3", "code": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ListFilterCoverageTest(TestCase):
    """Single-branch 100% gate: problemId/language list filters."""

    def setUp(self):
        from rest_framework.test import APIClient

        self.client = APIClient()
        self.user = User.objects.create_user(username="cc-lf", password="p")
        self.p1 = Problem.objects.create(
            title_i18n={"en": "P1"}, statement_i18n={"en": "S"}
        )
        self.p2 = Problem.objects.create(
            title_i18n={"en": "P2"}, statement_i18n={"en": "S"}
        )

    def _sub(self, problem, language="python3"):
        return Submission.objects.create(
            user=self.user, problem=problem, language=language, code="x"
        )

    def test_filter_by_problem_and_language(self):
        self._sub(self.p1, language="python3")
        self._sub(self.p2, language="java11")
        self.client.force_authenticate(self.user)

        by_problem = self.client.get(
            "/api/v1/submissions/submissions/", {"problemId": self.p1.id}
        )
        self.assertEqual(len(by_problem.json()["results"]), 1)
        self.assertEqual(by_problem.json()["results"][0]["problem"]["id"], self.p1.id)

        by_language = self.client.get(
            "/api/v1/submissions/submissions/", {"language": "java11"}
        )
        self.assertEqual(len(by_language.json()["results"]), 1)
        self.assertEqual(by_language.json()["results"][0]["language"], "java11")
