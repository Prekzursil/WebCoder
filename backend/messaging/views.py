"""COM-5 REST surface (mounted at /api/v1/messages/).

Safety stack, end-to-end:

- every write path re-checks :func:`messaging.services.can_message`
  (blocks + minor policy) — nothing bypasses it;
- send + thread-start carry their own ScopedRateThrottle budgets
  (``message_send`` 30/hour, ``message_thread`` 10/hour — env
  overridable, see settings.py);
- the thread list HIDES conversations whose other party blocked the
  viewer (blocked users cannot even see the thread exists);
- per-message reporting lands in the moderator queue
  (``moderation/reports/``) with the forum report resolve contract;
- the admin audit view lists thread METADATA only; full transcripts are
  sealed behind an explicit report on the thread.
"""

from django.contrib.auth import get_user_model
from django.db.models import Exists, OuterRef, Q
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView
from webcoder_api.pagination import (
    NewestFirstCursorPagination,
    StandardPageNumberPagination,
)

from forum.permissions import IsModerator
from .models import Block, Conversation, Message, MessageReport
from .serializers import (
    AdminConversationSerializer,
    BlockCreateSerializer,
    BlockSerializer,
    ConversationCreateSerializer,
    ConversationSerializer,
    FlaggedMessageSerializer,
    MessageCreateSerializer,
    MessageReportCreateSerializer,
    MessageReportSerializer,
    MessageSerializer,
    TranscriptSerializer,
)
from .services import (
    PolicyError,
    audit_visible_conversations,
    get_or_start_conversation,
    send_message,
)

User = get_user_model()


def _now():
    """Request-time "now" (single import point; tests freeze via the
    django.utils.timezone patcher without touching every call site)."""
    from django.utils import timezone

    return timezone.now()


class ConversationPagination(StandardPageNumberPagination):
    page_size = 20


class MessageCursorPagination(NewestFirstCursorPagination):
    """Message history: newest-first cursor (new rows drift pages)."""

    page_size = 30


def _visible_conversations(user):
    """The viewer's threads, minus ones hidden by a block.

    A block hides the thread from the BLOCKED side entirely: if the
    other participant blocked the viewer, the conversation vanishes
    from their list (and detail lookups 404).
    """
    blocked_by_user1 = Block.objects.filter(blocker=OuterRef("user1"), blocked=user)
    blocked_by_user2 = Block.objects.filter(blocker=OuterRef("user2"), blocked=user)
    return (
        Conversation.objects.filter(Q(user1=user) | Q(user2=user))
        .annotate(
            _hidden_1=Exists(blocked_by_user1),
            _hidden_2=Exists(blocked_by_user2),
        )
        .exclude(
            (Q(user1=user) & Q(_hidden_2=True)) | (Q(user2=user) & Q(_hidden_1=True))
        )
    )


def _resolve_target_user(serializer_validated, request):
    """user_id or username -> User, or None when no such user exists.

    The create serializers guarantee exactly one key is present and
    non-empty, so the lookup is exhaustive.
    """
    user_id = serializer_validated.get("user_id")
    if user_id is not None:
        return User.objects.filter(pk=user_id).first()
    return User.objects.filter(username=serializer_validated.get("username")).first()


