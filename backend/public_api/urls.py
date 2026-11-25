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
    # JDG-9: the judge registry as public toolchain docs.
    path("languages/", views.PublicLanguagesView.as_view(), name="languages"),
    # Item 150 (wave G section K): the transparency report data layer.
    path(
        "transparency/",
        views.TransparencyReportView.as_view(),
        name="transparency",
    ),
    # Wave G item 106: contest standings + public user profiles complete v1.
    path(
        "contests/<int:contest_id>/standings/",
        views.PublicStandingsView.as_view(),
        name="contest_standings",
    ),
    path(
        "users/<str:username>/",
        views.PublicUserProfileView.as_view(),
        name="user_profile",
    ),
]
