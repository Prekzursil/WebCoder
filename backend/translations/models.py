"""Community translation proposals (i18n & translation platform wave).

Owner rule (c): community members contribute problem translations into
other languages; VERIFIER/ADMIN curate them, optionally assisted by a
pluggable AI curator (see ``ai_curator.py``). An approved proposal is
promoted atomically into the problem's ``title_i18n`` / ``statement_i18n``
by ``views.promote_proposal`` — the proposal row then serves as the
"translated by @user" attribution record.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class TranslationProposal(models.Model):
    """A community-proposed translation of ONE problem into ONE language."""

    class Status(models.TextChoices):
        PENDING = "PENDING", _("Pending review")
        APPROVED = "APPROVED", _("Approved")
        REJECTED = "REJECTED", _("Rejected")

    class AIVerdict(models.TextChoices):
        # Empty string = never screened (curator off at proposal time).
        APPROVE = "approve", _("AI: looks good")
        FLAG = "flag", _("AI: needs a human look")
        ERROR = "error", _("AI: screening failed (fail-open)")

    problem = models.ForeignKey(
        "problems.Problem",
        on_delete=models.CASCADE,
        related_name="translation_proposals",
        verbose_name=_("problem"),
    )
    language = models.CharField(
        _("language"),
        max_length=8,
        help_text=_("Target language code (any UI locale except 'en')."),
    )
    title = models.CharField(_("proposed title"), max_length=255)
    statement = models.TextField(_("proposed statement"))
    contributor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="translation_proposals",
        verbose_name=_("contributor"),
    )
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.PENDING
    )
    reviewer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviewed_translation_proposals",
        verbose_name=_("reviewer"),
    )
    review_note = models.TextField(
        _("review note"), blank=True, default=""
    )  # shown to the contributor on rejection
    reviewed_at = models.DateTimeField(_("reviewed at"), null=True, blank=True)

    # Pluggable AI curator output (never a decision by itself — a human
    # confirms unless AI_CURATOR_AUTO_APPROVE explicitly opts in).
    ai_verdict = models.CharField(
        _("AI verdict"),
        max_length=8,
        choices=AIVerdict.choices,
        blank=True,
        default="",
    )
    ai_confidence = models.FloatField(
        _("AI confidence"), null=True, blank=True
    )  # 0.0–1.0 when screened
    ai_notes = models.TextField(_("AI notes"), blank=True, default="")

    created_at = models.DateTimeField(_("created at"), auto_now_add=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("translation proposal")
        verbose_name_plural = _("translation proposals")
        ordering = ["-created_at"]
        constraints = [
            # One pending proposal per (problem, language, user): edit your
            # draft instead of stacking duplicates into the queue.
            models.UniqueConstraint(
                fields=["problem", "language", "contributor"],
                condition=models.Q(status="PENDING"),
                name="unique_pending_translation_per_contributor",
            ),
        ]
        indexes = [
            models.Index(fields=["status", "-created_at"]),
            models.Index(fields=["problem", "language"]),
        ]

    def __str__(self):
        return f"#{self.pk} {self.language} translation of problem {self.problem_id} by {self.contributor_id} [{self.status}]"
