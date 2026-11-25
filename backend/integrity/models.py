"""Integrity & safety models (wave G, BACKLOG section H).

- ``SimilarityFlag`` (items 113/114): advisory pairwise similarity flags
  (submission↔submission plagiarism scans, submission↔template boilerplate
  scans) surfaced for VERIFIER/TEACHER/ADMIN review — never auto-punish
  (the roadmap's explicit design rule for JDG-13).
- ``ModerationAction`` (item 118): the append-only audit trail of every
  moderator intervention (report resolutions, hides, DQs, appeals).
- ``Appeal`` (item 118): the user-side appeal against a moderation action.
- ``AbuseQueueSLA`` rows are computed, not stored — see services.py.
"""

from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class SimilarityFlag(models.Model):
    """One advisory similarity finding (items 113/114).

    ``kind`` distinguishes plagiarism scans (two users' submissions on the
    same problem) from boilerplate scans (a submission vs the problem's
    code template / starter skeleton).
    """

    class Kind(models.TextChoices):
        PLAGIARISM = "PLAGIARISM", _("Plagiarism (submission ↔ submission)")
        BOILERPLATE = "BOILERPLATE", _("Boilerplate (submission ↔ template)")

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Open")
        DISMISSED = "DISMISSED", _("Dismissed")
        CONFIRMED = "CONFIRMED", _("Confirmed")

    kind = models.CharField(_("kind"), max_length=16, choices=Kind.choices)
    submission = models.ForeignKey(
        "submissions.Submission",
        on_delete=models.CASCADE,
        related_name="similarity_flags_about",
        verbose_name=_("submission"),
    )
    # Null for boilerplate scans (the counterpart is the template itself).
    other_submission = models.ForeignKey(
        "submissions.Submission",
        on_delete=models.CASCADE,
        related_name="similarity_flags_other",
        null=True,
        blank=True,
        verbose_name=_("other submission"),
    )
    score = models.FloatField(
        _("similarity score (0..1)"), help_text=_("Jaccard over k-gram shingles.")
    )
    status = models.CharField(
        _("status"), max_length=12, choices=Status.choices, default=Status.OPEN
    )
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_similarity_flags",
        verbose_name=_("reviewed by"),
    )
    reviewed_at = models.DateTimeField(_("reviewed at"), null=True, blank=True)
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("similarity flag")
        verbose_name_plural = _("similarity flags")
        ordering = ["-score", "-created_at"]
        indexes = [models.Index(fields=["status", "-created_at"])]

    def __str__(self):
        other = self.other_submission_id or "template"
        return f"{self.kind} {self.submission_id}↔{other} ({self.score:.2f})"


class ModerationAction(models.Model):
    """The append-only moderation audit trail (item 118).

    Every moderator intervention writes one row: who acted, against whom,
    what kind of action, on which target, with the note. Never updated —
    corrections are new rows.
    """

    class ActionKind(models.TextChoices):
        REPORT_RESOLVED = "REPORT_RESOLVED", _("Report resolved")
        REPORT_DISMISSED = "REPORT_DISMISSED", _("Report dismissed")
        CONTENT_HIDDEN = "CONTENT_HIDDEN", _("Content hidden")
        CONTENT_RESTORED = "CONTENT_RESTORED", _("Content restored")
        USER_SUSPENDED = "USER_SUSPENDED", _("User suspended")
        USER_UNSUSPENDED = "USER_UNSUSPENDED", _("User unsuspended")
        CONTEST_DQ = "CONTEST_DQ", _("Contest disqualification")
        RATING_ROLLBACK = "RATING_ROLLBACK", _("Rating rollback")
        SIMILARITY_REVIEWED = "SIMILARITY_REVIEWED", _("Similarity flag reviewed")

    moderator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="moderation_actions",
        verbose_name=_("moderator"),
    )
    target_user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="moderation_actions_against",
        null=True,
        blank=True,
        verbose_name=_("target user"),
    )
    action = models.CharField(_("action"), max_length=24, choices=ActionKind.choices)
    target_ct = models.ForeignKey(
        "contenttypes.ContentType",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="+",
    )
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    note = models.TextField(_("note"), blank=True, default="")
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("moderation action")
        verbose_name_plural = _("moderation actions")
        ordering = ["-created_at"]

    def __str__(self):
        return (
            f"{self.action} by {self.moderator_id} at {self.created_at:%Y-%m-%d %H:%M}"
        )


class Appeal(models.Model):
    """A user's appeal against a moderation action (item 118)."""

    class Status(models.TextChoices):
        PENDING = "PENDING", _("Pending")
        ACCEPTED = "ACCEPTED", _("Accepted")
        REJECTED = "REJECTED", _("Rejected")

    action = models.ForeignKey(
        ModerationAction,
        on_delete=models.CASCADE,
        related_name="appeals",
        verbose_name=_("moderation action"),
    )
    appellant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="appeals",
        verbose_name=_("appellant"),
    )
    text = models.TextField(_("appeal text"))
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.PENDING
    )
    decided_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="appeals_decided",
        verbose_name=_("decided by"),
    )
    decision_note = models.TextField(_("decision note"), blank=True, default="")
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    decided_at = models.DateTimeField(_("decided at"), null=True, blank=True)

    class Meta:
        verbose_name = _("appeal")
        verbose_name_plural = _("appeals")
        ordering = ["-created_at"]

    def __str__(self):
        return f"appeal {self.id} on action {self.action_id} ({self.status})"
