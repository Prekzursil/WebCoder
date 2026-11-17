"""Wave E learning-engine models (items 29/30/33/34/35).

- ``SkillEdge`` (item 30): prerequisite edges between TAGS — the skill
  graph. Nodes are the existing tags (with the user's mastery coming from
  ``users.statistics.tag_skill_profile``); edges say what unlocks what.
- ``TheoryCard`` (item 33): tag-linked flashcards (front/back, RO+EN) —
  the two-minute theory refresher between problems.

The remaining engine surfaces (spaced-repeat queue, practice plan,
mistake profile) are derivations over submission history — no new state
(see ``learning/engine.py``).
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class SkillEdge(models.Model):
    """A prerequisite arrow between two tags (item 30).

    ``to_tag`` requires ``from_tag``: the practice-next strip and the
    /skills graph render locked nodes until their prerequisites have at
    least one solve.
    """

    from_tag = models.ForeignKey(
        "problems.Tag",
        on_delete=models.CASCADE,
        related_name="skill_children",
        verbose_name=_("from (prerequisite)"),
    )
    to_tag = models.ForeignKey(
        "problems.Tag",
        on_delete=models.CASCADE,
        related_name="skill_parents",
        verbose_name=_("to (requires)"),
    )

    class Meta:
        verbose_name = _("skill edge")
        verbose_name_plural = _("skill edges")
        constraints = [
            models.UniqueConstraint(
                fields=["from_tag", "to_tag"], name="unique_skill_edge"
            )
        ]

    def __str__(self):
        return f"{self.from_tag_id} -> {self.to_tag_id}"


class TheoryCard(models.Model):
    """A bilingual flashcard tied to a tag (item 33)."""

    tag = models.ForeignKey(
        "problems.Tag",
        on_delete=models.CASCADE,
        related_name="theory_cards",
        verbose_name=_("tag"),
    )
    front_ro = models.TextField(_("front (Romanian)"))
    front_en = models.TextField(_("front (English)"))
    back_ro = models.TextField(_("back (Romanian)"))
    back_en = models.TextField(_("back (English)"))
    order = models.PositiveIntegerField(_("order"), default=0)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="theory_cards",
        verbose_name=_("created by"),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("theory card")
        verbose_name_plural = _("theory cards")
        ordering = ["tag", "order", "id"]

    def __str__(self):
        return f"{self.tag_id}: {self.front_en[:40]}"


class Drill(models.Model):
    """A practice drill (wave E items 36/37/38/40).

    Three kinds, one JSON payload contract:

    - ``READ_CODE`` (item 36): a code snippet + "what does this output?"
      — the options are the choices, the answer the right index.
    - ``COMPLEXITY`` (item 38): a snippet + complexity options.
    - ``MICRO`` (item 37): fill-the-line micro-exercise built on the
      partial-code discipline — the payload carries the template with a
      ``___`` blank and the accepted answer lines (normalized compare).

    The daily warmup (item 40) is a deterministic date-hash pick over the
    three kinds — no new state.
    """

    class Kind(models.TextChoices):
        READ_CODE = "READ_CODE", _("Read the code")
        COMPLEXITY = "COMPLEXITY", _("Complexity drill")
        MICRO = "MICRO", _("Fill the line")

    kind = models.CharField(_("kind"), max_length=12, choices=Kind.choices)
    tag = models.ForeignKey(
        "problems.Tag",
        on_delete=models.CASCADE,
        related_name="drills",
        verbose_name=_("tag"),
    )
    payload = models.JSONField(
        _("payload"),
        help_text=_(
            "{code, question_ro, question_en, options_ro[], options_en[], "
            "answer (index or accepted lines), explanation_ro, explanation_en}"
        ),
    )
    order = models.PositiveIntegerField(_("order"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("drill")
        verbose_name_plural = _("drills")
        ordering = ["kind", "order", "id"]

    def __str__(self):
        return f"{self.kind} #{self.id} ({self.tag_id})"
