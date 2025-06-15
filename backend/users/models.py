from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.translation import gettext_lazy as _

class User(AbstractUser):
    """
    Custom User model for WebCoder.
    Inherits from Django's AbstractUser and adds role-based functionalities.
    """
    class Roles(models.TextChoices):
        BASIC_USER = 'BASIC', _('Basic User')
        PROBLEM_CREATOR = 'CREATOR', _('Problem Creator')
        PROBLEM_VERIFIER = 'VERIFIER', _('Problem Verifier')
        ADMIN = 'ADMIN', _('Admin') # Django's is_superuser can also denote admin

    # We can use Django's built-in groups and permissions for fine-grained control,
    # but a simple role field can be useful for quick checks and broader role categories.
    # Alternatively, is_staff and is_superuser can map to some of these roles.
    # For now, let's add an explicit role field.
    # The default AbstractUser already has username, first_name, last_name, email,
    # is_staff, is_active, is_superuser, date_joined, last_login.

    role = models.CharField(
        _('role'),
        max_length=10,
        choices=Roles.choices,
        default=Roles.BASIC_USER,
        help_text=_('The primary role of the user on the platform.')
    )

    # Add any additional fields specific to WebCoder users here in the future
    # For example:
    # profile_picture = models.ImageField(upload_to='profile_pics/', null=True, blank=True)
    # bio = models.TextField(max_length=500, blank=True)
    # country = models.CharField(max_length=100, blank=True)

    def __str__(self):
        return self.username

    # You might add helper properties here later, e.g.:
    # @property
    # def is_problem_creator(self):
    #     return self.role in {self.Roles.PROBLEM_CREATOR, self.Roles.PROBLEM_VERIFIER, self.Roles.ADMIN}

    # @property
    # def is_problem_verifier(self):
    #     return self.role in {self.Roles.PROBLEM_VERIFIER, self.Roles.ADMIN}
