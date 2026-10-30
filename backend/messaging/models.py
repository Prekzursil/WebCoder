"""COM-5 (competitive roadmap, owner reversal 2026-10-30): 1:1 private
message threads.

The roadmap originally recorded COM-5 as "skip v1 — moderation burden
without learning value"; the owner reversed that on 2026-10-30 with the
condition that the FULL safety stack ships WITH the feature, not after:
per-message reporting, content filtering (flag-not-block), user blocks
honored end-to-end, strict rate limits, minor-safety defaults and an
admin audit view. Everything in this app exists to make that burden
cheap to carry.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Conversation(models.Model):
    """A 1:1 message thread between exactly two users.

    The pair is stored ordered (``user1_id < user2_id``) so the unique
    constraint gives one thread per pair regardless of who started it.
    """

    user1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_as_user1",
        verbose_name=_("participant 1 (lower id)"),
    )
    user2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="conversations_as_user2",
        verbose_name=_("participant 2 (higher id)"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    # Bumped (via update_fields) on every send so the thread list orders
    # by recency without recomputing message max(created_at).
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("conversation")
        verbose_name_plural = _("conversations")
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user1", "user2"], name="unique_conversation_pair"
            ),
            models.CheckConstraint(
                condition=models.Q(user1_id__lt=models.F("user2_id")),
                name="conversation_ordered_pair",
            ),
        ]
        indexes = [
            models.Index(fields=["user1", "-updated_at"]),
            models.Index(fields=["user2", "-updated_at"]),
        ]

    def __str__(self):
        return f"Conversation({self.id}: {self.user1_id}<->{self.user2_id})"

    @classmethod
    def for_pair(cls, a, b):
        """Return the existing conversation for users a/b, or None."""
        lo, hi = (a, b) if a.pk <= b.pk else (b, a)
        return cls.objects.filter(user1=lo, user2=hi).first()

    def other_user(self, user):
        """The participant that is not ``user`` (None when not a member)."""
        if user == self.user1:
            return self.user2
        if user == self.user2:
            return self.user1
        return None


class Message(models.Model):
    """One message inside a conversation.

    ``body`` is plain text only — the client renders it as text, never
    HTML/markdown (XSS-safe by construction; the serializer enforces the
    length and rejects control characters). ``is_flagged`` +
    ``flag_categories`` carry the COM-5 content-filter verdict:
    flag-not-block, surfaced to moderators for review.
    """

    conversation = models.ForeignKey(
        Conversation,
        on_delete=models.CASCADE,
        related_name="messages",
        verbose_name=_("conversation"),
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="sent_messages",
        verbose_name=_("sender"),
    )
    body = models.TextField(_("body"))
    is_flagged = models.BooleanField(
        _("flagged by content filter"),
        default=False,
        help_text=_("RO+EN heuristic scan hit; delivered, queued for review."),
    )
    flag_categories = models.JSONField(
        _("flag categories"),
        default=list,
        blank=True,
        help_text=_("Filter categories that matched, e.g. grooming."),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    read_at = models.DateTimeField(
        _("read at"), null=True, blank=True
    )  # null = unread

    class Meta:
        verbose_name = _("message")
        verbose_name_plural = _("messages")
        ordering = ["created_at", "id"]
        indexes = [
            models.Index(fields=["conversation", "created_at"]),
            models.Index(fields=["conversation", "read_at"]),
            models.Index(fields=["is_flagged", "-created_at"]),
        ]

    def __str__(self):
        return f"Message({self.id} in conversation {self.conversation_id})"


class Block(models.Model):
    """A user block ("mute"): the blocker refuses messages from ``blocked``.

    Honored end-to-end: the blocked user cannot start a thread with the
    blocker, cannot send into an existing thread, and the thread is
    hidden from their conversation list entirely.
    """

    blocker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="message_blocks",
        verbose_name=_("blocker"),
    )
    blocked = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blocked_by",
        verbose_name=_("blocked user"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("message block")
        verbose_name_plural = _("message blocks")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["blocker", "blocked"], name="unique_block_pair"
            ),
            models.CheckConstraint(
                condition=~models.Q(blocker=models.F("blocked")),
                name="no_self_block",
            ),
        ]

    def __str__(self):
        return f"Block({self.blocker_id} -> {self.blocked_id})"


class MessageReport(models.Model):
    """A user report against a private message, for the moderation queue.

    Mirrors forum.Report's shape (reason/details/status/resolve) so the
    moderation surface stays one workflow; a separate model keeps the
    forum's audit trail free of private-message references.
    """

    class Reason(models.TextChoices):
        SPAM = "SPAM", _("Spam")
        ABUSE = "ABUSE", _("Abuse")
        GROOMING = "GROOMING", _("Grooming")
        OTHER = "OTHER", _("Other")

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Open")
        RESOLVED = "RESOLVED", _("Resolved")
        DISMISSED = "DISMISSED", _("Dismissed")

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name="reports",
        verbose_name=_("message"),
    )
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="filed_message_reports",
        verbose_name=_("reporter"),
    )
    reason = models.CharField(_("reason"), max_length=16, choices=Reason.choices)
    details = models.TextField(_("details"), blank=True)
    status = models.CharField(
        _("status"), max_length=16, choices=Status.choices, default=Status.OPEN
    )
    resolution_note = models.TextField(_("resolution note"), blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="resolved_message_reports",
        verbose_name=_("resolved by"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("message report")
        verbose_name_plural = _("message reports")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["reporter", "message"], name="unique_message_report"
            )
        ]

    def __str__(self):
        return f"MessageReport({self.id}: {self.reason} on message {self.message_id})"
