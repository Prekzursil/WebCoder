from django.conf import settings
from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _


class User(AbstractUser):
    """
    Custom User model for WebCoder.
    Inherits from Django's AbstractUser and adds role-based functionalities.
    """

    class Roles(models.TextChoices):
        BASIC_USER = "BASIC", _("Basic User")
        PROBLEM_CREATOR = "CREATOR", _("Problem Creator")
        PROBLEM_VERIFIER = "VERIFIER", _("Problem Verifier")
        # EDU-1: granted by an ADMIN after teacher verification (school/email
        # check) — never a self-service checkbox.
        TEACHER = "TEACHER", _("Teacher")
        ADMIN = "ADMIN", _("Admin")  # Django's is_superuser can also denote admin

    # We can use Django's built-in groups and permissions for fine-grained control,
    # but a simple role field can be useful for quick checks and broader role categories.
    # Alternatively, is_staff and is_superuser can map to some of these roles.
    # For now, let's add an explicit role field.
    # The default AbstractUser already has username, first_name, last_name, email,
    # is_staff, is_active, is_superuser, date_joined, last_login.

    role = models.CharField(
        _("role"),
        max_length=10,
        choices=Roles.choices,
        default=Roles.BASIC_USER,
        help_text=_("The primary role of the user on the platform."),
    )

    # Add any additional fields specific to WebCoder users here in the future
    # For example:
    # profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    # bio = models.TextField(max_length=500, blank=True)
    # country = models.CharField(max_length=100, blank=True)

    # RO-3 (competitive roadmap): optional Olympiad-geography identity —
    # feeds county/school leaderboard segments. Real names stay NOT
    # required (deliberate differentiation from pbinfo's real-name policy).
    county = models.CharField(_("county"), max_length=64, blank=True)
    school = models.CharField(_("school"), max_length=160, blank=True)
    # LEG-2 (round-2): GDPR Art. 8 — Romania kept the information-society
    # consent age at 16, so minor accounts default to privacy-first:
    # county/school never render on their public profile and they are
    # excluded from public leaderboard segments.
    is_minor = models.BooleanField(
        _("minor account (under 16)"),
        default=False,
        help_text=_(
            "Minors' profiles default non-public: county/school hidden, "
            "no leaderboard segments."
        ),
    )

    # GDPR account control (round-2 LEG-1/X5): set when the account is
    # soft-deleted; the purge_deleted_users beat task removes user-authored
    # side content once this timestamp passes (submissions/leaderboard stay,
    # anonymized). Null on active accounts and after the purge ran.
    scheduled_purge_at = models.DateTimeField(
        _("scheduled purge at"),
        null=True,
        blank=True,
        help_text=_("When purging this deleted account's side content is due."),
    )

    # TOTP two-factor auth (competitive roadmap OPS-2): stdlib RFC 6238
    # (users/totp.py). The secret is stored base32 while enrollment is in
    # progress AND after it completes — verification needs the raw secret
    # (a hash would be unverifiable), the same trust model django-otp
    # uses. ``two_factor_enabled`` only flips after a live code verified.
    two_factor_secret = models.CharField(
        _("TOTP secret"),
        max_length=64,
        blank=True,
        help_text=_("Base32 TOTP secret while enrolling or enrolled (OPS-2)."),
    )
    two_factor_enabled = models.BooleanField(
        _("two-factor enabled"),
        default=False,
        help_text=_("TOTP verified at least once (OPS-2)."),
    )

    #: Roles the 2FA policy treats as privileged (OPS-2: content supply
    #: chain + administration). Kept as a class constant so permissions,
    #: serializers and the login banner agree on one definition.
    PRIVILEGED_ROLES = (
        Roles.PROBLEM_CREATOR,
        Roles.PROBLEM_VERIFIER,
        Roles.TEACHER,
        Roles.ADMIN,
    )

    @property
    def is_privileged(self) -> bool:
        """Privileged-role member (or staff) — the 2FA policy cohort."""
        return self.is_staff or self.role in self.PRIVILEGED_ROLES

    def __str__(self):
        return self.username


class OwnerWeeklySnapshot(models.Model):
    """ANA-1 (round-2; completed in Wave D): the week's activation and
    retention derivations, frozen on capture — the trend behind the
    weekly owner dashboard.

    ``week`` is the ISO year-week key (``YYYY-Www``) — one row per week;
    re-capturing the same week overwrites (idempotent backfills).
    """

    week = models.CharField(
        _("ISO week"),
        max_length=8,
        unique=True,
        db_index=True,
        help_text=_("ISO year-week key, e.g. 2026-W44."),
    )
    captured_at = models.DateTimeField(_("captured at"), auto_now=True)
    payload = models.JSONField(
        _("metrics payload"),
        help_text=_("The activation_snapshot() derivations for the week."),
    )

    class Meta:
        verbose_name = _("owner weekly snapshot")
        verbose_name_plural = _("owner weekly snapshots")
        ordering = ["-week"]

    def __str__(self):
        return f"owner metrics {self.week}"


class Follow(models.Model):
    """COM-4 (competitive roadmap): the friends/follow graph.

    Deliberately minimal — one directed edge per (follower, target) pair.
    The payoff surface is friends-filtered views: contest standings and
    the practice leaderboard expose ``?friends=1`` limited to the viewer
    plus the people they follow (the Codeforces friends-only standings
    pattern). No feeds, no activity fan-out: notifications already cover
    reply loops, and the roadmap defers anything heavier until the
    community demands it.
    """

    follower = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="following",
        verbose_name=_("follower"),
    )
    target = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="followers",
        verbose_name=_("target"),
    )
    created_at = models.DateTimeField(_("created at"), auto_now_add=True)

    class Meta:
        verbose_name = _("follow")
        verbose_name_plural = _("follows")
        constraints = [
            models.UniqueConstraint(
                fields=["follower", "target"], name="unique_follow_pair"
            ),
            models.CheckConstraint(
                condition=~models.Q(follower=models.F("target")),
                name="no_self_follow",
            ),
        ]
        indexes = [models.Index(fields=["follower", "created_at"])]

    def __str__(self):
        return f"{self.follower_id} -> {self.target_id}"
