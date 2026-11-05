from rest_framework import permissions

from users.models import User


def is_moderator(user) -> bool:
    """Staff or VERIFIER/ADMIN role (pattern of users/permissions.py)."""
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.PROBLEM_VERIFIER, User.Roles.ADMIN)
        )
    )


class IsModerator(permissions.BasePermission):
    """Verifiers and admins (plus Django staff) moderate the forum."""

    def has_permission(self, request, view):
        return is_moderator(request.user)


class IsAuthorOrModerator(permissions.BasePermission):
    """Authors edit/hide their own threads/posts; moderators anything."""

    def has_object_permission(self, request, view, obj):
        if is_moderator(request.user):
            return True
        if not (request.user and request.user.is_authenticated):
            return False
        author = getattr(obj, "author", None)
        return author == request.user
