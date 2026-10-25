"""Contest serializers (Wave B: CON-1/CON-2/CON-3/CON-6)."""

from django.utils import timezone
from rest_framework import serializers

from problems.models import Problem
from users.models import User

from .models import Contest, ContestParticipation, ContestProblem


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
        return attrs


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
        participation = ContestParticipation.objects.filter(
            contest=obj, user=request.user
        ).first()
        if participation is None:
            return None
        return {
            "virtual_start": participation.virtual_start,
            "effective_start": participation.effective_start(),
            "effective_end": participation.effective_end(),
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
