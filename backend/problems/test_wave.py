"""
Wave-migration test suite for the ``problems`` app (tests_wave.py).

Target: 100% line + branch coverage of the problems app (models, serializers,
views, urls, admin, apps, migrations) using plain Django ORM test data (no
factory_boy) and DRF's APIClient. The problems app has no judge/celery task
calls to mock (verified: no celery imports in problems/*).

COLLECTION NOTE (measured): pytest.ini sets ``python_files = tests.py
test_*.py *_tests.py`` which does NOT match ``tests_wave.py``; a probe test
in this file alone yielded "no tests collected" under ``pytest problems``.
``problems/test_wave.py`` is therefore a 2-line re-export shim that makes
this module collectable. All real content lives HERE.

COVERAGE STATE (measured, updated per round — 3 rounds used):
    ROUND 1 (gate + --cov-branch): 90 passed / 3 failed; problems app ALREADY
        100% lines+branches. Failures were wrong test expectations, not code
        gaps: anonymous OPTIONS -> 401 (JWT challenge header), author update
        of own PRIVATE -> 404 (get_queryset hides PRIVATE from authors), other
        user's draft update -> 404 (filtered from queryset before permissions).
    ROUND 2 (gate + --cov-branch): 94 passed / 0 failed. problems app 100%
        lines+branches on every file (views.py 105 stmts/0 miss + 34 branches/
        0 partial; serializers 41/0 + 6/0; models 69/0 + 4/0; admin 35/0 +
        6/0; urls/apps/__init__/tests/migrations all 100%).
    ROUND 3 (exact gate command, no extra flags): 94 passed, exit 0, problems
        app 100% lines. Disk receipt: this docstring + the run transcripts.
"""
import importlib
import pkgutil
from unittest import mock

from django.contrib.admin import site as admin_site
from django.test import TestCase as DjangoTestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIClient, APIRequestFactory

from problems import admin as problems_admin
from problems import migrations as problems_migrations
from problems.models import Problem, Tag
from problems.models import TestCase as ProblemTestCase
from problems.serializers import ProblemSerializer, TestCaseSerializer
from problems.views import ProblemViewSet
from users.models import User
from users.permissions import ProblemObjectPermissions

TAG_LIST = "problems_api_v1:tag-list"
TAG_DETAIL = "problems_api_v1:tag-detail"
PROBLEM_LIST = "problems_api_v1:problem-list"
PROBLEM_DETAIL = "problems_api_v1:problem-detail"
PROBLEM_SUBMIT = "problems_api_v1:problem-submit-for-approval"
PROBLEM_APPROVE = "problems_api_v1:problem-approve-problem"
PROBLEM_REJECT = "problems_api_v1:problem-reject-problem"
TESTCASE_LIST = "problems_api_v1:testcase-list"
TESTCASE_DETAIL = "problems_api_v1:testcase-detail"


def make_user(username, role=User.Roles.BASIC_USER, **extra):
    return User.objects.create_user(
        username=username,
        email=f"{username}@example.com",
        password="s3cure-Pass-42",
        role=role,
        **extra,
    )


def make_problem(author=None, status=Problem.ProblemStatus.DRAFT, **extra):
    fields = {
        "title_i18n": {"en": "A Title", "ro": "Un Titlu"},
        "statement_i18n": {"en": "A statement."},
        "author": author,
        "status": status,
    }
    fields.update(extra)
    return Problem.objects.create(**fields)


def make_testcase(problem, is_sample=False, order=0):
    return ProblemTestCase.objects.create(
        problem=problem,
        input_data="in",
        expected_output_data="out",
        is_sample=is_sample,
        order=order,
    )


def drf_request(method="get", path="/", user=None):
    """A DRF Request with an optionally forced user (anonymous by default)."""
    factory = APIRequestFactory()
    req = Request(getattr(factory, method)(path))
    if user is not None:
        req.user = user
    return req


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class TagModelStrTests(DjangoTestCase):
    """Cover every branch of Tag.__str__ (models.py:14-18)."""

    def test_str_dict_with_english_name(self):
        tag = Tag.objects.create(name_i18n={"en": "Arrays", "ro": "Tablouri"}, slug="arrays")
        self.assertEqual(str(tag), "Arrays")

    def test_str_dict_with_romanian_fallback(self):
        tag = Tag.objects.create(name_i18n={"ro": "Tablouri"}, slug="tablouri")
        self.assertEqual(str(tag), "Tablouri")

    def test_str_dict_without_en_or_ro_falls_back_to_slug(self):
        tag = Tag.objects.create(name_i18n={"fr": "Tableaux"}, slug="tag-slug")
        self.assertEqual(str(tag), "tag-slug")

    def test_str_non_dict_name_falls_back_to_slug(self):
        tag = Tag.objects.create(name_i18n="not-a-dict", slug="plain-slug")
        self.assertEqual(str(tag), "plain-slug")


