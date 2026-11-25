from rest_framework import viewsets, permissions, status, generics
from rest_framework.views import APIView
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from webcoder_api.pagination import NewestFirstCursorPagination
from .models import Submission
from .serializers import (
    SubmissionSerializer,
    SubmissionListSerializer,
    SubmissionCreateSerializer,
)
from .tasks import judge_task
from users.permissions import IsOwnerOrAdminForSubmission


class CanRejudgeSubmission(permissions.BasePermission):
    """Wave E item 15 (verifier rejudge): who may re-run a submission.

    ADMIN/staff (JDG-12 as shipped), VERIFIER (the platform-wide review
    duty — a wrong judge outcome is exactly what verifiers exist to
    catch) and the problem's author (their tests, their correctness
    question). The submitter and BASIC strangers get nothing (the
    historical discipline: rejudge is a review action, not a re-roll).
    """

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        user = request.user
        if user.is_superuser or user.is_staff:
            return True
        if getattr(user, "role", "") in ("ADMIN", "VERIFIER"):
            return True
        return obj.problem.author_id == user.pk


class SubmissionCursorPagination(NewestFirstCursorPagination):
    # Newest-first feed: cursor pagination so new submissions (constant
    # inserts) don't shift page contents under the client. Matches the
    # model Meta ordering (-submission_time) plus an id tiebreaker.
    ordering = ("-submission_time", "-id")


class SubmissionViewSet(viewsets.ReadOnlyModelViewSet):
    """
    API endpoint for listing and retrieving submissions.
    - Users can see their own submissions.
    - Admins can see all submissions.
    - Admins can rejudge (JDG-12): reset to PENDING and re-dispatch.
    """

    queryset = Submission.objects.all().select_related("user", "problem")
    serializer_class = SubmissionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdminForSubmission]
    pagination_class = SubmissionCursorPagination

    def get_serializer_class(self):
        # List responses use the slim serializer (no code / test_results);
        # retrieve keeps the full detail shape.
        if self.action == "list":
            return SubmissionListSerializer
        return SubmissionSerializer

    def get_queryset(self):
        """
        This view should return a list of submissions:
        - for the currently authenticated user (all of theirs),
        - for admins: everyone's,
        - for contest organizers: their contests' submissions.
        Optional query params (B3 pattern): `problemId`, `language`,
        `contestId`.
        """
        user = self.request.user
        is_admin = user.is_staff or (hasattr(user, "role") and user.role == "ADMIN")
        if is_admin:
            qs = Submission.objects.all().select_related("user", "problem", "contest")
        else:
            qs = Submission.objects.filter(user=user).select_related(
                "user", "problem", "contest"
            )
            # Contest organizers can read (not write) every submission made
            # inside their contests — the organizer's live view (CON-1/CON-3).
            from contests.models import Contest

            organized = Contest.objects.filter(created_by=user).values_list(
                "pk", flat=True
            )
            if organized:
                qs = qs | Submission.objects.filter(
                    contest_id__in=organized
                ).select_related("user", "problem", "contest")
        params = self.request.query_params
        contest_id = params.get("contestId")
        if contest_id:
            qs = qs.filter(contest_id=contest_id)
        problem_id = params.get("problemId")
        if problem_id:
            qs = qs.filter(problem_id=problem_id)
        language = params.get("language")
        if language:
            qs = qs.filter(language=language)
        return qs

    @action(
        detail=True,
        methods=["post"],
        permission_classes=[permissions.IsAuthenticated, CanRejudgeSubmission],
    )
    def rejudge(self, request, pk=None):
        """JDG-12 + wave E item 15: reset a submission to PENDING and
        re-dispatch judging. ADMIN (as shipped), VERIFIER (platform-wide
        review duty), the problem's author and the submitter themselves
        may trigger a re-run.

        Per-test rows are deleted (replaced by the fresh run); the verdict
        cycles back through PENDING ("WJ" in UI terms) until the judge
        commits. Contest-bound submissions re-dispatch on the judge-contest
        lane. Idempotent: a submission already in flight is rejected.

        The action deliberately widens WHO can reach the row (verifier/
        author lanes) without changing the list/detail visibility for
        anyone — a stranger still cannot discover the submission.
        """
        submission = (
            Submission.objects.select_related("problem")
            .filter(pk=self.kwargs.get("pk"))
            .first()
        )
        if submission is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        self.check_object_permissions(self.request, submission)
        if submission.verdict in (
            Submission.VerdictStatus.PENDING,
            Submission.VerdictStatus.COMPILING,
            Submission.VerdictStatus.RUNNING,
        ):
            return Response(
                {"detail": "Submission is already being judged."},
                status=status.HTTP_409_CONFLICT,
            )
        submission.test_results.all().delete()
        submission.verdict = Submission.VerdictStatus.PENDING
        submission.score = None
        submission.detailed_feedback = "Rejudge requested."
        submission.save(update_fields=["verdict", "score", "detailed_feedback"])
        if submission.contest_id:
            judge_task.apply_async(args=[submission.id], queue="judge-contest")
        else:
            judge_task.delay(submission.id)
        return Response({"detail": "Rejudge dispatched.", "id": submission.id})


