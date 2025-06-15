from rest_framework import permissions
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
        return request.user.role in [User.Roles.PROBLEM_CREATOR, User.Roles.PROBLEM_VERIFIER, User.Roles.ADMIN]

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
            if view.action in ['update', 'partial_update']:
                return obj.status in [Problem.ProblemStatus.DRAFT, Problem.ProblemStatus.PRIVATE]
            if view.action == 'destroy':
                return obj.status in [Problem.ProblemStatus.DRAFT, Problem.ProblemStatus.PRIVATE]
            if view.action == 'submit_for_approval':
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
    """
    def has_object_permission(self, request, view, obj):
        if not (request.user and request.user.is_authenticated):
            return False
            
        is_admin = request.user.role == User.Roles.ADMIN or request.user.is_superuser

        return obj.author == request.user or is_admin
