from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import UserRegistrationView, PasswordChangeView, UserMeView, AdminUserViewSet, GoogleLogin, GithubLogin, AdminStatsView, UserViewSet

app_name = "users"

# Using a router for the AdminUserViewSet to handle standard CRUD URLs
router = DefaultRouter()
router.register(r'admin/manage', AdminUserViewSet, basename='admin-user-management')
router.register(r'', UserViewSet, basename='user')

urlpatterns = [
    path("register/", UserRegistrationView.as_view(), name="user_register"),
    path("me/", UserMeView.as_view(), name="user_me"),
    path("password/change/", PasswordChangeView.as_view(), name="password_change"),
    path("admin/stats/", AdminStatsView.as_view(), name="admin_stats"),
    # Include the router URLs for admin user management
    path("", include(router.urls)),
]
