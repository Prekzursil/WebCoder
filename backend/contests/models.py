"""Contest models (competitive roadmap Wave B: CON-1/CON-2/CON-3/CON-6/PRF-1).

The engine is deliberately format-agnostic: ``Contest.format`` selects a
ranking strategy (``contests.formats``) over materialized per-(participation,
problem) score rows (``ContestScore``, round-2 PRF-1) so scoreboard reads
never recompute verdict history. Windowed contests (CON-6) give each
participation a personal timer via ``virtual_start`` + ``per_user_duration``.
"""

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


class Contest(models.Model):
    """A scheduled contest with registration, gating, standings and freeze."""

    class Visibility(models.TextChoices):
        PUBLIC = "PUBLIC", _("Public")
        PRIVATE = "PRIVATE", _("Private (invite code)")

    class Format(models.TextChoices):
        IOI = "IOI", _("IOI (sum of best per-problem points)")
        ICPC = "ICPC", _("ICPC (solved count + penalty minutes)")
        ATCODER = "ATCODER", _("AtCoder (points + time penalty)")

    class State(models.TextChoices):
        UPCOMING = "UPCOMING", _("Upcoming")
        RUNNING = "RUNNING", _("Running")
        FINISHED = "FINISHED", _("Finished")

    title_i18n = models.JSONField(
        _("title (i18n)"), help_text=_("Contest title per locale, e.g. {'en':…,'ro':…}")
    )
    description_i18n = models.JSONField(
        _("description (i18n)"),
        default=dict,
        blank=True,
        help_text=_("Optional per-locale description markdown."),
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_contests",
        verbose_name=_("created by"),
    )
    visibility = models.CharField(
        _("visibility"),
        max_length=10,
        choices=Visibility.choices,
        default=Visibility.PUBLIC,
    )
    # Invite code for PRIVATE contests (X1 "invite links" — the code rides in
    # a shareable URL ?code=… and unlocks self-registration).
    access_code = models.CharField(
        _("access code"),
        max_length=32,
        blank=True,
        default="",
        help_text=_("Self-registration code for PRIVATE contests."),
    )
    is_rated = models.BooleanField(
        _("is rated"),
        default=False,
        help_text=_("Ratings (Glicko) update when this contest finalizes."),
    )
    format = models.CharField(
        _("format"),
        max_length=10,
        choices=Format.choices,
        default=Format.IOI,
    )
    # ICPC wrong-submission penalty minutes (DOMjudge-style, CE-free).
    penalty_time_minutes = models.PositiveIntegerField(
        _("ICPC penalty time (minutes)"), default=20
    )
    # AtCoder-style per-wrong-submission penalty on solved problems.
    penalty_factor_minutes = models.PositiveIntegerField(
        _("AtCoder penalty factor (minutes)"), default=5
    )

    start_at = models.DateTimeField(_("starts at"))
    end_at = models.DateTimeField(_("ends at"))
    # Scoreboard freeze (CON-3): public standings only reflect submissions
    # made at or before this instant; organizers always see the live board.
    # ``POST /contests/{id}/unfreeze/`` clears it deliberately.
    freeze_at = models.DateTimeField(_("freeze at"), null=True, blank=True)
    # Windowed personal-timer contests (CON-6): each participation gets one
    # timed sitting inside [start_at, end_at].
    is_window = models.BooleanField(
        _("windowed (personal timers)"),
        default=False,
        help_text=_(
            "Participants start any time inside the window and get "
            "per_user_duration_minutes on their personal clock."
        ),
    )
    per_user_duration_minutes = models.PositiveIntegerField(
        _("per-user duration (minutes)"), default=180
    )
    # CON-8 pretests: during the contest the judge runs only tests flagged
    # is_pretest; the end-of-contest pass re-judges on the full suite.
    pretest_mode = models.BooleanField(
        _("pretest mode"),
        default=False,
        help_text=_("Judge only pretest-flagged tests while the contest runs."),
    )
    # Upsolving (CON-5 archive half): minutes after end_at before contest
    # problems revert to ordinary practice (editorials often land here).
    editorial_delay_minutes = models.PositiveIntegerField(
        _("editorial delay (minutes)"), default=0
    )

    # Set once by the finalize beat task when the contest ends: marks that
    # the end-of-contest pass (full-suite rejudge of pretest submissions)
    # has been scheduled, keeping the tick idempotent.
    finalized_at = models.DateTimeField(_("finalized at"), null=True, blank=True)
    # Round-2 SAF-2: set when an organizer discards this contest's ratings
    # (post-contest DQ / integrity action) — the ratings replay skips it and
    # finalize never (re)rates it.
    ratings_discarded = models.BooleanField(_("ratings discarded"), default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("contest")
        verbose_name_plural = _("contests")
        ordering = ["-start_at"]
        indexes = [models.Index(fields=["start_at"])]

    def __str__(self):
        if isinstance(self.title_i18n, dict):
            return self.title_i18n.get("en", self.title_i18n.get("ro", f"Contest {self.id}"))
        return f"Contest {self.id}"

    @property
    def duration(self) -> int:
        """Scheduled length in minutes (window contests: the outer window)."""
        delta = self.end_at - self.start_at
        return max(0, int(delta.total_seconds() // 60))

    def state(self, now=None) -> str:
        now = now or timezone.now()
        if now < self.start_at:
            return self.State.UPCOMING
        if now < self.end_at:
            return self.State.RUNNING
        return self.State.FINISHED

    def is_ongoing(self, now=None) -> bool:
        """True while submissions can still be made by *someone* (CON-1's
        "active contest" definition used to pin problem edits)."""
        return self.state(now) in (self.State.UPCOMING, self.State.RUNNING)

    def upsolving_free_at(self):
        """When the problems fully revert to practice (CON-5 archive mode)."""
        from datetime import timedelta

        return self.end_at + timedelta(minutes=self.editorial_delay_minutes)


class ContestProblem(models.Model):
    """Ordered contest<->problem membership with per-contest max points."""

    contest = models.ForeignKey(
        Contest, on_delete=models.CASCADE, related_name="contest_problems"
    )
    problem = models.ForeignKey(
        "problems.Problem",
        on_delete=models.CASCADE,
        related_name="contest_problems",
    )
    order = models.PositiveIntegerField(
        _("order"), default=0, help_text=_("Display/judging order (0 = A).")
    )
    label = models.CharField(
        _("label"),
        max_length=8,
        blank=True,
        help_text=_("Board label (A, B, C…); auto-assigned when blank."),
    )
    points = models.PositiveIntegerField(
        _("points"),
        default=100,
        help_text=_("Max points this problem is worth inside the contest."),
    )

    class Meta:
        verbose_name = _("contest problem")
        verbose_name_plural = _("contest problems")
        ordering = ["contest", "order", "id"]
        constraints = [
            models.UniqueConstraint(fields=["contest", "problem"], name="unique_contest_problem")
        ]

    def save(self, *args, **kwargs):
        if not self.label:
            self.label = chr(ord("A") + (self.order % 26))
            if self.order >= 26:  # pragma: no cover - 27+ problem contests
                self.label = f"{self.label}{self.order // 26}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.contest_id}:{self.label} (problem {self.problem_id})"


class ContestParticipation(models.Model):
    """A user's registration/sitting in a contest (CON-1 + CON-6)."""

    contest = models.ForeignKey(
        Contest, on_delete=models.CASCADE, related_name="participations"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="contest_participations",
    )
    # Windowed contests (CON-6): set by POST /contests/{id}/start/; the
    # personal deadline is min(virtual_start + duration, contest.end_at).
    virtual_start = models.DateTimeField(_("personal start"), null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    # Contest integrity (round-2 SAF-2): organizers can DQ a participation;
    # disqualified rows keep their scores but vanish from standings/ratings.
    is_disqualified = models.BooleanField(_("disqualified"), default=False)
    disqualification_reason = models.TextField(_("disqualification reason"), blank=True)

    class Meta:
        verbose_name = _("contest participation")
        verbose_name_plural = _("contest participations")
        constraints = [
            models.UniqueConstraint(fields=["contest", "user"], name="unique_contest_user")
        ]

    def __str__(self):
        return f"{self.user_id}@{self.contest_id}"

    def effective_start(self):
        return self.virtual_start or self.contest.start_at

    def effective_end(self):
        from datetime import timedelta

        contest = self.contest
        if contest.is_window and self.virtual_start:
            return min(
                self.virtual_start + timedelta(minutes=contest.per_user_duration_minutes),
                contest.end_at,
            )
        return contest.end_at

    def window_open(self, now=None) -> bool:
        now = now or timezone.now()
        return self.effective_start() <= now < self.effective_end()


class ContestScore(models.Model):
    """Materialized standings row (round-2 PRF-1).

    One row per (participation, contest problem), updated on every terminal
    verdict commit (``contests.scoring.record_verdict``). Scoreboard reads
    aggregate these rows per ``Contest.format`` — they never recompute from
    the submission history.

    Each aggregate exists twice: the *live* variant reflects every judged
    submission, the ``frozen`` variant only submissions made at or before
    ``Contest.freeze_at`` — the public board reads the frozen columns while
    the freeze is in effect; organizers read the live ones (CON-3).
    """

    participation = models.ForeignKey(
        ContestParticipation, on_delete=models.CASCADE, related_name="scores"
    )
    contest_problem = models.ForeignKey(
        ContestProblem, on_delete=models.CASCADE, related_name="scores"
    )
    best_score = models.FloatField(_("best score (live)"), default=0)
    best_score_frozen = models.FloatField(_("best score (frozen view)"), default=0)
    attempts = models.PositiveIntegerField(_("attempts (live)"), default=0)
    attempts_frozen = models.PositiveIntegerField(_("attempts (frozen view)"), default=0)
    # Wrong (non-CE) submissions that scored nothing before the first full
    # solve — the ICPC/AtCoder penalty input. Only meaningful on solved rows.
    wrong_before_ac = models.PositiveIntegerField(default=0)
    wrong_before_ac_frozen = models.PositiveIntegerField(default=0)
    first_ac_at = models.DateTimeField(_("first full-solve at"), null=True, blank=True)
    first_ac_at_frozen = models.DateTimeField(null=True, blank=True)
    last_improvement = models.DateTimeField(_("last score improvement"), null=True, blank=True)
    last_improvement_frozen = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("contest score row")
        verbose_name_plural = _("contest score rows")
        constraints = [
            models.UniqueConstraint(
                fields=["participation", "contest_problem"],
                name="unique_participation_problem_score",
            )
        ]

    def __str__(self):
        return f"score {self.participation_id}/{self.contest_problem_id}"


#: Organizer canned answers (CON-4, .campion precedent): rendered as
#: one-click buttons in the jury UI; the API stays free-text.
CLARIFICATION_CANNED_ANSWERS = [
    "Yes",
    "No",
    "No comment",
    "Read the statement again",
]


class Clarification(models.Model):
    """Participant→jury question (CON-4).

    Private by default (asker + organizers); ``is_broadcast`` publishes the
    Q&A pair to every participant via a notification. Moderation basics
    (round-2 SAF-1): organizers can hide an abusive question — hidden rows
    disappear from participant lists while staying auditable.
    """

    contest = models.ForeignKey(
        Contest, on_delete=models.CASCADE, related_name="clarifications"
    )
    problem = models.ForeignKey(
        "problems.Problem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="clarifications",
        verbose_name=_("problem"),
        help_text=_("Optional: the question is about this board problem."),
    )
    asker = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="asked_clarifications",
    )
    question = models.TextField(_("question"), max_length=2000)
    answer = models.TextField(_("answer"), blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="answered_clarifications",
    )
    answered_at = models.DateTimeField(_("answered at"), null=True, blank=True)
    is_broadcast = models.BooleanField(
        _("broadcast"), default=False, help_text=_("Publish to all participants.")
    )
    is_hidden = models.BooleanField(_("hidden"), default=False)
    hidden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hidden_clarifications",
    )
    hidden_reason = models.CharField(_("hidden reason"), max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("clarification")
        verbose_name_plural = _("clarifications")
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["contest", "-created_at"])]

    def __str__(self):
        return f"clarification #{self.id} on contest {self.contest_id}"
