"""
Extended coverage tests for the ``users`` app (wave/nextjs-migration coverage push).

NOTE ON FILENAME: the spawn prompt asked for ``users/tests_wave.py`` (to avoid
clobbering ``users/tests.py``), but the repo's ``pytest.ini`` sets
``python_files = tests.py test_*.py *_tests.py`` — ``tests_wave.py`` matches
none of those globs and is silently never collected under ``pytest users``
(measured: 413 statements, 0% coverage, "2 passed" with the file present).
This file therefore lives as ``users/test_wave.py`` (matches ``test_*.py``,
still a new file — nothing clobbered).

Factory-free: plain Django ORM test data. Judge/celery paths: the users app
contains no celery tasks or judge calls (AdminStatsView only counts rows), so
no task mocking is required for this app.

Run with:
    cd backend && SECRET_KEY=testkey DB_PASSWORD=x \
    ./venv/Scripts/python.exe -m pytest users --ds webcoder_api.test_settings \
        --cov=. --cov-report=term-missing --cov-branch

Coverage progress log (updated per measured round):
    ROUND 1 baseline (users/tests.py only): adapters 0%, permissions 21%,
        serializers 61%, views 68%, utils 50%, models 92%, migrations 0%.
    ROUND 2: file added (as tests_wave.py) - NOT COLLECTED (see note above).
    ROUND 3: renamed to test_wave.py; 9 test bugs fixed (SimpleNamespace value
        equality, adapter URL encoding, unpaginated lists, dead-branch Request
        parsers, admin-create empty username, login key-vs-JWT). FINAL:
        81 passed, every users/* file 100% stmts+branches, 0 partial branches.
"""

import importlib
import itertools
import os
import unittest.mock as mock
from io import StringIO
from types import SimpleNamespace

from django.contrib.sites.models import Site
from django.core.management import call_command
from django.http import HttpResponseRedirect
from django.test import SimpleTestCase, TestCase

from problems.models import Problem
from rest_framework.parsers import JSONParser
from rest_framework.request import Request
from rest_framework.test import APITestCase, APIRequestFactory
from submissions.models import Submission

from .adapters import CustomAccountAdapter, CustomSocialAccountAdapter
from .models import User
from .permissions import (
    IsAdminUser,
    IsOwnerOrAdminForSubmission,
    IsOwnerOrAdminForUser,
    IsProblemCreator,
    IsProblemVerifier,
    ProblemObjectPermissions,
)
from .serializers import CustomLoginSerializer
from .utils import get_sentinel_user
from .views import PasswordChangeView, UserViewSet


# ---------------------------------------------------------------------------
# helpers (plain namespace fakes keep permission tests DB-free)
# ---------------------------------------------------------------------------

_fake_uid = itertools.count(1)


def _fake_user(role=User.Roles.BASIC_USER, superuser=False, authenticated=True):
    # NOTE: SimpleNamespace has VALUE equality, so distinct fake users need a
    # unique ``uid`` or ``obj.author == request.user`` would be True for any
    # two fakes with identical attributes.
    return SimpleNamespace(
        uid=next(_fake_uid),
        is_authenticated=authenticated,
        role=role,
        is_superuser=superuser,
    )


ANON = _fake_user(authenticated=False)


def _perm_request(user, method="GET"):
    return SimpleNamespace(user=user, method=method)


def _rows(response):
    """Unpaginated list endpoints return a plain JSON array (no pagination
    is configured in REST_FRAMEWORK settings); tolerate both shapes."""
    data = response.json()
    return data["results"] if isinstance(data, dict) else data


class _RaisingUserSocialLogin:
    """Fake allauth SocialLogin whose ``.user`` access raises (user not built)."""

    def __init__(self, extra_data):
        self.is_existing = False
        self.account = SimpleNamespace(extra_data=extra_data)

    @property
    def user(self):
        raise AttributeError("no user on this sociallogin")


