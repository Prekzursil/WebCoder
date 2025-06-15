from django.urls import path
from .views import GitHubLogin, GitHubTokenLogin

urlpatterns = [
    path('login/', GitHubLogin.as_view(), name='github_login'),
    path('login/token/', GitHubTokenLogin.as_view(), name='github_login_token'),
]