class ProblemModelStrTests(DjangoTestCase):
    """Cover every branch of Problem.__str__ (models.py:125-128)."""

    def test_str_dict_with_english_title(self):
        problem = make_problem()
        problem.title_i18n = {"en": "Sum Two", "ro": "Suma"}
        self.assertEqual(str(problem), "Sum Two")

    def test_str_dict_with_romanian_fallback(self):
        problem = make_problem()
        problem.title_i18n = {"ro": "Suma"}
        self.assertEqual(str(problem), "Suma")

    def test_str_dict_without_en_or_ro_falls_back_to_id(self):
        problem = make_problem()
        problem.title_i18n = {}
        self.assertEqual(str(problem), f"Problem {problem.id}")

    def test_str_non_dict_title_falls_back_to_id(self):
        problem = make_problem()
        problem.title_i18n = "just a string"
        self.assertEqual(str(problem), f"Problem {problem.id}")

    def test_testcase_str(self):
        problem = make_problem()
        tc = make_testcase(problem, order=3)
        self.assertEqual(str(tc), f"Test Case 3 for Problem: {problem.id}")


class MigrationModulesImportedTests(DjangoTestCase):
    """
    Import every problems.migrations module so the ``--cov=.`` source-mode
    report (which lists never-imported files at 0%) measures them. The
    migration modules are declarative (no branches — verified by grep).
    """

    def test_all_migration_modules_import(self):
        imported = [
            importlib.import_module(f"problems.migrations.{mod.name}")
            for mod in pkgutil.iter_modules(problems_migrations.__path__)
        ]
        self.assertGreaterEqual(len(imported), 1)


# ---------------------------------------------------------------------------
# Admin (display methods + save_model)
# ---------------------------------------------------------------------------

class AdminDisplayMethodTests(DjangoTestCase):
    """Cover TagAdmin/ProblemAdmin display-method branches (admin.py)."""

    def setUp(self):
        self.tag_admin = problems_admin.TagAdmin(Tag, admin_site)
        self.problem_admin = problems_admin.ProblemAdmin(Problem, admin_site)

    def test_tag_name_display_en(self):
        tag = Tag(name_i18n={"en": "Arrays", "ro": "X"}, slug="arrays")
        self.assertEqual(self.tag_admin.name_i18n_display(tag), "Arrays")

    def test_tag_name_display_ro_fallback(self):
        tag = Tag(name_i18n={"ro": "Tablouri"}, slug="tablouri")
        self.assertEqual(self.tag_admin.name_i18n_display(tag), "Tablouri")

    def test_tag_name_display_na_for_other_keys(self):
        tag = Tag(name_i18n={"fr": "Tableaux"}, slug="tag")
        self.assertEqual(self.tag_admin.name_i18n_display(tag), "N/A")

    def test_tag_name_display_na_for_non_dict(self):
        tag = Tag(name_i18n="plain", slug="tag")
        self.assertEqual(self.tag_admin.name_i18n_display(tag), "N/A")

    def test_problem_title_display_en(self):
        problem = Problem(title_i18n={"en": "Sum", "ro": "S"}, statement_i18n={})
        self.assertEqual(self.problem_admin.title_i18n_display(problem), "Sum")

    def test_problem_title_display_ro_fallback(self):
        problem = Problem(title_i18n={"ro": "Suma"}, statement_i18n={})
        self.assertEqual(self.problem_admin.title_i18n_display(problem), "Suma")

    def test_problem_title_display_na_for_other_keys(self):
        problem = Problem(title_i18n={"fr": "Somme"}, statement_i18n={})
        self.assertEqual(self.problem_admin.title_i18n_display(problem), "N/A")

    def test_problem_title_display_na_for_non_dict(self):
        problem = Problem(title_i18n="plain", statement_i18n={})
        self.assertEqual(self.problem_admin.title_i18n_display(problem), "N/A")

    def test_author_display_with_author(self):
        author = make_user("adm-author")
        problem = make_problem(author=author)
        self.assertEqual(self.problem_admin.author_display(problem), "adm-author")

    def test_author_display_without_author(self):
        problem = make_problem(author=None)
        self.assertEqual(self.problem_admin.author_display(problem), "N/A")


