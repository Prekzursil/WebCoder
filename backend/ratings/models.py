"""Rating models (competitive roadmap RAT-1/RAT-2/SAF-2).

Glicko with rating deviation — the infoarena precedent — chosen over plain
Elo because RD absorbs sparse activity on a small platform. Every user
carries one ``UserRating`` state row (the next period's inputs); every rated
contest appends one ``RatingHistory`` row per participant (the audit trail
rating-rollback replays deterministically).
"""

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

#: Glicko constants (Glickman 1999, applied per contest period).
DEFAULT_RATING = 1500
DEFAULT_RD = 350.0
#: RD volatility per YEAR of inactivity — scaled from Glickman's canonical
#: per-period c=63.2 (24 monthly periods ≈ 2 years from RD 50 to the 350
#: ceiling) into a single yearly constant: sqrt(24)·63.2 ≈ 309.7? That
#: overshoots (reaches the cap at ~1.2y); the 2-year calibration is
#: sqrt((350² − 50²)/2) ≈ 244.9.
RD_C_PER_YEAR = 244.9
RD_MAX = 350.0


class UserRating(models.Model):
    """A user's live Glicko state (RAT-1) + display engineering (RAT-2).

    ``rating``/``rd`` are the INTERNAL Glicko numbers the engine consumes;
    what the UI shows is ``display_rating`` — the internal rating with
    AtCoder-style newcomer suppression applied so a learner's first contests
    cannot tank their visible handle (roadmap RAT-2's day-one rule).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rating_state",
        verbose_name=_("user"),
    )
    rating = models.PositiveIntegerField(
        _("internal rating"), default=DEFAULT_RATING
    )
    rd = models.FloatField(_("rating deviation"), default=DEFAULT_RD)
    contests_count = models.PositiveIntegerField(default=0)
    last_competition_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("user rating")
        verbose_name_plural = _("user ratings")
        ordering = ["-rating"]

    def __str__(self):
        return f"{self.user_id}: {self.rating}±{round(self.rd)}"

    # -- RAT-2 display engineering ------------------------------------

    @staticmethod
    def suppression(contests_count: int) -> int:
        """AtCoder's published suppression curve (atcoder.jp/posts/16):
        fewer than 5 contests −400, fewer than 9 −200, fewer than 14 −100.
        Cheap at launch, painful as a retrofit — shipped inside RAT-1 by
        design."""
        if contests_count < 5:
            return 400
        if contests_count < 9:
            return 200
        if contests_count < 14:
            return 100
        return 0

    @property
    def display_rating(self) -> int:
        return max(0, self.rating - self.suppression(self.contests_count))


class RatingHistory(models.Model):
    """One per (user, rated contest) — the replayable audit trail."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="rating_history",
        verbose_name=_("user"),
    )
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.CASCADE,
        related_name="rating_history",
        verbose_name=_("contest"),
    )
    rank = models.PositiveIntegerField(_("final rank in contest"))
    rating = models.PositiveIntegerField(_("internal rating after"))
    rd = models.FloatField(_("rating deviation after"))
    delta = models.IntegerField(_("change vs previous internal rating"))
    # Contests count INCLUDING this one — freezes the suppression curve at
    # the moment of the update so history rows render exactly as the UI
    # showed them at the time.
    contests_count = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("rating history entry")
        verbose_name_plural = _("rating history entries")
        ordering = ["-contest__end_at", "rank"]
        constraints = [
            models.UniqueConstraint(fields=["user", "contest"], name="unique_user_contest_rating")
        ]

    def __str__(self):
        return f"{self.user_id}@{self.contest_id}: {self.rating} ({self.delta:+d})"

    @property
    def rating_before(self) -> int:
        return self.rating - self.delta

    @property
    def display_rating(self) -> int:
        return max(0, self.rating - UserRating.suppression(self.contests_count))
