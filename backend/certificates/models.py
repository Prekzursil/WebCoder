"""Atestat models — Wave D certifications/attestations (the honest variant).

The roadmap reserves certifications for "only with brand recognition; a
leaderboard-derived 'atestat' is the honest variant": every certificate is
DERIVED from activity the platform already attests to (a rated contest you
officially finished, a rating milestone you crossed in a rated contest, a
solve count from the judged archive) — never from a self-paced "skill test"
nobody proctored. Each row is publicly verifiable by UUID
(H-120 verifiable participation certificates) and revocable with an audit
reason (integrity: rollback/DQ tooling).
"""

import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class Certificate(models.Model):
    """One issued atestat.

    Identity/dedup keys by kind:

    - ``CONTEST_PARTICIPATION`` — unique per (user, contest): an official
      (non-virtual, non-DQ) finisher of a RATED contest, with the final rank
      and post-contest rating snapshotted in ``details``.
    - ``RATING_MILESTONE`` — unique per (user, threshold): the ladder
      thresholds (1200…2000) crossed in rated competition.
    - ``SOLVE_MILESTONE`` — unique per (user, threshold): distinct APPROVED
      problems solved (10…500), the same derivation the leaderboard uses.
    """

    # NB: single-string member form — under the repo's no-django-stubs
    # typecheck the tuple form's label half infers as a tuple, breaking
    # every use of a member as a ``str``. Human labels live in the
    # frontend catalogs.
    class Kind(models.TextChoices):
        CONTEST_PARTICIPATION = "CONTEST_PARTICIPATION"
        RATING_MILESTONE = "RATING_MILESTONE"
        SOLVE_MILESTONE = "SOLVE_MILESTONE"
        # Item 148 (wave G section K): teacher-certification exam pass.
        TEACHER = "TEACHER"

    #: Public verification id — printed on the atestat; the verify endpoint
    #: is anonymous so employers/teachers can check it without an account.
    uuid = models.UUIDField(
        _("verification id"), default=uuid.uuid4, editable=False, unique=True
    )
    #: Human serial ``WC-YYYY-NNNNNN`` (allocated from the row pk on issue).
    serial = models.CharField(_("serial"), max_length=20, editable=False)

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="certificates",
        verbose_name=_("holder"),
    )
    kind = models.CharField(_("kind"), max_length=24, choices=Kind.choices)

    #: Discriminators for the per-kind uniqueness above (exactly one of
    #: contest/threshold is set per kind; PROTECT keeps issued atestats
    #: answerable even if a contest row were ever removed).
    contest = models.ForeignKey(
        "contests.Contest",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="certificates",
        verbose_name=_("contest"),
    )
    threshold = models.PositiveIntegerField(
        _("milestone threshold"), null=True, blank=True
    )

    #: Immutable achievement snapshot at issue time (rank, rating, solve
    #: count, contest title/slug) — the atestat must not change meaning
    #: when the live objects are later edited.
    details = models.JSONField(_("achievement snapshot"), default=dict)

    issued_at = models.DateTimeField(_("issued at"), auto_now_add=True)

    #: Revocation (integrity): a rolled-back rating, a post-contest DQ, or
    #: an admin action flips the atestat to REVOKED — verification keeps
    #: answering, honestly, that the achievement no longer stands.
    revoked_at = models.DateTimeField(_("revoked at"), null=True, blank=True)
    revoked_reason = models.CharField(
        _("revocation reason"), max_length=200, blank=True
    )

    class Meta:
        verbose_name = _("certificate")
        verbose_name_plural = _("certificates")
        ordering = ["-issued_at", "-id"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "kind", "contest"],
                condition=models.Q(contest__isnull=False),
                name="uniq_certificate_contest",
            ),
            models.UniqueConstraint(
                fields=["user", "kind", "threshold"],
                condition=models.Q(threshold__isnull=False),
                name="uniq_certificate_threshold",
            ),
            models.CheckConstraint(
                condition=models.Q(kind="CONTEST_PARTICIPATION", contest__isnull=False)
                | models.Q(kind="RATING_MILESTONE", threshold__isnull=False)
                | models.Q(kind="SOLVE_MILESTONE", threshold__isnull=False)
                # Item 148: the teacher cert's discriminator is the exam
                # score in `details` — no contest/threshold.
                | models.Q(
                    kind="TEACHER", contest__isnull=True, threshold__isnull=True
                ),
                name="certificate_kind_has_its_discriminator",
            ),
        ]
        indexes = [
            models.Index(fields=["user", "-issued_at"]),
            models.Index(fields=["kind"]),
        ]

    def __str__(self):
        return f"{self.serial} {self.get_kind_display()} for {self.user_id}"

    @property
    def is_revoked(self) -> bool:
        return self.revoked_at is not None

    @property
    def status(self) -> str:
        return "REVOKED" if self.is_revoked else "VALID"


class TeacherCertQuestion(models.Model):
    """Item 148 — one multiple-choice exam question (platform + classroom
    policy knowledge). The bank is seeded by seed_teacher_cert_exam."""

    question = models.TextField(_("question"), unique=True)
    choices = models.JSONField(_("choices"), default=list)
    correct_index = models.PositiveSmallIntegerField(_("correct choice index"))
    active = models.BooleanField(_("active"), default=True)

    class Meta:
        verbose_name = _("teacher certification question")
        verbose_name_plural = _("teacher certification questions")
        ordering = ["id"]

    def __str__(self):
        return self.question[:80]


class TeacherCertAttempt(models.Model):
    """One graded exam attempt (audit trail: who tried, when, score)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="teacher_cert_attempts",
        verbose_name=_("teacher"),
    )
    score = models.FloatField(_("score (fraction)"))
    passed = models.BooleanField(_("passed"))
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("teacher certification attempt")
        verbose_name_plural = _("teacher certification attempts")
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.user_id}: {self.score:.0%} ({'pass' if self.passed else 'fail'})"