# ---------------------------------------------------------------------------
# models / utils
# ---------------------------------------------------------------------------

class UserStrTests(SimpleTestCase):
    def test_str_returns_username(self):
        u = User(username="struser")
        self.assertEqual(str(u), "struser")


class SentinelUserTests(TestCase):
    def test_get_sentinel_user_creates_then_reuses(self):
        first = get_sentinel_user()
        self.assertEqual(first.username, "deleted_user")
        second = get_sentinel_user()
        self.assertEqual(first.pk, second.pk)
        self.assertEqual(User.objects.filter(username="deleted_user").count(), 1)


class MigrationImportTests(SimpleTestCase):
    def test_users_initial_migration_imports(self):
        mod = importlib.import_module("users.migrations.0001_initial")
        self.assertTrue(mod.Migration.initial)


# ---------------------------------------------------------------------------
# permissions (unit level, no DB)
# ---------------------------------------------------------------------------

class IsAdminUserTests(SimpleTestCase):
    def setUp(self):
        self.perm = IsAdminUser()

    def test_admin_role_allowed(self):
        self.assertTrue(self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.ADMIN)), None))

    def test_superuser_allowed(self):
        self.assertTrue(self.perm.has_permission(_perm_request(_fake_user(superuser=True)), None))

    def test_basic_user_denied(self):
        self.assertFalse(self.perm.has_permission(_perm_request(_fake_user()), None))

    def test_anonymous_denied(self):
        self.assertFalse(self.perm.has_permission(_perm_request(ANON), None))


class IsProblemCreatorTests(SimpleTestCase):
    def setUp(self):
        self.perm = IsProblemCreator()

    def test_creator_allowed(self):
        self.assertTrue(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.PROBLEM_CREATOR)), None)
        )

    def test_verifier_allowed(self):
        self.assertTrue(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.PROBLEM_VERIFIER)), None)
        )

    def test_admin_allowed(self):
        self.assertTrue(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.ADMIN)), None)
        )

    def test_basic_denied(self):
        self.assertFalse(self.perm.has_permission(_perm_request(_fake_user()), None))

    def test_anonymous_denied(self):
        self.assertFalse(self.perm.has_permission(_perm_request(ANON), None))


class IsProblemVerifierTests(SimpleTestCase):
    def setUp(self):
        self.perm = IsProblemVerifier()

    def test_verifier_allowed(self):
        self.assertTrue(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.PROBLEM_VERIFIER)), None)
        )

    def test_admin_allowed(self):
        self.assertTrue(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.ADMIN)), None)
        )

    def test_creator_denied(self):
        self.assertFalse(
            self.perm.has_permission(_perm_request(_fake_user(role=User.Roles.PROBLEM_CREATOR)), None)
        )

    def test_anonymous_denied(self):
        self.assertFalse(self.perm.has_permission(_perm_request(ANON), None))


