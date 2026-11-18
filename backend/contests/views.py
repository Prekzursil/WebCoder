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
    ContestCommentary,
    ContestParticipation,
    Hack,
)
from .serializers import (
    ClarificationAnswerSerializer,
    ClarificationCreateSerializer,
    ClarificationSerializer,
    CommentaryCreateSerializer,
    CommentarySerializer,
    ContestDetailSerializer,
    ContestProblemSerializer,
    ContestSerializer,
    HackCreateSerializer,
    HackSerializer,
    RegistrationSerializer,
)
from submissions.models import Submission


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
    return ContestParticipation.objects.filter(contest=contest, user=user).exists()


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
        if self.action in (
            "list",
            "retrieve",
            "standings",
            "problems",
            "awards",
            "commentary",
            "replay",
            "drama",
            "hacks",
            "teams",
        ):
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
            "lock",
            "hack_targets",
            "predict",
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
        # Item 54 — the long-challenge catalog axis.
        if self.request.query_params.get("kind", "") == "long":
            qs = qs.filter(is_long_contest=True)
        user = self.request.user
        if (
            user
            and user.is_authenticated
            and (user.role == User.Roles.ADMIN or user.is_superuser)
        ):
            return qs.order_by("-start_at", "-id")  # staff see PRIVATE too
        visible = Contest.objects.filter(visibility=Contest.Visibility.PUBLIC)
        if user and user.is_authenticated:
            mine = Contest.objects.filter(created_by=user)
            visible = (
                visible | Contest.objects.filter(participations__user=user) | mine
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
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
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
                    {"detail": ("Rated contests require a verified email address.")},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        # CON-7 divisions: rating-band eligibility (organizers bypass so
        # they can always enter their own room).
        from .awards import registration_rating_error

        if not can_manage_contest(request.user, contest):
            reason = registration_rating_error(contest, request.user)
            if reason:
                return Response({"detail": reason}, status=status.HTTP_403_FORBIDDEN)
        serializer = RegistrationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if contest.visibility == Contest.Visibility.PRIVATE:
            code = serializer.validated_data.get("access_code") or ""
            if code != contest.access_code:
                return Response(
                    {"detail": "Invalid access code."}, status=status.HTTP_403_FORBIDDEN
                )
        # Item 50 — school cups gate registration on the caller's school.
        if contest.is_school_cup:
            caller_school = (getattr(request.user, "school", "") or "").strip()
            if (
                not caller_school
                or caller_school.lower() != contest.school_name.strip().lower()
            ):
                return Response(
                    {
                        "detail": (
                            f"This cup is for students of {contest.school_name} — "
                            "set your school on your profile first."
                        )
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
        # Item 49 — team contests ride the team flow: join the named team
        # (created when new, captained by the creator), capped at
        # ContestTeam.MAX_MEMBERS.
        team = None
        team_name = serializer.validated_data.get("team_name") or ""
        if contest.is_team_contest:
            if not team_name:
                return Response(
                    {"detail": "Team contests need a team name."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from .models import ContestTeam, ContestTeamMember

            team = ContestTeam.objects.filter(
                contest=contest, name__iexact=team_name
            ).first()
            if team is None:
                team = ContestTeam.objects.create(
                    contest=contest, name=team_name, captain=request.user
                )
            elif team.members.count() >= ContestTeam.MAX_MEMBERS:
                return Response(
                    {
                        "detail": (
                            f"Team '{team.name}' is full "
                            f"({ContestTeam.MAX_MEMBERS} members max)."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            elif team.members.filter(user=request.user).exists():
                return Response(
                    {"detail": "Already registered."}, status=status.HTTP_409_CONFLICT
                )
        participation, created = ContestParticipation.objects.get_or_create(
            contest=contest, user=request.user, is_virtual=False
        )
        if not created:
            return Response(
                {"detail": "Already registered."}, status=status.HTTP_409_CONFLICT
            )
        if team is not None:
            from .models import ContestTeamMember

            ContestTeamMember.objects.get_or_create(team=team, user=request.user)
        return Response(
            {
                "contest": contest.id,
                "user": request.user.id,
                "virtual_start": None,
                "team": team.name if team is not None else None,
            },
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
                {"detail": "The contest window is not open."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user
        ).first()
        if participation is None:
            return Response(
                {"detail": "Register before starting."},
                status=status.HTTP_400_BAD_REQUEST,
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
        live = can_manage_contest(request.user, contest)
        frozen = (not live) and contest.freeze_at is not None
        # CON-5: the official board never shows virtual replays; the
        # ``?section=virtual`` board never shows official sittings.
        section = request.query_params.get("section", "official")
        virtual_board = section == "virtual"
        # Item 49 — the team board: per-team aggregates over member rows.
        if section == "teams":
            from .models import ContestTeam
            from .teams import teams_ranking

            if not contest.is_team_contest:
                return Response(
                    {"detail": "This contest is not a team contest."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            results = teams_ranking(contest)
            return Response(
                {
                    "count": len(results),
                    "next": None,
                    "previous": None,
                    "results": results,
                    "format": contest.format,
                    "frozen": False,
                    "section": "teams",
                    "team_size": ContestTeam.MAX_MEMBERS,
                }
            )

        # Hidden boards (DMOJ/campion): non-organizers get an explicitly
        # empty envelope while the contest runs — the FE renders the
        # "hidden until the contest ends" notice from the flag. The
        # virtual board is by definition post-contest history and stays
        # visible.
        if (
            (not live)
            and (not virtual_board)
            and contest.hide_scoreboard_until_end
            and contest.state() != contest.State.FINISHED
        ):
            return Response(
                {
                    "count": 0,
                    "next": None,
                    "previous": None,
                    "results": [],
                    "format": contest.format,
                    "frozen": False,
                    "hidden": True,
                    "section": "official",
                }
            )

        from .awards import build_ranking_input

        # Freeze applies to the public OFFICIAL board only; the virtual
        # board is by definition post-contest history.
        ranking_input = build_ranking_input(
            contest, virtual=virtual_board, frozen=frozen and not virtual_board
        )
        standings = rank_contest(contest, ranking_input)

        # COM-4: friends-only standings — the viewer plus the people they
        # follow (the Codeforces friends-only board). Authentication is
        # required for the flag to mean anything; an anonymous request
        # keeps the full board rather than 401-ing a public page.
        friends_only = request.query_params.get("friends", "") in ("1", "true")
        if friends_only and request.user.is_authenticated:
            from users.models import Follow

            friend_ids = set(
                Follow.objects.filter(follower=request.user).values_list(
                    "target_id", flat=True
                )
            )
            friend_ids.add(request.user.id)
            standings = [
                standing for standing in standings if standing.user_id in friend_ids
            ]

        results = []
        by_user = {entry["user_id"]: entry for entry in ranking_input}
        for position, standing in enumerate(standings, start=1):
            entry = by_user[standing.user_id]
            results.append(
                {
                    "rank": position,
                    "user": {
                        "id": entry["user"].id,
                        "username": entry["user"].username,
                    },
                    "score": standing.total_score,
                    "solved": standing.solved,
                    "penalty_minutes": (
                        None
                        if standing.penalty_minutes == float("inf")
                        else round(standing.penalty_minutes, 2)
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
        clarification = (
            Clarification.objects.select_related("contest")
            .filter(pk=clarification_id)
            .first()
        )
        if clarification is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not can_manage_contest(request.user, clarification.contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = ClarificationAnswerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        answer = (
            serializer.validated_data.get("answer")
            or serializer.validated_data["canned"]
        )
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
        clarification.save(update_fields=["is_hidden", "hidden_by", "hidden_reason"])
        return Response({"detail": "Clarification hidden.", "id": clarification.id})

    # ------------------------------------------------------------------
    # Wave F — contest depth: open hacks (48), commentary (56), replay
    # (57), frozen-board drama (58).
    # ------------------------------------------------------------------

    def _visible_contest_or_none(self, request, pk):
        contest = _fetch_contest(pk)
        if contest is None or not can_view_contest(request.user, contest):
            return None
        return contest

    @action(detail=True, methods=["get", "post"])
    def commentary(self, request, pk=None):
        """Item 56 — organizer commentary feed, readable by anyone who can
        see the contest, writable by organizers only."""
        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.method == "GET":
            rows = contest.commentary.select_related("author").all()
            return Response(
                {
                    "count": rows.count(),
                    "results": CommentarySerializer(rows, many=True).data,
                }
            )
        if not can_manage_contest(request.user, contest):
            return Response(
                {"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN
            )
        serializer = CommentaryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        row = ContestCommentary.objects.create(
            contest=contest,
            author=request.user,
            text=serializer.validated_data["text"],
            minute_offset=serializer.validated_data.get("minute_offset", 0),
        )
        return Response(CommentarySerializer(row).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path=r"lock/(?P<contest_problem_id>[0-9]+)",
    )
    def lock(self, request, pk=None, contest_problem_id=None):
        """Item 48 — lock a fully-solved board problem to unlock hacking."""
        from .hacks import lock_problem

        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        contest_problem = contest.contest_problems.filter(pk=contest_problem_id).first()
        if contest_problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user, is_virtual=False
        ).first()
        if participation is None:
            return Response(
                {"detail": "Register for the contest first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ok, error = lock_problem(contest, participation, contest_problem)
        if not ok:
            return Response({"detail": error}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "detail": "Locked — you can now hack this problem's solutions.",
                "contest_problem": contest_problem_id,
            }
        )

    @action(detail=True, methods=["get"], url_path="hacks/targets")
    def hack_targets(self, request, pk=None):
        """Hackable solutions for the caller: other participants' latest
        submissions on problems the caller has locked (code included —
        finding the counter-test by reading is the game)."""
        from .hacks import hackable_targets

        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user, is_virtual=False
        ).first()
        if participation is None:
            return Response(
                {"detail": "Register for the contest first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = hackable_targets(contest, participation)
        labels = {cp.problem_id: cp.label for cp in contest.contest_problems.all()}
        results = [
            {
                "id": sub.id,
                "user": {"username": sub.user.username},
                "problem_id": sub.problem_id,
                "problem_label": labels.get(sub.problem_id, "?"),
                "language": sub.language,
                "verdict": sub.verdict,
                "score": sub.score,
                "code": sub.code,
                "submission_time": sub.submission_time,
            }
            for sub in rows
        ]
        return Response({"count": len(results), "results": results})

    @action(detail=True, methods=["get", "post"])
    def hacks(self, request, pk=None):
        """Item 48 — the open-hacks feed (GET) and counter-test submit
        (POST, judged synchronously through the judge sandbox)."""
        from . import hacks as hacks_mod

        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.method == "GET":
            mine = request.query_params.get("mine", "") in ("1", "true")
            qs = hacks_mod.visible_hacks_queryset(contest, request.user)
            if mine and request.user.is_authenticated:
                qs = qs.filter(hacker=request.user)
            return Response(
                {
                    "count": qs.count(),
                    "results": HackSerializer(qs, many=True).data,
                    "window_open": hacks_mod.hack_window_open(contest),
                }
            )

        serializer = HackCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.is_authenticated:
            return Response(
                {"detail": "Sign in to submit hacks."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not hacks_mod.hack_window_open(contest):
            return Response(
                {"detail": "The hacking window is not open."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        target = (
            Submission.objects.select_related("problem", "user")
            .filter(
                pk=serializer.validated_data["target_submission_id"], contest=contest
            )
            .first()
        )
        if target is None:
            return Response(
                {"detail": "That submission is not part of this contest."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        participation = ContestParticipation.objects.filter(
            contest=contest, user=request.user, is_virtual=False
        ).first()
        if participation is None:
            return Response(
                {"detail": "Register for the contest first."},
                status=status.HTTP_403_FORBIDDEN,
            )
        contest_problem = contest.contest_problems.filter(
            problem_id=target.problem_id
        ).first()
        if (
            contest_problem is None
            or not participation.locked_problems.filter(pk=contest_problem.pk).exists()
        ):
            return Response(
                {
                    "detail": (
                        "Lock this problem (after fully solving it) before hacking it."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )
        if target.user_id == request.user.id:
            return Response(
                {"detail": "You cannot hack your own submission."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Hack.objects.filter(
            hacker=request.user,
            target=target,
            input_data=serializer.validated_data["input_data"],
        ).exists():
            return Response(
                {"detail": "Identical hack already submitted."},
                status=status.HTTP_409_CONFLICT,
            )
        hack = Hack.objects.create(
            contest=contest,
            contest_problem=contest_problem,
            hacker=request.user,
            target=target,
            input_data=serializer.validated_data["input_data"],
        )
        hack = hacks_mod.judge_hack(hack)
        return Response(HackSerializer(hack).data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["get"],
        url_path=r"replay/(?P<username>[^/.]+)",
    )
    def replay(self, request, pk=None, username=None):
        """Item 57 — replay one user's contest: every in-window submission
        as a minute-offset event with the running score, plus the final
        rank and rating change."""
        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        target_user = User.objects.filter(username=username).first()
        if target_user is None:
            return Response(
                {"detail": "No such user."}, status=status.HTTP_404_NOT_FOUND
            )
        participation = (
            ContestParticipation.objects.filter(contest=contest, user=target_user)
            .order_by("is_virtual")
            .first()
        )
        if participation is None:
            return Response(
                {"detail": "That user did not participate."},
                status=status.HTTP_404_NOT_FOUND,
            )
        start = participation.effective_start()
        labels = {cp.problem_id: cp.label for cp in contest.contest_problems.all()}
        maxima = {cp.problem_id: cp.points for cp in contest.contest_problems.all()}
        subs = Submission.objects.filter(contest=contest, user=target_user).order_by(
            "submission_time", "id"
        )
        best: dict[int, float] = {}
        events = []
        for sub in subs:
            if sub.submission_time < participation.effective_start() or (
                sub.submission_time >= participation.effective_end()
                and not participation.is_virtual
            ):
                continue
            offset = (sub.submission_time - start).total_seconds() / 60
            prev_best = best.get(sub.problem_id, 0.0)
            current = float(sub.score or 0)
            best[sub.problem_id] = max(prev_best, current)
            events.append(
                {
                    "minute_offset": round(offset, 2),
                    "problem_label": labels.get(sub.problem_id, "?"),
                    "problem_id": sub.problem_id,
                    "verdict": sub.verdict,
                    "score": current,
                    "problem_best": best[sub.problem_id],
                    "problem_max": maxima.get(sub.problem_id, 0),
                    "total": round(sum(best.values()), 2),
                    "submission_id": sub.id,
                }
            )
        # Final rank from the stored standings computation.
        from .awards import build_ranking_input

        ranking_input = build_ranking_input(contest, virtual=False, frozen=False)
        standings = rank_contest(contest, ranking_input)
        final_rank = next(
            (
                position
                for position, standing in enumerate(standings, start=1)
                if standing.user_id == target_user.id
            ),
            None,
        )
        from ratings.models import RatingHistory

        rating = RatingHistory.objects.filter(contest=contest, user=target_user).first()
        return Response(
            {
                "contest": contest.id,
                "username": target_user.username,
                "is_virtual": participation.is_virtual,
                "events": events,
                "final_rank": final_rank,
                "rating_change": (
                    None
                    if rating is None
                    else {"delta": rating.delta, "rating": rating.rating}
                ),
            }
        )

    @action(detail=True, methods=["get"])
    def drama(self, request, pk=None):
        """Item 58 — the frozen-board suspense view: the public (frozen)
        board plus, per participant, how many submissions the freeze is
        hiding and when the veil lifts."""
        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        now = timezone.now()
        freeze_live = (
            contest.freeze_at is not None
            and now >= contest.freeze_at
            and contest.state(now) != Contest.State.FINISHED
        )
        from .awards import build_ranking_input

        ranking_input = build_ranking_input(contest, virtual=False, frozen=freeze_live)
        standings = rank_contest(contest, ranking_input)
        by_user = {entry["user_id"]: entry for entry in ranking_input}
        hidden_counts = {}
        if freeze_live:
            participant_ids = set(
                ContestParticipation.objects.filter(
                    contest=contest, is_virtual=False, is_disqualified=False
                ).values_list("user_id", flat=True)
            )
            hidden = (
                Submission.objects.filter(
                    contest=contest,
                    submission_time__gt=contest.freeze_at,
                    user_id__in=participant_ids,
                )
                .values("user")
                .annotate(n=Count("id"))
            )
            hidden_counts = {row["user"]: row["n"] for row in hidden}
        results = []
        for position, standing in enumerate(standings, start=1):
            entry = by_user[standing.user_id]
            results.append(
                {
                    "rank": position,
                    "user": {
                        "id": entry["user"].id,
                        "username": entry["user"].username,
                    },
                    "score": standing.total_score,
                    "solved": standing.solved,
                    "hidden_submissions": hidden_counts.get(standing.user_id, 0),
                }
            )
        return Response(
            {
                "is_frozen": freeze_live,
                "freeze_at": contest.freeze_at,
                "reveal_at": contest.end_at,
                "seconds_until_reveal": max(
                    0, int((contest.end_at - now).total_seconds())
                ),
                "results": results,
            }
        )

    # ------------------------------------------------------------------
    # Wave F — teams (49), school cups (50), self-prediction (55).
    # ------------------------------------------------------------------

    @action(detail=True, methods=["get"])
    def teams(self, request, pk=None):
        """Item 49 — the contest's teams with their members (captain first)."""
        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not contest.is_team_contest:
            return Response(
                {"detail": "This contest is not a team contest."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from .models import ContestTeam

        results = []
        for team in contest.teams.prefetch_related("members__user").order_by("name"):
            members = list(team.members.select_related("user").order_by("joined_at"))
            results.append(
                {
                    "id": team.id,
                    "name": team.name,
                    "captain": team.captain.username,
                    "members": [member.user.username for member in members],
                    "member_count": len(members),
                    "max_members": ContestTeam.MAX_MEMBERS,
                }
            )
        return Response({"count": len(results), "results": results})

    @action(detail=True, methods=["get", "post"])
    def predict(self, request, pk=None):
        """Item 55 — self-prediction: commit a predicted final rank before
        the contest starts (or before the predictor's first submission);
        the calibration profile lives under /ratings."""
        from django.utils import timezone as dj_timezone

        from .models import ContestPrediction

        contest = self._visible_contest_or_none(request, pk)
        if contest is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if request.method == "GET":
            prediction = ContestPrediction.objects.filter(
                contest=contest, user=request.user
            ).first()
            return Response(
                {
                    "prediction": (prediction.predicted_rank if prediction else None),
                    "open": contest.state() != Contest.State.FINISHED,
                }
            )
        raw_rank = request.data.get("predicted_rank")
        try:
            predicted_rank = int(raw_rank)
        except (TypeError, ValueError):
            return Response(
                {"predicted_rank": "An integer rank is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if predicted_rank < 1:
            return Response(
                {"predicted_rank": "Rank starts at 1."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        now = dj_timezone.now()
        if contest.state(now) == Contest.State.FINISHED:
            return Response(
                {"detail": "The contest already finished."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Submission.objects.filter(contest=contest, user=request.user).exists():
            return Response(
                {
                    "detail": (
                        "Too late — you already submitted; predictions lock at "
                        "your first submission."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        prediction, _created = ContestPrediction.objects.update_or_create(
            contest=contest,
            user=request.user,
            defaults={"predicted_rank": predicted_rank},
        )
        return Response(
            {"contest": contest.id, "predicted_rank": prediction.predicted_rank},
            status=status.HTTP_201_CREATED,
        )
