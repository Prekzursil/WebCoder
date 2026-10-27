"""Contest API (competitive roadmap Wave B: CON-1/2/3/6 + round-2 PRF-1).

Endpoints under /api/v1/contests/:

- ``GET/POST /``                list (visibility-scoped) / create (ADMIN)
- ``GET/PATCH/DELETE /{id}/``   detail / manage (organizer)
- ``POST /{id}/register/``      self-registration (PRIVATE needs access_code)
- ``POST /{id}/start/``         windowed: start the personal clock (CON-6)
- ``GET /{id}/problems/``       board labels + points (statements open at start)
- ``GET /{id}/standings/``      format-ranked, freeze-aware materialized board
- ``POST /{id}/unfreeze/``      deliberate unfreeze (CON-3, organizer)
- ``POST /{id}/disqualify/``    integrity DQ of one participation (SAF-2)
"""

from django.conf import settings
from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework import exceptions, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.response import Response
from webcoder_api.pagination import StandardPageNumberPagination

from users.models import User
from users.permissions import IsAdminUser

from .formats import rank_contest
from .models import (
    ContestAward,
    CLARIFICATION_CANNED_ANSWERS,
    Clarification,
    Contest,
    ContestParticipation,
    ContestProblem,
    ContestScore,
)
from .serializers import (
    ClarificationAnswerSerializer,
    ClarificationCreateSerializer,
    ClarificationSerializer,
    ContestDetailSerializer,
    ContestProblemSerializer,
    ContestSerializer,
    RegistrationSerializer,
)


def can_manage_contest(user, contest) -> bool:
    """Organizer check: creator, ADMIN role, or superuser."""
    if not (user and user.is_authenticated):
        return False
    return (
        contest.created_by_id == user.id
        or user.role == User.Roles.ADMIN
        or user.is_superuser
    )


def _fetch_contest(pk):
    """Fetch by pk bypassing the list queryset — detail actions govern
    visibility with can_view_contest (PRIVATE id probing stays a 404)."""
    from contests.models import Contest as _C
    return _C.objects.filter(pk=pk).first()


def can_view_contest(user, contest) -> bool:
    """PUBLIC contests are listed for everyone; PRIVATE for organizers and
    participants only."""
    if contest.visibility == Contest.Visibility.PUBLIC:
        return True
    if can_manage_contest(user, contest):
        return True
    if not (user and user.is_authenticated):
        return False
    return ContestParticipation.objects.filter(
        contest=contest, user=user
    ).exists()


class CanCreateContest(permissions.BasePermission):
    """CON-9: ADMIN/CREATOR/TEACHER may create contests (mashups).

    CREATOR/TEACHER contests are forced PRIVATE + unrated by the serializer
    — this gate only decides who can call create at all.
    """

    message = "Only admins, creators and teachers can create contests."

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        return (
            user.is_superuser
            or user.is_staff
            or user.role
            in (User.Roles.ADMIN, User.Roles.PROBLEM_CREATOR, User.Roles.TEACHER)
        )


class ContestPagination(StandardPageNumberPagination):
    page_size = 20