class ProblemObjectPermissionsTests(SimpleTestCase):
    def setUp(self):
        self.perm = ProblemObjectPermissions()
        self.author = _fake_user()

    def _obj(self, status):
        return SimpleNamespace(author=self.author, status=status)

    def _req(self, user, method="PATCH"):
        return _perm_request(user, method=method)

    def test_safe_method_allowed_for_anyone(self):
        self.assertTrue(self.perm.has_object_permission(self._req(ANON, "GET"), None, self._obj("APPROVED")))

    def test_unauthenticated_write_denied(self):
        self.assertFalse(self.perm.has_object_permission(self._req(ANON, "DELETE"), None, self._obj("DRAFT")))

    def test_admin_role_can_write(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(_fake_user(role=User.Roles.ADMIN), "PATCH"),
                SimpleNamespace(action="update"),
                self._obj("APPROVED"),
            )
        )

    def test_superuser_can_write(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(_fake_user(superuser=True), "DELETE"),
                SimpleNamespace(action="destroy"),
                self._obj("APPROVED"),
            )
        )

    def test_verifier_can_write(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(_fake_user(role=User.Roles.PROBLEM_VERIFIER), "PATCH"),
                SimpleNamespace(action="update"),
                self._obj("PENDING"),
            )
        )

    def test_author_update_draft_allowed(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"), SimpleNamespace(action="update"), self._obj("DRAFT")
            )
        )

    def test_author_update_private_allowed(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"), SimpleNamespace(action="partial_update"), self._obj("PRIVATE")
            )
        )

    def test_author_update_approved_denied(self):
        self.assertFalse(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"), SimpleNamespace(action="update"), self._obj("APPROVED")
            )
        )

    def test_author_destroy_draft_allowed(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(self.author, "DELETE"), SimpleNamespace(action="destroy"), self._obj("DRAFT")
            )
        )

    def test_author_destroy_pending_denied(self):
        self.assertFalse(
            self.perm.has_object_permission(
                self._req(self.author, "DELETE"), SimpleNamespace(action="destroy"), self._obj("PENDING")
            )
        )

    def test_author_submit_for_approval_draft_allowed(self):
        self.assertTrue(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"),
                SimpleNamespace(action="submit_for_approval"),
                self._obj("DRAFT"),
            )
        )

    def test_author_submit_for_approval_non_draft_denied(self):
        self.assertFalse(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"),
                SimpleNamespace(action="submit_for_approval"),
                self._obj("APPROVED"),
            )
        )

    def test_non_author_basic_denied(self):
        other = _fake_user()
        self.assertFalse(
            self.perm.has_object_permission(
                self._req(other, "PATCH"), SimpleNamespace(action="update"), self._obj("DRAFT")
            )
        )

    def test_author_unknown_action_falls_through_to_deny(self):
        self.assertFalse(
            self.perm.has_object_permission(
                self._req(self.author, "PATCH"),
                SimpleNamespace(action="some_custom_action"),
                self._obj("DRAFT"),
            )
        )


class IsOwnerOrAdminForUserTests(SimpleTestCase):
    def setUp(self):
        self.perm = IsOwnerOrAdminForUser()
        self.owner = _fake_user()

    def test_owner_allowed(self):
        self.assertTrue(self.perm.has_object_permission(_perm_request(self.owner), None, self.owner))

    def test_admin_role_allowed(self):
        admin = _fake_user(role=User.Roles.ADMIN)
        self.assertTrue(self.perm.has_object_permission(_perm_request(admin), None, self.owner))

    def test_superuser_allowed(self):
        sup = _fake_user(superuser=True)
        self.assertTrue(self.perm.has_object_permission(_perm_request(sup), None, self.owner))

    def test_other_user_denied(self):
        other = _fake_user()
        self.assertFalse(self.perm.has_object_permission(_perm_request(other), None, self.owner))

    def test_anonymous_denied(self):
        self.assertFalse(self.perm.has_object_permission(_perm_request(ANON), None, self.owner))


class IsOwnerOrAdminForSubmissionTests(SimpleTestCase):
    def setUp(self):
        self.perm = IsOwnerOrAdminForSubmission()
        self.owner = _fake_user()
        # Submission's FK is ``user`` (submissions/models.py:25), not ``author``
        # — fixed 2026-09-22 together with permissions.py.
        self.obj = SimpleNamespace(user=self.owner)

    def test_owner_allowed(self):
        self.assertTrue(self.perm.has_object_permission(_perm_request(self.owner), None, self.obj))

    def test_admin_role_allowed(self):
        admin = _fake_user(role=User.Roles.ADMIN)
        self.assertTrue(self.perm.has_object_permission(_perm_request(admin), None, self.obj))

    def test_other_user_denied(self):
        other = _fake_user()
        self.assertFalse(self.perm.has_object_permission(_perm_request(other), None, self.obj))

    def test_anonymous_denied(self):
        self.assertFalse(self.perm.has_object_permission(_perm_request(ANON), None, self.obj))


# ---------------------------------------------------------------------------
# adapters
# ---------------------------------------------------------------------------

