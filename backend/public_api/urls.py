"""URL routes for the public read-only API (OPS-1)."""

from django.urls import path

from . import views

app_name = "public_api"

urlpatterns = [
    path("", views.PublicRoot.as_view(), name="root"),
    path("problems/", views.PublicProblemList.as_view(), name="problems"),
    path(
        "problems/<int:pk>/",
        views.PublicProblemDetail.as_view(),
        name="problem-detail",
    ),
    path("leaderboard/", views.PublicLeaderboard.as_view(), name="leaderboard"),
    path("feed/", views.PublicFeed.as_view(), name="feed"),
    path("tags/", views.PublicTags.as_view(), name="tags"),
]