class AdminSaveModelTests(DjangoTestCase):
    """Cover ProblemAdmin.save_model branches (admin.py:65-68)."""

    def setUp(self):
        self.problem_admin = problems_admin.ProblemAdmin(Problem, admin_site)
        self.request_user = make_user("save-model-user")

    def test_save_model_assigns_request_user_when_author_missing(self):
        request = mock.Mock(user=self.request_user)
        problem = Problem(title_i18n={"en": "T"}, statement_i18n={"en": "S"})
        self.problem_admin.save_model(request, problem, form=None, change=False)
        problem.refresh_from_db()
        self.assertEqual(problem.author, self.request_user)

    def test_save_model_keeps_existing_author(self):
        author = make_user("original-author")
        request = mock.Mock(user=self.request_user)
        problem = make_problem(author=author)
        self.problem_admin.save_model(request, problem, form=None, change=True)
        problem.refresh_from_db()
        self.assertEqual(problem.author, author)


# ---------------------------------------------------------------------------
# Serializers (direct unit tests)
# ---------------------------------------------------------------------------

class TestCaseSerializerRepresentationTests(DjangoTestCase):
    """Cover TestCaseSerializer.to_representation auth branches (serializers.py:17-35)."""

    def setUp(self):
        self.author = make_user("tc-author", role=User.Roles.PROBLEM_CREATOR)
        self.problem = make_problem(author=self.author)
        self.tc_hidden = make_testcase(self.problem, is_sample=False)
        self.tc_sample = make_testcase(self.problem, is_sample=True)

    def serialize(self, tc, request):
        serializer = TestCaseSerializer(instance=tc, context={"request": request})
        return serializer.data

    def test_anonymous_cannot_see_hidden_output(self):
        data = self.serialize(self.tc_hidden, drf_request())
        self.assertNotIn("expected_output_data", data)

    def test_anonymous_sees_sample_output(self):
        data = self.serialize(self.tc_sample, drf_request())
        self.assertEqual(data["expected_output_data"], "out")

    def test_admin_sees_hidden_output(self):
        admin = make_user("tc-admin", role=User.Roles.ADMIN)
        data = self.serialize(self.tc_hidden, drf_request(user=admin))
        self.assertEqual(data["expected_output_data"], "out")

    def test_verifier_sees_hidden_output(self):
        verifier = make_user("tc-verifier", role=User.Roles.PROBLEM_VERIFIER)
        data = self.serialize(self.tc_hidden, drf_request(user=verifier))
        self.assertEqual(data["expected_output_data"], "out")

    def test_author_sees_hidden_output(self):
        data = self.serialize(self.tc_hidden, drf_request(user=self.author))
        self.assertEqual(data["expected_output_data"], "out")

    def test_other_authenticated_user_cannot_see_hidden_output(self):
        other = make_user("tc-other")
        data = self.serialize(self.tc_hidden, drf_request(user=other))
        self.assertNotIn("expected_output_data", data)

    def test_user_none_cannot_see_hidden_output(self):
        data = self.serialize(self.tc_hidden, drf_request(user=None))
        self.assertNotIn("expected_output_data", data)


