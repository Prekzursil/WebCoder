"""Publishing routes, mounted under /api/v1/community/."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register(r"blogs", views.BlogPostViewSet, basename="blog-post")

urlpatterns = router.urls + [
    # Item 63 — the member-editable algorithm wiki.
    path("wiki/", views.WikiListView.as_view(), name="wiki-list"),
    path("wiki/<str:slug>/", views.WikiPageView.as_view(), name="wiki-page"),
    path(
        "wiki/<str:slug>/history/", views.WikiHistoryView.as_view(), name="wiki-history"
    ),
    path(
        "wiki/<str:slug>/revert/<int:revision_id>/",
        views.WikiRevertView.as_view(),
        name="wiki-revert",
    ),
    # Item 64 — the explain-my-WA queue.
    path("wa-help/", views.WaHelpView.as_view(), name="wa-help-list"),
    path(
        "wa-help/<int:request_id>/answers/",
        views.WaHelpAnswerView.as_view(),
        name="wa-help-answer",
    ),
    path(
        "wa-help/<int:request_id>/accept/<int:answer_id>/",
        views.WaHelpAcceptView.as_view(),
        name="wa-help-accept",
    ),
]

app_name = "publishing"
