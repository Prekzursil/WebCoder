"""
URL configuration for webcoder_api project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""

from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
    TokenVerifyView,
)
from users import views as users_views
from webcoder_api import observability

urlpatterns = [
    path("", RedirectView.as_view(url="/api/v1/problems/", permanent=False)),
    path("admin/", admin.site.urls),
    # Observability probes (round-2 X3): /healthz touches nothing (liveness),
    # /readyz pings db+cache+broker (readiness). Unauthenticated by design —
    # they leak no data beyond up/down per component.
    path("healthz", observability.healthz, name="healthz"),
    path("readyz", observability.readyz, name="readyz"),
    path("api/v1/users/", include("users.urls", namespace="users_api_v1")),
    path("api/v1/problems/", include("problems.urls", namespace="problems_api_v1")),
    path(
        "api/v1/submissions/",
        include("submissions.urls", namespace="submissions_api_v1"),
    ),
    path(
        "api/v1/leaderboard/",
        include("leaderboard.urls", namespace="leaderboard_api_v1"),
    ),
    path(
        "api/v1/notifications/",
        include("notifications.urls", namespace="notifications_api_v1"),
    ),
    path("api/v1/forum/", include("forum.urls", namespace="forum_api_v1")),
    # Contests (competitive roadmap Wave B: CON-1/2/3/6 + PRF-1).
    path("api/v1/contests/", include("contests.urls", namespace="contests_api_v1")),
    # Ratings (competitive roadmap Wave B: RAT-1/2/3 + SAF-2 rollback).
    path("api/v1/ratings/", include("ratings.urls", namespace="ratings_api_v1")),
    path("api/v1/classroom/", include("classroom.urls", namespace="classroom_api_v1")),
    # Community depth (competitive roadmap Wave C: COM-3/7, RAT-8/9/10).
    path(
        "api/v1/community/",
        include("community_depth.urls", namespace="community_depth_api_v1"),
    ),
    # Public read-only API (competitive roadmap OPS-1).
    path("api/v1/public/", include("public_api.urls", namespace="public_api")),
    # Custom invocation / scratch run (competitive roadmap X7/JDG-6) —
    # throttled + audit-logged raw judge execution.
    path("api/v1/scratch/", include("scratch.urls", namespace="scratch_api_v1")),
    # JWT Token Authentication
    path("api/v1/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/v1/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/v1/token/verify/", TokenVerifyView.as_view(), name="token_verify"),
    # dj-rest-auth and allauth urls
    path("api/v1/auth/", include("dj_rest_auth.urls")),
    path("api/v1/auth/registration/", include("dj_rest_auth.registration.urls")),
    # CSRF cookie seeding for the SPA's cookie-JWT flow (SPEC-GAPS SP1).
    # Mounted ahead of the dj_rest_auth include; 'csrf/' collides with no
    # vendor route.
    path("api/v1/auth/csrf/", users_views.CSRFCookieView.as_view(), name="auth_csrf"),
    # Operator metrics snapshot (round-2 X3c): admin-only JSON.
    path(
        "api/v1/admin/metrics/",
        observability.MetricsView.as_view(),
        name="admin_metrics",
    ),
    path("api/v1/auth/google/", include("users.api.oauth.google.urls")),
    # OPS-3 (competitive roadmap): Microsoft/Azure AD (school) SSO lane.
    path("api/v1/auth/microsoft/", include("users.api.oauth.microsoft.urls")),
    path("api/v1/auth/github/", include("users.api.oauth.github.urls")),
    path("accounts/", include("allauth.urls")),
]