class ContestViewSet(viewsets.ModelViewSet):
    """Contest CRUD + registration + standings surface."""

    pagination_class = ContestPagination

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ContestDetailSerializer
        return ContestSerializer

    def get_permissions(self):
        # NOTE: action-level permission_classes would be shadowed by this
        # override (DRF sets them as view attributes), so the action sets
        # live HERE instead: public reads, participant actions, staff CRUD.
        if self.action in ("list", "retrieve", "standings", "problems", "awards"):
            return [permissions.AllowAny()]
        if self.action in (
            "register",
            "start",
            "virtual_start",
            "unfreeze",
            "disqualify",
            "clarifications",
            "clarification_answer",
            "clarification_hide",
        ):
            # Organizer-only actions check can_manage_contest() inside.
            return [permissions.IsAuthenticated()]
        if self.action in ("create", "update", "partial_update", "destroy"):
            # CON-9 mashups: CREATOR/TEACHER may create (PRIVATE + unrated
            # enforced in the serializer) and then manage THEIR OWN contests
            # (perform_update/perform_destroy enforce the organizer check);
            # everything else stays admin-only.
            return [permissions.IsAuthenticated(), CanCreateContest()]
        return [permissions.IsAuthenticated(), IsAdminUser()]

    def get_queryset(self):
        qs = (
            Contest.objects.all()
            .select_related("created_by")
            .annotate(
                problem_count=Count("contest_problems", distinct=True),
                participant_count=Count("participations", distinct=True),
            )
        )
        state = self.request.query_params.get("state", "").upper()
        if state in ("UPCOMING", "RUNNING", "FINISHED"):
            now = timezone.now()
            if state == "UPCOMING":
                qs = qs.filter(start_at__gt=now)
            elif state == "RUNNING":
                qs = qs.filter(start_at__lte=now, end_at__gt=now)
            else:
                qs = qs.filter(end_at__lte=now)
        user = self.request.user
        if user and user.is_authenticated and (
            user.role == User.Roles.ADMIN or user.is_superuser
        ):
            return qs.order_by("-start_at", "-id")  # staff see PRIVATE too
        visible = Contest.objects.filter(visibility=Contest.Visibility.PUBLIC)
        if user and user.is_authenticated:
            mine = Contest.objects.filter(created_by=user)
            visible = (
                visible
                | Contest.objects.filter(participations__user=user)
                | mine
            ).distinct()
        # pk__in-subquery + aggregations drop the Meta ordering in some
        # combinations — pin it explicitly so pagination stays consistent.
        return qs.filter(pk__in=visible.values_list("pk", flat=True)).order_by(
            "-start_at", "-id"
        )

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def perform_update(self, serializer):
        # CON-9: organizers manage their own contests; admins anything.
        if not can_manage_contest(self.request.user, serializer.instance):
            raise exceptions.PermissionDenied("Organizer only.")
        serializer.save()

    def perform_destroy(self, instance):
        if not can_manage_contest(self.request.user, instance):
            raise exceptions.PermissionDenied("Organizer only.")
        instance.delete()

    def retrieve(self, request, *args, **kwargs):
        contest = _fetch_contest(self.kwargs.get("pk"))
        if contest is None or not can_view_contest(request.user, contest):
            return Response(
                {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = self.get_serializer(contest)
        return Response(serializer.data)

    @action(detail=True, methods=["post"])
    def register(self, request, pk=None):
        # Bypass the visibility-scoped queryset: joining a PRIVATE contest
        # is exactly how you become allowed to see it — the access code is
        # the gate (404 only when the id itself doesn't exist).
        contest = _fetch_contest(pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        state = contest.state()
        # Windowed contests accept late joiners until the window closes;
        # fixed-time contests close registration at start.
        if state == Contest.State.FINISHED or (
            state == Contest.State.RUNNING and not contest.is_window
        ):
            return Response(
                {"detail": "Registration closed — the contest already started."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Round-2 SAF-2: rated contests are the platform's integrity asset
        # (the anti-multi-accounting spine) — registering for one requires
        # a verified email address. Env-gated so dev stacks can turn it off.
        if contest.is_rated and getattr(
            settings, "RATED_CONTESTS_REQUIRE_VERIFIED_EMAIL", True
        ):
            from allauth.account.models import EmailAddress

            has_verified = EmailAddress.objects.filter(
                user=request.user, verified=True
            ).exists()
            if not has_verified:
                return Response(
                    {
                        "detail": (
                            "Rated contests require a verified email address."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        # CON-7 divisions: rating-band eligibility (organizers bypass so
        # they can always enter their own room).
        from .awards import registration_rating_error

        if not can_manage_contest(request.user, contest):
            reason = registration_rating_error(contest, request.user)
            if reason:
                return Response(
                    {"detail": reason}, status=status.HTTP_403_FORBIDDEN
                )
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if contest.visibility == Contest.Visibility.PRIVATE:
            code = serializer.validated_data.get("access_code") or ""
            if code != contest.access_code:
                return Response(
                    {"detail": "Invalid access code."}, status=status.HTTP_403_FORBIDDEN
                )
        participation, created = ContestParticipation.objects.get_or_create(
            contest=contest, user=request.user, is_virtual=False
        )
        if not created:
            return Response(
                {"detail": "Already registered."}, status=status.HTTP_409_CONFLICT
            )
        return Response(
            {"contest": contest.id, "user": request.user.id, "virtual_start": None},
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        """Windowed contests (CON-6): start (or resume reporting) the caller's
        personal clock. Sets ``virtual_start`` once; idempotent afterwards."""
        contest = self.get_object()
        if not contest.is_window:
            return Response(
                {"detail": "This contest has no personal timers."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        if not (contest.start_at <= now < contest.end_at):
            return Response(
                {"detail": "The contest window is not open."}, status=status.HTTP_400_BAD_REQUEST
            )
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user
        ).first()
        if participation is None:
            return Response(
                {"detail": "Register before starting."}, status=status.HTTP_400_BAD_REQUEST
            )
        if participation.virtual_start is not None:
            return Response(
                {
                    "detail": "Personal clock already running.",
                    "virtual_start": participation.virtual_start,
                    "effective_end": participation.effective_end(),
                },
                status=status.HTTP_200_OK,
            )
        with transaction.atomic():
            participation = ContestParticipation.objects.select_for_update().get(
                pk=participation.pk
            )
            # Locked re-check: only a concurrent request can win the race
            # between the unlocked check above and this row lock, so the
            # falsey arm is unreachable in-process (reasoned no-branch pragma).
            if participation.virtual_start is None:  # pragma: no branch
                participation.virtual_start = now
                participation.save(update_fields=["virtual_start"])
        return Response(
            {
                "virtual_start": participation.virtual_start,
                "effective_end": participation.effective_end(),
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def problems(self, request, pk=None):
        """Board problems. Statements (this list) stay sealed until start_at;
        PRIVATE contests additionally require participant/organizer."""
        contest = _fetch_contest(pk)
        if contest is None or not can_view_contest(request.user, contest):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        if now < contest.start_at and not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "Problems are sealed until the contest starts."},
                status=status.HTTP_403_FORBIDDEN,
            )
        problems = contest.contest_problems.select_related("problem").all()
        return Response(ContestProblemSerializer(problems, many=True).data)

    @action(detail=True, methods=["get"])
    def standings(self, request, pk=None):
        """Format-ranked board over materialized rows (PRF-1).

        Non-organizers read the freeze-filtered aggregates while a freeze is
        in effect (CON-3); organizers always see the live board.
        """
        contest = _fetch_contest(pk)
        if contest is None or not can_view_contest(request.user, contest):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        live = can_manage_contest(request.user, contest)
        frozen = (not live) and contest.freeze_at is not None
        # CON-5: the official board never shows virtual replays; the
        # ``?section=virtual`` board never shows official sittings.
        section = request.query_params.get("section", "official")
        virtual_board = section == "virtual"

        from .awards import build_ranking_input

        # Freeze applies to the public OFFICIAL board only; the virtual
        # board is by definition post-contest history.
        ranking_input = build_ranking_input(
            contest, virtual=virtual_board, frozen=frozen and not virtual_board
        )
        standings = rank_contest(contest, ranking_input)

        results = []
        by_user = {entry["user_id"]: entry for entry in ranking_input}
        for position, standing in enumerate(standings, start=1):
            entry = by_user[standing.user_id]
            results.append(
                {
                    "rank": position,
                    "user": {"id": entry["user"].id, "username": entry["user"].username},
                    "score": standing.total_score,
                    "solved": standing.solved,
                    "penalty_minutes": (
                        None if standing.penalty_minutes == float("inf") else round(
                            standing.penalty_minutes, 2
                        )
                    ),
                    "problems": sorted(entry["rows"], key=lambda r: r["label"]),
                }
            )
        paginator = ContestPagination()
        page = paginator.paginate_queryset(results, request)
        data = paginator.get_paginated_response(page).data
        data["format"] = contest.format
        data["frozen"] = frozen
        data["section"] = "virtual" if virtual_board else "official"
        return Response(data)

    @action(detail=True, methods=["post"], url_path="virtual-start")
    def virtual_start(self, request, pk=None):
        """CON-5: start (or resume) a virtual replay of a FINISHED contest.

        The personal clock runs the contest's own length from now; contest-
        bound submissions stay gated to it (gating.py). Pretest-mode and
        windowed contests are excluded v1 — pretests need the systest pass
        to score honestly and windowed contests already ARE personal-clock
        contests while live.
        """
        contest = _fetch_contest(pk)
        if contest is None or not can_view_contest(request.user, contest):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if contest.state() != Contest.State.FINISHED:
            return Response(
                {"detail": "Virtual participation opens after the contest ends."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if contest.is_window:
            return Response(
                {
                    "detail": (
                        "Windowed contests run on personal timers while live — "
                        "replay them by re-registering next edition."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if contest.pretest_mode:
            return Response(
                {
                    "detail": (
                        "Pretest contests cannot be replayed virtually yet — "
                        "solutions are judged on the full suite only via the "
                        "final standings."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = timezone.now()
        # A previous official sitting never blocks the replay — official and
        # virtual rows coexist (disjoint standings sections). An existing
        # virtual row resumes its clock idempotently.
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user, is_virtual=True
        ).first()
        if participation is None:
            participation = ContestParticipation.objects.create(
                contest=contest, user=request.user, is_virtual=True, virtual_start=now
            )
            return Response(
                {
                    "virtual_start": participation.virtual_start,
                    "effective_end": participation.effective_end(),
                    "is_virtual": True,
                },
                status=status.HTTP_201_CREATED,
            )
        return Response(
            {
                "virtual_start": participation.virtual_start,
                "effective_end": participation.effective_end(),
                "is_virtual": True,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=["get"])
    def awards(self, request, pk=None):
        """CON-11: medal table over the official standings (post-finalize)."""
        contest = _fetch_contest(pk)
        if contest is None or not can_view_contest(request.user, contest):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rows = (
            ContestAward.objects.filter(contest=contest)
            .select_related("user")
            .order_by("rank")
        )
        return Response(
            {
                "count": rows.count(),
                "results": [
                    {
                        "rank": a.rank,
                        "medal": a.medal,
                        "user": {"id": a.user.id, "username": a.user.username},
                    }
                    for a in rows
                ],
            }
        )

    @action(detail=True, methods=["post"])
    def unfreeze(self, request, pk=None):
        """CON-3: deliberate unfreeze — organizer action, clears freeze_at."""
        contest = self.get_object()
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        contest.freeze_at = None
        contest.save(update_fields=["freeze_at", "updated_at"])
        return Response({"detail": "Scoreboard unfrozen.", "freeze_at": None})

    @action(detail=True, methods=["post"])
    def disqualify(self, request, pk=None):
        """Round-2 SAF-2: organizer DQs one participation (reason recorded)."""
        contest = self.get_object()
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        user_id = request.data.get("user")
        reason = (request.data.get("reason") or "").strip()
        if not user_id:
            return Response(
                {"detail": "user (id) is required."}, status=status.HTTP_400_BAD_REQUEST
            )
        participation = ContestParticipation.objects.filter(
            contest=contest, user_id=user_id
        ).first()
        if participation is None:
            return Response(
                {"detail": "No such participation."}, status=status.HTTP_404_NOT_FOUND
            )
        participation.is_disqualified = True
        participation.disqualification_reason = reason
        participation.save(update_fields=["is_disqualified", "disqualification_reason"])
        return Response(
            {
                "detail": "Participation disqualified.",
                "user": participation.user_id,
                "reason": participation.disqualification_reason,
            }
        )


    # ------------------------------------------------------------------
    # Clarifications (CON-4) + moderation basics (round-2 SAF-1)
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get", "post"])
    def clarifications(self, request, pk=None):
        """Participant view: own questions + broadcasts (+ jury everything).

        GET ?include_hidden=1 (organizer) also lists hidden rows; POST asks
        a new question (participants only, must be registered).
        """
        contest = _fetch_contest(pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        is_organizer = can_manage_contest(request.user, contest)

        if request.method == "POST":
            # CON-4 question budget: bounded per user so the jury queue
            # cannot be flooded mid-contest (SP4 scoped-throttle pattern).
            self.throttle_classes = [ScopedRateThrottle]
            self.throttle_scope = "clarification"
            if is_organizer:
                return Response(
                    {"detail": "Organizers answer; participants ask."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            participation = ContestParticipation.objects.filter(
                contest=contest, user=request.user
            ).first()
            if participation is None:
                return Response(
                    {"detail": "Only participants can ask questions."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if contest.state() != Contest.State.RUNNING:
                return Response(
                    {"detail": "The contest is not running."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            serializer = ClarificationCreateSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            clarification = Clarification.objects.create(
                contest=contest,
                asker=request.user,
                problem=serializer.validated_data.get("problem"),
                question=serializer.validated_data["question"],
            )
            return Response(
                ClarificationSerializer(clarification).data,
                status=status.HTTP_201_CREATED,
            )

        qs = Clarification.objects.filter(contest=contest).select_related(
            "asker", "answered_by", "problem"
        )
        if is_organizer:
            if request.query_params.get("include_hidden", "") not in ("1", "true"):
                qs = qs.exclude(is_hidden=True)
            data = ClarificationSerializer(qs, many=True).data
            return Response(
                {"results": data, "canned_answers": CLARIFICATION_CANNED_ANSWERS}
            )
        # Participants: own + broadcast, never hidden.
        from django.db.models import Q

        qs = qs.filter(Q(asker=request.user) | Q(is_broadcast=True)).exclude(
            is_hidden=True
        )
        return Response({"results": ClarificationSerializer(qs, many=True).data})

    @action(
        detail=False,
        methods=["post"],
        url_path=r"clarifications/(?P<clarification_id>[0-9]+)/answer",
    )
    def clarification_answer(self, request, clarification_id=None):
        """Jury answers a clarification; broadcasts notify every participant."""
        clarification = Clarification.objects.select_related("contest").filter(
            pk=clarification_id
        ).first()
        if clarification is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_contest(request.user, clarification.contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = ClarificationAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        answer = serializer.validated_data.get("answer") or serializer.validated_data[
            "canned"
        ]
        broadcast = serializer.validated_data.get("broadcast", False)
        clarification.answer = answer
        clarification.is_broadcast = broadcast
        clarification.answered_by = request.user
        clarification.answered_at = timezone.now()
        clarification.save()

        if broadcast:
            from notifications.services import notify

            for participation in clarification.contest.participations.filter(
                is_disqualified=False
            ).select_related("user"):
                notify(
                    participation.user,
                    "SYSTEM",
                    actor=request.user,
                    target=clarification.contest,
                    data={
                        "kind": "clarification_broadcast",
                        "clarification_id": clarification.id,
                        "contest_id": clarification.contest_id,
                        "question": clarification.question[:200],
                        "answer": answer[:200],
                    },
                )
        return Response(ClarificationSerializer(clarification).data)

    @action(
        detail=False,
        methods=["post"],
        url_path=r"clarifications/(?P<clarification_id>[0-9]+)/hide",
    )
    def clarification_hide(self, request, clarification_id=None):
        """Moderation (SAF-1): organizer hides an abusive question."""
        clarification = Clarification.objects.filter(pk=clarification_id).first()
        if clarification is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_contest(request.user, clarification.contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        clarification.is_hidden = True
        clarification.hidden_by = request.user
        clarification.hidden_reason = (request.data.get("reason") or "").strip()
        clarification.save(
            update_fields=["is_hidden", "hidden_by", "hidden_reason"]
        )
        return Response({"detail": "Clarification hidden.", "id": clarification.id})
