from django.db import models, transaction
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response
from .bookmarks import ProblemStar
from .models import (
    CurriculumNode,
    ProblemEditorial,
    ProblemRating,
    Tag,
    Problem,
    TestCase,
)
from .serializers import (
    CurriculumNodeSerializer,
    TagSerializer,
    ProblemSerializer,
    ProblemDetailSerializer,
    ProblemEditorialSerializer,
    TestCaseSerializer,
)
from notifications.models import Notification
from notifications.services import notify
from users.models import User
from users.permissions import (
    IsProblemCreator,
    IsProblemVerifier,
    ProblemObjectPermissions,
)


def editorial_visible_to(editorial, user):
    """Publish-policy gate for editorials (competitive roadmap EDT-1).

    - PUBLIC: anyone (who can see the problem — the viewset queryset already
      scopes that).
    - AFTER_AC: the requester has an AC submission on the problem, or is the
      problem's author / a verifier / an admin (staff need it to review).
    - MANUAL: author / verifier / admin only.
    Anonymous users never pass AFTER_AC or MANUAL.
    """
    if user is None or not getattr(user, "is_authenticated", False):
        return editorial.publish_policy == ProblemEditorial.PublishPolicy.PUBLIC

    is_staff = user.is_staff or user.role in [
        User.Roles.ADMIN,
        User.Roles.PROBLEM_VERIFIER,
    ]
    if is_staff or editorial.problem.author_id == user.id:
        return True
    if editorial.publish_policy == ProblemEditorial.PublishPolicy.PUBLIC:
        return True
    if editorial.publish_policy == ProblemEditorial.PublishPolicy.AFTER_AC:
        from submissions.models import Submission

        return Submission.objects.filter(
            user=user,
            problem_id=editorial.problem_id,
            verdict=Submission.VerdictStatus.ACCEPTED,
        ).exists()
    return False


def user_can_manage_editorial(user, problem):
    """Editorial write access: the problem's author, a verifier, or an admin."""
    if not (user and user.is_authenticated):
        return False
    if user.is_staff or user.role in [User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER]:
        return True
    return problem.author_id == user.id


class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all()
    serializer_class = TagSerializer
    permission_classes = [
        permissions.IsAuthenticatedOrReadOnly
    ]  # Allow read for anyone, write for authenticated
    # More specific permissions for create/update/delete might be needed (e.g., only admins/verifiers)

    def get_permissions(self):
        if self.action in ["create", "update", "partial_update", "destroy"]:
            # For write actions, TEMPORARILY allow any authenticated user for testing
            # TODO: Revert to IsAdminUser() or a more specific role-based permission later.
            return [permissions.IsAuthenticated()]
        return super().get_permissions()  # Default is IsAuthenticatedOrReadOnly


def _guard_contest_pin(problem: Problem, user) -> None:
    """CON-1: raise ValidationError when ``problem`` is on the board of a
    contest that has not finished and ``user`` is not an admin — statements,
    tests and checkers must stay frozen for the contest's lifetime."""
    is_admin = user.is_staff or (
        hasattr(user, "role") and user.role == User.Roles.ADMIN
    )
    if is_admin:
        return
    from django.utils import timezone as _tz

    from contests.models import ContestProblem

    pinned = ContestProblem.objects.filter(
        problem=problem, contest__end_at__gt=_tz.now()
    ).exists()
    if pinned:
        from rest_framework.exceptions import ValidationError

        raise ValidationError(
            {
                "detail": (
                    "This problem is part of an upcoming or running contest "
                    "and cannot be edited until that contest ends."
                )
            }
        )


