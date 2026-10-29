from rest_framework import permissions
from django.utils.translation import gettext_lazy as _

from .models import User
from problems.models import Problem


class IsAdminUser(permissions.BasePermission):
    """
    Allows access only to admin users.
    An admin is a user with the 'ADMIN' role or a superuser.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.role == User.Roles.ADMIN or request.user.is_superuser


class IsProblemCreator(permissions.BasePermission):
    """
    Allows access to users who can create problems.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.role in [
            User.Roles.PROBLEM_CREATOR,
            User.Roles.PROBLEM_VERIFIER,
            User.Roles.ADMIN,
        ]


class IsProblemVerifier(permissions.BasePermission):
    """
    Allows access to users who can verify problems.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        return request.user.role in [User.Roles.PROBLEM_VERIFIER, User.Roles.ADMIN]


class ProblemObjectPermissions(permissions.BasePermission):
    """
    Handles object-level permissions for Problems.
    - Read for anyone (if problem is APPROVED, handled by queryset).
    - Author can edit/delete their DRAFT/PRIVATE problems.
    - Verifiers/Admins can edit/delete any problem.
    """

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True

        if not (request.user and request.user.is_authenticated):
            return False

        is_admin = request.user.role == User.Roles.ADMIN or request.user.is_superuser
        is_verifier = request.user.role == User.Roles.PROBLEM_VERIFIER

        if is_admin or is_verifier:
            return True

        if obj.author == request.user:
            if view.action in ["update", "partial_update"]:
                return obj.status in [
                    Problem.ProblemStatus.DRAFT,
                    Problem.ProblemStatus.PRIVATE,
                ]
            if view.action == "destroy":
                return obj.status in [
                    Problem.ProblemStatus.DRAFT,
                    Problem.ProblemStatus.PRIVATE,
                ]
            if view.action == "submit_for_approval":
                return obj.status == Problem.ProblemStatus.DRAFT

        return False


class IsOwnerOrAdminForUser(permissions.BasePermission):
    """
    Allows access only to the owner of the user object or an admin.
    """

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        is_admin = request.user.role == User.Roles.ADMIN or request.user.is_superuser

        return obj == request.user or is_admin


class IsOwnerOrAdminForSubmission(permissions.BasePermission):
    """
    Allows access only to the owner of the submission or an admin.

    Contest organizers (CON-1/CON-3) may additionally READ submissions made
    inside contests they created — the organizer's live-monitoring view.
    """

    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False

        is_admin = request.user.role == User.Roles.ADMIN or request.user.is_superuser

        if obj.user == request.user or is_admin:
            return True

        return (
            request.method in permissions.SAFE_METHODS
            and getattr(obj, "contest", None) is not None
            and obj.contest.created_by_id == request.user.id
        )


class PrivilegedRoleRequires2FA(permissions.BasePermission):
    """OPS-2 enforcement phase — privileged writes need enrolled TOTP.

    Active only while ``settings.TWO_FACTOR_ENFORCE`` is on (the roadmap's
    "warn → require at next login" progression: warn ships as the
    ``two_factor_required`` flag on /users/me/, require flips with this
    env var). Applied to the content-supply-chain surfaces (problem
    authoring/approval); safe methods always pass, so it composes cleanly
    with the existing per-action permission classes.
    """

    message = _(
        "Two-factor authentication is required for this role. "
        "Enable it in Profile → Security."
    )

    def has_permission(self, request, view):
        from django.conf import settings

        if request.method in permissions.SAFE_METHODS:
            return True
        if not getattr(settings, "TWO_FACTOR_ENFORCE", False):
            return True
        user = request.user
        if not (user and user.is_authenticated):
            return True  # authentication is another class's job
        if user.is_privileged and not user.two_factor_enabled:
            return False
        return True
