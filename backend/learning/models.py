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
