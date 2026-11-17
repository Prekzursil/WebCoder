from django.urls import path
from rest_framework.routers import DefaultRouter  # noqa: F401 — reserved for future write surfaces

from . import views

app_name = "learning"

urlpatterns = [
    path("review-queue/", views.ReviewQueueView.as_view(), name="review-queue"),
    path("practice-plan/", views.PracticePlanView.as_view(), name="practice-plan"),
    path(
        "mistake-profile/", views.MistakeProfileView.as_view(), name="mistake-profile"
    ),
    path("skills/", views.SkillGraphView.as_view(), name="skills"),
    path("theory/", views.TheoryCardsView.as_view(), name="theory"),
]
