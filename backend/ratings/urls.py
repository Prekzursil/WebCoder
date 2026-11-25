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
    path(
        "users/<str:username>/calibration/",
        views.UserCalibrationView.as_view(),
        name="user_calibration",
    ),
    # Wave F items 51/52/53 — graph annotations, percentiles, divisions.
    path("divisions/", views.DivisionsView.as_view(), name="divisions"),
    path(
        "users/<str:username>/divisions/",
        views.UserDivisionsView.as_view(),
        name="user_divisions",
    ),
    path(
        "users/<str:username>/percentiles/",
        views.UserPercentilesView.as_view(),
        name="user_percentiles",
    ),
]
