from django.db import models
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import Tag, Problem, TestCase
from .serializers import TagSerializer, ProblemSerializer, ProblemDetailSerializer, TestCaseSerializer
from users.models import User
from users.permissions import IsAdminUser, IsProblemCreator, IsProblemVerifier, ProblemObjectPermissions


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [permissions.IsAuthenticatedOrReadOnly] # Allow read for anyone, write for authenticated
    # More specific permissions for create/update/delete might be needed (e.g., only admins/verifiers)

    def get_permissions(self):
        if self.action in ['create', 'update', 'partial_update', 'destroy']:
            # For write actions, TEMPORARILY allow any authenticated user for testing
            # TODO: Revert to IsAdminUser() or a more specific role-based permission later.
            return [permissions.IsAuthenticated()]
        return super().get_permissions() # Default is IsAuthenticatedOrReadOnly


class ProblemViewSet(viewsets.ModelViewSet):
    queryset = Problem.objects.all() # Default queryset
    serializer_class = ProblemSerializer
    # permission_classes = [IsAuthorOrVerifierOrAdminOrReadOnly] # Replaced with more granular per-action

    def get_permissions(self):
        if self.action == 'create':
            self.permission_classes = [permissions.IsAuthenticated, IsProblemCreator]
        elif self.action in ['update', 'partial_update', 'destroy', 'submit_for_approval']:
            self.permission_classes = [permissions.IsAuthenticated, ProblemObjectPermissions]
        elif self.action in ['approve_problem', 'reject_problem']:
            self.permission_classes = [permissions.IsAuthenticated, IsProblemVerifier] # Or IsAdminUser
        elif self.action == 'list' or self.action == 'retrieve':
             self.permission_classes = [permissions.AllowAny] # Queryset handles visibility
        else:
            self.permission_classes = [permissions.IsAdminUser] # Default to admin for other actions
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProblemDetailSerializer # Use detailed serializer for single problem view
        return ProblemSerializer

    def perform_create(self, serializer):
        # Automatically set the author to the current user on creation
        if self.request.user.is_authenticated:
            serializer.save(author=self.request.user)
        else:
            serializer.save() # Or raise an error if anonymous users cannot create problems

    def get_queryset(self):
        # By default, show only APPROVED problems to non-staff/non-authors
        # Authors can see their own drafts/pending. Admins/Verifiers see all.
        user = self.request.user
        if user.is_authenticated:
            if user.is_staff or (hasattr(user, 'role') and user.role in [User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER]):
                return Problem.objects.all() # Admins/Verifiers see all
            # Authenticated users see APPROVED problems and their own DRAFT/PENDING problems
            return Problem.objects.filter(
                models.Q(status=Problem.ProblemStatus.APPROVED) |
                (models.Q(author=user) & models.Q(status__in=[Problem.ProblemStatus.DRAFT, Problem.ProblemStatus.PENDING_APPROVAL]))
            ).distinct()
        # Anonymous users only see APPROVED problems
        return Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)

    @action(detail=True, methods=['post'], url_path='submit-for-approval')
    def submit_for_approval(self, request, pk=None):
        problem = self.get_object() # ProblemObjectPermissions will check if user is author
        if problem.status == Problem.ProblemStatus.DRAFT:
            problem.status = Problem.ProblemStatus.PENDING_APPROVAL
            problem.verifier = None # Clear verifier when resubmitting
            problem.verifier_feedback = None # Clear old feedback
            problem.save()
            return Response({'status': 'problem submitted for approval'}, status=status.HTTP_200_OK)
        return Response({'status': f'problem cannot be submitted for approval from state {problem.status}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='approve')
    def approve_problem(self, request, pk=None): # Renamed from 'approve'
        problem = self.get_object() # IsProblemVerifier permission applied
        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            problem.status = Problem.ProblemStatus.APPROVED
            problem.verifier = request.user 
            problem.verifier_feedback = request.data.get('feedback', None) # Optional approval feedback
            problem.save()
            return Response({'status': 'problem approved'}, status=status.HTTP_200_OK)
        return Response({'status': f'problem cannot be approved from state {problem.status}'}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='reject')
    def reject_problem(self, request, pk=None): # Renamed from 'reject'
        problem = self.get_object() # IsProblemVerifier permission applied
        feedback = request.data.get('feedback', None)
        if not feedback:
            return Response({'feedback': 'Feedback is required for rejection.'}, status=status.HTTP_400_BAD_REQUEST)
        
        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            problem.status = Problem.ProblemStatus.PRIVATE 
            problem.verifier = request.user
            problem.verifier_feedback = feedback
            problem.save()
            return Response({'status': 'problem rejected and marked as private'}, status=status.HTTP_200_OK)
        return Response({'status': f'problem cannot be rejected from state {problem.status}'}, status=status.HTTP_400_BAD_REQUEST)


class TestCaseViewSet(viewsets.ModelViewSet):
    queryset = TestCase.objects.all()
    serializer_class = TestCaseSerializer
    # Permissions for test cases should be tied to the parent problem's permissions
    # This means if a user can edit a problem, they can manage its test cases.
    # The perform_create and perform_update/destroy methods will handle this.
    permission_classes = [permissions.IsAuthenticated] 

    def get_queryset(self):
        # Filter test cases based on the problem_id if provided in query_params
        # Or, if nested, this might be handled by the router
        problem_id = self.request.query_params.get('problem_id')
        if problem_id:
            return TestCase.objects.filter(problem_id=problem_id)
        return TestCase.objects.all()

    def perform_create(self, serializer):
        problem = serializer.validated_data['problem']
        # Check if user has permission to modify the problem (implies they can add test cases)
        # We use ProblemObjectPermissions for this check.
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(self.request, self, problem):
             self.permission_denied(self.request, message="You do not have permission to add test cases to this problem.")
        serializer.save()

    def perform_update(self, serializer):
        problem = serializer.instance.problem # Get problem from existing test case
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(self.request, self, problem):
             self.permission_denied(self.request, message="You do not have permission to update test cases for this problem.")
        serializer.save()

    def perform_destroy(self, instance):
        problem = instance.problem
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(self.request, self, problem):
             self.permission_denied(self.request, message="You do not have permission to delete test cases for this problem.")
        instance.delete()

# models import moved to the top
