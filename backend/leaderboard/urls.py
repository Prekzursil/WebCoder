from django.urls import path

from .views import LeaderboardListView, MyLeaderboardView

app_name = "leaderboard"

urlpatterns = [
    path("", LeaderboardListView.as_view(), name="list"),
    path("me/", MyLeaderboardView.as_view(), name="me"),
]
