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

    def __str__(self):
        return self.username
