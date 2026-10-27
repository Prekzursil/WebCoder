from django.urls import path

from .views import ScratchRunView

app_name = "scratch"

urlpatterns = [
    path("", ScratchRunView.as_view(), name="scratch_run"),
]
