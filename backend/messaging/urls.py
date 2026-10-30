from django.urls import path

from .views import (
    AdminThreadListView,
    AdminTranscriptView,
    BlockDestroyView,
    BlockListCreateView,
    ConversationDetailView,
    ConversationListCreateView,
    MessageReportView,
    ModerationFlaggedListView,
    ModerationReportListView,
    ModerationReportResolveView,
    ThreadMessagesView,
    ThreadReadView,
    ThreadSendView,
)

app_name = "messaging"

urlpatterns = [
    # Threads: list/start, detail, history (cursor), send, mark-read.
    path("threads/", ConversationListCreateView.as_view(), name="threads"),
    path(
        "threads/<int:pk>/",
        ConversationDetailView.as_view(),
        name="thread-detail",
    ),
    path(
        "threads/<int:thread_pk>/messages/",
        ThreadMessagesView.as_view(),
        name="thread-messages",
    ),
    path(
        "threads/<int:thread_pk>/send/",
        ThreadSendView.as_view(),
        name="thread-send",
    ),
    path(
        "threads/<int:thread_pk>/read/",
        ThreadReadView.as_view(),
        name="thread-read",
    ),
    # Per-message reporting into the moderation queue.
    path(
        "messages/<int:pk>/report/",
        MessageReportView.as_view(),
        name="message-report",
    ),
    # Blocks (mute list).
    path("blocks/", BlockListCreateView.as_view(), name="blocks"),
    path(
        "blocks/<int:user_id>/",
        BlockDestroyView.as_view(),
        name="block-detail",
    ),
    # Moderation queue (forum report parity).
    path(
        "moderation/reports/",
        ModerationReportListView.as_view(),
        name="moderation-reports",
    ),
    path(
        "moderation/reports/<int:pk>/resolve/",
        ModerationReportResolveView.as_view(),
        name="moderation-resolve",
    ),
    path(
        "moderation/flagged/",
        ModerationFlaggedListView.as_view(),
        name="moderation-flagged",
    ),
    # Admin audit: metadata by default, transcript behind a report.
    path(
        "admin/threads/",
        AdminThreadListView.as_view(),
        name="admin-threads",
    ),
    path(
        "admin/threads/<int:pk>/transcript/",
        AdminTranscriptView.as_view(),
        name="admin-transcript",
    ),
]