class SubmissionCreateView(generics.CreateAPIView):
    """
    API endpoint for creating new submissions.
    """

    queryset = Submission.objects.all()
    serializer_class = SubmissionCreateSerializer
    permission_classes = [
        permissions.IsAuthenticated
    ]  # Only authenticated users can submit
    # SPEC-GAPS SP4: each submission spawns compile+run judge containers —
    # the judge-DoS chokepoint. Scope-throttled at THROTTLE_RATES['submit'].
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "submit"

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # perform_create now returns the created submission instance
        submission_instance = self.perform_create(serializer)

        # Dispatch the Celery task to judge the submission. Round-2 OPR-4
        # priority lanes: contest submissions run on the dedicated
        # judge-contest queue so a practice/scratch burst cannot starve a
        # live contest (and vice versa); operators size worker concurrency
        # per queue.
        if getattr(submission_instance, "contest_id", None):
            judge_task.apply_async(args=[submission_instance.id], queue="judge-contest")
        else:
            judge_task.delay(submission_instance.id)
        print(
            f"Dispatched judging task for submission ID: {submission_instance.id}"
        )  # For server log

        # Return the data using SubmissionSerializer for a more detailed response
        response_serializer = SubmissionSerializer(
            submission_instance, context=self.get_serializer_context()
        )
        headers = self.get_success_headers(response_serializer.data)
        return Response(
            response_serializer.data, status=status.HTTP_201_CREATED, headers=headers
        )

    def perform_create(self, serializer):
        # User + submitter IP (item 115's multi-account heuristics feed)
        # are passed from the view to serializer.save().
        forwarded = getattr(self.request, "META", {}) or {}
        ip = forwarded.get("REMOTE_ADDR") or None
        return serializer.save(user=self.request.user, ip_address=ip)


class SubmissionLicenseView(APIView):
    """POST /submissions/{id}/license/ — the author relicenses their own
    ACCEPTED source (item 61: solution sharing with explicit licenses)."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, submission_id):
        submission = Submission.objects.filter(pk=submission_id).first()
        if submission is None:
            return Response({"detail": "Not found."}, status=404)
        if submission.user_id != request.user.id:
            return Response(
                {"detail": "Only the author may relicense this source."},
                status=403,
            )
        if submission.verdict != Submission.VerdictStatus.ACCEPTED:
            return Response(
                {"detail": "Only accepted sources can be shared under a license."},
                status=400,
            )
        choice = (request.data.get("license") or "").strip()
        if choice not in Submission.License.values:
            return Response(
                {"license": "Choose one of: " + ", ".join(Submission.License.values)},
                status=400,
            )
        submission.license = choice
        submission.save(update_fields=["license"])
        return Response({"id": submission.id, "license": submission.license})
