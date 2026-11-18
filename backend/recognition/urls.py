"""Recognition routes, mounted under /api/v1/community/."""

from django.urls import path

from . import views

app_name = "recognition"

urlpatterns = [
    # Item 66 — reputation tiers + privileges.
    path("reputation/me/", views.MyReputationView.as_view(), name="my_reputation"),
    path("reputation/tiers/", views.ReputationTiersView.as_view(), name="reputation_tiers"),
    # Item 67 — community awards.
    path("awards/", views.AwardsView.as_view(), name="awards"),
    path("awards/grant/", views.AwardGrantView.as_view(), name="award_grant"),
    # Item 68 — medalist AMAs.
    path("amas/", views.AmaListView.as_view(), name="amas"),
    path("amas/<int:session_id>/", views.AmaDetailView.as_view(), name="ama_detail"),
    path("amas/<int:session_id>/questions/", views.AmaAskView.as_view(), name="ama_ask"),
    path(
        "amas/questions/<int:question_id>/answer/",
        views.AmaAnswerView.as_view(),
        name="ama_answer",
    ),
    path(
        "amas/questions/<int:question_id>/upvote/",
        views.AmaUpvoteView.as_view(),
        name="ama_upvote",
    ),
    # Item 69 — the problem-request board.
    path("problem-requests/", views.ProblemRequestListView.as_view(), name="problem_requests"),
    path(
        "problem-requests/<int:request_id>/vote/",
        views.ProblemRequestVoteView.as_view(),
        name="problem_request_vote",
    ),
    path(
        "problem-requests/<int:request_id>/status/",
        views.ProblemRequestStatusView.as_view(),
        name="problem_request_status",
    ),
]
