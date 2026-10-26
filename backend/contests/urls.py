from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views
from .calendar import calendar_ics

app_name = "contests"

router = DefaultRouter()
router.register(r"", views.ContestViewSet, basename="contest")

urlpatterns = [
    # ICS feed (CON-10) — plain path ahead of the router's catch-all.
    path("calendar.ics", calendar_ics, name="contest_calendar_ics"),
] + router.urls
