"""Classroom models (competitive roadmap Wave B: EDU-1/EDU-2/EDU-3).

The pbinfo/campion lesson (roadmap §5): classroom tooling stays minimal —
rosters with student self-join, problem-set assignments (teme) with publish
windows, and nothing else. No LMS.

EDU-3 soft-expiry is deliberately *not* a model constraint: a submission
counts for an assignment iff ``available_from <= submission_time <= due_at``
(or ``late_until`` when set, flagged late) — one pure join condition in
:class:`Assignment.association`, copied verbatim from the pbinfo semantic.
The judge never blocks late learning; the gradebook simply ignores it.
"""

import secrets

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _


def _generate_join_code() -> str:
    """Readable, unambiguous join code (no 0/O, 1/I) for self-join URLs."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(secrets.choice(alphabet) for _ in range(8))


class ClassRoom(models.Model):
    """A teacher's roster (EDU-1).

    Students self-join with the shareable ``join_code`` (+ optional
    ``join_password``) — pbinfo's anti-abuse design: the teacher never types
    student accounts. ``join_password`` is stored hashed; blank = code only.
    """

    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="classrooms",
        verbose_name=_("teacher"),
    )
    name = models.CharField(_("name"), max_length=120)
    # Optional school context (RO-3): keeps county/school leaderboards honest
    # without exposing anything on public profiles.
    school = models.CharField(_("school"), max_length=160, blank=True)
    join_code = models.CharField(
        _("join code"),
        max_length=8,
        unique=True,
        editable=False,
        help_text=_("Shareable code students use to self-join."),
    )
    join_password = models.CharField(
        _("join password (hashed)"),
        max_length=128,
        blank=True,
        default="",
        help_text=_("Optional second factor for joining; empty = code only."),
    )
    is_open = models.BooleanField(
        _("open for joining"),
        default=True,
        help_text=_("Closed classes reject new self-joins; members stay."),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("classroom")
        verbose_name_plural = _("classrooms")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.name} ({self.teacher_id})"

    def save(self, *args, **kwargs):
        if not self.join_code:
            # Collision against an existing code is astronomically unlikely
            # (8 chars from a 32-char alphabet); regenerate once if the
            # unique constraint loses the lottery.
            code = _generate_join_code()
            while ClassRoom.objects.filter(join_code=code).exists():
                code = _generate_join_code()
            self.join_code = code
        super().save(*args, **kwargs)

    def check_join_password(self, raw: str) -> bool:
        """True when no password is set, or *raw* matches the stored hash."""
        if not self.join_password:
            return True
        from django.contrib.auth.hashers import check_password

        return check_password(raw or "", self.join_password)

    def set_join_password(self, raw: str):
        from django.contrib.auth.hashers import make_password

        self.join_password = make_password(raw) if raw else ""


class ClassMembership(models.Model):
    """A student's membership in a class (EDU-1 self-join)."""

    classroom = models.ForeignKey(
        ClassRoom, on_delete=models.CASCADE, related_name="memberships"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="class_memberships",
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("class membership")
        verbose_name_plural = _("class memberships")
        ordering = ["joined_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["classroom", "student"], name="unique_classroom_student"
            )
        ]

    def __str__(self):
        return f"{self.student_id}@{self.classroom_id}"


class Assignment(models.Model):
    """A problem-set homework (temă) with a publish window (EDU-2).

    Lifecycle mirrors pbinfo's three states — nepublicată / în curs de
    rezolvare / expirată — derived, never stored, via :meth:`state`.
    ``is_exam`` ships as a flag now (EDU-2 "mod examen"); the site-lockdown
    enforcement itself is EDU-4 (Wave C).
    """

    class State(models.TextChoices):
        SCHEDULED = "SCHEDULED", _("Scheduled (not published yet)")
        OPEN = "OPEN", _("Open for solving")
        CLOSED = "CLOSED", _("Expired")

    classroom = models.ForeignKey(
        ClassRoom, on_delete=models.CASCADE, related_name="assignments"
    )
    title_i18n = models.JSONField(
        _("title (i18n)"),
        help_text=_("Assignment title per locale, e.g. {'en':…,'ro':…}"),
    )
    description = models.TextField(_("description"), blank=True)
    available_from = models.DateTimeField(_("available from"))
    due_at = models.DateTimeField(_("due at"))
    # EDU-3: soft expiry — when set, submissions in (due_at, late_until]
    # still count but are flagged late; after late_until they stop counting.
    late_until = models.DateTimeField(_("late until"), null=True, blank=True)
    is_exam = models.BooleanField(
        _("exam mode"),
        default=False,
        help_text=_("Flag only in this increment; lockdown lands with EDU-4."),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("assignment")
        verbose_name_plural = _("assignments")
        ordering = ["-available_from"]

    def __str__(self):
        if isinstance(self.title_i18n, dict):
            return self.title_i18n.get(
                "en", self.title_i18n.get("ro", f"Assignment {self.id}")
            )
        return f"Assignment {self.id}"

    @property
    def effective_due_at(self):
        """The last instant a submission can still count (EDU-3)."""
        return self.late_until or self.due_at

    def state(self, now=None) -> str:
        now = now or timezone.now()
        if now < self.available_from:
            return self.State.SCHEDULED
        if now <= self.effective_due_at:
            return self.State.OPEN
        return self.State.CLOSED

    def association(self, submission_time) -> str | None:
        """EDU-3 soft-expiry rule, verbatim.

        Returns ``"ONTIME"``, ``"LATE"`` or ``None`` (does not count).
        The judge is never blocked; only the gradebook's join condition
        decides whether a submission is associated with this assignment.
        """
        if submission_time < self.available_from:
            return None
        if submission_time <= self.due_at:
            return "ONTIME"
        if self.late_until and submission_time <= self.late_until:
            return "LATE"
        return None


class AssignmentProblem(models.Model):
    """Ordered assignment<->problem membership with per-assignment points."""

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="assignment_problems"
    )
    problem = models.ForeignKey(
        "problems.Problem",
        on_delete=models.CASCADE,
        related_name="assignment_problems",
    )
    order = models.PositiveIntegerField(
        _("order"), default=0, help_text=_("Display order (0 = A).")
    )
    label = models.CharField(
        _("label"), max_length=8, blank=True, help_text=_("A, B, C…; auto-assigned.")
    )
    points = models.PositiveIntegerField(
        _("points"), default=100, help_text=_("Max points inside this assignment.")
    )

    class Meta:
        verbose_name = _("assignment problem")
        verbose_name_plural = _("assignment problems")
        ordering = ["assignment", "order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "problem"], name="unique_assignment_problem"
            )
        ]

    def save(self, *args, **kwargs):
        if not self.label:
            self.label = chr(ord("A") + (self.order % 26))
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.assignment_id}:{self.label} (problem {self.problem_id})"
