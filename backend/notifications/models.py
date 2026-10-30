from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.utils.translation import gettext_lazy as _


class Notification(models.Model):
    """A single user-facing event (SPEC-GAPS D-B10).

    Delivery-agnostic: v1 is read via the REST endpoints (list, mark-read,
    unread-count badge poll); SSE/WebSocket stay out of scope and can be
    layered later because the model already records actor + generic target.
    """

    class Verb(models.TextChoices):
        SUBMISSION_JUDGED = "SUBMISSION_JUDGED", _("Submission judged")
        THREAD_REPLY = "THREAD_REPLY", _("Thread reply")
        PROBLEM_APPROVED = "PROBLEM_APPROVED", _("Problem approved")
        PROBLEM_REJECTED = "PROBLEM_REJECTED", _("Problem rejected")
        # EDU-2: a teacher published a new tema in one of your classes.
        ASSIGNMENT_PUBLISHED = "ASSIGNMENT_PUBLISHED", _("Assignment published")
        # i18n wave: a community translation proposal decision.
        TRANSLATION_APPROVED = "TRANSLATION_APPROVED", _("Translation approved")
        TRANSLATION_REJECTED = "TRANSLATION_REJECTED", _("Translation rejected")
        SYSTEM = "SYSTEM", _("System")

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name=_("recipient"),
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="actor_notifications",
        verbose_name=_("actor"),
    )
    verb = models.CharField(_("verb"), max_length=20, choices=Verb.choices)
    target_ct = models.ForeignKey(
        ContentType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        verbose_name=_("target content type"),
    )
    target_id = models.PositiveBigIntegerField(
        _("target id"), null=True, blank=True
    )
    target = GenericForeignKey("target_ct", "target_id")
    data = models.JSONField(
        _("data"), default=dict, blank=True
    )  # verdict, problem title, feedback excerpt, ...
    read_at = models.DateTimeField(
        _("read at"), null=True, blank=True
    )  # null = unread
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("notification")
        verbose_name_plural = _("notifications")
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "-created_at"]),
            models.Index(fields=["recipient", "read_at"]),
        ]

    def __str__(self):
        return f"Notification({self.verb} -> {self.recipient_id})"
