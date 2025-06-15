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

urlpatterns = [
    path('', RedirectView.as_view(url='/api/v1/problems/', permanent=False)),
    path("admin/", admin.site.urls),
    path("api/v1/users/", include("users.urls", namespace="users_api_v1")),
    path("api/v1/problems/", include("problems.urls", namespace="problems_api_v1")),
    path("api/v1/submissions/", include("submissions.urls", namespace="submissions_api_v1")),
    # JWT Token Authentication
    path('api/v1/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/token/verify/', TokenVerifyView.as_view(), name='token_verify'),
    # dj-rest-auth and allauth urls
    path('api/v1/auth/', include('dj_rest_auth.urls')),
    path('api/v1/auth/registration/', include('dj_rest_auth.registration.urls')),
    path('api/v1/auth/google/', include('users.api.oauth.google.urls')),
    path('api/v1/auth/github/', include('users.api.oauth.github.urls')),
    path('accounts/', include('allauth.urls')),
]