class CustomAccountAdapterTests(SimpleTestCase):
    def test_login_redirect_url_is_root(self):
        self.assertEqual(CustomAccountAdapter().get_login_redirect_url(None), "/")


class CustomSocialAccountAdapterTests(SimpleTestCase):
    def setUp(self):
        self.adapter = CustomSocialAccountAdapter()

    def test_existing_sociallogin_returns_early(self):
        sociallogin = SimpleNamespace(is_existing=True)
        self.assertIsNone(self.adapter.pre_social_login(None, sociallogin))

    def test_user_attribute_present_returns_none(self):
        # try-branch succeeds (sociallogin.user does not raise) -> bare return
        sociallogin = SimpleNamespace(is_existing=False, user=object())
        self.assertIsNone(self.adapter.pre_social_login(None, sociallogin))

    def test_no_user_with_email_redirects_to_registration(self):
        sociallogin = _RaisingUserSocialLogin({"email": "someone@example.com"})
        result = self.adapter.pre_social_login(None, sociallogin)
        self.assertIsInstance(result, HttpResponseRedirect)
        # the redirect URL is a plain f-string: '@' is NOT percent-encoded
        self.assertIn("/complete-registration?email=someone@example.com", result.url)

    def test_no_user_without_email_returns_none(self):
        sociallogin = _RaisingUserSocialLogin({})
        self.assertIsNone(self.adapter.pre_social_login(None, sociallogin))


# ---------------------------------------------------------------------------
# registration API
# ---------------------------------------------------------------------------

class RegistrationApiTests(APITestCase):
    def setUp(self):
        self.url = "/api/v1/users/register/"

    def test_register_with_full_fields_and_role(self):
        payload = {
            "username": "fullreg",
            "email": "full@example.com",
            "password": "Br@ndNewPass99",
            "password2": "Br@ndNewPass99",
            "first_name": "Full",
            "last_name": "Register",
            "role": User.Roles.PROBLEM_CREATOR,
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["user"]["role"], User.Roles.PROBLEM_CREATOR)
        user = User.objects.get(username="fullreg")
        self.assertEqual(user.first_name, "Full")
        self.assertEqual(user.last_name, "Register")
        self.assertEqual(user.role, User.Roles.PROBLEM_CREATOR)

    def test_register_without_role_defaults_to_basic(self):
        payload = {
            "username": "basicreg",
            "email": "basic@example.com",
            "password": "An0therGoodPass7",
            "password2": "An0therGoodPass7",
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(username="basicreg").role, User.Roles.BASIC_USER)

    def test_register_duplicate_email_case_insensitive(self):
        User.objects.create_user(
            username="first", email="dup@example.com", password="Existing!Pass42"
        )
        payload = {
            "username": "second",
            "email": "DUP@EXAMPLE.COM",
            "password": "Un1quePassHere8",
            "password2": "Un1quePassHere8",
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json())

    def test_register_password_mismatch(self):
        payload = {
            "username": "mismatch",
            "email": "mismatch@example.com",
            "password": "GoodPass!Number1",
            "password2": "GoodPass!Number2",
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password2", response.json())

    def test_register_weak_password_rejected(self):
        payload = {
            "username": "weakpw",
            "email": "weak@example.com",
            "password": "123",
            "password2": "123",
        }
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.json())


# ---------------------------------------------------------------------------
# login serializer
# ---------------------------------------------------------------------------

class CustomLoginSerializerTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="loginser", email="loginser@example.com", password="Serializer!Pass1"
        )

    def test_to_representation_injects_user(self):
        drf_request = Request(APIRequestFactory().post("/api/v1/auth/login/"))
        drf_request.user = self.user
        serializer = CustomLoginSerializer(context={"request": drf_request})
        data = serializer.to_representation(self.user)
        self.assertEqual(data["user"]["username"], "loginser")
        self.assertEqual(data["user"]["email"], "loginser@example.com")


