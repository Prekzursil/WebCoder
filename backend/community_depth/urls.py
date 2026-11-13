"""URLs for the community-depth app (Wave C)."""

from django.urls import path

from . import views

app_name = "community_depth"

urlpatterns = [
    path("feed/", views.FeedView.as_view(), name="feed"),
    path(
        "problems/<int:problem_id>/solutions/",
        views.SolutionsView.as_view(),
        name="problem-solutions",
    ),
    path("honor/me/", views.MyHonorView.as_view(), name="my-honor"),
    path(
        "honor/<str:username>/",
        views.HonorView.as_view(),
        name="user-honor",
    ),
    path(
        "leaderboard/weekly/",
        views.WeeklyLeaderboardView.as_view(),
        name="weekly-leaderboard",
    ),
]
