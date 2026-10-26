from rest_framework import viewsets, permissions, status, generics
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
                qs = (
                    qs
                    | Submission.objects.filter(
                        contest_id__in=organized
                    ).select_related("user", "problem", "contest")
                )
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
            judge_task.apply_async(
                args=[submission_instance.id], queue="judge-contest"
            )
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
        # User is passed from the view to serializer.save()
        # serializer.save() will call the serializer's create method and return the instance
        return serializer.save(user=self.request.user)
