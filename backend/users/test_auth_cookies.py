"""httpOnly-cookie JWT auth tests (SPEC-GAPS SP1).

Covers the full cookie lifecycle through the real URLconf and the real
dj-rest-auth/simplejwt views (no mocks):

- login sets ``wc_access``/``wc_refresh`` httpOnly cookies (SameSite=Lax)
  and removes the refresh token from the body;
- the access cookie authenticates requests (``/users/me/``);
- unsafe cookie-authenticated methods enforce the double-submit CSRF check;
- ``GET /api/v1/auth/csrf/`` seeds the ``csrftoken`` cookie;
- refresh with an EMPTY body rotates the cookie pair and BLACKLISTS the
  presented refresh token (single-use);
- a stale/garbage ``wc_access`` cookie degrades to anonymous instead of
  blocking the refresh endpoint (users/authentication.py);
- logout via the refresh cookie blacklists it and clears both cookies;
- the simplejwt ``/api/v1/token/…`` endpoints keep returning body tokens
  for non-browser clients.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

LOGIN = "/api/v1/auth/login/"
LOGOUT = "/api/v1/auth/logout/"
REFRESH = "/api/v1/auth/token/refresh/"
ME = "/api/v1/users/me/"
CSRF = "/api/v1/auth/csrf/"
PASSWORD_CHANGE = "/api/v1/users/password/change/"
TOKEN_PAIR = "/api/v1/token/"

User = get_user_model()


class CookieAuthFlowTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bob", email="bob@example.com", password="BobPass-2026!x"
        )
        self.client = APIClient()

    def _csrf_header(self):
        """Seed + return the X-CSRFToken header, as the SPA does."""
        self.client.get(CSRF)
        return {"HTTP_X_CSRFTOKEN": self.client.cookies["csrftoken"].value}

    def _login(self, client=None):
        client = client or self.client
        return client.post(
            LOGIN, {"username": "bob", "password": "BobPass-2026!x"}, format="json"
        )

    def test_login_sets_httponly_cookies_and_blanks_body_refresh(self):
        response = self._login()
        self.assertEqual(response.status_code, 200)
        cookies = response.cookies
        self.assertIn("wc_access", cookies)
        self.assertIn("wc_refresh", cookies)
        self.assertEqual(str(cookies["wc_access"]["httponly"]).lower(), "true")
        self.assertEqual(str(cookies["wc_refresh"]["httponly"]).lower(), "true")
        self.assertEqual(cookies["wc_access"]["samesite"], "Lax")
        self.assertEqual(cookies["wc_refresh"]["samesite"], "Lax")
        # Body: access token still present (migration window), refresh gone.
        self.assertTrue(response.data["access"])
        self.assertEqual(response.data.get("refresh", ""), "")
        self.assertEqual(response.data["user"]["username"], "bob")

    def test_access_cookie_authenticates_me(self):
        self._login()
        response = self.client.get(ME)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "bob")

    def test_anonymous_me_is_401(self):
        response = self.client.get(ME)
        self.assertEqual(response.status_code, 401)

    def test_csrf_endpoint_seeds_cookie_and_me_does_too(self):
        response = self.client.get(CSRF)
        self.assertEqual(response.status_code, 200)
        self.assertIn("csrftoken", response.cookies)
        # The hydration endpoint also seeds it (SPA gets it for free).
        self.client.credentials()  # ensure no auth headers
        response = self.client.get(ME)
        self.assertIn("csrftoken", response.cookies)

    def test_unsafe_cookie_request_requires_csrf_header(self):
        # The Django test client skips CSRF by default
        # (_dont_enforce_csrf_checks); enforcing client + double-submit
        # proves the cookie-auth CSRF contract end-to-end.
        client = APIClient(enforce_csrf_checks=True)
        self._login(client)
        # Seed the csrf cookie first (as the SPA does via GET /auth/csrf/).
        client.get(CSRF)
        response = client.post(
            PASSWORD_CHANGE,
            {"old_password": "BobPass-2026!x", "new_password1": "NewPass-2026!y",
             "new_password2": "NewPass-2026!y"},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertIn("CSRF", str(response.data))

        csrf_token = client.cookies["csrftoken"].value
        response = client.post(
            PASSWORD_CHANGE,
            {"old_password": "BobPass-2026!x", "new_password1": "NewPass-2026!y",
             "new_password2": "NewPass-2026!y"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(response.status_code, 200)

    def test_browser_origin_header_must_be_csrf_trusted(self):
        # Browsers ALWAYS send Origin on cross-origin unsafe methods, and
        # Django's CSRF check validates it against CSRF_TRUSTED_ORIGINS —
        # without the frontend origin configured, every cookie-authenticated
        # SPA POST 403s with "Origin checking failed" even with a valid
        # X-CSRFToken (found live on the redeployed stack).
        client = APIClient(enforce_csrf_checks=True)
        self._login(client)
        client.get(CSRF)
        token = client.cookies["csrftoken"].value

        with override_settings(CSRF_TRUSTED_ORIGINS=[]):
            response = client.post(
                PASSWORD_CHANGE,
                {"old_password": "BobPass-2026!x", "new_password1": "NewPass-2026!y",
                 "new_password2": "NewPass-2026!y"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
                HTTP_ORIGIN="http://localhost:3000",
            )
            self.assertEqual(response.status_code, 403)
            self.assertIn("Origin checking failed", str(response.data))

        with override_settings(CSRF_TRUSTED_ORIGINS=["http://localhost:3000"]):
            response = client.post(
                PASSWORD_CHANGE,
                {"old_password": "BobPass-2026!x", "new_password1": "NewPass-2026!y",
                 "new_password2": "NewPass-2026!y"},
                format="json",
                HTTP_X_CSRFTOKEN=token,
                HTTP_ORIGIN="http://localhost:3000",
            )
            self.assertEqual(response.status_code, 200)

    def test_refresh_with_empty_body_rotates_and_blacklists(self):
        self._login()
        old_refresh = self.client.cookies["wc_refresh"].value
        # NO body: dj-rest-auth reads the wc_refresh cookie. The browser
        # contract sends X-CSRFToken with every unsafe method (the valid
        # wc_access cookie makes this an authenticated request).
        response = self.client.post(REFRESH, **self._csrf_header())
        self.assertEqual(response.status_code, 200)
        self.assertIn("wc_access", response.cookies)
        # Rotation issued a new refresh cookie...
        self.assertIn("wc_refresh", response.cookies)
        self.assertNotEqual(response.cookies["wc_refresh"].value, old_refresh)
        # ...and the OLD refresh token is blacklisted: reuse must 401.
        reuse = APIClient()
        reuse.cookies["wc_refresh"] = old_refresh
        response = reuse.post(REFRESH)
        self.assertEqual(response.status_code, 401)

    def test_stale_access_cookie_does_not_block_refresh(self):
        self._login()
        # Corrupt the access cookie (simulates expiry): authentication must
        # degrade to anonymous, not 401 the refresh endpoint itself.
        self.client.cookies["wc_access"] = "garbage.token.value"
        me = self.client.get(ME)
        self.assertEqual(me.status_code, 401)
        response = self.client.post(REFRESH)
        self.assertEqual(response.status_code, 200)
        # After the rotation the me request works again via the new cookie.
        me = self.client.get(ME)
        self.assertEqual(me.status_code, 200)

    def test_logout_blacklists_refresh_cookie_and_clears_cookies(self):
        self._login()
        refresh = self.client.cookies["wc_refresh"].value
        response = self.client.post(LOGOUT, **self._csrf_header())
        self.assertEqual(response.status_code, 200)
        # Both cookies cleared on the response.
        self.assertEqual(response.cookies["wc_access"].value, "")
        self.assertEqual(response.cookies["wc_refresh"].value, "")
        # The logged-out refresh token is blacklisted.
        reuse = APIClient()
        reuse.cookies["wc_refresh"] = refresh
        self.assertEqual(reuse.post(REFRESH).status_code, 401)

    def test_simplejwt_token_endpoints_still_issue_body_tokens(self):
        response = self.client.post(
            TOKEN_PAIR, {"username": "bob", "password": "BobPass-2026!x"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access"])
        self.assertTrue(response.data["refresh"])

    def test_header_bearer_still_works(self):
        pair = self.client.post(
            TOKEN_PAIR, {"username": "bob", "password": "BobPass-2026!x"}, format="json"
        ).data
        header_client = APIClient()
        header_client.credentials(HTTP_AUTHORIZATION=f"Bearer {pair['access']}")
        self.assertEqual(header_client.get(ME).status_code, 200)

    def test_garbage_bearer_header_fails_loud(self):
        header_client = APIClient()
        header_client.credentials(HTTP_AUTHORIZATION="Bearer garbage.token.value")
        self.assertEqual(header_client.get(ME).status_code, 401)
