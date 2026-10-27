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
        help_text=_("EDU-4: while OPEN, the student's session is site-locked."),
    )

    class Kind(models.TextChoices):
        """Assignment type (EDU-7): the classic problem-set teme, an
        auto-graded MCQ quiz drawn from the Bac bank (EDU-8), or a
        file-upload deliverable teme."""

        PROBLEMS = "PROBLEMS", _("Problem set")
        QUIZ = "QUIZ", _("Quiz (MCQ)")
        FILES = "FILES", _("File upload")

    kind = models.CharField(
        _("kind"), max_length=8, choices=Kind.choices, default=Kind.PROBLEMS
    )
    # QUIZ policy (EDU-7): deterministic per-student variant shuffling.
    quiz_shuffle = models.BooleanField(
        _("shuffle quiz variants"),
        default=True,
        help_text=_("Each student sees variants in a per-student random order."),
    )
    # FILES policy (EDU-7): teacher-set extension allowlist + size cap.
    file_extensions = models.CharField(
        _("allowed file extensions"),
        max_length=200,
        blank=True,
        default="",
        help_text=_("Comma-separated, e.g. 'pdf,zip,cpp'; empty = any."),
    )
    max_file_mb = models.PositiveIntegerField(_("max file size (MB)"), default=10)
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


class MCQItem(models.Model):
    """Auto-graded multiple-choice item (EDU-8 — the Bacalaureat grile bank).

    Bilingual by discipline (question + variants per locale), tagged by
    discipline/grade/chapter and optional Bac provenance, mirroring
    pbinfo's exam-prep surface with EN variants pbinfo cannot offer.
    """

    discipline = models.CharField(
        _("discipline"),
        max_length=64,
        default="Informatics",
        help_text=_("Exam discipline, e.g. Informatics / Computing."),
    )
    grade = models.PositiveSmallIntegerField(
        _("grade"), help_text=_("School grade 5-12 the item targets.")
    )
    chapter = models.ForeignKey(
        "problems.CurriculumNode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="mcq_items",
        verbose_name=_("curriculum chapter"),
    )
    question_i18n = models.JSONField(
        _("question (i18n)"), help_text=_("{'en': ..., 'ro': ...}")
    )
    variants_ro = models.JSONField(
        _("variants (Romanian)"),
        default=list,
        help_text=_("Exactly 4 answer variants, order = display order."),
    )
    variants_en = models.JSONField(
        _("variants (English)"),
        default=list,
        help_text=_("Exactly 4 answer variants, order = display order."),
    )
    correct_index = models.PositiveSmallIntegerField(
        _("correct variant index"), help_text=_("0-3 into the variant lists.")
    )
    source = models.CharField(
        _("source"),
        max_length=120,
        blank=True,
        help_text=_("Provenance, e.g. 'Bacalaureat 2024'."),
    )
    bac_year = models.PositiveSmallIntegerField(
        _("Bacalaureat year"), null=True, blank=True
    )
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="authored_mcq_items",
        verbose_name=_("author"),
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("MCQ item")
        verbose_name_plural = _("MCQ items")
        ordering = ["grade", "id"]
        indexes = [
            models.Index(fields=["discipline", "grade"]),
            models.Index(fields=["bac_year"]),
        ]

    def __str__(self):
        question = (
            self.question_i18n.get("en", "")
            if isinstance(self.question_i18n, dict)
            else ""
        )
        return "MCQ g%d: %s" % (self.grade, question[:48])

    def variants_valid(self) -> bool:
        """Both locale variant lists carry exactly 4 options and the correct
        index points inside them (serializer + admin share this rule)."""
        return (
            isinstance(self.variants_ro, list)
            and isinstance(self.variants_en, list)
            and len(self.variants_ro) == 4
            and len(self.variants_en) == 4
            and 0 <= self.correct_index <= 3
        )


class AssignmentQuizItem(models.Model):
    """Ordered quiz<->MCQ membership inside an assignment (EDU-7)."""

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="quiz_items"
    )
    item = models.ForeignKey(
        MCQItem, on_delete=models.CASCADE, related_name="assignment_links"
    )
    order = models.PositiveIntegerField(_("order"), default=0)

    class Meta:
        verbose_name = _("assignment quiz item")
        verbose_name_plural = _("assignment quiz items")
        ordering = ["assignment", "order", "id"]
        constraints = [
            models.UniqueConstraint(
                fields=["assignment", "item"], name="unique_assignment_quiz_item"
            )
        ]

    def __str__(self):
        return "quiz item %d@%d" % (self.item_id, self.assignment_id)


class QuizSubmission(models.Model):
    """One student's graded answer sheet for a quiz assignment (EDU-7/8).

    ``answers`` maps MCQItem id -> chosen variant index; the denormalized
    ``score`` is correct/total so the gradebook needs no regrade pass.
    Re-attempts while the tema is open create new rows; the grid consumes
    the best attempt, the teacher stats read every attempt.
    """

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="quiz_submissions"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="quiz_submissions",
    )
    answers = models.JSONField(_("answers"), default=dict)
    score = models.FloatField(_("score (0..1)"), default=0)
    correct_count = models.PositiveSmallIntegerField(_("correct answers"), default=0)
    total_count = models.PositiveSmallIntegerField(_("items"), default=0)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("quiz submission")
        verbose_name_plural = _("quiz submissions")
        ordering = ["assignment", "student", "-submitted_at"]

    def __str__(self):
        return "quiz %d/%d=%s" % (self.assignment_id, self.student_id, self.score)


def deliverable_upload_path(instance, filename):
    return "deliverables/%d/%d/%s" % (
        instance.assignment_id,
        instance.student_id,
        filename,
    )


class UploadedDeliverable(models.Model):
    """A student's uploaded file for a FILES teme (EDU-7, pbinfo type 3).

    Validated against the teacher's extension allowlist + size cap at
    upload time; one row per upload so the audit trail survives multiple
    submissions.
    """

    assignment = models.ForeignKey(
        Assignment, on_delete=models.CASCADE, related_name="deliverables"
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="uploaded_deliverables",
    )
    file = models.FileField(_("file"), upload_to=deliverable_upload_path)
    original_filename = models.CharField(_("filename"), max_length=255, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("uploaded deliverable")
        verbose_name_plural = _("uploaded deliverables")
        ordering = ["assignment", "student", "-uploaded_at"]

    def __str__(self):
        return "deliverable %d/%d" % (self.assignment_id, self.student_id)
