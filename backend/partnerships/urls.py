from django.urls import path

from . import views

app_name = "partnerships"

urlpatterns = [
    path("apply/", views.ApplyView.as_view(), name="apply"),
    path("requests/", views.RequestsView.as_view(), name="requests"),
    path(
        "requests/<int:request_id>/review/",
        views.ReviewView.as_view(),
        name="review",
    ),
]
