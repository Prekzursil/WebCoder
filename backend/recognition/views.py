"""Recognition API (wave F items 66/67/68/69), under /api/v1/community/.

- ``GET  reputation/me/``                 the caller's tier + privileges
- ``GET  reputation/tiers/``              the ladder table
- ``GET  awards/``                        the public award shelf
- ``POST awards/grant/``                  ADMIN grants a special award
- ``GET/POST amas/``                      sessions list / host creates
- ``GET  amas/{id}/``                     session + questions
- ``POST amas/{id}/questions/``           ask during the window
- ``POST amas/questions/{id}/answer/``    host answers
- ``POST amas/questions/{id}/upvote/``    toggle an upvote
- ``GET/POST problem-requests/``          the request board
- ``POST problem-requests/{id}/vote/``    toggle a vote
- ``POST problem-requests/{id}/status/``  ADMIN triage
"""

from django.contrib.auth import get_user_model
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView
from webcoder_api.pagination import StandardPageNumberPagination

from problems.models import Problem
from users.models import User

from .models import AmaQuestion, AmaSession, AmaVote, CommunityAward, ProblemRequest
from .reputation import REPUTATION_TIERS, can_host_ama, user_reputation

User_ = get_user_model()


def _is_admin(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.is_superuser or user.is_staff or getattr(user, "role", "") == "ADMIN")
    )


# --------------------------------------------------------- reputation (66)


class MyReputationView(APIView):
    """GET /community/reputation/me/ — the caller's tier, next tier and
    unlocked privileges (item 66)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(user_reputation(request.user))


class ReputationTiersView(APIView):
    """GET /community/reputation/tiers/ — the public ladder."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response(
            {
                "tiers": [
                    {"name": name, "min_honor": minimum}
                    for name, minimum in REPUTATION_TIERS
                ]
            }
        )


# -------------------------------------------------------------- awards (67)


class AwardSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = CommunityAward
        fields = ["id", "username", "kind", "reason", "period", "created_at"]


