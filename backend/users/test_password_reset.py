"""Password-reset round-trip over the dj-rest-auth endpoints [ONB-1].

The roadmap's Wave-A onboarding extension calls for a verified
password-reset flow "once SP5 lands"; SP5 (env-driven mail transport,
``webcoder_api/settings.py`` EMAIL_BACKEND) has shipped, and the frontend
now links /forgot-password + /reset-password against these endpoints, so
this module pins the backend half of the contract:

- ``POST /api/v1/auth/password/reset/`` sends exactly one mail to the
  account's address and answers 200 for unknown emails too (no account
  enumeration);
- the mailed link carries a uid+token pair accepted by
  ``POST /api/v1/auth/password/reset/confirm/``;
- a confirmed reset swaps the password (old login 400, new login 200) and
  invalidates the single-use token (second confirm 400).

The locmem backend (``override_settings``) stands in for SMTP so the
outbox is inspectable; the CI/default console backend only differs in
transport.
"""

from django.contrib.auth import get_user_model
from django.core import mail
from django.core.mail.backends.locmem import EmailBackend
from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

User = get_user_model()

# dj-rest-auth mounts these with APPEND_SLASH-style tolerance: the URLconf
# pattern itself is slash-less ("password/reset"), DRF normalizes the
# trailing-slash POST to the same view. Pin the API paths the frontend
# calls (trailing slash) and assert the URLconf names resolve to the
# canonical prefixes.
RESET_URL = "/api/v1/auth/password/reset/"
CONFIRM_URL = "/api/v1/auth/password/reset/confirm/"
LOGIN_URL = "/api/v1/auth/login/"


def _uid_and_token_from_mail(message) -> tuple[str, str]:
    """Extract (uid, token) from a dj-rest-auth reset email body.

    The link points at the frontend route
    ``/reset-password?uid=...&token=...`` (PASSWORD_RESET_URL — settings
    and ``docs/RUNBOOK.md`` §email); either query order is tolerated.
    """
    import re

    body = message.body
    uid = re.search(r"uid=([A-Za-z0-9_-]+)", body)
    token = re.search(r"token=([A-Za-z0-9_:-]+)", body)
    assert uid and token, f"reset link not found in mail body: {body!r}"
    return uid.group(1), token.group(1)


@override_settings(EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class PasswordResetFlowTest(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="resetter",
            email="resetter@example.com",
            password="OldPass-2026!x",
        )

    def test_locmem_override_is_active(self):
        """Guard the test's own premise: the outbox is the locmem one."""
        from django.conf import settings

        self.assertEqual(
            settings.EMAIL_BACKEND, f"{EmailBackend.__module__}.EmailBackend"
        )

    def test_request_mails_the_account_owner(self):
        response = self.client.post(RESET_URL, {"email": self.user.email})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, [self.user.email])

    def test_mailed_link_points_at_the_spa_route(self):
        from django.conf import settings as dj_settings

        self.client.post(RESET_URL, {"email": self.user.email})
        uid, token = _uid_and_token_from_mail(mail.outbox[0])
        self.assertIn(
            f"{dj_settings.FRONTEND_ORIGIN}/reset-password?uid={uid}&token={token}",
            mail.outbox[0].body,
        )

    def test_frontend_reset_url_generator_shape(self):
        """The url_generator itself, independent of the mail stack."""
        from django.test import RequestFactory

        from users.serializers import frontend_reset_url

        url = frontend_reset_url(RequestFactory().post("/"), self.user, "tok-123")
        self.assertTrue(url.startswith("http://"))
        self.assertIn("/reset-password?uid=", url)
        self.assertTrue(url.endswith("&token=tok-123"))

    def test_request_for_unknown_email_is_200_and_silent(self):
        response = self.client.post(RESET_URL, {"email": "nobody@example.com"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(mail.outbox), 0)

    def test_full_reset_round_trip(self):
        self.client.post(RESET_URL, {"email": self.user.email})
        uid, token = _uid_and_token_from_mail(mail.outbox[0])

        confirmed = self.client.post(
            CONFIRM_URL,
            {
                "uid": uid,
                "token": token,
                "new_password1": "NewPass-2026!y",
                "new_password2": "NewPass-2026!y",
            },
        )
        self.assertEqual(confirmed.status_code, status.HTTP_200_OK)

        # The swap took effect server-side.
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("NewPass-2026!y"))

        old_login = self.client.post(
            LOGIN_URL, {"username": "resetter", "password": "OldPass-2026!x"}
        )
        self.assertEqual(old_login.status_code, status.HTTP_400_BAD_REQUEST)
        new_login = self.client.post(
            LOGIN_URL, {"username": "resetter", "password": "NewPass-2026!y"}
        )
        self.assertEqual(new_login.status_code, status.HTTP_200_OK)

        # Tokens are single-use: replaying the confirm now 400s.
        replay = self.client.post(
            CONFIRM_URL,
            {
                "uid": uid,
                "token": token,
                "new_password1": "ThirdPass-2026!z",
                "new_password2": "ThirdPass-2026!z",
            },
        )
        self.assertEqual(replay.status_code, status.HTTP_400_BAD_REQUEST)

    def test_confirm_with_garbage_pair_is_400(self):
        response = self.client.post(
            CONFIRM_URL,
            {
                "uid": "not-a-uid",
                "token": "not-a-token",
                "new_password1": "NewPass-2026!y",
                "new_password2": "NewPass-2026!y",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_confirm_rejects_validator_failing_password(self):
        # allauth's EmailAwarePasswordResetTokenGenerator (dj-rest-auth's
        # pick when allauth is installed) — not Django's vanilla one.
        from allauth.account.forms import default_token_generator
        from django.utils.http import urlsafe_base64_encode

        uid = urlsafe_base64_encode(str(self.user.pk).encode())
        token = default_token_generator.make_token(self.user)
        response = self.client.post(
            CONFIRM_URL,
            {
                "uid": uid,
                "token": token,
                "new_password1": "short",
                "new_password2": "short",
            },
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("OldPass-2026!x"))

    def test_reverse_names_resolve_to_the_same_endpoints(self):
        """The URLs are dj-rest-auth's mounted defaults, not custom views —
        pin them so a future include-reshuffle fails loudly here rather
        than silently breaking the frontend's hardcoded paths."""
        self.assertEqual(reverse("rest_password_reset"), RESET_URL.rstrip("/"))
        self.assertEqual(
            reverse("rest_password_reset_confirm"), CONFIRM_URL.rstrip("/")
        )
