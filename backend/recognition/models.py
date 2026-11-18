"""Recognition app (wave F items 66/67/68/69).

- ``CommunityAward`` — site-wide (non-contest) awards: admin-granted
  specials + the monthly contributor-of-the-month derivation.
- ``AmaSession`` / ``AmaQuestion`` — medalist ask-me-anything sessions.
- ``ProblemRequest`` / ``ProblemRequestVote`` — the problem-request board
  where the community votes on what authors should build next.

Reputation tiers (item 66) live in ``reputation.py`` as a derivation over
the shipped honor system.
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class CommunityAward(models.Model):
    """Item 67 — one award row on a user's shelf."""

    class Kind(models.TextChoices):
        CONTRIBUTOR_OF_MONTH = "CONTRIBUTOR_OF_MONTH", _("Contributor of the month")
        FIRST_PROBLEM = "FIRST_PROBLEM", _("First approved problem")
        PROLIFIC_AUTHOR = "PROLIFIC_AUTHOR", _("Prolific author (25+ problems)")
        TRANSLATOR = "TRANSLATOR", _("Translator")
        HELPING_HAND = "HELPING_HAND", _("Helping hand")
        MEDALIST = "MEDALIST", _("Contest medalist")
        LEGEND = "LEGEND", _("Legend of the platform")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="community_awards",
    )
    kind = models.CharField(_("kind"), max_length=24, choices=Kind.choices)
    reason = models.CharField(_("reason"), max_length=200, blank=True)
    awarded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_awards",
        verbose_name=_("awarded by"),
    )
    # For monthly awards: the month bucket ("2026-11") keeping the
    # derivation idempotent — one award per (user, kind, month).
    period = models.CharField(_("period"), max_length=7, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("community award")
        verbose_name_plural = _("community awards")
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kind", "period"],
                name="unique_award_per_period",
            )
        ]

    def __str__(self):
        return f"{self.kind} for user {self.user_id}"


class AmaSession(models.Model):
    """Item 68 — an ask-me-anything session hosted by a medalist."""

    class Status(models.TextChoices):
        SCHEDULED = "SCHEDULED", _("Scheduled")
        LIVE = "LIVE", _("Live")
        CLOSED = "CLOSED", _("Closed")

    host = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="hosted_amas",
    )
    title = models.CharField(_("title"), max_length=200)
    description = models.TextField(_("description"), max_length=2000)
    starts_at = models.DateTimeField(_("starts at"))
    ends_at = models.DateTimeField(_("ends at"))
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("AMA session")
        verbose_name_plural = _("AMA sessions")
        ordering = ["-starts_at"]

    def __str__(self):
        return f"AMA: {self.title}"

    def status(self, now=None) -> str:
        from django.utils import timezone

        now = now or timezone.now()
        if now < self.starts_at:
            return str(self.Status.SCHEDULED)
        if now > self.ends_at:
            return str(self.Status.CLOSED)
        return str(self.Status.LIVE)


class AmaQuestion(models.Model):
    """One question (with the host's answer) inside a session."""

    session = models.ForeignKey(
        AmaSession, on_delete=models.CASCADE, related_name="questions"
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ama_questions",
    )
    question = models.TextField(_("question"), max_length=2000)
    answer = models.TextField(_("answer"), blank=True)
    answered_at = models.DateTimeField(_("answered at"), null=True, blank=True)
    upvotes = models.PositiveIntegerField(_("upvotes"), default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("AMA question")
        verbose_name_plural = _("AMA questions")
        ordering = ["-upvotes", "created_at"]

    def __str__(self):
        return f"AMA question {self.id} in session {self.session_id}"


class AmaVote(models.Model):
    """One upvote per (user, question)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="ama_votes",
    )
    question = models.ForeignKey(
        AmaQuestion, on_delete=models.CASCADE, related_name="votes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("AMA vote")
        verbose_name_plural = _("AMA votes")
        constraints = [
            models.UniqueConstraint(fields=["user", "question"], name="unique_ama_vote")
        ]

    def __str__(self):
        return f"vote by {self.user_id} on question {self.question_id}"


class ProblemRequest(models.Model):
    """Item 69 — a community request for a problem (or problem type)."""

    class Status(models.TextChoices):
        OPEN = "OPEN", _("Open")
        PLANNED = "PLANNED", _("Planned")
        FULFILLED = "FULFILLED", _("Fulfilled")
        DECLINED = "DECLINED", _("Declined")

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_requests",
    )
    title = models.CharField(_("title"), max_length=200)
    description = models.TextField(_("description"), max_length=4000)
    status = models.CharField(
        _("status"), max_length=10, choices=Status.choices, default=Status.OPEN
    )
    fulfilled_problem = models.ForeignKey(
        "problems.Problem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="fulfilled_requests",
        verbose_name=_("fulfilled problem"),
    )
    vote_count = models.PositiveIntegerField(_("votes"), default=0)  # denormalized
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("problem request")
        verbose_name_plural = _("problem requests")
        ordering = ["-vote_count", "-created_at"]

    def __str__(self):
        return f"request #{self.id}: {self.title}"


class ProblemRequestVote(models.Model):
    """One vote per (user, request); withdrawing deletes the row."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="problem_request_votes",
    )
    request = models.ForeignKey(
        ProblemRequest, on_delete=models.CASCADE, related_name="votes"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("problem request vote")
        verbose_name_plural = _("problem request votes")
        constraints = [
            models.UniqueConstraint(
                fields=["user", "request"], name="unique_request_vote"
            )
        ]

    def __str__(self):
        return f"vote by {self.user_id} on request {self.request_id}"
