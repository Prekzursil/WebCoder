from django.urls import path
from rest_framework.routers import DefaultRouter

from ratings import views as rating_views
from . import views
from .calendar import calendar_ics

app_name = "contests"

router = DefaultRouter()
router.register(r"", views.ContestViewSet, basename="contest")

urlpatterns = [
    # ICS feed (CON-10) — plain path ahead of the router's catch-all.
    path("calendar.ics", calendar_ics, name="contest_calendar_ics"),
    # Ratings (RAT-1/SAF-2): per-contest changes + organizer rollback.
    path(
        "<int:contest_id>/rating-changes/",
        rating_views.contest_rating_changes,
        name="contest_rating_changes",
    ),
    path(
        "<int:contest_id>/rating-rollback/",
        rating_views.contest_rating_rollback,
        name="contest_rating_rollback",
    ),
] + router.urls
