from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserRegistrationView,
    PasswordChangeView,
    UserMeView,
    AdminUserViewSet,
    AdminStatsView,
    UserViewSet,
    UserStatisticsView,
    UserSolvedIdsView,
    AccountExportView,
    AccountDeleteView,
    ActivationMetricsView,
)

app_name = "users"

# Using a router for the AdminUserViewSet to handle standard CRUD URLs
router = DefaultRouter()
router.register(r"admin/manage", AdminUserViewSet, basename="admin-user-management")
router.register(r"", UserViewSet, basename="user")

urlpatterns = [
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
        "me/statistics/",
        UserStatisticsView.as_view(),
        name="user_statistics",
    ),
    path("me/solved-ids/", UserSolvedIdsView.as_view(), name="user_solved_ids"),
    path("me/export/", AccountExportView.as_view(), name="account_export"),
    path("me/delete/", AccountDeleteView.as_view(), name="account_delete"),
    # Include the router URLs for admin user management
    path("", include(router.urls)),
]
