from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import (
    UserMeUpdateSerializer,
    UserRegistrationSerializer,
    UserSerializer,
    PasswordChangeSerializer,
    AdminUserSerializer,
)
from submissions.models import Submission

from .models import User
from problems.models import Problem
from .permissions import IsAdminUser, IsOwnerOrAdminForUser
from django.utils.translation import gettext_lazy as _


class UserRegistrationView(generics.CreateAPIView):
    """
    API endpoint for user registration.
    """

    queryset = User.objects.all()
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]  # Anyone can register
    # SPEC-GAPS SP4: anonymous registration is a credential-stuffing /
    # spam surface — scope-throttled at THROTTLE_RATES['auth'].
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "user": UserSerializer(
                    user, context=self.get_serializer_context()
                ).data,
                "message": "User registered successfully.",
            },
            status=status.HTTP_201_CREATED,
        )


class PasswordChangeView(generics.GenericAPIView):
    """
    An endpoint for changing password.
    """

    serializer_class = PasswordChangeSerializer
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data, context={"request": request}
        )
        if serializer.is_valid(raise_exception=True):
            serializer.save()
            return Response(
                {"detail": _("Password updated successfully.")},
                status=status.HTTP_200_OK,
            )
        # Unreachable: is_valid(raise_exception=True) raises on invalid input and
        # returns True on success, so this fallback never executes. Reasoned,
        # greppable pragma.
        return Response(  # pragma: no cover
            serializer.errors, status=status.HTTP_400_BAD_REQUEST
        )


@method_decorator(ensure_csrf_cookie, name="dispatch")
class UserMeView(generics.RetrieveUpdateAPIView):
    """
    API endpoint to get (and partially update) the current user.

    PATCH accepts the RO-3 Olympiad-geography identity fields
    (``county``, ``school``) and the LEG-2 ``is_minor`` self-declaration
    — the only self-service profile fields; everything else is read-only
    here. Minors' county/school stay private to other viewers
    (UserSerializer hides them) and minors never appear on segmented
    leaderboards.

    ``ensure_csrf_cookie`` (SPEC-GAPS SP1): the SPA's hydration GET also
    seeds the ``csrftoken`` cookie the double-submit CSRF check needs for
    the cookie-authenticated unsafe requests that follow.
    """

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return UserMeUpdateSerializer
        return UserSerializer

    def get_object(self):
        return self.request.user