class AwardsView(APIView):
    """GET /community/awards/ — the public shelf (newest first), optional
    ?username= filter."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = CommunityAward.objects.select_related("user").order_by("-created_at")
        username = request.query_params.get("username", "").strip()
        if username:
            qs = qs.filter(user__username=username)
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(list(qs), request)
        return paginator.get_paginated_response(AwardSerializer(page, many=True).data)


class AwardGrantView(APIView):
    """POST /community/awards/grant/ — ADMIN grants a special award."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_admin(request.user):
            return Response({"detail": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        serializer = AwardGrantSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = User.objects.filter(
            username=serializer.validated_data["username"]
        ).first()
        if target is None:
            return Response(
                {"username": "No such user."}, status=status.HTTP_400_BAD_REQUEST
            )
        award = CommunityAward.objects.create(
            user=target,
            kind=serializer.validated_data["kind"],
            reason=serializer.validated_data.get("reason", ""),
            awarded_by=request.user,
        )
        return Response(AwardSerializer(award).data, status=status.HTTP_201_CREATED)


class AwardGrantSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    kind = serializers.ChoiceField(choices=CommunityAward.Kind.choices)
    reason = serializers.CharField(max_length=200, required=False, allow_blank=True)


# ---------------------------------------------------------------- AMA (68)


class AmaQuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=2000)


class AmaAnswerSerializer(serializers.Serializer):
    answer = serializers.CharField(max_length=4000)


def _ama_payload(session: AmaSession) -> dict:
    questions = session.questions.select_related("author").order_by(
        "-upvotes", "created_at"
    )
    return {
        "id": session.id,
        "host": session.host.username,
        "title": session.title,
        "description": session.description,
        "starts_at": session.starts_at,
        "ends_at": session.ends_at,
        "status": session.status(),
        "can_host_more": True,
        "questions": [
            {
                "id": question.id,
                "author": question.author.username,
                "question": question.question,
                "answer": question.answer,
                "answered_at": question.answered_at,
                "upvotes": question.upvotes,
            }
            for question in questions
        ],
    }


class AmaListView(APIView):
    """GET /community/amas/ — sessions newest first; POST — a qualified
    host (Mentor tier or staff, item 66's enforced privilege) schedules one."""

    def get(self, request):
        sessions = AmaSession.objects.select_related("host").order_by("-starts_at")
        return Response(
            {
                "count": sessions.count(),
                "results": [
                    {
                        "id": session.id,
                        "host": session.host.username,
                        "title": session.title,
                        "status": session.status(),
                        "starts_at": session.starts_at,
                    }
                    for session in sessions
                ],
            }
        )

    def post(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to host."}, status=status.HTTP_401_UNAUTHORIZED
            )
        if not can_host_ama(request.user):
            return Response(
                {
                    "detail": (
                        "AMA hosting needs the Mentor reputation tier (300+ honor) "
                        "— keep contributing!"
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        serializer = AmaCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if data["ends_at"] <= data["starts_at"]:
            return Response(
                {"ends_at": "The session must end after it starts."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        session = AmaSession.objects.create(host=request.user, **data)
        return Response(_ama_payload(session), status=status.HTTP_201_CREATED)


class AmaCreateSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=200)
    description = serializers.CharField(max_length=2000)
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()


class AmaDetailView(APIView):
    """GET /community/amas/{id}/ — the session with its questions."""

    def get(self, request, session_id):
        session = AmaSession.objects.filter(pk=session_id).select_related("host").first()
        if session is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(_ama_payload(session))


class AmaAskView(APIView):
    """POST /community/amas/{id}/questions/ — ask while the window is open."""

    def post(self, request, session_id):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to ask."}, status=status.HTTP_401_UNAUTHORIZED
            )
        session = AmaSession.objects.filter(pk=session_id).first()
        if session is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if session.status() != AmaSession.Status.LIVE:
            return Response(
                {"detail": f"This AMA is {session.status().lower()} — questions are closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        serializer = AmaQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = AmaQuestion.objects.create(
            session=session,
            author=request.user,
            question=serializer.validated_data["question"],
        )
        return Response(
            {
                "id": question.id,
                "author": question.author.username,
                "question": question.question,
                "answer": "",
                "answered_at": None,
                "upvotes": 0,
            },
            status=status.HTTP_201_CREATED,
        )


class AmaAnswerView(APIView):
    """POST /community/amas/questions/{id}/answer/ — the host answers."""

    def post(self, request, question_id):
        if not request.user.is_authenticated:
            return Response({"detail": "Sign in."}, status=status.HTTP_401_UNAUTHORIZED)
        question = AmaQuestion.objects.select_related("session__host").filter(
            pk=question_id
        ).first()
        if question is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if question.session.host_id != request.user.id and not _is_admin(request.user):
            return Response(
                {"detail": "Only the host answers."}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = AmaAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.utils import timezone

        question.answer = serializer.validated_data["answer"]
        question.answered_at = timezone.now()
        question.save(update_fields=["answer", "answered_at"])
        return Response({"id": question.id, "answer": question.answer})


class AmaUpvoteView(APIView):
    """POST /community/amas/questions/{id}/upvote/ — toggle an upvote."""

    def post(self, request, question_id):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to vote."}, status=status.HTTP_401_UNAUTHORIZED
            )
        question = AmaQuestion.objects.filter(pk=question_id).first()
        if question is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        vote = AmaVote.objects.filter(
            user=request.user, question=question
        ).first()
        if vote is not None:
            vote.delete()
            question.upvotes = max(0, question.upvotes - 1)
            question.save(update_fields=["upvotes"])
            return Response({"upvotes": question.upvotes, "voted": False})
        AmaVote.objects.create(user=request.user, question=question)
        question.upvotes += 1
        question.save(update_fields=["upvotes"])
        return Response({"upvotes": question.upvotes, "voted": True})


# ------------------------------------------------- problem requests (69)


class ProblemRequestSerializer(serializers.ModelSerializer):
    requester_username = serializers.CharField(
        source="requester.username", read_only=True
    )
    fulfilled_problem_title = serializers.SerializerMethodField()

    class Meta:
        model = ProblemRequest
        fields = [
            "id",
            "requester",
            "requester_username",
            "title",
            "description",
            "status",
            "fulfilled_problem",
            "fulfilled_problem_title",
            "vote_count",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "requester",
            "status",
            "fulfilled_problem",
            "vote_count",
            "created_at",
        ]

    def get_fulfilled_problem_title(self, obj):
        if obj.fulfilled_problem_id is None:
            return None
        return obj.fulfilled_problem.title_i18n


class ProblemRequestListView(APIView):
    """GET /community/problem-requests/ — the board (top-voted first, the
    model ordering); POST — open a request (auth)."""

    def get(self, request):
        qs = ProblemRequest.objects.select_related("requester").all()
        paginator = StandardPageNumberPagination()
        page = paginator.paginate_queryset(list(qs), request)
        return paginator.get_paginated_response(
            ProblemRequestSerializer(page, many=True).data
        )

    def post(self, request):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to open a request."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        serializer = ProblemRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = ProblemRequest.objects.create(
            requester=request.user, **serializer.validated_data
        )
        return Response(ProblemRequestSerializer(row).data, status=status.HTTP_201_CREATED)


class ProblemRequestVoteView(APIView):
    """POST /community/problem-requests/{id}/vote/ — toggle the caller's vote."""

    def post(self, request, request_id):
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to vote."}, status=status.HTTP_401_UNAUTHORIZED
            )
        row = ProblemRequest.objects.filter(pk=request_id).first()
        if row is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        from .models import ProblemRequestVote

        vote = ProblemRequestVote.objects.filter(
            user=request.user, request=row
        ).first()
        if vote is not None:
            vote.delete()
            row.vote_count = max(0, row.vote_count - 1)
            row.save(update_fields=["vote_count"])
            return Response({"votes": row.vote_count, "voted": False})
        ProblemRequestVote.objects.create(user=request.user, request=row)
        row.vote_count += 1
        row.save(update_fields=["vote_count"])
        return Response({"votes": row.vote_count, "voted": True})


class ProblemRequestStatusView(APIView):
    """POST /community/problem-requests/{id}/status/ — ADMIN triage:
    PLANNED / DECLINED, or FULFILLED with the problem id that answers it."""

    def post(self, request, request_id):
        if not _is_admin(request.user):
            return Response({"detail": "Admin only."}, status=status.HTTP_403_FORBIDDEN)
        row = ProblemRequest.objects.filter(pk=request_id).first()
        if row is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        choice = (request.data.get("status") or "").strip().upper()
        if choice not in ProblemRequest.Status.values:
            return Response(
                {"status": "Choose one of: " + ", ".join(ProblemRequest.Status.values)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        problem = None
        if choice == ProblemRequest.Status.FULFILLED:
            problem = Problem.objects.filter(
                pk=request.data.get("problem_id")
            ).first()
            if problem is None:
                return Response(
                    {"problem_id": "Fulfilled requests need a problem id."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        row.status = choice
        row.fulfilled_problem = problem
        row.save(update_fields=["status", "fulfilled_problem"])
        return Response(ProblemRequestSerializer(row).data)
