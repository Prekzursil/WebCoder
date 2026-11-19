from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .profile_widgets import (
    EmbedProblemView,
    SetterCVView,
    SolveCardSvgView,
    SolveCardView,
)
from .views import (
    UserRegistrationView,
    PasswordChangeView,
    UserMeView,
    AdminUserViewSet,
    AdminStatsView,
    UserViewSet,
    UserStatisticsView,
    UserSolvedIdsView,
    UserOnboardingView,
    AccountExportView,
    AccountDeleteView,
    ActivationMetricsView,
    ActivationHistoryView,
    TOTPBeginView,
    TOTPVerifyView,
    TOTPDisableView,
    APITokenListView,
    FollowingListView,
    UsernameFollowView,
)

app_name = "users"

# Using a router for the AdminUserViewSet to handle standard CRUD URLs
router = DefaultRouter()
router.register(r"admin/manage", AdminUserViewSet, basename="admin-user-management")
router.register(r"", UserViewSet, basename="user")

urlpatterns = [
    # Wave F items 70-72 — setter CVs, solve cards, embeddable widgets.
    path(
        "username/<str:username>/setter-cv/",
        SetterCVView.as_view(),
        name="user_setter_cv",
    ),
    path(
        "cards/solve/<str:username>/<int:problem_id>/",
        SolveCardView.as_view(),
        name="solve_card",
    ),
    path(
        "cards/solve/<str:username>/<int:problem_id>/svg/",
        SolveCardSvgView.as_view(),
        name="solve_card_svg",
    ),
    path(
        "embed/problems/<int:problem_id>/",
        EmbedProblemView.as_view(),
        name="embed_problem",
    ),
    path("register/", UserRegistrationView.as_view(), name="user_register"),
    path("me/", UserMeView.as_view(), name="user_me"),
    path("password/change/", PasswordChangeView.as_view(), name="password_change"),
    path("admin/stats/", AdminStatsView.as_view(), name="admin_stats"),
    path(
        "admin/activation/",
        ActivationMetricsView.as_view(),
        name="admin_activation",
    ),
    path(
        "admin/activation/history/",
        ActivationHistoryView.as_view(),
        name="admin_activation_history",
    ),
    path(
        "me/statistics/",
        UserStatisticsView.as_view(),
        name="user_statistics",
    ),
    path("me/solved-ids/", UserSolvedIdsView.as_view(), name="user_solved_ids"),
    # Wave G item 88 — the first-hour checklist.
    path(
        "me/onboarding/",
        UserOnboardingView.as_view(),
        name="user_onboarding",
    ),
    path("me/export/", AccountExportView.as_view(), name="account_export"),
    path("me/delete/", AccountDeleteView.as_view(), name="account_delete"),
    # OPS-2 (Wave D): TOTP enrollment lifecycle + personal API tokens.
    path("me/totp/begin/", TOTPBeginView.as_view(), name="totp_begin"),
    path("me/totp/verify/", TOTPVerifyView.as_view(), name="totp_verify"),
    path("me/totp/disable/", TOTPDisableView.as_view(), name="totp_disable"),
    path("me/tokens/", APITokenListView.as_view(), name="api_tokens"),
    # COM-4: the friends/follow graph.
    path(
        "me/following/",
        FollowingListView.as_view(),
        name="user_following",
    ),
    path(
        "username/<str:username>/follow/",
        UsernameFollowView.as_view(),
        name="user_follow_by_username",
    ),
    # Include the router URLs for admin user management
    path("", include(router.urls)),
]
