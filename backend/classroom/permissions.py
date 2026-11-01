"""Classroom permissions (EDU-1).

The TEACHER role is granted by an ADMIN after verification (the roadmap's
"teacher email/school check" — admin-mediated v1, never an unchecked
self-service checkbox). Admins act as teachers everywhere.
"""

from rest_framework import permissions

from users.models import User


def is_teacher(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            user.role == User.Roles.TEACHER
            or user.role == User.Roles.ADMIN
            or user.is_superuser
        )
    )


class IsTeacher(permissions.BasePermission):
    """Create/manage classes + assignments: TEACHER or ADMIN only."""

    def has_permission(self, request, view):
        return is_teacher(request.user)
