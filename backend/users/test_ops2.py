"""OPS-2 (Wave D): TOTP two-factor for privileged roles + personal API
tokens — stdlib RFC 6238, enrollment lifecycle, enforcement gate, token
minting/revocation/auth, and the authenticated public-API rate."""

from unittest import mock

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from public_api.views import PublicAPIThrottle
from users.models import User
from users.totp import (
    DIGITS,
    generate_secret,
    provisioning_uri,
    totp_code,
    verify_code,
)


class TotpProtocolTest(TestCase):
    """The stdlib RFC 6238 core."""

    def test_secret_shape(self):
        secret = generate_secret()
        self.assertEqual(len(secret), 32)
        self.assertEqual(secret, secret.upper())
        self.assertTrue(all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" for c in secret))

    def test_codes_are_six_digits_and_deterministic(self):
        secret = generate_secret()
        at = 1_700_000_000.0
        code = totp_code(secret, at_time=at)
        self.assertEqual(len(code), DIGITS)
        self.assertTrue(code.isdigit())
        # Same instant -> same code; next step -> (almost surely) another.
        self.assertEqual(totp_code(secret, at_time=at), code)
        self.assertNotEqual(totp_code(secret, at_time=at, step_offset=1), code)

    def test_verify_accepts_current_and_drift(self):
        secret = generate_secret()
        at = 1_700_000_000.0
        self.assertTrue(verify_code(secret, totp_code(secret, at_time=at), at))
        # ±1 step of clock skew is tolerated.
        self.assertTrue(
            verify_code(secret, totp_code(secret, at_time=at, step_offset=-1), at)
        )
        self.assertTrue(
            verify_code(secret, totp_code(secret, at_time=at, step_offset=1), at)
        )
        # ±2 steps is outside the window.
        self.assertFalse(
            verify_code(secret, totp_code(secret, at_time=at, step_offset=2), at)
        )

    def test_verify_rejects_malformed_codes(self):
        secret = generate_secret()
        at = 1_700_000_000.0
        self.assertFalse(verify_code(secret, "", at))
        self.assertFalse(verify_code(secret, "abcdef", at))
        self.assertFalse(verify_code(secret, "12345", at))
        self.assertFalse(verify_code(secret, "1234567", at))
        self.assertFalse(verify_code(secret, "000000", at))
        self.assertFalse(verify_code("", "123456", at))

    def test_provisioning_uri(self):
        secret = generate_secret()
        uri = provisioning_uri("alice", secret)
        self.assertTrue(uri.startswith("otpauth://totp/WebCoder%3Aalice?"))
        self.assertIn(f"secret={secret}", uri)
        self.assertIn("issuer=WebCoder", uri)
        self.assertIn("digits=6", uri)
        self.assertIn("period=30", uri)


class TotpEnrollmentFlowTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="creator", password="pw-123456", role=User.Roles.PROBLEM_CREATOR
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def _begin(self):
        response = self.client.post("/api/v1/users/me/totp/begin/")
        self.assertEqual(response.status_code, 200)
        return response.data

    def _verify(self, code, expect=200):
        response = self.client.post(
            "/api/v1/users/me/totp/verify/", {"code": code}, format="json"
        )
        self.assertEqual(response.status_code, expect)
        return response

    def test_begin_returns_secret_and_uri_without_enabling(self):
        data = self._begin()
        self.assertIn("secret", data)
        self.assertTrue(data["otpauth_uri"].startswith("otpauth://totp/"))
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_secret)
        self.assertFalse(self.user.two_factor_enabled)

    def test_verify_with_live_code_enables(self):
        self._begin()
        self.user.refresh_from_db()
        code = totp_code(self.user.two_factor_secret)
        self._verify(code)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

    def test_verify_with_wrong_code_rejected(self):
        self._begin()
        self._verify("000000", expect=400)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)

    def test_verify_without_pending_enrollment_rejected(self):
        self._verify("123456", expect=400)

    def test_begin_twice_rerolls_the_secret(self):
        first = self._begin()["secret"]
        second = self._begin()["secret"]
        self.assertNotEqual(first, second)

    def test_disable_requires_password_and_code(self):
        self._begin()
        self.user.refresh_from_db()
        code = totp_code(self.user.two_factor_secret)
        self._verify(code)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

        # Wrong password: refused, still enabled.
        response = self.client.post(
            "/api/v1/users/me/totp/disable/",
            {"code": totp_code(self.user.two_factor_secret), "current_password": "no"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

        # Right password, wrong code: refused, still enabled.
        response = self.client.post(
            "/api/v1/users/me/totp/disable/",
            {"code": "000000", "current_password": "pw-123456"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

        # Both factors correct: disabled and secret cleared.
        response = self.client.post(
            "/api/v1/users/me/totp/disable/",
            {
                "code": totp_code(self.user.two_factor_secret),
                "current_password": "pw-123456",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)
        self.assertEqual(self.user.two_factor_secret, "")

    def test_disable_without_enrollment_rejected(self):
        response = self.client.post(
            "/api/v1/users/me/totp/disable/",
            {"code": "123456", "current_password": "pw-123456"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_me_serializer_flags(self):
        # Privileged without 2FA -> required=True (the warn-phase banner).
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["two_factor_enabled"])
        self.assertTrue(response.data["two_factor_required"])

        # Enrolled -> no longer required.
        self._begin()
        self.user.refresh_from_db()
        self._verify(totp_code(self.user.two_factor_secret))
        response = self.client.get("/api/v1/users/me/")
        self.assertTrue(response.data["two_factor_enabled"])
        self.assertFalse(response.data["two_factor_required"])

    def test_basic_user_never_flagged(self):
        basic = User.objects.create_user(username="basic", password="pw-123456")
        client = APIClient()
        client.force_authenticate(basic)
        response = client.get("/api/v1/users/me/")
        self.assertFalse(response.data["two_factor_required"])

    def test_anonymous_cannot_begin(self):
        anonymous = APIClient()
        response = anonymous.post("/api/v1/users/me/totp/begin/")
        self.assertEqual(response.status_code, 401)


class TwoFactorEnforcementTest(TestCase):
    """The "require" phase behind TWO_FACTOR_ENFORCE."""

    def setUp(self):
        self.creator = User.objects.create_user(
            username="author", password="pw-123456", role=User.Roles.PROBLEM_CREATOR
        )
        self.client = APIClient()
        self.client.force_authenticate(self.creator)

    def _payload(self):
        return {
            "title_i18n": {"en": "T", "ro": "T"},
            "statement_i18n": {"en": "S", "ro": "S"},
            "test_cases_data": [],
        }

    def test_enforce_off_warn_phase_only(self):
        response = self.client.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        self.assertNotEqual(response.status_code, 403)

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_blocks_privileged_writes_without_totp(self):
        response = self.client.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("Two-factor", str(response.data["detail"]))

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_allows_privileged_writes_with_totp(self):
        self.creator.two_factor_enabled = True
        self.creator.save(update_fields=["two_factor_enabled"])
        response = self.client.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        # The 2FA gate passes; downstream validation now owns the response.
        self.assertNotEqual(response.status_code, 403)

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_leaves_reads_alone(self):
        response = self.client.get("/api/v1/problems/problems/")
        self.assertEqual(response.status_code, 200)

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_gate_passes_anonymous_through(self):
        # Authentication is another permission class's job — the gate
        # never masquerades as an auth check.
        anonymous = APIClient()
        response = anonymous.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        self.assertEqual(response.status_code, 401)

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_gate_passes_safe_methods_and_unauthenticated_directly(self):
        # Unit-level: the branches the API order hides (IsAuthenticated
        # short-circuits before the gate ever sees an anonymous POST).
        from rest_framework.test import APIRequestFactory

        from users.permissions import PrivilegedRoleRequires2FA

        factory = APIRequestFactory()
        gate = PrivilegedRoleRequires2FA()
        safe = factory.get("/api/v1/problems/problems/")
        self.assertTrue(gate.has_permission(safe, None))
        anonymous_post = factory.post("/api/v1/problems/problems/", format="json")
        anonymous_post.user = None
        self.assertTrue(gate.has_permission(anonymous_post, None))

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_gate_passes_non_privileged_through(self):
        # A BASIC user on the problem route passes the 2FA gate and is
        # refused by the ROLE gate instead (a different 403).
        basic = User.objects.create_user(username="plain2", password="pw-123456")
        client = APIClient()
        client.force_authenticate(basic)
        response = client.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        self.assertEqual(response.status_code, 403)
        self.assertNotIn("Two-factor", str(response.data.get("detail", "")))

    @override_settings(TWO_FACTOR_ENFORCE=True)
    def test_enforced_leaves_basic_users_alone(self):
        basic = User.objects.create_user(username="plain", password="pw-123456")
        client = APIClient()
        client.force_authenticate(basic)
        response = client.post("/api/v1/submissions/submit/", {}, format="json")
        # Not a privileged surface for a BASIC user — the gate passes and
        # the request proceeds to normal validation.
        self.assertNotEqual(response.status_code, 403)


class PersonalApiTokenTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="tok", password="pw-123456")
        self.other = User.objects.create_user(username="oth", password="pw-123456")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_create_returns_key_once(self):
        response = self.client.post("/api/v1/users/me/tokens/", format="json")
        self.assertEqual(response.status_code, 201)
        key = response.data["key"]
        self.assertEqual(len(key), 40)

        # Second mint is refused until revoked (single-token rotation).
        response = self.client.post("/api/v1/users/me/tokens/", format="json")
        self.assertEqual(response.status_code, 409)

    def test_list_masks_the_key(self):
        self.client.post("/api/v1/users/me/tokens/", format="json")
        response = self.client.get("/api/v1/users/me/tokens/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        entry = response.data["results"][0]
        self.assertTrue(entry["key_hint"].startswith("…"))
        self.assertEqual(len(entry["key_hint"]), 5)
        self.assertNotIn("key", entry)

    def test_revoke_clears_the_token(self):
        self.client.post("/api/v1/users/me/tokens/", format="json")
        response = self.client.delete("/api/v1/users/me/tokens/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(self.client.get("/api/v1/users/me/tokens/").data["count"], 0)

    def test_revoke_without_token_404(self):
        response = self.client.delete("/api/v1/users/me/tokens/")
        self.assertEqual(response.status_code, 404)

    def test_revoke_never_touches_other_users(self):
        # The other user mints a token; the caller's revoke must not kill it.
        other_client = APIClient()
        other_client.force_authenticate(self.other)
        other_key = other_client.post("/api/v1/users/me/tokens/", format="json").data[
            "key"
        ]

        self.client.delete("/api/v1/users/me/tokens/")

        check = APIClient()
        check.credentials(HTTP_AUTHORIZATION=f"Token {other_key}")
        response = check.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "oth")

    def test_token_authenticates_api_requests(self):
        key = self.client.post("/api/v1/users/me/tokens/", format="json").data["key"]

        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Token {key}")
        response = token_client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "tok")

    def test_revoked_token_stops_working(self):
        key = self.client.post("/api/v1/users/me/tokens/", format="json").data["key"]
        self.client.delete("/api/v1/users/me/tokens/")

        token_client = APIClient()
        token_client.credentials(HTTP_AUTHORIZATION=f"Token {key}")
        response = token_client.get("/api/v1/users/me/")
        self.assertEqual(response.status_code, 401)


class PublicApiTokenRateTest(TestCase):
    """OPS-2 x OPS-1: authenticated public-API reads switch throttle."""

    def _throttle(self):
        throttle = PublicAPIThrottle()
        throttle.scope = "public_api"
        return throttle

    def test_anonymous_uses_public_api_scope(self):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/public/problems/")
        request.user = None
        throttle = self._throttle()
        self.assertTrue(throttle.allow_request(request, None))
        self.assertEqual(throttle.scope, "public_api")

    def test_authenticated_switches_to_auth_scope(self):
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        request = factory.get("/api/v1/public/problems/")
        user = User.objects.create_user(username="anon-rate", password="pw-123456")
        request.user = user
        with override_settings(
            REST_FRAMEWORK={
                "DEFAULT_THROTTLE_RATES": {
                    "public_api": "60/min",
                    "public_api_auth": "240/min",
                }
            }
        ):
            throttle = self._throttle()
            self.assertTrue(throttle.allow_request(request, None))
            self.assertEqual(throttle.scope, "public_api_auth")
            self.assertEqual(throttle.rate, "240/min")

    def test_rate_lookup_per_scope(self):
        throttle = self._throttle()
        with override_settings(
            REST_FRAMEWORK={
                "DEFAULT_THROTTLE_RATES": {
                    "public_api": "60/min",
                    "public_api_auth": "240/min",
                }
            }
        ):
            self.assertEqual(throttle.get_rate(), "60/min")
            throttle.scope = "public_api_auth"
            self.assertEqual(throttle.get_rate(), "240/min")

    def test_throttle_actually_blocks_at_the_ceiling(self):
        """The #236 latent no-op, regressed forever: anon requests over
        the ceiling must be refused (isolated cache, tiny rate)."""
        from django.core.cache.backends.locmem import LocMemCache

        from rest_framework.test import APIRequestFactory

        cache = LocMemCache(name="ops2-throttle-test", params={})
        factory = APIRequestFactory()
        request = factory.get("/api/v1/public/problems/")
        request.user = None
        with (
            override_settings(
                REST_FRAMEWORK={
                    "DEFAULT_THROTTLE_RATES": {
                        "public_api": "2/min",
                        "public_api_auth": "10000/min",
                    }
                }
            ),
            mock.patch.object(PublicAPIThrottle, "cache", cache),
        ):
            throttle = PublicAPIThrottle()
            self.assertTrue(throttle.allow_request(request, None))
            self.assertTrue(throttle.allow_request(request, None))
            self.assertFalse(throttle.allow_request(request, None))
