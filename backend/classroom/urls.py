from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = "classroom"

router = DefaultRouter()
router.register(r"classes", views.ClassRoomViewSet, basename="classroom")
router.register(r"assignments", views.AssignmentViewSet, basename="assignment")

# EDU-8 MCQ bank (separate router so it mounts under /classroom/mcq/).
mcq_router = DefaultRouter()
mcq_router.register(r"", views.MCQItemViewSet, basename="mcq")

urlpatterns = list(router.urls)

# ---------------------------------------------------------------------------
# Wave C (EDU-4/7/8): MCQ bank, quiz sheets/submits/stats, file deliverables,
# exam-mode status.
# ---------------------------------------------------------------------------
urlpatterns += [
    path(
        "assignments/<int:assignment_id>/quiz/",
        views.assignment_quiz_view,
        name="assignment-quiz",
    ),
    path(
        "assignments/<int:assignment_id>/quiz/submit/",
        views.quiz_submit_view,
        name="assignment-quiz-submit",
    ),
    path(
        "assignments/<int:assignment_id>/quiz/stats/",
        views.quiz_stats_view,
        name="assignment-quiz-stats",
    ),
    path(
        "assignments/<int:assignment_id>/deliverables/",
        views.deliverables_view,
        name="assignment-deliverables",
    ),
    path("exam-mode/", views.exam_mode_view, name="exam-mode"),
    path("mcq/", include((mcq_router.urls, "mcq"), namespace="mcq-api")),
]
