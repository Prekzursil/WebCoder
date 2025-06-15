from django.urls import path
from .views import GoogleLogin, GoogleTokenLogin

urlpatterns = [
    path('login/', GoogleLogin.as_view(), name='google_login'),
    path('login/token/', GoogleTokenLogin.as_view(), name='google_login_token'),
]
