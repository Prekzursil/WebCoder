from django.urls import path

from . import views

app_name = "ratings"

urlpatterns = [
    path("", views.RatingLadderView.as_view(), name="rating_ladder"),
    path("me/", views.MyRatingView.as_view(), name="my_rating"),
    path("colors/", views.RatingColorsView.as_view(), name="rating_colors"),
    path(
        "users/<str:username>/",
        views.UserRatingHistoryView.as_view(),
        name="user_rating_history",
    ),
]
