"""Full coverage for the users app: models, serializers, views, permissions,
utils, adapters."""

from typing import cast
from unittest import mock

from django.http import HttpResponseRedirect
from django.test import RequestFactory, TestCase
from rest_framework import status
from rest_framework.test import APIClient

from users.adapters import CustomAccountAdapter, CustomSocialAccountAdapter
from users.models import User
from users.permissions import (
    IsAdminUser,
    IsOwnerOrAdminForSubmission,
    IsOwnerOrAdminForUser,
    IsProblemCreator,
    IsProblemVerifier,
    ProblemObjectPermissions,
)
from users.serializers import (
    PasswordChangeSerializer,
    UserRegistrationSerializer,
)
from users.utils import get_sentinel_user
from problems.models import Problem
from submissions.models import Submission


class UserModelTest(TestCase):
    def test_str(self):
        self.assertEqual(str(User(username="bob")), "bob")


class SentinelUserTest(TestCase):
    def test_get_or_create_sentinel(self):
        u = get_sentinel_user()
        self.assertEqual(u.username, "deleted_user")
        # idempotent
        self.assertEqual(get_sentinel_user().pk, u.pk)


class RegistrationSerializerTest(TestCase):
    def _ctx(self):
        request = RequestFactory().post("/")
        return {"request": request}

    def test_email_already_exists(self):
        User.objects.create_user(username="x", email="dup@example.com", password="p")
        s = UserRegistrationSerializer(
            data={
                "username": "y",
                "email": "DUP@example.com",
                "password": "Sterk123!",
                "password2": "Sterk123!",
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("email", s.errors)

    def test_password_mismatch(self):
        s = UserRegistrationSerializer(
            data={
                "username": "y",
                "email": "u@example.com",
                "password": "Sterk123!",
                "password2": "different",
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("password2", s.errors)

    def test_create_with_optional_fields(self):
        s = UserRegistrationSerializer(
            data={
                "username": "newuser",
                "email": "new@example.com",
                "password": "Sterk123!",
                "password2": "Sterk123!",
                "first_name": "First",
                "last_name": "Last",
                "role": User.Roles.PROBLEM_CREATOR,
            }
        )
        self.assertTrue(s.is_valid(), s.errors)
        user = s.save()
        self.assertEqual(user.first_name, "First")
        self.assertEqual(user.role, User.Roles.PROBLEM_CREATOR)


class PasswordChangeSerializerTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="OldPass123!")
        self.request = RequestFactory().post("/")
        self.request.user = self.user

    def _ser(self, data):
        return PasswordChangeSerializer(data=data, context={"request": self.request})

    def test_wrong_old_password(self):
        s = self._ser(
            {
                "old_password": "wrong",
                "new_password1": "NewPass123!",
                "new_password2": "NewPass123!",
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("old_password", s.errors)

    def test_new_passwords_mismatch(self):
        s = self._ser(
            {
                "old_password": "OldPass123!",
                "new_password1": "NewPass123!",
                "new_password2": "Other123!",
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("new_password2", s.errors)

    def test_new_same_as_old(self):
        s = self._ser(
            {
                "old_password": "OldPass123!",
                "new_password1": "OldPass123!",
                "new_password2": "OldPass123!",
            }
        )
        self.assertFalse(s.is_valid())
        self.assertIn("new_password1", s.errors)

    def test_successful_change_saves(self):
        s = self._ser(
            {
                "old_password": "OldPass123!",
                "new_password1": "BrandNew123!",
                "new_password2": "BrandNew123!",
            }
        )
        self.assertTrue(s.is_valid(), s.errors)
        s.save()
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("BrandNew123!"))


class PermissionsTest(TestCase):
    def setUp(self):
        self.factory = RequestFactory()
        self.admin = User.objects.create_user(
            username="admin", password="p", role=User.Roles.ADMIN
        )
        self.verifier = User.objects.create_user(
            username="ver", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.creator = User.objects.create_user(
            username="cre", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.basic = User.objects.create_user(
            username="basic", password="p", role=User.Roles.BASIC_USER
        )

    def _req(self, user, method="POST"):
        request = getattr(self.factory, method.lower())("/")
        request.user = user
        return request

    def test_is_admin_user(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(IsAdminUser().has_permission(self._req(AnonymousUser()), None))
        self.assertTrue(IsAdminUser().has_permission(self._req(self.admin), None))
        self.assertFalse(IsAdminUser().has_permission(self._req(self.basic), None))

    def test_is_problem_creator(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(
            IsProblemCreator().has_permission(self._req(AnonymousUser()), None)
        )
        self.assertTrue(
            IsProblemCreator().has_permission(self._req(self.creator), None)
        )
        self.assertFalse(IsProblemCreator().has_permission(self._req(self.basic), None))

    def test_is_problem_verifier(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(
            IsProblemVerifier().has_permission(self._req(AnonymousUser()), None)
        )
        self.assertTrue(
            IsProblemVerifier().has_permission(self._req(self.verifier), None)
        )
        self.assertFalse(
            IsProblemVerifier().has_permission(self._req(self.creator), None)
        )

    def test_problem_object_permissions_safe_method(self):
        request = self._req(self.basic, method="GET")
        problem = Problem(status=Problem.ProblemStatus.APPROVED)
        self.assertTrue(
            ProblemObjectPermissions().has_object_permission(request, None, problem)
        )

    def test_problem_object_permissions_anonymous_write(self):
        from django.contrib.auth.models import AnonymousUser

        request = self._req(AnonymousUser())
        self.assertFalse(
            ProblemObjectPermissions().has_object_permission(request, None, Problem())
        )

    def test_problem_object_permissions_admin_and_verifier(self):
        for user in (self.admin, self.verifier):
            request = self._req(user)
            self.assertTrue(
                ProblemObjectPermissions().has_object_permission(
                    request, None, Problem()
                )
            )

    def test_problem_object_permissions_author_update_draft(self):
        request = self._req(self.creator)
        view = mock.Mock(action="update")
        problem = Problem(author=self.creator, status=Problem.ProblemStatus.DRAFT)
        self.assertTrue(
            ProblemObjectPermissions().has_object_permission(request, view, problem)
        )

    def test_problem_object_permissions_author_destroy_private(self):
        request = self._req(self.creator)
        view = mock.Mock(action="destroy")
        problem = Problem(author=self.creator, status=Problem.ProblemStatus.PRIVATE)
        self.assertTrue(
            ProblemObjectPermissions().has_object_permission(request, view, problem)
        )

    def test_problem_object_permissions_author_submit(self):
        request = self._req(self.creator)
        view = mock.Mock(action="submit_for_approval")
        problem = Problem(author=self.creator, status=Problem.ProblemStatus.DRAFT)
        self.assertTrue(
            ProblemObjectPermissions().has_object_permission(request, view, problem)
        )

    def test_problem_object_permissions_author_other_action(self):
        request = self._req(self.creator)
        view = mock.Mock(action="some_other_action")
        problem = Problem(author=self.creator, status=Problem.ProblemStatus.DRAFT)
        self.assertFalse(
            ProblemObjectPermissions().has_object_permission(request, view, problem)
        )

    def test_problem_object_permissions_non_author(self):
        request = self._req(self.creator)
        view = mock.Mock(action="update")
        problem = Problem(author=self.basic, status=Problem.ProblemStatus.DRAFT)
        self.assertFalse(
            ProblemObjectPermissions().has_object_permission(request, view, problem)
        )

    def test_is_owner_or_admin_for_user(self):
        from django.contrib.auth.models import AnonymousUser

        self.assertFalse(
            IsOwnerOrAdminForUser().has_object_permission(
                self._req(AnonymousUser()), None, self.basic
            )
        )
        self.assertTrue(
            IsOwnerOrAdminForUser().has_object_permission(
                self._req(self.basic), None, self.basic
            )
        )
        self.assertTrue(
            IsOwnerOrAdminForUser().has_object_permission(
                self._req(self.admin), None, self.basic
            )
        )
        self.assertFalse(
            IsOwnerOrAdminForUser().has_object_permission(
                self._req(self.creator), None, self.basic
            )
        )

    def test_is_owner_or_admin_for_submission(self):
        from django.contrib.auth.models import AnonymousUser

        problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )
        sub = Submission.objects.create(
            user=self.basic, problem=problem, language="python3", code="x"
        )
        self.assertFalse(
            IsOwnerOrAdminForSubmission().has_object_permission(
                self._req(AnonymousUser()), None, sub
            )
        )
        self.assertTrue(
            IsOwnerOrAdminForSubmission().has_object_permission(
                self._req(self.basic), None, sub
            )
        )
        self.assertTrue(
            IsOwnerOrAdminForSubmission().has_object_permission(
                self._req(self.admin), None, sub
            )
        )
        self.assertFalse(
            IsOwnerOrAdminForSubmission().has_object_permission(
                self._req(self.creator), None, sub
            )
        )


class AdaptersTest(TestCase):
    def test_account_adapter_redirect(self):
        adapter = CustomAccountAdapter()
        self.assertEqual(adapter.get_login_redirect_url(request=None), "/")

    def test_social_adapter_existing_account_returns(self):
        adapter = CustomSocialAccountAdapter()
        sociallogin = mock.Mock(is_existing=True)
        self.assertIsNone(adapter.pre_social_login(None, sociallogin))

    def test_social_adapter_existing_user_returns(self):
        adapter = CustomSocialAccountAdapter()
        sociallogin = mock.Mock(is_existing=False)
        # Accessing .user succeeds (does not raise) -> the try-return branch.
        sociallogin.user = mock.Mock()
        self.assertIsNone(adapter.pre_social_login(None, sociallogin))

    def test_social_adapter_new_user_with_email_redirects(self):
        adapter = CustomSocialAccountAdapter()
        sociallogin = mock.Mock(is_existing=False)
        type(sociallogin).user = mock.PropertyMock(side_effect=Exception("no user"))
        sociallogin.account.extra_data = {"email": "new@example.com"}
        result = cast(HttpResponseRedirect, adapter.pre_social_login(None, sociallogin))
        self.assertIsInstance(result, HttpResponseRedirect)
        self.assertIn("new@example.com", result.headers["Location"])

    def test_social_adapter_new_user_without_email_returns_none(self):
        adapter = CustomSocialAccountAdapter()
        sociallogin = mock.Mock(is_existing=False)
        type(sociallogin).user = mock.PropertyMock(side_effect=Exception("no user"))
        sociallogin.account.extra_data = {}
        self.assertIsNone(adapter.pre_social_login(None, sociallogin))


class CustomLoginSerializerTest(TestCase):
    def test_get_user_and_to_representation(self):
        from users.serializers import CustomLoginSerializer

        user = User.objects.create_user(username="loginuser", password="p")
        request = RequestFactory().post("/")
        request.user = user
        serializer = CustomLoginSerializer(context={"request": request})
        # get_user reads request.user and serializes it.
        self.assertEqual(serializer.get_user(None)["username"], "loginuser")
        # to_representation augments the parent payload with the nested user.
        with mock.patch(
            "dj_rest_auth.serializers.LoginSerializer.to_representation",
            return_value={"key": "tok"},
        ):
            rep = serializer.to_representation(object())
        self.assertEqual(rep["user"]["username"], "loginuser")
        self.assertEqual(rep["key"], "tok")


class UserViewSetPermissionsTest(TestCase):
    def test_get_permissions_for_write_actions(self):
        from users.permissions import IsOwnerOrAdminForUser
        from users.views import UserViewSet

        view = UserViewSet()
        for action in ("update", "partial_update", "destroy"):
            view.action = action
            perms = view.get_permissions()
            self.assertTrue(any(isinstance(p, IsOwnerOrAdminForUser) for p in perms))

    def test_get_permissions_default_action(self):
        from users.views import UserViewSet

        view = UserViewSet()
        view.action = "list"
        # default (no override) -> IsAuthenticated from class attr.
        self.assertTrue(view.get_permissions())


class UserViewsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            username="admin", password="AdminPass123!", role=User.Roles.ADMIN
        )
        self.user = User.objects.create_user(
            username="regular", password="UserPass123!"
        )

    def test_registration_view_success(self):
        resp = self.client.post(
            "/api/v1/users/register/",
            {
                "username": "fresh",
                "email": "fresh@example.com",
                "password": "Sterk123!",
                "password2": "Sterk123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertIn("user", resp.json())

    def test_password_change_view_success(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/users/password/change/",
            {
                "old_password": "UserPass123!",
                "new_password1": "NewUserPass123!",
                "new_password2": "NewUserPass123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_password_change_view_invalid(self):
        self.client.force_authenticate(self.user)
        resp = self.client.post(
            "/api/v1/users/password/change/",
            {
                "old_password": "wrong",
                "new_password1": "NewUserPass123!",
                "new_password2": "NewUserPass123!",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_me_view(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/users/me/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["username"], "regular")

    def test_user_viewset_requires_auth(self):
        resp = self.client.get("/api/v1/users/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_admin_user_viewset_list(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/v1/users/admin/manage/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_admin_user_viewset_update_uses_admin_serializer(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.patch(
            f"/api/v1/users/admin/manage/{self.user.id}/",
            {"role": User.Roles.PROBLEM_CREATOR},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Roles.PROBLEM_CREATOR)

    def test_admin_user_viewset_forbidden_for_non_admin(self):
        self.client.force_authenticate(self.user)
        resp = self.client.get("/api/v1/users/admin/manage/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_stats_view(self):
        self.client.force_authenticate(self.admin)
        resp = self.client.get("/api/v1/users/admin/stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertIn("user_count", body)
        self.assertIn("problem_count", body)
        self.assertIn("submission_count", body)