class ConversationListCreateView(generics.ListCreateAPIView):
    """GET: my threads (block-hidden ones excluded). POST: start a thread."""

    permission_classes = [permissions.IsAuthenticated]
    pagination_class = ConversationPagination

    def get_throttles(self):
        # Only the POST (thread start) pays the new-thread budget; the
        # list read keeps the global default classes.
        if self.request.method == "POST":
            self.throttle_scope = "message_thread"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.request.method == "POST":
            return ConversationCreateSerializer
        return ConversationSerializer

    def get_queryset(self):
        return (
            _visible_conversations(self.request.user)
            .select_related("user1", "user2")
            .order_by("-updated_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = _resolve_target_user(serializer.validated_data, request)
        if target is None:
            return Response(
                {"detail": "No such user."},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            conversation, created = get_or_start_conversation(request.user, target)
        except PolicyError as exc:
            return Response({"detail": exc.code}, status=status.HTTP_403_FORBIDDEN)
        output = ConversationSerializer(
            conversation, context=self.get_serializer_context()
        )
        return Response(
            output.data,
            status=(status.HTTP_201_CREATED if created else status.HTTP_200_OK),
        )


class ConversationDetailView(generics.RetrieveAPIView):
    """Thread metadata for a participant (block-hidden threads 404)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = ConversationSerializer

    def get_queryset(self):
        return _visible_conversations(self.request.user).select_related(
            "user1", "user2"
        )


class ThreadMessagesView(generics.ListAPIView):
    """Message history inside one of the viewer's threads (cursor)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MessageSerializer
    pagination_class = MessageCursorPagination

    def get_queryset(self):
        return Message.objects.filter(
            conversation_id=self.kwargs["thread_pk"],
            conversation__in=_visible_conversations(self.request.user),
        )


class ThreadSendView(APIView):
    """POST a message into one of the viewer's threads."""

    permission_classes = [permissions.IsAuthenticated]

    def get_throttles(self):
        self.throttle_scope = "message_send"
        return [ScopedRateThrottle()]

    def post(self, request, thread_pk):
        conversation = (
            _visible_conversations(request.user)
            .filter(pk=thread_pk)
            .select_related("user1", "user2")
            .first()
        )
        if conversation is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            message = send_message(
                request.user, conversation, serializer.validated_data["body"]
            )
        except PolicyError as exc:
            return Response({"detail": exc.code}, status=status.HTTP_403_FORBIDDEN)
        return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)


class ThreadReadView(APIView):
    """Mark the other party's messages in a thread as read (idempotent)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, thread_pk):
        conversation = _visible_conversations(request.user).filter(pk=thread_pk).first()
        if conversation is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        other = conversation.other_user(request.user)
        updated = Message.objects.filter(
            conversation=conversation,
            sender=other,
            read_at__isnull=True,
        ).update(read_at=_now())
        return Response({"marked_read": updated})


class MessageReportView(generics.CreateAPIView):
    """Report a private message into the moderation queue."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = MessageReportCreateSerializer

    def create(self, request, *args, **kwargs):
        # Merge the URL's message pk into the payload; form-encoded
        # QueryDicts flatten via .dict() so values stay scalars.
        base = (
            request.data.dict() if hasattr(request.data, "dict") else dict(request.data)
        )
        serializer = self.get_serializer(data={**base, "message": kwargs.get("pk")})
        serializer.is_valid(raise_exception=True)
        message = serializer.validated_data.get("message")
        # Only a participant of the thread may report inside it — a
        # leaked message id must not open a reporting channel.
        participant = message and (
            request.user == message.sender
            or request.user in (message.conversation.user1, message.conversation.user2)
        )
        if not participant:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if MessageReport.objects.filter(
            reporter=request.user, message=message
        ).exists():
            return Response(
                {"detail": "You already reported this message."},
                status=status.HTTP_409_CONFLICT,
            )
        report = serializer.save(reporter=request.user)
        return Response(
            MessageReportSerializer(report).data,
            status=status.HTTP_201_CREATED,
        )


class BlockListCreateView(generics.ListCreateAPIView):
    """List / create the viewer's blocks (mute list)."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BlockSerializer
    pagination_class = ConversationPagination

    def get_queryset(self):
        return (
            Block.objects.filter(blocker=self.request.user)
            .select_related("blocked")
            .order_by("-created_at")
        )

    def create(self, request, *args, **kwargs):
        serializer = BlockCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = _resolve_target_user(serializer.validated_data, request)
        if target is None:
            return Response(
                {"detail": "No such user."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target == request.user:
            return Response({"detail": "self"}, status=status.HTTP_400_BAD_REQUEST)
        block, _created = Block.objects.get_or_create(
            blocker=request.user, blocked=target
        )
        return Response(BlockSerializer(block).data, status=status.HTTP_201_CREATED)


class BlockDestroyView(APIView):
    """DELETE /blocks/<user_id>/ — lift a block."""

    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request, user_id):
        deleted, _ = Block.objects.filter(
            blocker=request.user, blocked_id=user_id
        ).delete()
        if not deleted:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ModerationReportListView(generics.ListAPIView):
    """The message-report queue: moderators only (forum parity)."""

    permission_classes = [permissions.IsAuthenticated, IsModerator]
    serializer_class = MessageReportSerializer
    pagination_class = ConversationPagination

    def get_queryset(self):
        queryset = MessageReport.objects.select_related(
            "reporter", "resolved_by", "message__sender"
        )
        status_filter = self.request.query_params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        return queryset


class ModerationReportResolveView(APIView):
    """Resolve/dismiss a message report (forum report contract)."""

    permission_classes = [permissions.IsAuthenticated, IsModerator]

    def post(self, request, pk):
        report = MessageReport.objects.filter(pk=pk).first()
        if report is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        action = request.data.get("action")
        if action not in ("resolved", "dismissed"):
            return Response(
                {"action": "Must be 'resolved' or 'dismissed'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        report.status = (
            MessageReport.Status.RESOLVED
            if action == "resolved"
            else MessageReport.Status.DISMISSED
        )
        report.resolution_note = request.data.get("note", "")
        report.resolved_by = request.user
        report.save(update_fields=["status", "resolution_note", "resolved_by"])
        return Response(MessageReportSerializer(report).data)


class ModerationFlaggedListView(generics.ListAPIView):
    """Content-filter hits (flag-not-block): moderators only."""

    permission_classes = [permissions.IsAuthenticated, IsModerator]
    serializer_class = FlaggedMessageSerializer
    pagination_class = ConversationPagination

    def get_queryset(self):
        return (
            Message.objects.filter(is_flagged=True)
            .select_related("sender")
            .order_by("-created_at")
        )


class AdminThreadListView(generics.ListAPIView):
    """Admin audit view: thread METADATA only, by default.

    Admins/staff see every thread; teachers see only threads involving
    students of their own classes (the documented minor-safety
    visibility toggle). Bodies never travel here — the transcript
    endpoint below gates them behind an explicit report.
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AdminConversationSerializer
    pagination_class = ConversationPagination

    def get_queryset(self):
        return (
            audit_visible_conversations(self.request.user)
            .select_related("user1", "user2")
            .order_by("-updated_at")
        )

    def list(self, request, *args, **kwargs):
        visible = audit_visible_conversations(request.user)
        if not visible.exists():
            # Basic users (and strangers' teachers) have no audit surface.
            return Response(
                {"detail": "Not allowed."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().list(request, *args, **kwargs)


class AdminTranscriptView(APIView):
    """Full transcript of a thread — ONLY when it has an explicit report.

    The privacy contract: metadata by default (AdminThreadListView);
    bodies surface when a participant filed a report on a message in
    the thread (or an auto-flag exists with a matching report), never
    on curiosity alone.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        queryset = audit_visible_conversations(request.user).filter(pk=pk)
        conversation = queryset.first()
        if conversation is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        has_report = MessageReport.objects.filter(
            message__conversation=conversation
        ).exists()
        if not has_report:
            return Response(
                {"detail": "transcript_requires_report"},
                status=status.HTTP_403_FORBIDDEN,
            )
        messages = conversation.messages.select_related("sender")
        return Response(
            {
                "conversation": AdminConversationSerializer(conversation).data,
                "messages": TranscriptSerializer(messages, many=True).data,
            }
        )
