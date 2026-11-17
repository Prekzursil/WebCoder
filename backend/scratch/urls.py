from django.urls import path

from problems.random_problem import MyScratchReceiptsView
from .views import ScratchRunView

app_name = "scratch"

urlpatterns = [
    path("", ScratchRunView.as_view(), name="scratch_run"),
    # Wave E item 20: the caller's sandbox receipts (scratch + stress runs).
    path("mine/", MyScratchReceiptsView.as_view(), name="my-receipts"),
]