class ProblemSerializerCreateTests(DjangoTestCase):
    """Cover ProblemSerializer.create author-default branches (serializers.py:70-74)."""

    PAYLOAD = {"title_i18n": {"en": "T"}, "statement_i18n": {"en": "S"}}

    def test_create_defaults_author_to_request_user(self):
        creator = make_user("ser-creator", role=User.Roles.PROBLEM_CREATOR)
        serializer = ProblemSerializer(
            data=self.PAYLOAD, context={"request": drf_request(user=creator)}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        problem = serializer.save()
        self.assertEqual(problem.author, creator)

    def test_create_without_authenticated_request_leaves_author_null(self):
        serializer = ProblemSerializer(data=self.PAYLOAD, context={"request": drf_request()})
        self.assertTrue(serializer.is_valid(), serializer.errors)
        problem = serializer.save()
        self.assertIsNone(problem.author)

    def test_create_keeps_explicit_author(self):
        author = make_user("explicit-author")
        payload = dict(self.PAYLOAD, author_id=author.id)
        serializer = ProblemSerializer(
            data=payload, context={"request": drf_request(user=make_user("someone-else"))}
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        problem = serializer.save()
        self.assertEqual(problem.author, author)


class ProblemViewSetPerformCreateDirectTests(DjangoTestCase):
    """Cover views.py:48-53 anonymous branch, unreachable through the API
    (the create action is guarded by IsAuthenticated)."""

    def test_perform_create_without_authenticated_user_saves_plain(self):
        view = ProblemViewSet()
        view.request = mock.Mock(user=mock.Mock(is_authenticated=False))
        serializer = mock.Mock()
        view.perform_create(serializer)
        serializer.save.assert_called_once_with()


class ProblemObjectPermissionsDirectTests(DjangoTestCase):
    """Cover has_object_permission arcs not reachable through the API
    (every mutating endpoint is behind IsAuthenticated)."""

    def setUp(self):
        self.permission = ProblemObjectPermissions()
        self.problem = make_problem()

    def test_safe_method_allowed_for_anonymous(self):
        request = drf_request(method="get")
        self.assertTrue(
            self.permission.has_object_permission(request, mock.Mock(action="retrieve"), self.problem)
        )

    def test_unauthenticated_non_safe_method_denied(self):
        request = drf_request(method="post")
        self.assertFalse(
            self.permission.has_object_permission(request, mock.Mock(action="update"), self.problem)
        )

    def test_user_none_non_safe_method_denied(self):
        request = drf_request(method="post", user=None)
        self.assertFalse(
            self.permission.has_object_permission(request, mock.Mock(action="update"), self.problem)
        )


# ---------------------------------------------------------------------------
# TagViewSet API
# ---------------------------------------------------------------------------

class TagViewSetAPITests(DjangoTestCase):
    """Cover TagViewSet.get_permissions branches + CRUD (views.py:11-22)."""

    def setUp(self):
        self.client = APIClient()
        self.tag = Tag.objects.create(name_i18n={"en": "DP"}, slug="dp")
        self.basic = make_user("tag-basic")

    def test_anonymous_can_list(self):
        response = self.client.get(reverse(TAG_LIST))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_anonymous_can_retrieve(self):
        response = self.client.get(reverse(TAG_DETAIL, args=[self.tag.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_anonymous_cannot_create(self):
        response = self.client.post(
            reverse(TAG_LIST), {"name_i18n": {"en": "X"}, "slug": "x"}, format="json"
        )
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_authenticated_can_create(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            reverse(TAG_LIST), {"name_i18n": {"en": "New"}, "slug": "new"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_authenticated_can_update(self):
        self.client.force_authenticate(self.basic)
        response = self.client.patch(
            reverse(TAG_DETAIL, args=[self.tag.id]), {"name_i18n": {"en": "DP2"}}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_authenticated_can_destroy(self):
        self.client.force_authenticate(self.basic)
        response = self.client.delete(reverse(TAG_DETAIL, args=[self.tag.id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ProblemViewSet: visibility (get_queryset branches)
# ---------------------------------------------------------------------------

class ProblemVisibilityTests(DjangoTestCase):
    """Cover ProblemViewSet.get_queryset branches (views.py:55-68)."""

    def setUp(self):
        self.client = APIClient()
        self.creator = make_user("vis-creator", role=User.Roles.PROBLEM_CREATOR)
        self.approved = make_problem(author=self.creator, status=Problem.ProblemStatus.APPROVED)
        self.draft = make_problem(author=self.creator, status=Problem.ProblemStatus.DRAFT)
        self.pending = make_problem(author=self.creator, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.private = make_problem(author=self.creator, status=Problem.ProblemStatus.PRIVATE)

    def ids(self, response):
        return {row["id"] for row in response.data}

    def test_anonymous_sees_only_approved(self):
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response), {self.approved.id})

    def test_basic_user_sees_only_approved(self):
        self.client.force_authenticate(make_user("vis-basic"))
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(self.ids(response), {self.approved.id})

    def test_author_sees_approved_plus_own_draft_and_pending(self):
        self.client.force_authenticate(self.creator)
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(
            self.ids(response), {self.approved.id, self.draft.id, self.pending.id}
        )

    def test_staff_sees_everything(self):
        staff = make_user("vis-staff", is_staff=True)
        self.client.force_authenticate(staff)
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(
            self.ids(response),
            {self.approved.id, self.draft.id, self.pending.id, self.private.id},
        )

    def test_admin_role_sees_everything(self):
        admin = make_user("vis-admin", role=User.Roles.ADMIN)
        self.client.force_authenticate(admin)
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(len(response.data), 4)

    def test_verifier_role_sees_everything(self):
        verifier = make_user("vis-verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.client.force_authenticate(verifier)
        response = self.client.get(reverse(PROBLEM_LIST))
        self.assertEqual(len(response.data), 4)

    def test_anonymous_retrieve_approved_uses_detail_serializer(self):
        make_testcase(self.approved, is_sample=True)
        response = self.client.get(reverse(PROBLEM_DETAIL, args=[self.approved.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("test_cases", response.data)  # ProblemDetailSerializer branch

    def test_author_can_retrieve_own_draft(self):
        self.client.force_authenticate(self.creator)
        response = self.client.get(reverse(PROBLEM_DETAIL, args=[self.draft.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_basic_user_cannot_retrieve_others_draft(self):
        self.client.force_authenticate(make_user("vis-basic2"))
        response = self.client.get(reverse(PROBLEM_DETAIL, args=[self.draft.id]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# ProblemViewSet: create + the get_permissions chain
# ---------------------------------------------------------------------------

class ProblemCreateAPITests(DjangoTestCase):
    """Cover ProblemViewSet.get_permissions create/else branches (views.py:30-41)."""

    def setUp(self):
        self.client = APIClient()
        self.payload = {"title_i18n": {"en": "T"}, "statement_i18n": {"en": "S"}}

    def test_anonymous_cannot_create(self):
        response = self.client.post(reverse(PROBLEM_LIST), self.payload, format="json")
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_basic_role_cannot_create(self):
        self.client.force_authenticate(make_user("pc-basic"))
        response = self.client.post(reverse(PROBLEM_LIST), self.payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creator_can_create_with_author_auto_set_and_tags(self):
        creator = make_user("pc-creator", role=User.Roles.PROBLEM_CREATOR)
        tag = Tag.objects.create(name_i18n={"en": "Arrays"}, slug="arrays")
        self.client.force_authenticate(creator)
        response = self.client.post(
            reverse(PROBLEM_LIST), dict(self.payload, tag_ids=[tag.id]), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        problem = Problem.objects.get(id=response.data["id"])
        self.assertEqual(problem.author, creator)
        self.assertEqual(list(problem.tags.values_list("id", flat=True)), [tag.id])

    def test_create_overrides_explicit_author_with_request_user(self):
        creator = make_user("pc-creator2", role=User.Roles.PROBLEM_CREATOR)
        someone = make_user("pc-someone")
        self.client.force_authenticate(creator)
        response = self.client.post(
            reverse(PROBLEM_LIST), dict(self.payload, author_id=someone.id), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Problem.objects.get(id=response.data["id"]).author, creator)

    def test_options_metadata_action_falls_through_to_admin_permission(self):
        # action == 'metadata' hits the else branch -> IsAdminUser; anonymous
        # is denied as 401 because JWTAuthentication issues a challenge header.
        response = self.client.options(reverse(PROBLEM_LIST))
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


# ---------------------------------------------------------------------------
# ProblemViewSet: update/destroy (ProblemObjectPermissions arcs)
# ---------------------------------------------------------------------------

class ProblemUpdateDestroyAPITests(DjangoTestCase):
    """Cover ProblemObjectPermissions has_object_permission arcs via API."""

    def setUp(self):
        self.client = APIClient()
        self.author = make_user("ud-author", role=User.Roles.PROBLEM_CREATOR)

    def patch(self, user, problem, payload=None):
        self.client.force_authenticate(user)
        return self.client.patch(
            reverse(PROBLEM_DETAIL, args=[problem.id]), payload or {"title_i18n": {"en": "U"}}, format="json"
        )

    def test_author_can_update_own_draft(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.assertEqual(self.patch(self.author, problem).status_code, status.HTTP_200_OK)

    def test_author_cannot_update_own_private_not_in_queryset(self):
        # ProblemObjectPermissions would allow update of own PRIVATE
        # (views.py:55), but get_queryset hides PRIVATE even from its author,
        # so the request 404s in get_object before object permissions run.
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PRIVATE)
        self.assertEqual(self.patch(self.author, problem).status_code, status.HTTP_404_NOT_FOUND)

    def test_author_cannot_update_own_approved(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        self.assertEqual(self.patch(self.author, problem).status_code, status.HTTP_403_FORBIDDEN)

    def test_author_cannot_update_own_pending(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.assertEqual(self.patch(self.author, problem).status_code, status.HTTP_403_FORBIDDEN)

    def test_other_user_cannot_update_others_draft(self):
        # Others' drafts are filtered out of a basic user's queryset, so the
        # request 404s in get_object rather than reaching a 403.
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.assertEqual(self.patch(make_user("ud-other"), problem).status_code, status.HTTP_404_NOT_FOUND)

    def test_verifier_can_update_any(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        verifier = make_user("ud-verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.assertEqual(self.patch(verifier, problem).status_code, status.HTTP_200_OK)

    def test_admin_role_can_update_any(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        admin = make_user("ud-admin", role=User.Roles.ADMIN)
        self.assertEqual(self.patch(admin, problem).status_code, status.HTTP_200_OK)

    def test_superuser_can_update_any(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        superuser = make_user("ud-super")
        superuser.is_superuser = True
        superuser.save()
        self.assertEqual(self.patch(superuser, problem).status_code, status.HTTP_200_OK)

    def test_author_can_destroy_own_draft(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.author)
        response = self.client.delete(reverse(PROBLEM_DETAIL, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_author_cannot_destroy_own_approved(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        self.client.force_authenticate(self.author)
        response = self.client.delete(reverse(PROBLEM_DETAIL, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_verifier_can_destroy_any(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(make_user("ud-verifier2", role=User.Roles.PROBLEM_VERIFIER))
        response = self.client.delete(reverse(PROBLEM_DETAIL, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------------------
# ProblemViewSet: workflow actions (submit / approve / reject)
# ---------------------------------------------------------------------------

class ProblemWorkflowAPITests(DjangoTestCase):
    """Cover submit_for_approval / approve_problem / reject_problem branches."""

    def setUp(self):
        self.client = APIClient()
        self.author = make_user("wf-author", role=User.Roles.PROBLEM_CREATOR)
        self.verifier = make_user("wf-verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.admin = make_user("wf-admin", role=User.Roles.ADMIN)

    def test_author_submits_draft_for_approval(self):
        problem = make_problem(
            author=self.author,
            status=Problem.ProblemStatus.DRAFT,
            verifier=self.verifier,
            verifier_feedback="stale feedback",
        )
        self.client.force_authenticate(self.author)
        response = self.client.post(reverse(PROBLEM_SUBMIT, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.PENDING_APPROVAL)
        self.assertIsNone(problem.verifier)
        self.assertIsNone(problem.verifier_feedback)

    def test_author_cannot_resubmit_pending(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.author)
        response = self.client.post(reverse(PROBLEM_SUBMIT, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_submit_non_draft_returns_400(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse(PROBLEM_SUBMIT, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verifier_approves_pending_problem_with_feedback(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            reverse(PROBLEM_APPROVE, args=[problem.id]), {"feedback": "looks good"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.APPROVED)
        self.assertEqual(problem.verifier, self.verifier)
        self.assertEqual(problem.verifier_feedback, "looks good")

    def test_approve_non_pending_returns_400(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(reverse(PROBLEM_APPROVE, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_basic_user_cannot_approve(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(make_user("wf-basic"))
        response = self.client.post(reverse(PROBLEM_APPROVE, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_approve(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        response = self.client.post(reverse(PROBLEM_APPROVE, args=[problem.id]))
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_reject_without_feedback_returns_400(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(reverse(PROBLEM_REJECT, args=[problem.id]))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verifier_rejects_pending_problem(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.PENDING_APPROVAL)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            reverse(PROBLEM_REJECT, args=[problem.id]), {"feedback": "needs work"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.PRIVATE)
        self.assertEqual(problem.verifier, self.verifier)
        self.assertEqual(problem.verifier_feedback, "needs work")

    def test_reject_non_pending_returns_400(self):
        problem = make_problem(author=self.author, status=Problem.ProblemStatus.APPROVED)
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            reverse(PROBLEM_REJECT, args=[problem.id]), {"feedback": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# TestCaseViewSet API
# ---------------------------------------------------------------------------

class TestCaseViewSetAPITests(DjangoTestCase):
    """Cover TestCaseViewSet get_queryset / perform_create / perform_update /
    perform_destroy branches (views.py:108-145)."""

    def setUp(self):
        self.client = APIClient()
        self.author = make_user("tcv-author", role=User.Roles.PROBLEM_CREATOR)
        self.basic = make_user("tcv-basic")
        self.admin = make_user("tcv-admin", role=User.Roles.ADMIN)
        self.verifier = make_user("tcv-verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.other_problem = make_problem(author=self.author, status=Problem.ProblemStatus.DRAFT)
        self.tc_sample = make_testcase(self.problem, is_sample=True, order=0)
        self.tc_hidden = make_testcase(self.problem, is_sample=False, order=1)

    def create_payload(self, problem=None):
        return {
            "problem": (problem or self.problem).id,
            "input_data": "2",
            "expected_output_data": "3",
        }

    def test_anonymous_cannot_list(self):
        response = self.client.get(reverse(TESTCASE_LIST))
        self.assertIn(response.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_list_without_param_returns_all(self):
        self.client.force_authenticate(self.basic)
        response = self.client.get(reverse(TESTCASE_LIST))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_list_with_problem_id_param_filters(self):
        make_testcase(self.other_problem, order=0)
        self.client.force_authenticate(self.basic)
        response = self.client.get(reverse(TESTCASE_LIST), {"problem_id": self.problem.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {row["id"] for row in response.data}, {self.tc_sample.id, self.tc_hidden.id}
        )

    def test_detail_hides_non_sample_output_for_basic_user(self):
        self.client.force_authenticate(self.basic)
        response = self.client.get(reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("expected_output_data", response.data)

    def test_detail_shows_sample_output_for_basic_user(self):
        self.client.force_authenticate(self.basic)
        response = self.client.get(reverse(TESTCASE_DETAIL, args=[self.tc_sample.id]))
        self.assertIn("expected_output_data", response.data)

    def test_detail_shows_hidden_output_for_admin(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]))
        self.assertIn("expected_output_data", response.data)

    def test_detail_shows_hidden_output_for_author(self):
        self.client.force_authenticate(self.author)
        response = self.client.get(reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]))
        self.assertIn("expected_output_data", response.data)

    def test_admin_can_create_testcase(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(reverse(TESTCASE_LIST), self.create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_verifier_can_create_testcase(self):
        self.client.force_authenticate(self.verifier)
        response = self.client.post(reverse(TESTCASE_LIST), self.create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_author_cannot_create_testcase_for_own_problem(self):
        # action 'create' is not in the author's allowed actions in
        # ProblemObjectPermissions, so perform_create denies it.
        self.client.force_authenticate(self.author)
        response = self.client.post(reverse(TESTCASE_LIST), self.create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_basic_user_cannot_create_testcase(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(reverse(TESTCASE_LIST), self.create_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_update_testcase(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]), {"points": 20}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_author_can_update_testcase_of_own_draft_problem(self):
        self.client.force_authenticate(self.author)
        response = self.client.patch(
            reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]), {"points": 30}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_author_can_update_testcase_of_own_private_problem(self):
        # TestCaseViewSet.get_queryset does not filter by problem status, so
        # unlike the problem endpoints this reaches ProblemObjectPermissions,
        # which allows author update of PRIVATE problems (views.py:55).
        self.problem.status = Problem.ProblemStatus.PRIVATE
        self.problem.save()
        self.client.force_authenticate(self.author)
        response = self.client.patch(
            reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]), {"points": 35}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_basic_user_cannot_update_testcase(self):
        self.client.force_authenticate(self.basic)
        response = self.client.patch(
            reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]), {"points": 40}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_destroy_testcase(self):
        self.client.force_authenticate(self.admin)
        response = self.client.delete(reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_basic_user_cannot_destroy_testcase(self):
        self.client.force_authenticate(self.basic)
        response = self.client.delete(reverse(TESTCASE_DETAIL, args=[self.tc_hidden.id]))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