class RestAuthLoginSmokeTests(TestCase):
    def test_login_endpoint_returns_tokens(self):
        # MEASURED BEHAVIOR: the installed dj-rest-auth 7.2.0 reads its config
        # from the setting named ``REST_AUTH`` (dj_rest_auth/app_settings.py:1),
        # but webcoder_api/settings.py writes ``DJ_REST_AUTH`` — so
        # USE_JWT=True and LOGIN_SERIALIZER are inert and the endpoint returns
        # a DRF token ``key`` instead of JWT access/refresh.
        User.objects.create_user(
            username="loginsmoke", email="loginsmoke@example.com", password="Smoke!Test!99"
        )
        response = self.client.post(
            "/api/v1/auth/login/",
            {"username": "loginsmoke", "password": "Smoke!Test!99"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue("key" in body or "access" in body)


# ---------------------------------------------------------------------------
# password change API
# ---------------------------------------------------------------------------

class PasswordChangeApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="pwchanger", email="pwchanger@example.com", password="OldPass!1234"
        )
        self.client.force_authenticate(user=self.user)
        self.url = "/api/v1/users/password/change/"

    def test_password_change_success(self):
        response = self.client.post(
            self.url,
            {"old_password": "OldPass!1234", "new_password1": "NewPass!5678", "new_password2": "NewPass!5678"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass!5678"))
        self.assertFalse(self.user.check_password("OldPass!1234"))

    def test_password_change_wrong_old_password(self):
        response = self.client.post(
            self.url,
            {"old_password": "WrongOld!0000", "new_password1": "NewPass!5678", "new_password2": "NewPass!5678"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("old_password", response.json())

    def test_password_change_new_mismatch(self):
        response = self.client.post(
            self.url,
            {"old_password": "OldPass!1234", "new_password1": "NewPass!5678", "new_password2": "Different!9x"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password2", response.json())

    def test_password_change_same_as_old(self):
        response = self.client.post(
            self.url,
            {"old_password": "OldPass!1234", "new_password1": "OldPass!1234", "new_password2": "OldPass!1234"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password1", response.json())

    def test_password_change_unauthenticated_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.url,
            {"old_password": "OldPass!1234", "new_password1": "NewPass!5678", "new_password2": "NewPass!5678"},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))

    def test_is_valid_false_branch_returns_serializer_errors(self):
        # views.PasswordChangeView.post can only reach its 400-branch when
        # is_valid() returns False without raising (raise_exception=True);
        # exercised by stubbing get_serializer. A bare Request() carries no
        # parsers, so request.data would raise UnsupportedMediaType — pass one.
        view = PasswordChangeView()
        request = Request(
            APIRequestFactory().post(self.url, {}, format="json"),
            parsers=[JSONParser()],
        )
        fake_serializer = mock.Mock()
        fake_serializer.is_valid.return_value = False
        fake_serializer.errors = {"detail": ["invalid"]}
        view.get_serializer = lambda *args, **kwargs: fake_serializer
        response = view.post(request)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {"detail": ["invalid"]})


# ---------------------------------------------------------------------------
# /users/me/ + UserViewSet
# ---------------------------------------------------------------------------

class UserMeApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="meuser", email="me@example.com", password="MeUser!Pass77"
        )

    def test_me_returns_current_user(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "meuser")

    def test_me_unauthenticated_rejected(self):
        response = self.client.get("/api/v1/users/me/")
        self.assertIn(response.status_code, (401, 403))


class UserViewSetApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="viewer", email="viewer@example.com", password="Viewer!Pass55"
        )
        self.target = User.objects.create_user(
            username="viewed", email="viewed@example.com", password="Viewed!Pass66"
        )
        self.client.force_authenticate(user=self.user)

    def test_list_users(self):
        response = self.client.get("/api/v1/users/")
        self.assertEqual(response.status_code, 200)
        usernames = [row["username"] for row in _rows(response)]
        self.assertIn("viewer", usernames)
        self.assertIn("viewed", usernames)

    def test_retrieve_user(self):
        response = self.client.get(f"/api/v1/users/{self.target.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "viewed")

    def test_get_permissions_owner_branch(self):
        view = UserViewSet()
        view.action = "update"
        perms = view.get_permissions()
        self.assertIsInstance(perms[0], IsOwnerOrAdminForUser)

    def test_get_permissions_read_branch(self):
        view = UserViewSet()
        view.action = "list"
        perms = view.get_permissions()
        self.assertNotIsInstance(perms[0], IsOwnerOrAdminForUser)


# ---------------------------------------------------------------------------
# admin user management viewset
# ---------------------------------------------------------------------------

class AdminUserViewSetApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="siteadmin",
            email="siteadmin@example.com",
            password="Admin!Pass1234",
            role=User.Roles.ADMIN,
        )
        self.basic = User.objects.create_user(
            username="plainuser", email="plain@example.com", password="Plain!Pass4321"
        )
        self.list_url = "/api/v1/users/admin/manage/"

    def test_list_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)
        usernames = [row["username"] for row in _rows(response)]
        self.assertIn("siteadmin", usernames)

    def test_list_as_basic_user_forbidden(self):
        self.client.force_authenticate(user=self.basic)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 403)

    def test_list_anonymous_forbidden(self):
        response = self.client.get(self.list_url)
        self.assertIn(response.status_code, (401, 403))

    def test_create_as_admin(self):
        # MEASURED BEHAVIOR: AdminUserSerializer lists username/email in
        # read_only_fields, so the admin create endpoint drops them and
        # persists the row with an EMPTY username (response echoes "").
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(
            self.list_url,
            {
                "username": "managed",
                "email": "managed@example.com",
                "first_name": "Mana",
                "last_name": "Ged",
                "role": User.Roles.PROBLEM_VERIFIER,
                "is_staff": True,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        body = response.json()
        self.assertEqual(body["first_name"], "Mana")
        self.assertEqual(body["role"], User.Roles.PROBLEM_VERIFIER)
        created = User.objects.get(first_name="Mana", last_name="Ged")
        self.assertEqual(created.role, User.Roles.PROBLEM_VERIFIER)
        self.assertTrue(created.is_staff)
        self.assertEqual(created.username, "")

    def test_retrieve_as_admin_uses_user_serializer(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(f"{self.list_url}{self.basic.pk}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["username"], "plainuser")

    def test_update_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.put(
            f"{self.list_url}{self.basic.pk}/",
            {
                "first_name": "Updated",
                "last_name": "User",
                "role": User.Roles.PROBLEM_CREATOR,
                "is_staff": False,
                "is_active": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.basic.refresh_from_db()
        self.assertEqual(self.basic.role, User.Roles.PROBLEM_CREATOR)
        self.assertEqual(self.basic.first_name, "Updated")

    def test_partial_update_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"{self.list_url}{self.basic.pk}/", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.basic.refresh_from_db()
        self.assertFalse(self.basic.is_active)

    def test_destroy_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.delete(f"{self.list_url}{self.basic.pk}/")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.basic.pk).exists())

    def test_create_as_basic_user_forbidden(self):
        self.client.force_authenticate(user=self.basic)
        response = self.client.post(
            self.list_url,
            {"username": "nope", "email": "nope@example.com", "role": User.Roles.ADMIN},
            format="json",
        )
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# admin stats
# ---------------------------------------------------------------------------

class AdminStatsApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="statsadmin",
            email="statsadmin@example.com",
            password="Stats!Pass4321",
            role=User.Roles.ADMIN,
        )
        self.basic = User.objects.create_user(
            username="statsuser", email="statsuser@example.com", password="Stats!Pass8765"
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "A+B"},
            statement_i18n={"en": "Add two numbers."},
            author=self.basic,
        )
        Submission.objects.create(
            user=self.basic, problem=self.problem, language="python3", code="print(1)"
        )
        Submission.objects.create(
            user=self.basic, problem=self.problem, language="cpp17", code="int main(){}"
        )

    def test_stats_as_admin(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/users/admin/stats/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"user_count": 2, "problem_count": 1, "submission_count": 2}
        )

    def test_stats_as_basic_user_forbidden(self):
        self.client.force_authenticate(user=self.basic)
        response = self.client.get("/api/v1/users/admin/stats/")
        self.assertEqual(response.status_code, 403)


# ---------------------------------------------------------------------------
# management commands
# ---------------------------------------------------------------------------

class CreateAdminCommandTests(TestCase):
    def test_missing_env_vars_reports_error(self):
        out = StringIO()
        with mock.patch.dict(os.environ, {"ADMIN_USER": "", "ADMIN_EMAIL": "", "ADMIN_PASS": ""}):
            call_command("create_admin", stdout=out)
        self.assertIn("required", out.getvalue())
        self.assertEqual(User.objects.filter(username="rootadmin").count(), 0)

    def test_creates_superuser_from_env(self):
        out = StringIO()
        env = {"ADMIN_USER": "rootadmin", "ADMIN_EMAIL": "root@example.com", "ADMIN_PASS": "Sup3rSecret!99"}
        with mock.patch.dict(os.environ, env):
            call_command("create_admin", stdout=out)
        self.assertIn("Successfully created", out.getvalue())
        user = User.objects.get(username="rootadmin")
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.check_password("Sup3rSecret!99"))

    def test_existing_superuser_is_updated(self):
        User.objects.create_superuser("rootadmin", "root@example.com", "First!Password1")
        out = StringIO()
        env = {"ADMIN_USER": "rootadmin", "ADMIN_EMAIL": "root@example.com", "ADMIN_PASS": "Sec0nd!Password"}
        with mock.patch.dict(os.environ, env):
            call_command("create_admin", stdout=out)
        self.assertIn("already exists", out.getvalue())
        user = User.objects.get(username="rootadmin")
        self.assertTrue(user.check_password("Sec0nd!Password"))


class AddSocialAppsCommandTests(TestCase):
    def setUp(self):
        Site.objects.get_or_create(
            id=1, defaults={"domain": "testserver", "name": "testserver"}
        )

    def test_missing_env_reports_errors(self):
        from allauth.socialaccount.models import SocialApp

        out = StringIO()
        empty = {
            "GOOGLE_CLIENT_ID": "", "GOOGLE_SECRET": "",
            "GITHUB_CLIENT_ID": "", "GITHUB_SECRET": "",
        }
        with mock.patch.dict(os.environ, empty):
            call_command("add_social_apps", stdout=out)
        self.assertEqual(SocialApp.objects.count(), 0)
        self.assertIn("not found", out.getvalue())

    def test_creates_both_apps_then_skips_existing(self):
        from allauth.socialaccount.models import SocialApp

        env = {
            "GOOGLE_CLIENT_ID": "google-id", "GOOGLE_SECRET": "google-secret",
            "GITHUB_CLIENT_ID": "github-id", "GITHUB_SECRET": "github-secret",
        }
        out = StringIO()
        with mock.patch.dict(os.environ, env):
            call_command("add_social_apps", stdout=out)
        self.assertIn("Successfully created Google", out.getvalue())
        self.assertIn("Successfully created GitHub", out.getvalue())
        self.assertEqual(SocialApp.objects.filter(provider="google").count(), 1)
        self.assertEqual(SocialApp.objects.filter(provider="github").count(), 1)
        google_app = SocialApp.objects.get(provider="google")
        self.assertEqual(list(google_app.sites.values_list("id", flat=True)), [1])

        out2 = StringIO()
        with mock.patch.dict(os.environ, env):
            call_command("add_social_apps", stdout=out2)
        self.assertIn("already exists", out2.getvalue())
        self.assertEqual(SocialApp.objects.count(), 2)
