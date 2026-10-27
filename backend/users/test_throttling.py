"""Rate-limiting tests (SPEC-GAPS SP4).

settings_ci disables the default throttle classes so the suite is
deterministic; these tests OPT BACK IN by patching the throttle class
attributes directly. Two DRF realities drive the shape:

- ``SimpleRateThrottle.THROTTLE_RATES`` is bound at import time, so
  ``override_settings`` cannot change it — we patch the class attribute
  with the shrunk rates instead;
- the throttle cache (``default_cache``) is likewise process-global, so
  each test identifies itself with a unique ``REMOTE_ADDR`` (the throttle
  cache key) to stay isolated from every other test.

Asserts the 429 contract on the three designed surfaces:

- ``auth`` scope: anonymous registration (users/register/),
- ``dj_rest_auth`` scope: the vendor dj-rest-auth login view,
- ``submit`` scope: submission creation (the judge-DoS chokepoint).
"""

from unittest import mock

from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from problems.models import Problem
from users.models import User

REGISTER = "/api/v1/users/register/"
LOGIN = "/api/v1/auth/login/"
SUBMIT = "/api/v1/submissions/submit/"

# Remote addresses unique per test (throttle cache keys are scope+ident).
_IP = {"registration": "10.7.0.1", "login": "10.7.0.2", "submit": "10.7.0.3"}


def _shrink_rates(**rates):
    """Shrink the scoped rates for this test.

    ``SimpleRateThrottle.THROTTLE_RATES`` is bound at DRF import time, so
    ``override_settings`` cannot change it — the class attribute is patched
    directly (the real deployment reads settings.py's rates at import, which
    is exactly what this emulates).
    """
    return mock.patch.object(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {"anon": "10000/min", "user": "10000/min", **rates},
    )


def _vendor_login_throttleable():
    """Give the vendor dj-rest-auth LoginView its ScopedRateThrottle back.

    The vendor view carries ``throttle_scope='dj_rest_auth'`` but relies on
    ``DEFAULT_THROTTLE_CLASSES`` — also import-time bound, and settings_ci
    empties it. The production settings include ScopedRateThrottle by
    default; patching the view class emulates that in the test profile.
    """
    from dj_rest_auth.views import LoginView
    from rest_framework.throttling import ScopedRateThrottle

    return mock.patch.object(LoginView, "throttle_classes", [ScopedRateThrottle])


class RegistrationThrottleTest(TestCase):
    def test_third_registration_in_a_minute_is_429(self):
        client = APIClient()
        ip = {"REMOTE_ADDR": _IP["registration"]}
        payload = {
            "email": "u{}@x.example",
            "password": "Sup3r-Secret-9!",
            "password2": "Sup3r-Secret-9!",
            "username": "u{}",
        }
        with _shrink_rates(auth="2/min"):
            first = client.post(
                REGISTER,
                {k: v.format(1) for k, v in payload.items()},
                format="json",
                **ip,
            )
            self.assertEqual(first.status_code, 201, first.data)
            second = client.post(
                REGISTER,
                {k: v.format(2) for k, v in payload.items()},
                format="json",
                **ip,
            )
            self.assertEqual(second.status_code, 201)
            third = client.post(
                REGISTER,
                {k: v.format(3) for k, v in payload.items()},
                format="json",
                **ip,
            )
            self.assertEqual(third.status_code, 429)


class LoginThrottleTest(TestCase):
    def setUp(self):
        User.objects.create_user(username="bob", password="BobPass-2026!x")

    def test_dj_rest_auth_login_scope_throttles(self):
        creds = {"username": "bob", "password": "BobPass-2026!x"}
        ip = {"REMOTE_ADDR": _IP["login"]}

        def login():
            # Fresh client per call: each login response sets auth cookies,
            # which would switch the throttle ident from IP to user pk for
            # the FOLLOWING call; anonymous ident keeps the counter stable.
            return APIClient().post(LOGIN, creds, format="json", **ip)

        with _vendor_login_throttleable(), _shrink_rates(dj_rest_auth="2/min"):
            self.assertEqual(login().status_code, 200)
            self.assertEqual(login().status_code, 200)
            third = login()
        self.assertEqual(third.status_code, 429)
        # 429s carry Retry-After.
        self.assertTrue(third.has_header("Retry-After"))


class SubmissionThrottleTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="pw")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
        )

    def test_third_submission_in_an_hour_is_429(self):
        from django.core.cache import cache

        client = APIClient()
        client.force_authenticate(user=self.user)
        # The throttle counter lives in the process-wide cache and the key
        # is the AUTHENTICATED user pk — earlier suite tests posting to
        # /submissions/submit/ under the (huge) settings_ci rates share it.
        # Reset this key, and clear it again on the way out for the next
        # suite run in the same process.
        key = f"throttle_submit_{self.user.pk}"
        self.addCleanup(cache.delete, key)
        cache.delete(key)
        ip = {"REMOTE_ADDR": _IP["submit"]}
        payload = {
            "problem": self.problem.id,
            "language": "python3",
            "code": "print(1)",
        }
        with mock.patch("submissions.views.judge_task"), _shrink_rates(
            submit="2/hour"
        ):
            self.assertEqual(
                client.post(SUBMIT, payload, format="json", **ip).status_code, 201
            )
            self.assertEqual(
                client.post(SUBMIT, payload, format="json", **ip).status_code, 201
            )
            third = client.post(SUBMIT, payload, format="json", **ip)
        self.assertEqual(third.status_code, 429)
