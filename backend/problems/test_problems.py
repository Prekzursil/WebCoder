"""Full coverage for the problems app: models, serializers, views, admin."""

from unittest import mock

from django.contrib.admin.sites import AdminSite
from django.test import RequestFactory, TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.admin import ProblemAdmin, TagAdmin
from problems.models import Problem, Tag, TestCase as ProblemTestCase
from problems.serializers import ProblemSerializer
from problems.serializers import TestCaseSerializer as TCSerializer
from users.models import User


class ModelStrTest(TestCase):
    def test_tag_str_prefers_english(self):
        self.assertEqual(
            Tag(name_i18n={"en": "Arrays"}, slug="arr").__str__(), "Arrays"
        )

    def test_tag_str_falls_back_to_romanian(self):
        self.assertEqual(
            Tag(name_i18n={"ro": "Tablouri"}, slug="t").__str__(), "Tablouri"
        )

    def test_tag_str_non_dict_returns_slug(self):
        self.assertEqual(Tag(name_i18n="bad", slug="s").__str__(), "s")

    def test_problem_str_english(self):
        self.assertEqual(Problem(title_i18n={"en": "Sum"}).__str__(), "Sum")

    def test_problem_str_non_dict(self):
        p = Problem(title_i18n="x")
        self.assertEqual(p.__str__(), f"Problem {p.id}")

    def test_testcase_str(self):
        p = Problem.objects.create(title_i18n={"en": "P"}, statement_i18n={"en": "S"})
        tc = ProblemTestCase.objects.create(
            problem=p, input_data="i", expected_output_data="o", order=2
        )
        self.assertIn("Test Case 2", str(tc))


class AdminTest(TestCase):
    def setUp(self):
        self.site = AdminSite()
        self.factory = RequestFactory()

    def test_tag_admin_name_display_dict_and_non_dict(self):
        admin = TagAdmin(Tag, self.site)
        self.assertEqual(admin.name_i18n_display(Tag(name_i18n={"en": "A"})), "A")
        self.assertEqual(admin.name_i18n_display(Tag(name_i18n={"ro": "B"})), "B")
        self.assertEqual(admin.name_i18n_display(Tag(name_i18n="x")), "N/A")

    def test_problem_admin_title_display(self):
        admin = ProblemAdmin(Problem, self.site)
        self.assertEqual(admin.title_i18n_display(Problem(title_i18n={"en": "T"})), "T")
        self.assertEqual(admin.title_i18n_display(Problem(title_i18n="x")), "N/A")

    def test_problem_admin_author_display(self):
        admin = ProblemAdmin(Problem, self.site)
        author = User.objects.create_user(username="auth", password="p")
        self.assertEqual(admin.author_display(Problem(author=author)), "auth")
        self.assertEqual(admin.author_display(Problem(author=None)), "N/A")

    def test_problem_admin_save_model_sets_author_when_missing(self):
        admin = ProblemAdmin(Problem, self.site)
        request = self.factory.post("/")
        request.user = User.objects.create_user(username="creator", password="p")
        problem = Problem(title_i18n={"en": "P"}, statement_i18n={"en": "S"})
        admin.save_model(request, problem, form=None, change=False)
        self.assertEqual(problem.author, request.user)

    def test_problem_admin_save_model_keeps_existing_author(self):
        admin = ProblemAdmin(Problem, self.site)
        existing = User.objects.create_user(username="orig", password="p")
        other = User.objects.create_user(username="other", password="p")
        request = self.factory.post("/")
        request.user = other
        problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}, author=existing
        )
        admin.save_model(request, problem, form=None, change=True)
        self.assertEqual(problem.author, existing)


class TestCaseSerializerRepresentationTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.author = User.objects.create_user(username="a", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}, author=self.author
        )

    def _serialize(self, tc, user):
        request = self.factory.get("/")
        request.user = user
        return TCSerializer(tc, context={"request": request}).data

    def test_hidden_for_anonymous_on_non_sample(self):
        from django.contrib.auth.models import AnonymousUser

        tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="secret",
            is_sample=False,
        )
        data = self._serialize(tc, AnonymousUser())
        self.assertNotIn("expected_output_data", data)

    def test_visible_for_sample(self):
        from django.contrib.auth.models import AnonymousUser

        tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="shown",
            is_sample=True,
        )
        data = self._serialize(tc, AnonymousUser())
        self.assertEqual(data["expected_output_data"], "shown")

    def test_visible_for_author(self):
        tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="x",
            is_sample=False,
        )
        data = self._serialize(tc, self.author)
        self.assertIn("expected_output_data", data)

    def test_visible_for_admin_role(self):
        admin_user = User.objects.create_user(
            username="adm", password="p", role=User.Roles.ADMIN
        )
        tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="x",
            is_sample=False,
        )
        data = self._serialize(tc, admin_user)
        self.assertIn("expected_output_data", data)


class ProblemSerializerCreateTest(TestCase):
    def test_create_sets_author_from_request_when_absent(self):
        factory = RequestFactory()
        user = User.objects.create_user(
            username="creator", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        request = factory.post("/")
        request.user = user
        serializer = ProblemSerializer(context={"request": request})
        problem = serializer.create(
            {"title_i18n": {"en": "T"}, "statement_i18n": {"en": "S"}}
        )
        self.assertEqual(problem.author, user)

    def test_create_keeps_explicit_author(self):
        factory = RequestFactory()
        request_user = User.objects.create_user(username="req", password="p")
        explicit = User.objects.create_user(username="exp", password="p")
        request = factory.post("/")
        request.user = request_user
        serializer = ProblemSerializer(context={"request": request})
        problem = serializer.create(
            {
                "title_i18n": {"en": "T"},
                "statement_i18n": {"en": "S"},
                "author": explicit,
            }
        )
        self.assertEqual(problem.author, explicit)


class ProblemViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.creator = User.objects.create_user(
            username="creator", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.verifier = User.objects.create_user(
            username="verifier", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.basic = User.objects.create_user(
            username="basic", password="p", role=User.Roles.BASIC_USER
        )
        self.staff = User.objects.create_user(
            username="staff", password="p", is_staff=True
        )

    def _make(self, status_value, author=None):
        return Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=status_value,
            author=author,
        )

    def test_anonymous_list_only_approved(self):
        self._make(Problem.ProblemStatus.APPROVED)
        self._make(Problem.ProblemStatus.DRAFT)
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.json()), 1)

    def test_author_sees_own_drafts(self):
        self._make(Problem.ProblemStatus.DRAFT, author=self.creator)
        self.client.force_authenticate(self.creator)
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(len(resp.json()), 1)

    def test_staff_sees_all(self):
        self._make(Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.staff)
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(len(resp.json()), 1)

    def test_verifier_role_sees_all(self):
        self._make(Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.verifier)
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(len(resp.json()), 1)

    def test_basic_user_sees_only_approved(self):
        self._make(Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.basic)
        resp = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(len(resp.json()), 0)

    def test_create_sets_author(self):
        self.client.force_authenticate(self.creator)
        resp = self.client.post(
            "/api/v1/problems/problems/",
            {"title_i18n": {"en": "New"}, "statement_i18n": {"en": "S"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Problem.objects.get().author, self.creator)

    def test_create_forbidden_for_basic_user(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            "/api/v1/problems/problems/",
            {"title_i18n": {"en": "New"}, "statement_i18n": {"en": "S"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_retrieve_uses_detail_serializer(self):
        p = self._make(Problem.ProblemStatus.APPROVED)
        resp = self.client.get(f"/api/v1/problems/problems/{p.id}/")
        self.assertIn("test_cases", resp.json())

    def test_submit_for_approval_from_draft(self):
        p = self._make(Problem.ProblemStatus.DRAFT, author=self.creator)
        self.client.force_authenticate(self.creator)
        resp = self.client.post(
            f"/api/v1/problems/problems/{p.id}/submit-for-approval/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        p.refresh_from_db()
        self.assertEqual(p.status, Problem.ProblemStatus.PENDING_APPROVAL)

    def test_submit_for_approval_wrong_state(self):
        p = self._make(Problem.ProblemStatus.APPROVED, author=self.verifier)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/problems/problems/{p.id}/submit-for-approval/"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approve_problem_pending(self):
        p = self._make(Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/problems/problems/{p.id}/approve/",
            {"feedback": "great"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        p.refresh_from_db()
        self.assertEqual(p.status, Problem.ProblemStatus.APPROVED)

    def test_approve_problem_wrong_state(self):
        p = self._make(Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/approve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_problem_requires_feedback(self):
        p = self._make(Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/reject/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reject_problem_pending_with_feedback(self):
        p = self._make(Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/problems/problems/{p.id}/reject/",
            {"feedback": "fix it"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        p.refresh_from_db()
        self.assertEqual(p.status, Problem.ProblemStatus.PRIVATE)

    def test_reject_problem_wrong_state(self):
        p = self._make(Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/problems/problems/{p.id}/reject/",
            {"feedback": "x"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_perform_create_anonymous_via_serializer_else_branch(self):
        # Directly drive perform_create with an unauthenticated request to hit
        # the `else: serializer.save()` branch in ProblemViewSet.perform_create.
        from django.contrib.auth.models import AnonymousUser

        from problems.views import ProblemViewSet

        view = ProblemViewSet()
        request = RequestFactory().post("/")
        request.user = AnonymousUser()
        view.request = request
        serializer = mock.Mock()
        view.perform_create(serializer)
        serializer.save.assert_called_once_with()


class ProblemViewSetPermissionsTest(TestCase):
    def test_default_permission_branch_for_unlisted_action(self):
        from rest_framework import permissions

        from problems.views import ProblemViewSet

        view = ProblemViewSet()
        view.action = "some_unlisted_custom_action"
        perms = view.get_permissions()
        # Falls through every branch to the `else` -> IsAdminUser default.
        self.assertTrue(any(isinstance(p, permissions.IsAdminUser) for p in perms))


class TagViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="u", password="p")

    def test_anonymous_can_read(self):
        Tag.objects.create(name_i18n={"en": "A"}, slug="a")
        resp = self.client.get("/api/v1/problems/tags/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_authenticated_can_create(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/problems/tags/",
            {"name_i18n": {"en": "B"}, "slug": "b"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_anonymous_cannot_create(self):
        resp = self.client.post(
            "/api/v1/problems/tags/",
            {"name_i18n": {"en": "B"}, "slug": "b"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class TestCaseViewSetTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        # A verifier passes ProblemObjectPermissions for any write action (incl.
        # the create-test-case check); a basic user does not. The problem is
        # authored by the verifier so the author-equality path is also covered.
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.other = User.objects.create_user(
            username="other", password="p", role=User.Roles.BASIC_USER
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.DRAFT,
            author=self.author,
        )

    def test_create_allowed_for_author(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            "/api/v1/problems/testcases/",
            {
                "problem": self.problem.id,
                "input_data": "i",
                "expected_output_data": "o",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_create_denied_for_non_author(self):
        self.client.force_authenticate(self.other)
        resp = self.client.post(
            "/api/v1/problems/testcases/",
            {
                "problem": self.problem.id,
                "input_data": "i",
                "expected_output_data": "o",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_filtered_by_problem_id(self):
        ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.author)
        resp = self.client.get(
            f"/api/v1/problems/testcases/?problem_id={self.problem.id}"
        )
        self.assertEqual(len(resp.json()), 1)

    def test_list_unfiltered(self):
        ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.author)
        resp = self.client.get("/api/v1/problems/testcases/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_allowed_for_author(self):
        tc = ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.author)
        resp = self.client.patch(
            f"/api/v1/problems/testcases/{tc.id}/",
            {"input_data": "new"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_update_denied_for_non_author(self):
        tc = ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.other)
        resp = self.client.patch(
            f"/api/v1/problems/testcases/{tc.id}/",
            {"input_data": "new"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy_allowed_for_author(self):
        tc = ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.author)
        resp = self.client.delete(f"/api/v1/problems/testcases/{tc.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_destroy_denied_for_non_author(self):
        tc = ProblemTestCase.objects.create(
            problem=self.problem, input_data="i", expected_output_data="o"
        )
        self.client.force_authenticate(self.other)
        resp = self.client.delete(f"/api/v1/problems/testcases/{tc.id}/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
