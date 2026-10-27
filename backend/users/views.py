from allauth.socialaccount.providers.google.views import GoogleOAuth2Adapter
from allauth.socialaccount.providers.github.views import GitHubOAuth2Adapter
from allauth.socialaccount.providers.oauth2.client import OAuth2Client
from dj_rest_auth.registration.views import SocialLoginView
from django.http import HttpResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import generics, permissions, status, viewsets
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.response import Response
from .serializers import (
    UserRegistrationSerializer,
    UserSerializer,
    PasswordChangeSerializer,
    AdminUserSerializer,
)
from submissions.models import Submission

from .models import User
from problems.models import Problem
from submissions.models import Submission
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
class UserMeView(generics.RetrieveAPIView):
    """
    API endpoint to get the current authenticated user's details.

    ``ensure_csrf_cookie`` (SPEC-GAPS SP1): the SPA's hydration GET also
    seeds the ``csrftoken`` cookie the double-submit CSRF check needs for
    the cookie-authenticated unsafe requests that follow.
    """

    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

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
        return super().get_permissions()


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
            body, content_type="application/json", headers={"Content-Disposition": f'attachment; filename="{filename}"'}
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
