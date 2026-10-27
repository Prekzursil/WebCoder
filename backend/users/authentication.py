"""JWT authentication for the httpOnly-cookie flow (SPEC-GAPS SP1).

``WCCookieJWTAuthentication`` extends dj-rest-auth's
``JWTCookieAuthentication`` (itself a simplejwt ``JWTAuthentication``
subclass):

- ``Authorization: Bearer <token>`` requests behave exactly like plain
  simplejwt (invalid header tokens still fail loud with 401);
- with no header, the ``wc_access`` httpOnly cookie authenticates the
  request, and — because the browser sends that cookie whether it is still
  valid or not — an *expired/invalid cookie is treated as anonymous* rather
  than as an authentication failure.

The swallow is load-bearing: without it, a stale ``wc_access`` cookie would
401 the ``/auth/token/refresh/`` endpoint itself (authentication runs before
the view), making refresh impossible and forcing a re-login on every access
expiry. Treated as anonymous, the protected endpoint still returns 401
(truthful — the caller is unauthenticated) but the refresh endpoint stays
reachable and can rotate the cookie pair.

CSRF: with ``REST_AUTH['JWT_AUTH_COOKIE_USE_CSRF'] = True``, cookie-based
authentication enforces Django's double-submit CSRF check (unsafe methods
must carry ``X-CSRFToken`` matching the ``csrftoken`` cookie); safe methods
pass through, and header-based authentication is exempt as before.
"""

from dj_rest_auth.app_settings import api_settings
from dj_rest_auth.jwt_auth import JWTCookieAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken


class WCCookieJWTAuthentication(JWTCookieAuthentication):
    def authenticate(self, request):
        header = self.get_header(request)
        if header is not None:
            # Header path unchanged: an explicit invalid Bearer token is a
            # client error and must surface as 401, not silently downgrade.
            return super().authenticate(request)

        cookie_name = api_settings.JWT_AUTH_COOKIE
        if not cookie_name:
            return None
        raw_token = request.COOKIES.get(cookie_name)
        if raw_token is None:
            return None
        if api_settings.JWT_AUTH_COOKIE_USE_CSRF:
            self.enforce_csrf(request)
        try:
            validated_token = self.get_validated_token(raw_token)
        except InvalidToken:
            # Stale/expired access cookie: anonymous, so the refresh flow can
            # still run (see module docstring). Protected views will return
            # their normal 401 for anonymous callers.
            return None
        return self.get_user(validated_token), validated_token
