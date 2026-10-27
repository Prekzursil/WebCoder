"""Contest serializers (Wave B: CON-1/CON-2/CON-3/CON-6)."""

from django.utils import timezone
from rest_framework import serializers

from problems.models import Problem
from users.models import User

from .models import (
    CLARIFICATION_CANNED_ANSWERS,
    Clarification,
    Contest,
    ContestParticipation,
    ContestProblem,
)


class ContestProblemSerializer(serializers.ModelSerializer):
    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())
    problem_title = serializers.SerializerMethodField()
    problem_difficulty = serializers.SerializerMethodField()

    class Meta:
        model = ContestProblem
        fields = [
            "id",
            "problem",
            "problem_title",
            "problem_difficulty",
            "order",
            "label",
            "points",
        ]

    def get_problem_title(self, obj):
        return obj.problem.title_i18n

    def get_problem_difficulty(self, obj):
        return obj.problem.difficulty


class ContestSerializer(serializers.ModelSerializer):
    """Create/update + list shape.

    Create validation enforces the roadmap's invariants: end after start,
    freeze inside the window, window duration not exceeding the window, and
    (for rated contests) a format whose scores the rating pass understands.
    """

    contest_problems = ContestProblemSerializer(many=True, read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True)
    # CON-9 mashups: organizers assemble their board by passing problem ids
    # on create/update. Non-admin creators (CREATOR/TEACHER) may only pick
    # from the APPROVED pool and only run PRIVATE unrated contests.
    problem_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        write_only=True,
        help_text="Ordered board problem ids; labels auto-assign A, B, C…",
    )
    state = serializers.SerializerMethodField()
    problem_count = serializers.IntegerField(read_only=True, default=0)
    participant_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = Contest
        fields = [
            "id",
            "title_i18n",
            "description_i18n",
            "visibility",
            "access_code",
            "is_rated",
            "format",
            "penalty_time_minutes",
            "penalty_factor_minutes",
            "start_at",
            "end_at",
            "freeze_at",
            "is_window",
            "per_user_duration_minutes",
            "pretest_mode",
            "editorial_delay_minutes",
            "rated_rating_min",
            "rated_rating_max",
            "problem_ids",
            "created_by",
            "created_by_username",
            "state",
            "problem_count",
            "participant_count",
            "contest_problems",
        ]
        read_only_fields = ["id", "created_by", "created_by_username", "state"]

    def get_state(self, obj):
        return obj.state()

    def validate(self, attrs):
        start = attrs.get("start_at") or getattr(self.instance, "start_at", None)
        end = attrs.get("end_at") or getattr(self.instance, "end_at", None)
        if start and end and end <= start:
            raise serializers.ValidationError(
                {"end_at": "Contest end must be after its start."}
            )
        freeze = attrs.get("freeze_at", getattr(self.instance, "freeze_at", None))
        if freeze is not None:
            if freeze <= start or freeze > end:
                raise serializers.ValidationError(
                    {"freeze_at": "Freeze must sit inside (start, end]."}
                )
        is_window = attrs.get("is_window", getattr(self.instance, "is_window", False))
        duration = attrs.get(
            "per_user_duration_minutes",
            getattr(self.instance, "per_user_duration_minutes", None),
        )
        if is_window and start and end and duration:
            window_minutes = (end - start).total_seconds() / 60
            if duration > window_minutes:
                raise serializers.ValidationError(
                    {"per_user_duration_minutes": "Personal duration exceeds the window."}
                )
        visibility = attrs.get("visibility", getattr(self.instance, "visibility", None))
        access_code = attrs.get("access_code", getattr(self.instance, "access_code", ""))
        if visibility == Contest.Visibility.PRIVATE and not access_code:
            raise serializers.ValidationError(
                {"access_code": "PRIVATE contests need an access code."}
            )
        # CON-7: division band sanity.
        lo = attrs.get("rated_rating_min", getattr(self.instance, "rated_rating_min", None))
        hi = attrs.get("rated_rating_max", getattr(self.instance, "rated_rating_max", None))
        if lo is not None and hi is not None and lo > hi:
            raise serializers.ValidationError(
                {"rated_rating_min": "Division minimum exceeds its maximum."}
            )
        # CON-9: non-admin creators (CREATOR/TEACHER) run PRIVATE, unrated
        # mashups from the APPROVED pool — the community-contest guardrail.
        request = self.context.get("request")
        user = getattr(request, "user", None)
        is_admin = bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.role == User.Roles.ADMIN or user.is_superuser)
        )
        if user is not None and user.is_authenticated and not is_admin:
            if attrs.get("visibility", visibility) != Contest.Visibility.PRIVATE:
                raise serializers.ValidationError(
                    {"visibility": "Community contests must be PRIVATE."}
                )
            if attrs.get("is_rated", getattr(self.instance, "is_rated", False)):
                raise serializers.ValidationError(
                    {"is_rated": "Community contests cannot be rated."}
                )
        problem_ids = attrs.get("problem_ids")
        if problem_ids is not None:
            if is_admin:
                allowed = Problem.objects.filter(id__in=problem_ids)
            else:
                allowed = Problem.objects.filter(
                    id__in=problem_ids, status=Problem.ProblemStatus.APPROVED
                )
            if allowed.count() != len(set(problem_ids)):
                missing = sorted(set(problem_ids) - set(allowed.values_list("id", flat=True)))
                raise serializers.ValidationError(
                    {
                        "problem_ids": (
                            "Problems must exist and be APPROVED for community "
                            f"contests. Rejected ids: {missing}."
                        )
                    }
                )
        return attrs

    def create(self, validated_data):
        problem_ids = validated_data.pop("problem_ids", None)
        contest = super().create(validated_data)
        if problem_ids is not None:
            _sync_board(contest, problem_ids)
        return contest

    def update(self, instance, validated_data):
        problem_ids = validated_data.pop("problem_ids", None)
        contest = super().update(instance, validated_data)
        if problem_ids is not None:
            _sync_board(contest, problem_ids)
        return contest


