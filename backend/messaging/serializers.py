"""COM-5 serializers.

Bodies are PLAIN TEXT ONLY: the message serializer accepts a string,
enforces the length and rejects control characters, and the client
renders it as text — never HTML, never markdown (XSS-safe by
construction; there is no rich-text pipeline to sanitize).
"""

from django.contrib.auth import get_user_model
from rest_framework import serializers

from .models import Block, Conversation, Message, MessageReport
from .services import MAX_BODY_LENGTH

User = get_user_model()


def _sanitize_body(value: str) -> str:
    """Validate message text: 1..4000 chars, no control characters."""
    if not value or not value.strip():
        raise serializers.ValidationError("Message body cannot be empty.")
    if len(value) > MAX_BODY_LENGTH:
        raise serializers.ValidationError(
            f"Message body exceeds {MAX_BODY_LENGTH} characters."
        )
    # C0 controls except tab/newline/CR would smuggle escapes through
    # naive clients; strip-check them outright.
    if any(ord(ch) < 32 and ch not in "\t\n\r" for ch in value):
        raise serializers.ValidationError(
            "Message body contains control characters."
        )
    return value


class PublicUserSerializer(serializers.ModelSerializer):
    """The minimal user shape messaging surfaces (never email/role/etc.)."""

    class Meta:
        model = User
        fields = ("id", "username")
        read_only_fields = fields


class MessageSerializer(serializers.ModelSerializer):
    """Participant-facing message row.

    Deliberately omits ``is_flagged``/``flag_categories``: the filter's
    verdict is for moderators, not for the sender (who would otherwise
    learn which phrasings evade the scan).
    """

    sender = PublicUserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = ("id", "sender", "body", "created_at", "read_at")
        read_only_fields = fields


class MessageCreateSerializer(serializers.Serializer):
    body = serializers.CharField(write_only=True)

    def validate_body(self, value):
        return _sanitize_body(value)


class ConversationCreateSerializer(serializers.Serializer):
    """Start (or fetch) a thread — by user id or username."""

    user_id = serializers.IntegerField(required=False, min_value=1)
    username = serializers.CharField(required=False, max_length=150)

    def validate(self, attrs):
        if not ("user_id" in attrs or "username" in attrs):
            raise serializers.ValidationError(
                "Provide either user_id or username."
            )
        return attrs


class ConversationSerializer(serializers.ModelSerializer):
    """Thread-list row: the other party, recency, unread badge, excerpt."""

    other_user = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "other_user",
            "unread_count",
            "last_message",
            "created_at",
            "updated_at",
        )

    def get_other_user(self, obj):
        viewer = self.context["request"].user
        return PublicUserSerializer(obj.other_user(viewer)).data

    def get_unread_count(self, obj):
        viewer = self.context["request"].user
        return obj.messages.filter(sender=obj.other_user(viewer), read_at__isnull=True).count()

    def get_last_message(self, obj):
        last = obj.messages.order_by("-created_at", "-id").first()
        if last is None:
            return None
        return {
            "sender_id": last.sender_id,
            "excerpt": last.body[:120],
            "created_at": last.created_at,
        }


class BlockCreateSerializer(serializers.Serializer):
    user_id = serializers.IntegerField(required=False, min_value=1)
    username = serializers.CharField(required=False, max_length=150)

    def validate(self, attrs):
        if not ("user_id" in attrs or "username" in attrs):
            raise serializers.ValidationError(
                "Provide either user_id or username."
            )
        return attrs


class BlockSerializer(serializers.ModelSerializer):
    blocked = PublicUserSerializer(read_only=True)

    class Meta:
        model = Block
        fields = ("id", "blocked", "created_at")


class MessageReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MessageReport
        fields = ("message", "reason", "details")
        # `reason` is the model's ChoiceField — invalid values are
        # rejected by DRF before any custom hook would run.


class MessageReportSerializer(serializers.ModelSerializer):
    reporter = PublicUserSerializer(read_only=True)
    resolved_by = PublicUserSerializer(read_only=True)
    message = MessageSerializer(read_only=True)

    class Meta:
        model = MessageReport
        fields = (
            "id",
            "message",
            "reporter",
            "reason",
            "details",
            "status",
            "resolution_note",
            "resolved_by",
            "created_at",
        )


class FlaggedMessageSerializer(serializers.ModelSerializer):
    """Moderator-queue view of an auto-flagged message (thread context)."""

    sender = PublicUserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = (
            "id",
            "conversation",
            "sender",
            "body",
            "flag_categories",
            "created_at",
        )


class AdminConversationSerializer(serializers.ModelSerializer):
    """Admin audit METADATA row — no message bodies travel in listings."""

    participants = serializers.SerializerMethodField()
    message_count = serializers.SerializerMethodField()
    has_report = serializers.SerializerMethodField()

    class Meta:
        model = Conversation
        fields = (
            "id",
            "participants",
            "message_count",
            "has_report",
            "created_at",
            "updated_at",
        )

    def get_participants(self, obj):
        return PublicUserSerializer(
            [obj.user1, obj.user2], many=True
        ).data

    def get_message_count(self, obj):
        return obj.messages.count()

    def get_has_report(self, obj):
        return MessageReport.objects.filter(
            message__conversation=obj
        ).exists()


class TranscriptSerializer(serializers.ModelSerializer):
    sender = PublicUserSerializer(read_only=True)

    class Meta:
        model = Message
        fields = (
            "id",
            "sender",
            "body",
            "is_flagged",
            "flag_categories",
            "created_at",
        )
