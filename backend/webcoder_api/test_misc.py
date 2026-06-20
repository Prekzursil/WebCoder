"""Coverage for the celery debug task and the OAuth social-login view wiring."""

from unittest import mock

from django.test import TestCase

from users.api.oauth.github.views import GitHubLogin, GitHubTokenLogin
from users.api.oauth.google.views import GoogleLogin, GoogleTokenLogin
from users.views import GithubLogin as UsersGithubLogin
from users.views import GoogleLogin as UsersGoogleLogin
from webcoder_api.celery import debug_task


class CeleryDebugTaskTest(TestCase):
    def test_debug_task_prints_request(self):
        # bind=True: Celery injects the task instance as ``self`` automatically,
        # so calling the task runs the body (which prints self.request).
        with mock.patch("builtins.print") as printer:
            debug_task()
        printer.assert_called_once()


class OAuthViewWiringTest(TestCase):
    def test_oauth_view_classes_are_configured(self):
        # Importing + referencing the social-login subclasses exercises their
        # class bodies (adapter_class / client_class / callback_url attributes).
        self.assertTrue(hasattr(GitHubLogin, "adapter_class"))
        self.assertTrue(hasattr(GitHubTokenLogin, "adapter_class"))
        self.assertTrue(hasattr(GoogleLogin, "adapter_class"))
        self.assertTrue(hasattr(GoogleTokenLogin, "adapter_class"))
        self.assertIn("github", GitHubLogin.callback_url)
        self.assertIn("google", GoogleLogin.callback_url)

    def test_users_views_social_login_classes(self):
        self.assertEqual(UsersGoogleLogin.callback_url, "http://localhost:3000/login")
        self.assertEqual(UsersGithubLogin.callback_url, "http://localhost:3000/login")
