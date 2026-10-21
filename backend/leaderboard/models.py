from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class LeaderboardEntry(models.Model):
    """Denormalized per-user leaderboard row (SPEC-GAPS D-B8).

    Computed from submissions by ``leaderboard.aggregation`` (single SQL
    pass, no N+1); a solve = AC verdict on an APPROVED problem, points
    credited once per (user, problem) as the sum of that problem's
    TestCase.points. ``total_submissions``/``ac_submissions`` back the
    success-rate column requested by the backend-features wave.
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="leaderboard_entry",
        verbose_name=_("user"),
    )
    solved_count = models.PositiveIntegerField(_("solved count"), default=0)
    total_points = models.PositiveIntegerField(_("total points"), default=0)
    total_submissions = models.PositiveIntegerField(
        _("total submissions"), default=0
    )
    ac_submissions = models.PositiveIntegerField(
        _("accepted submissions"), default=0
    )
    last_solved_at = models.DateTimeField(_("last solved at"), null=True, blank=True)
    updated_at = models.DateTimeField(_("updated at"), auto_now=True)

    class Meta:
        verbose_name = _("leaderboard entry")
        verbose_name_plural = _("leaderboard entries")
        # Most points first; then most solved; earlier last-solve wins ties.
        ordering = ["-total_points", "-solved_count", "last_solved_at"]
        indexes = [models.Index(fields=["-total_points"])]

    def __str__(self):
        return f"LeaderboardEntry(user={self.user_id}, points={self.total_points})"