class ProblemViewSet(viewsets.ModelViewSet):
    queryset = Problem.objects.all()  # Default queryset
    serializer_class = ProblemSerializer

    @action(detail=True, methods=["get"], url_path="statement-revisions")
    def statement_revisions(self, request, pk=None):
        """UXP-4 — the public statement history feed (newest first)."""
        from .models import StatementRevision

        problem = self.get_object()
        rows = (
            StatementRevision.objects.filter(problem=problem)
            .select_related("edited_by")
            .order_by("-created_at")[:20]
        )
        return Response(
            {
                "count": len(rows),
                "results": [
                    {
                        "id": row.id,
                        "note": row.note,
                        "edited_by": row.edited_by.username if row.edited_by else None,
                        "created_at": row.created_at,
                    }
                    for row in rows
                ],
            }
        )
    # permission_classes = [IsAuthorOrVerifierOrAdminOrReadOnly] # Replaced with more granular per-action

    def get_permissions(self):
        if self.action == "create":
            self.permission_classes = [permissions.IsAuthenticated, IsProblemCreator]
        elif self.action in [
            "update",
            "partial_update",
            "destroy",
            "submit_for_approval",
        ]:
            self.permission_classes = [
                permissions.IsAuthenticated,
                ProblemObjectPermissions,
            ]
        elif self.action in ["approve_problem", "reject_problem"]:
            self.permission_classes = [
                permissions.IsAuthenticated,
                IsProblemVerifier,
            ]  # Or IsAdminUser
        elif self.action == "list" or self.action == "retrieve":
            self.permission_classes = [
                permissions.AllowAny
            ]  # Queryset handles visibility
        elif self.action == "bookmark":
            self.permission_classes = [permissions.IsAuthenticated]
        elif self.action in [
            "editorial",
            "statistics",
            "starters",
            "bookmarked",
            "statement_revisions",
        ]:
            # Read-shaped actions: the queryset already scopes problem
            # visibility; the editorial action additionally enforces the
            # publish-policy gate inside.
            self.permission_classes = [permissions.AllowAny]
        elif self.action == "rate":
            self.permission_classes = [permissions.IsAuthenticated]
        else:
            self.permission_classes = [
                permissions.IsAdminUser
            ]  # Default to admin for other actions
        return super().get_permissions()

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ProblemDetailSerializer  # Use detailed serializer for single problem view
        return ProblemSerializer

    def perform_create(self, serializer):
        # Automatically set the author to the current user on creation
        if self.request.user.is_authenticated:
            serializer.save(author=self.request.user)
        else:
            serializer.save()  # Or raise an error if anonymous users cannot create problems

    def perform_update(self, serializer):
        """CON-1: pin problem edits while the problem sits on the board of a
        contest that has not finished yet (upcoming or running) — mid-contest
        statement/test changes would silently invalidate live standings.
        Admins bypass; after end_at the problem reverts to normal editing
        (archive/upsolving mode).
        """
        from .revisions import record_revision

        _guard_contest_pin(serializer.instance, self.request.user)
        serializer.save()
        # UXP-4: statement history — a row lands whenever title/statement
        # materially changed; metadata-only saves stay out of the feed.
        record_revision(serializer.instance, edited_by=self.request.user)

    def get_queryset(self):
        # By default, show only APPROVED problems to non-staff/non-authors
        # Authors can see their own drafts/pending. Admins/Verifiers see all.
        user = self.request.user
        if user.is_authenticated:
            if user.is_staff or (
                hasattr(user, "role")
                and user.role in [User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER]
            ):
                qs = Problem.objects.all()  # Admins/Verifiers see all
            else:
                # Authenticated users see APPROVED problems and their own DRAFT/PENDING problems
                qs = Problem.objects.filter(
                    models.Q(status=Problem.ProblemStatus.APPROVED)
                    | (
                        models.Q(author=user)
                        & models.Q(
                            status__in=[
                                Problem.ProblemStatus.DRAFT,
                                Problem.ProblemStatus.PENDING_APPROVAL,
                            ]
                        )
                    )
                ).distinct()
        else:
            # Anonymous users only see APPROVED problems
            qs = Problem.objects.filter(status=Problem.ProblemStatus.APPROVED)
        # Curriculum browse axis (competitive roadmap EDU-9): filter by the
        # chapter/grade node the catalog is drilling into. Exact node match
        # v1 — the tree itself provides the drill-down ids.
        node_id = self.request.query_params.get("curriculum_node")
        if node_id:
            qs = qs.filter(curriculum_nodes__id=node_id)
        # Catalog stats add-on (SPEC-GAPS D-B8): "X tried / Y solved" per
        # problem card. distinct=True keeps counts exact under the author
        # branch's .distinct().
        return qs.annotate(
            submission_count=models.Count("submissions"),
            solved_count=models.Count(
                "submissions",
                filter=models.Q(submissions__verdict="AC"),
                distinct=True,
            ),
        )

    @action(detail=True, methods=["post"], url_path="submit-for-approval")
    def submit_for_approval(self, request, pk=None):
        problem = (
            self.get_object()
        )  # ProblemObjectPermissions will check if user is author
        if problem.status == Problem.ProblemStatus.DRAFT:
            problem.status = Problem.ProblemStatus.PENDING_APPROVAL
            problem.verifier = None  # Clear verifier when resubmitting
            problem.verifier_feedback = None  # Clear old feedback
            problem.save()
            return Response(
                {"status": "problem submitted for approval"}, status=status.HTTP_200_OK
            )
        return Response(
            {
                "status": f"problem cannot be submitted for approval from state {problem.status}"
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"], url_path="approve")
    def approve_problem(self, request, pk=None):  # Renamed from 'approve'
        problem = self.get_object()  # IsProblemVerifier permission applied
        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            problem.status = Problem.ProblemStatus.APPROVED
            problem.verifier = request.user
            problem.verifier_feedback = request.data.get(
                "feedback", None
            )  # Optional approval feedback
            problem.save()
            transaction.on_commit(
                lambda: notify(
                    problem.author,
                    Notification.Verb.PROBLEM_APPROVED,
                    actor=request.user,
                    target=problem,
                    data={"feedback": problem.verifier_feedback},
                )
            )
            return Response({"status": "problem approved"}, status=status.HTTP_200_OK)
        return Response(
            {"status": f"problem cannot be approved from state {problem.status}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    @action(detail=True, methods=["post"], url_path="reject")
    def reject_problem(self, request, pk=None):  # Renamed from 'reject'
        problem = self.get_object()  # IsProblemVerifier permission applied
        feedback = request.data.get("feedback", None)
        if not feedback:
            return Response(
                {"feedback": "Feedback is required for rejection."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if problem.status == Problem.ProblemStatus.PENDING_APPROVAL:
            problem.status = Problem.ProblemStatus.PRIVATE
            problem.verifier = request.user
            problem.verifier_feedback = feedback
            problem.save()
            transaction.on_commit(
                lambda: notify(
                    problem.author,
                    Notification.Verb.PROBLEM_REJECTED,
                    actor=request.user,
                    target=problem,
                    data={"feedback": problem.verifier_feedback},
                )
            )
            return Response(
                {"status": "problem rejected and marked as private"},
                status=status.HTTP_200_OK,
            )
        return Response(
            {"status": f"problem cannot be rejected from state {problem.status}"},
            status=status.HTTP_400_BAD_REQUEST,
        )


    @action(detail=True, methods=["get", "put", "patch"], url_path="editorial")
    def editorial(self, request, pk=None):
        """Read (gated by publish policy) or write (author/verifier/admin).

        GET returns the editorial, 403 with a locked reason when the policy
        hides it, or 404 when none exists. PUT/PATCH create-or-update
        (editorials ride the problem's own visibility: the writer must
        already be able to see the problem).
        """
        problem = self.get_object()
        editorial = getattr(problem, "editorial", None)

        if request.method in ("PUT", "PATCH"):
            if not user_can_manage_editorial(request.user, problem):
                return Response(
                    {
                        "detail": (
                            "Only the problem author, verifiers or admins "
                            "may edit the editorial."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            serializer = ProblemEditorialSerializer(
                editorial,
                data=request.data,
                partial=request.method == "PATCH",
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save(
                problem=problem,
                author=(editorial.author if editorial else request.user),
            )
            return Response(serializer.data)

        if editorial is None:
            return Response(
                {"detail": "No editorial for this problem."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if not editorial_visible_to(editorial, request.user):
            return Response(
                {
                    "detail": "This editorial is locked by its publish policy.",
                    "publish_policy": editorial.publish_policy,
                    "locked": True,
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(
            ProblemEditorialSerializer(editorial, context={"request": request}).data
        )

    @action(detail=True, methods=["get"], url_path="statistics")
    def statistics(self, request, pk=None):
        """Per-problem statistics (competitive roadmap UXP-7 / X9 core).

        tried, solved (distinct AC users), acceptance rate, verdict
        distribution, per-language submission counts, and the satisfaction
        vote aggregate. Readable by anyone who can see the problem.
        """
        from submissions.models import Submission

        problem = self.get_object()
        subs = Submission.objects.filter(problem=problem)
        tried = subs.count()
        verdict_distribution = {
            row["verdict"]: row["n"] for row in subs.values("verdict").annotate(n=models.Count("id"))
        }
        solved = (
            subs.filter(verdict=Submission.VerdictStatus.ACCEPTED)
            .values("user_id")
            .distinct()
            .count()
        )
        language_counts = {
            row["language"]: row["n"]
            for row in subs.values("language").annotate(n=models.Count("id"))
        }
        ratings = problem.ratings.aggregate(
            avg=models.Avg("rating"), count=models.Count("id")
        )
        return Response(
            {
                "problem": problem.id,
                "tried": tried,
                "solved": solved,
                "acceptance_rate": round(solved / tried, 4) if tried else None,
                "verdict_distribution": verdict_distribution,
                "language_counts": language_counts,
                "rating_avg": round(ratings["avg"], 2)
                if ratings["avg"] is not None
                else None,
                "rating_count": ratings["count"],
            }
        )

    @action(detail=True, methods=["post"], url_path="rate")
    def rate(self, request, pk=None):
        """Three-level satisfaction vote (1=poor, 2=fine, 3=great); re-vote overwrites."""
        problem = self.get_object()
        rating_value = request.data.get("rating")
        if isinstance(rating_value, str) and rating_value in ("1", "2", "3"):
            rating_value = int(rating_value)
        if rating_value not in (1, 2, 3):
            return Response(
                {"rating": "Rating must be 1, 2 or 3."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ProblemRating.objects.update_or_create(
            user=request.user, problem=problem, defaults={"rating": rating_value}
        )
        aggregate = problem.ratings.aggregate(
            avg=models.Avg("rating"), count=models.Count("id")
        )
        return Response(
            {
                "rating_avg": round(aggregate["avg"], 2)
                if aggregate["avg"] is not None
                else None,
                "rating_count": aggregate["count"],
                "your_rating": rating_value,
            }
        )

    @action(detail=False, methods=["get"], url_path="starters")
    def starters(self, request):
        """Guided first-run trio (competitive roadmap ONB-1): one easy
        APPROVED problem per paradigm (curriculum chapter), in tree order —
        the /start page's data source. Falls back to the easiest APPROVED
        problems by creation order when no curriculum links exist yet.
        """
        picked_ids = []
        chapters = CurriculumNode.objects.filter(
            kind=CurriculumNode.NodeKind.CHAPTER, parent__isnull=False
        ).select_related("parent").order_by("parent__order", "parent__id", "order", "id")
        for chapter in chapters:
            candidate = (
                chapter.problems.filter(
                    status=Problem.ProblemStatus.APPROVED,
                    difficulty=Problem.DifficultyLevel.EASY,
                )
                .order_by("id")
                .first()
            )
            if candidate is not None:
                picked_ids.append(candidate.id)
            if len(picked_ids) == 3:
                break
        if len(picked_ids) < 3:
            fallback = (
                Problem.objects.filter(
                    status=Problem.ProblemStatus.APPROVED,
                    difficulty=Problem.DifficultyLevel.EASY,
                )
                .exclude(id__in=picked_ids)
                .order_by("id")
            )
            for problem in fallback:
                picked_ids.append(problem.id)
                if len(picked_ids) == 3:
                    break
        qs = Problem.objects.filter(id__in=picked_ids).annotate(
            submission_count=models.Count("submissions"),
            solved_count=models.Count(
                "submissions",
                filter=models.Q(submissions__verdict="AC"),
                distinct=True,
            ),
        )
        data = sorted(qs, key=lambda p: picked_ids.index(p.id))
        return Response(ProblemSerializer(data, many=True, context={"request": request}).data)

    @action(detail=True, methods=["post", "delete"], url_path="bookmark")
    def bookmark(self, request, pk=None):
        """Toggle (POST) or remove (DELETE) the requester's star (UXP-6).

        POST is idempotent-create (starring twice keeps one row); DELETE is
        idempotent too. Returns the problem's total star count.
        """
        problem = self.get_object()
        if request.method == "DELETE":
            ProblemStar.objects.filter(user=request.user, problem=problem).delete()
        else:
            ProblemStar.objects.get_or_create(user=request.user, problem=problem)
        return Response({"problem": problem.id, "starred": request.method == "POST",
                         "star_count": problem.stars.count()})

    @action(detail=False, methods=["get"], url_path="bookmarked")
    def bookmarked(self, request):
        """The requester's starred problem ids (UXP-6) — cheap id set for
        the catalog's star column."""
        if not request.user.is_authenticated:
            return Response({"starred_ids": []})
        ids = ProblemStar.objects.filter(user=request.user).values_list(
            "problem_id", flat=True
        )
        return Response({"starred_ids": list(ids)})


class CurriculumViewSet(viewsets.ReadOnlyModelViewSet):
    """Read-only curriculum tree (competitive roadmap EDU-9 / RO-1).

    GET /api/v1/curriculum/ — the full versioned tree (grades with nested
    chapters) and per-node APPROVED problem counts; the pbinfo-style browse
    spine. GET /api/v1/curriculum/{id}/ — one node.
    """

    serializer_class = CurriculumNodeSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        # List returns the tree roots (grades with nested chapters); any
        # node — a chapter — is retrievable directly for drill-down links.
        if self.action == "retrieve":
            return CurriculumNode.objects.all()
        return CurriculumNode.objects.filter(parent__isnull=True)


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
        problem_id = self.request.query_params.get("problem_id")
        if problem_id:
            return TestCase.objects.filter(problem_id=problem_id)
        return TestCase.objects.all()

    def perform_create(self, serializer):
        problem = serializer.validated_data["problem"]
        # Check if user has permission to modify the problem (implies they can add test cases)
        # We use ProblemObjectPermissions for this check.
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to add test cases to this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        serializer.save()

    def perform_update(self, serializer):
        problem = serializer.instance.problem  # Get problem from existing test case
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to update test cases for this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        serializer.save()

    def perform_destroy(self, instance):
        problem = instance.problem
        problem_permission_check = ProblemObjectPermissions()
        if not problem_permission_check.has_object_permission(
            self.request, self, problem
        ):
            self.permission_denied(
                self.request,
                message="You do not have permission to delete test cases for this problem.",
            )
        _guard_contest_pin(problem, self.request.user)
        instance.delete()


# models import moved to the top
