"""COM-5 messaging policy + send pipeline.

Every write path funnels through :func:`can_message` so the safety rules
(blocked users cannot send; minors only hear from followed users or
shared-class members) hold end-to-end — thread creation, sends into
existing threads, all of it.
"""

from django.db import transaction

from notifications.services import notify
from users.models import Follow, User

from .filters import scan_message
from .models import Block, Conversation, Message

#: Maximum message length (serializer mirrors this; kept here so the
#: service layer can be used outside the REST surface).
MAX_BODY_LENGTH = 4000


class PolicyError(Exception):
    """A send/thread-start would violate a messaging safety rule."""

    def __init__(self, code):
        self.code = code
        super().__init__(code)


def shares_a_classroom(a, b) -> bool:
    """True when users a and b are members of the same class."""
    from classroom.models import ClassMembership

    a_class_ids = ClassMembership.objects.filter(student=a).values_list(
        "classroom_id", flat=True
    )
    return ClassMembership.objects.filter(
        student=b, classroom_id__in=a_class_ids
    ).exists()


def can_message(sender, recipient) -> None:
    """Raise :class:`PolicyError` when sender may not message recipient.

    Rules, in order:

    - ``self`` — no conversations with yourself;
    - ``blocked`` — the recipient blocked the sender (blocks are honored
      on every write path, existing threads included);
    - ``minor_policy`` — recipients flagged ``is_minor`` only accept
      messages from users they follow or share a class with (LEG-2:
      Romania's GDPR Art. 8 age of 16 makes the gimnaziu cohort
      minor-by-default); staff/admins are exempt so support can reach a
      locked-in minor.
    """
    if recipient.pk == sender.pk:
        raise PolicyError("self")
    if Block.objects.filter(blocker=recipient, blocked=sender).exists():
        raise PolicyError("blocked")
    if recipient.is_minor:
        exempt = sender.is_staff or sender.role == User.Roles.ADMIN
        if not exempt:
            follows = Follow.objects.filter(follower=recipient, target=sender).exists()
            if not (follows or shares_a_classroom(recipient, sender)):
                raise PolicyError("minor_policy")


def get_or_start_conversation(sender, recipient):
    """Return ``(conversation, created)`` for the pair's 1:1 thread.

    Policy-checked first: a blocked/forbidden pair cannot conjure a
    thread into existence.
    """
    can_message(sender, recipient)
    lo, hi = (
        (sender, recipient)
        if sender.pk <= recipient.pk
        else (
            recipient,
            sender,
        )
    )
    return Conversation.objects.get_or_create(user1=lo, user2=hi)


def send_message(sender, conversation, body) -> Message:
    """Create one message; returns the persisted Message.

    Re-checks policy at send time (a block may have landed between
    thread start and send), runs the content filter (flag-not-block),
    bumps the thread's recency and queues the MESSAGE_RECEIVED
    notification on commit so a rolled-back transaction never emits.
    """
    recipient = conversation.other_user(sender)
    if recipient is None:
        # Not a participant (REST paths 404 before reaching this; the
        # guard keeps the service safe standalone).
        raise PolicyError("not_participant")
    can_message(sender, recipient)
    categories = scan_message(body)
    message = Message.objects.create(
        conversation=conversation,
        sender=sender,
        body=body,
        is_flagged=bool(categories),
        flag_categories=categories,
    )
    conversation.save(update_fields=["updated_at"])
    excerpt = body[:80]
    transaction.on_commit(
        lambda: notify(
            recipient,
            "MESSAGE_RECEIVED",
            actor=sender,
            target=message,
            data={
                "conversation_id": conversation.pk,
                "message_id": message.pk,
                "excerpt": excerpt,
            },
        )
    )
    return message


def audit_visible_conversations(user):
    """Conversations whose METADATA an auditor may list (admin audit view).

    Admins/staff see all threads (metadata only — participants, counts,
    timestamps; never bodies). Teachers see only threads involving a
    student of one of their classes: the documented minor-safety
    visibility toggle (BACKLOG COM-5 note). Full transcripts stay
    sealed behind an explicit report
    (:class:`messaging.views.AdminTranscriptView`).
    """
    from classroom.models import ClassMembership

    if user.is_staff or user.role == User.Roles.ADMIN:
        return Conversation.objects.all()
    if user.role == User.Roles.TEACHER:
        own_class_ids = ClassMembership.objects.filter(
            classroom__teacher=user
        ).values_list("classroom_id", flat=True)
        student_ids = ClassMembership.objects.filter(
            classroom_id__in=own_class_ids
        ).values_list("student_id", flat=True)
        return Conversation.objects.filter(
            user1_id__in=student_ids
        ) | Conversation.objects.filter(user2_id__in=student_ids)
    return Conversation.objects.none()
