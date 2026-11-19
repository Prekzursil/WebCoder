from django.urls import path

from . import views

app_name = "integrity"

urlpatterns = [
    # Items 113/114 — similarity scans + the flag review surface.
    path("scan/", views.ScanView.as_view(), name="scan"),
    path("flags/", views.SimilarityFlagsView.as_view(), name="flags"),
    path(
        "flags/<int:flag_id>/review/",
        views.SimilarityReviewView.as_view(),
        name="flag_review",
    ),
    # Item 115 — multi-account heuristics.
    path("multi-accounts/", views.MultiAccountView.as_view(), name="multi_accounts"),
    # Item 117 — the unified abuse queue with SLA aging.
    path("abuse-queue/", views.AbuseQueueView.as_view(), name="abuse_queue"),
    # Item 118 — audit trail + appeals.
    path("audit/", views.ModerationAuditView.as_view(), name="audit"),
    path("appeals/", views.AppealView.as_view(), name="appeals"),
    path(
        "appeals/<int:appeal_id>/decide/",
        views.AppealDecideView.as_view(),
        name="appeal_decide",
    ),
]
