from django.urls import path

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
    # Wave E items 36/37/38/40: the drill deck, answer checking and the
    # deterministic daily warmup. daily/ precedes the id routes.
    path("drills/daily/", views.DailyDrillsView.as_view(), name="drills-daily"),
    path("drills/", views.DrillsView.as_view(), name="drills"),
    path(
        "drills/<int:drill_id>/answer/",
        views.DrillAnswerView.as_view(),
        name="drill-answer",
    ),
]