class CSRFCookieView(APIView):
    """GET-only helper that sets the ``csrftoken`` cookie (SPEC-GAPS SP1).

    The cookie-JWT authentication enforces Django's double-submit CSRF on
    unsafe methods: the browser must echo the ``csrftoken`` cookie value in
    ``X-CSRFToken``. This endpoint lets the SPA obtain that cookie on
    demand (e.g. right after login) without coupling CSRF seeding to an
    authenticated endpoint. Returns ``{"detail": "CSRF cookie set"}``.
    """

    permission_classes = [permissions.AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request, *args, **kwargs):
        return Response({"detail": _("CSRF cookie set")})


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for viewing user profiles.
    """

    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_permissions(self):
        if self.action in ["update", "partial_update", "destroy"]:
            self.permission_classes = [IsOwnerOrAdminForUser]
        # COM-4: the follow toggle needs nothing beyond authentication
        # (any user may follow any other user); the class default already
        # covers it, so no branch here.
        return super().get_permissions()

    @action(detail=True, methods=["post"], url_path="follow")
    def follow(self, request, pk=None):
        """COM-4: toggle the viewer's follow edge to this user.

        POST /users/{id}/follow/ -> {"following": bool, "followers": n}.
        Self-follow is rejected (the model constraint also enforces it);
        the graph feeds the ?friends=1 filtered standings/leaderboard.
        """
        from .models import Follow

        target = self.get_object()
        if target.id == request.user.id:
            return Response(
                {"detail": "You cannot follow yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        edge = Follow.objects.filter(follower=request.user, target=target).first()
        if edge:
            edge.delete()
            following = False
        else:
            Follow.objects.create(follower=request.user, target=target)
            following = True
        return Response({"following": following, "followers": target.followers.count()})


class UsernameFollowView(APIView):
    """POST /api/v1/users/username/{username}/follow/ — COM-4 toggle by
    handle. The public surfaces (forum threads, leaderboard rows) carry
    usernames, not ids; this lane keeps the follow button usable
    everywhere a handle renders."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, username):
        from .models import Follow

        target = User.objects.filter(username=username).first()
        if target is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if target.id == request.user.id:
            return Response(
                {"detail": "You cannot follow yourself."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        edge = Follow.objects.filter(follower=request.user, target=target).first()
        if edge:
            edge.delete()
            following = False
        else:
            Follow.objects.create(follower=request.user, target=target)
            following = True
        return Response({"following": following, "followers": target.followers.count()})


class FollowingListView(APIView):
    """GET /api/v1/users/me/following/ — the viewer's follow list as
    {id, username} rows (COM-4): the friends chip strip and the
    ?friends=1 filtered views are driven from it."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from .models import Follow

        rows = list(
            Follow.objects.filter(follower=request.user)
            .select_related("target")
            .order_by("-created_at")
            .values("target__id", "target__username")
        )
        return Response(
            {
                "count": len(rows),
                "results": [
                    {"id": r["target__id"], "username": r["target__username"]}
                    for r in rows
                ],
            }
        )


class AdminUserViewSet(viewsets.ModelViewSet):
    """
    API endpoint for admins to view and manage users.
    """

    queryset = User.objects.all().order_by("id")
    permission_classes = [IsAdminUser]

    def get_serializer_class(self):
        if self.action in ["create", "update", "partial_update"]:
            return AdminUserSerializer
        return UserSerializer


class GoogleLogin(SocialLoginView):
    adapter_class = GoogleOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/login"


class GithubLogin(SocialLoginView):
    adapter_class = GitHubOAuth2Adapter
    client_class = OAuth2Client
    callback_url = "http://localhost:3000/login"


class AdminStatsView(APIView):
    """
    API endpoint for admins to view site statistics.
    """

    permission_classes = [IsAdminUser]

    def get(self, request, *args, **kwargs):
        user_count = User.objects.count()
        problem_count = Problem.objects.count()
        submission_count = Submission.objects.count()

        stats = {
            "user_count": user_count,
            "problem_count": problem_count,
            "submission_count": submission_count,
        }
        return Response(stats)


# ---------------------------------------------------------------------------
# Wave A: statistics/gamification (B5/RAT-4/5/6), solved-ids (F5 backend),
# GDPR account control (LEG-1/X5) and owner analytics (ANA-1).


class UserStatisticsView(generics.RetrieveAPIView):
    """GET /api/v1/users/me/statistics/ — practice stats + derivations."""

    permission_classes = [permissions.IsAuthenticated]

    def retrieve(self, request, *args, **kwargs):
        from .statistics import user_statistics

        return Response(user_statistics(request.user))


class UserSolvedIdsView(APIView):
    """GET /api/v1/users/me/solved-ids/ — the catalog's solved/attempted
    indicator column (F5): two id arrays, cheap to intersect client-side."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        subs = Submission.objects.filter(user=request.user)
        solved = list(
            subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
            .values_list("problem_id", flat=True)
            .distinct()
        )
        attempted = list(subs.values_list("problem_id", flat=True).distinct())
        return Response(
            {
                "solved": solved,
                "attempted": [pid for pid in attempted if pid not in set(solved)],
            }
        )


class AccountExportView(APIView):
    """POST /api/v1/users/me/export/ — GDPR data dump (JSON attachment)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .account import export_as_attachment

        filename, body = export_as_attachment(request.user)
        response = HttpResponse(
            body,
            content_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
        return response


class AccountDeleteView(APIView):
    """POST /api/v1/users/me/delete/ — GDPR soft delete + scheduled purge.

    Body ``{"confirm": "DELETE"}`` guards accidents. The session is left
    standing; the frontend logs out on 200.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        from .account import soft_delete_account

        if request.data.get("confirm") != "DELETE":
            return Response(
                {"detail": 'Body must be {"confirm": "DELETE"}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        soft_delete_account(request.user)
        return Response(
            {
                "detail": (
                    "Account deactivated and anonymized; personal side "
                    "content will be purged within 30 days."
                )
            }
        )


class ActivationMetricsView(APIView):
    """GET /api/v1/users/admin/activation/ — ANA-1 owner analytics.

    Admin-only: funnel + D1/D7 + submission volume derivations over
    existing models (cookie-light by construction).
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from .analytics import activation_snapshot

        return Response(activation_snapshot())


# ---------------------------------------------------------------------------
# Wave D: OPS-2 — TOTP two-factor + personal API tokens.


class TOTPBeginView(APIView):
    """POST /api/v1/users/me/totp/begin/ — start TOTP enrollment.

    Generates (or regenerates) the caller's pending secret and returns it
    with the ``otpauth://`` provisioning URI. The secret stays inert until
    a live code is verified (TOTPVerifyView) — beginning twice simply
    re-rolls the pending secret.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        from .totp import generate_secret, provisioning_uri

        secret = generate_secret()
        request.user.two_factor_secret = secret
        request.user.two_factor_enabled = False
        request.user.save(update_fields=["two_factor_secret", "two_factor_enabled"])
        return Response(
            {
                "secret": secret,
                "otpauth_uri": provisioning_uri(request.user.username, secret),
            }
        )


class TOTPVerifyView(APIView):
    """POST /api/v1/users/me/totp/verify/ {code} — complete enrollment.

    A matching current-step (±1 drift) code flips two_factor_enabled.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        from .totp import verify_code

        code = str(request.data.get("code", "")).strip()
        user = request.user
        if not user.two_factor_secret:
            return Response(
                {"detail": "No pending enrollment — call totp/begin first."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not verify_code(user.two_factor_secret, code):
            return Response(
                {"detail": "Invalid or expired code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.two_factor_enabled = True
        user.save(update_fields=["two_factor_enabled"])
        return Response({"detail": "Two-factor authentication enabled."})


class TOTPDisableView(APIView):
    """POST /api/v1/users/me/totp/disable/ {code, current_password}.

    Disabling demands BOTH a live TOTP code and the account password —
    losing one factor must not be enough to shed the other.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "auth"

    def post(self, request):
        from .totp import verify_code

        code = str(request.data.get("code", "")).strip()
        password = str(request.data.get("current_password", ""))
        user = request.user
        if not user.two_factor_enabled:
            return Response(
                {"detail": "Two-factor is not enabled."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not user.check_password(password):
            return Response(
                {"detail": "Current password is incorrect."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not verify_code(user.two_factor_secret, code):
            return Response(
                {"detail": "Invalid or expired code."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.two_factor_enabled = False
        user.two_factor_secret = ""
        user.save(update_fields=["two_factor_enabled", "two_factor_secret"])
        return Response({"detail": "Two-factor authentication disabled."})


class APITokenListView(APIView):
    """GET /api/v1/users/me/tokens/ — the personal API token (masked).

    The full key is shown exactly once, at creation. The DRF Token model
    is one-per-user with the key AS the primary key, so there is no
    numeric id and at most one row — the list shape (``results``) keeps
    the day a labeled multi-token model arrives a non-breaking change.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from rest_framework.authtoken.models import Token

        tokens = Token.objects.filter(user=request.user).order_by("-created")
        return Response(
            {
                "count": tokens.count(),
                "results": [
                    {
                        # Enough to recognize, never enough to use.
                        "key_hint": f"…{token.key[-4:]}",
                        "created": token.created,
                    }
                    for token in tokens
                ],
            }
        )

    def post(self, request):
        """POST /api/v1/users/me/tokens/ — mint the personal token.

        Body ``{"name": optional label}`` is accepted for forward
        compatibility; the DRF Token model has no label column yet, so
        the response reports the creation time instead.
        """
        from rest_framework.authtoken.models import Token

        token, _created = Token.objects.get_or_create(user=request.user)
        if not _created:
            return Response(
                {
                    "detail": (
                        "You already have a personal token — revoke it "
                        "first to rotate the key."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )
        return Response(
            {
                "detail": "Store this key now — it is shown only once.",
                "key": token.key,
                "created": token.created,
            },
            status=status.HTTP_201_CREATED,
        )

    def delete(self, request):
        """DELETE /api/v1/users/me/tokens/ — revoke the personal token.

        Scoped to the caller by construction (the queryset filters on
        the requesting user); 404 when there is nothing to revoke.
        """
        from rest_framework.authtoken.models import Token

        deleted, _ = Token.objects.filter(user=request.user).delete()
        if not deleted:
            return Response(
                {"detail": "Token not found."},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"detail": "Token revoked."})


class ActivationHistoryView(APIView):
    """GET /api/v1/users/admin/activation/history/?weeks=12 — ANA-1
    weekly snapshots (trend strip) for the owner dashboard. Admin-only,
    like the live activation view; ``?weeks=`` caps the look-back (<=52).
    """

    permission_classes = [permissions.IsAdminUser]

    def get(self, request):
        from .analytics import weekly_history

        try:
            weeks = int(request.query_params.get("weeks", 12))
        except (TypeError, ValueError):
            weeks = 12
        weeks = max(1, min(weeks, 52))
        return Response({"weeks": weeks, "history": weekly_history(weeks)})