class ContestDetailSerializer(ContestSerializer):
    """Retrieve shape: adds the caller's participation + organizer flag."""

    my_participation = serializers.SerializerMethodField()
    can_manage = serializers.SerializerMethodField()

    class Meta(ContestSerializer.Meta):
        fields = ContestSerializer.Meta.fields + ["my_participation", "can_manage"]

    def get_my_participation(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        # Virtual replay (CON-5) outranks the historical official row —
        # it is the sitting the caller can still act on.
        participation = (
            ContestParticipation.objects.filter(contest=obj, user=request.user)
            .order_by("-is_virtual", "created_at")
            .first()
        )
        if participation is None:
            return None
        return {
            "virtual_start": participation.virtual_start,
            "effective_start": participation.effective_start(),
            "effective_end": participation.effective_end(),
            "is_virtual": participation.is_virtual,
            "is_disqualified": participation.is_disqualified,
            "created_at": participation.created_at,
        }

    def get_can_manage(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        user = request.user
        return (
            obj.created_by_id == user.id
            or user.role == User.Roles.ADMIN
            or user.is_superuser
        )


class RegistrationSerializer(serializers.Serializer):
    """POST /contests/{id}/register/ body: PRIVATE contests need the code."""

    access_code = serializers.CharField(required=False, allow_blank=True, trim_whitespace=True)


class ClarificationSerializer(serializers.ModelSerializer):
    asker_username = serializers.CharField(source="asker.username", read_only=True)
    answered_by_username = serializers.CharField(
        source="answered_by.username", read_only=True, allow_null=True
    )
    problem_id = serializers.PrimaryKeyRelatedField(
        source="problem",
        queryset=Problem.objects.all(),
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Clarification
        fields = [
            "id",
            "contest",
            "problem_id",
            "asker",
            "asker_username",
            "question",
            "answer",
            "answered_by",
            "answered_by_username",
            "answered_at",
            "is_broadcast",
            "is_hidden",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "asker",
            "answer",
            "answered_by",
            "answered_at",
            "is_broadcast",
            "is_hidden",
            "created_at",
        ]


class ClarificationCreateSerializer(serializers.Serializer):
    """POST /contests/{id}/clarifications/ — participant question."""

    problem = serializers.PrimaryKeyRelatedField(
        queryset=Problem.objects.all(), required=False, allow_null=True
    )
    question = serializers.CharField(max_length=2000)


class ClarificationAnswerSerializer(serializers.Serializer):
    """POST /contests/clarifications/{id}/answer/ — jury reply.

    ``canned`` accepts one of CLARIFICATION_CANNED_ANSWERS and is expanded
    server-side (the UI offers them as one-click buttons, .campion style).
    """

    answer = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    canned = serializers.ChoiceField(
        choices=[(c, c) for c in CLARIFICATION_CANNED_ANSWERS],
        required=False,
    )
    broadcast = serializers.BooleanField(default=False)

    def validate(self, attrs):
        if not (attrs.get("answer") or attrs.get("canned")):
            raise serializers.ValidationError(
                {"detail": "Provide answer text or a canned choice."}
            )
        return attrs


def _sync_board(contest: Contest, problem_ids: list[int]) -> None:
    """Replace the contest board with the ordered ``problem_ids``.

    Used by the CON-9 mashup create/update path: labels re-derive from the
    new order; points default to 100 per problem (organizers adjust later
    via the admin or a follow-up update).
    """
    contest.contest_problems.all().delete()
    rows = []
    for order, problem_id in enumerate(problem_ids):
        # bulk_create skips Model.save(), so derive the board label here
        # exactly as ContestProblem.save() does (A, B…, AA1-style at 27+).
        label = chr(ord("A") + (order % 26))
        if order >= 26:
            label = f"{label}{order // 26}"
        rows.append(
            ContestProblem(
                contest=contest,
                problem_id=problem_id,
                order=order,
                points=100,
                label=label,
            )
        )
    ContestProblem.objects.bulk_create(rows)
