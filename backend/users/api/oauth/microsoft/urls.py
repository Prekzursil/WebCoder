from django.urls import path

from .views import MicrosoftLogin, MicrosoftTokenLogin

app_name = "microsoft"

urlpatterns = [
    path("login/", MicrosoftLogin.as_view(), name="login"),
    path("login/token/", MicrosoftTokenLogin.as_view(), name="login_token"),
]
