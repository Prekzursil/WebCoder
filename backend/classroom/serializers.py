"""Classroom serializers (EDU-1/EDU-2)."""

from django.utils import timezone
from rest_framework import serializers

from problems.models import Problem
from users.models import User

from .models import Assignment, AssignmentProblem, ClassMembership, ClassRoom


class ClassRoomSerializer(serializers.ModelSerializer):
    """Create/update + teacher list shape.

    ``join_code`` is generated server-side and only ever echoed to the
    owning teacher (students join with it — they must receive it out of
    band, so leaking it to members-only list views is unnecessary).
    ``join_password`` is write-only and stored hashed.
    """

    teacher_username = serializers.CharField(
        source="teacher.username", read_only=True
    )
    member_count = serializers.SerializerMethodField()
    assignment_count = serializers.SerializerMethodField()
    is_owner = serializers.SerializerMethodField()

    class Meta:
        model = ClassRoom
        fields = [
            "id",
            "name",
            "school",
            "join_code",
            "join_password",
            "is_open",
            "created_at",
            "teacher_username",
            "member_count",
            "assignment_count",
            "is_owner",
        ]
        read_only_fields = ["id", "join_code", "created_at"]

    def get_member_count(self, obj):
        return obj.memberships.count()

    def get_assignment_count(self, obj):
        return obj.assignments.count()

    def get_is_owner(self, obj):
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.teacher_id == request.user.id

    def create(self, validated_data):
        raw_password = validated_data.pop("join_password", "")
        classroom = ClassRoom(**validated_data)
        classroom.set_join_password(raw_password)
        classroom.save()
        return classroom

    def update(self, instance, validated_data):
        raw_password = validated_data.pop("join_password", None)
        if raw_password is not None:
            instance.set_join_password(raw_password)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        return instance

    def to_representation(self, instance):
        data = super().to_representation(instance)
        request = self.context.get("request")
        is_owner = bool(
            request
            and request.user.is_authenticated
            and request.user.id == instance.teacher_id
        )
        if not is_owner:
            # Join code is the teacher's invite secret — members join with
            # the code they were given; non-owners never see it re-printed.
            data.pop("join_code", None)
        return data


class ClassMembershipSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="student.username", read_only=True)

    class Meta:
        model = ClassMembership
        fields = ["id", "username", "joined_at"]


class JoinClassSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=8)
    password = serializers.CharField(required=False, allow_blank=True, default="")


class AssignmentProblemSerializer(serializers.ModelSerializer):
    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())
    problem_title = serializers.SerializerMethodField()
    problem_difficulty = serializers.SerializerMethodField()

    class Meta:
        model = AssignmentProblem
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


class AssignmentProblemInputSerializer(serializers.Serializer):
    """Write shape for one problem row: ``{"problem": id, "points": 100}``."""

    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())
    points = serializers.IntegerField(default=100, min_value=1)


class AssignmentSerializer(serializers.ModelSerializer):
    """Create/update + list shape.

    Create takes ``problems: [{problem, points?}, …]`` (ordered) and
    validates the window: ``due_at`` after ``available_from``, and
    ``late_until`` (when set) after ``due_at`` — the EDU-3 invariant.
    """

    assignment_problems = AssignmentProblemSerializer(many=True, read_only=True)
    problems = AssignmentProblemInputSerializer(
        many=True, write_only=True, required=False
    )
    classroom_name = serializers.CharField(
        source="classroom.name", read_only=True
    )
    state = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = [
            "id",
            "classroom",
            "classroom_name",
            "title_i18n",
            "description",
            "available_from",
            "due_at",
            "late_until",
            "is_exam",
            "state",
            "assignment_problems",
            "problems",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_state(self, obj):
        return obj.state()

    def validate(self, attrs):
        available_from = attrs.get("available_from") or getattr(
            self.instance, "available_from", None
        )
        due_at = attrs.get("due_at") or getattr(self.instance, "due_at", None)
        late_until = attrs.get("late_until", getattr(self.instance, "late_until", None))
        if available_from and due_at and due_at <= available_from:
            raise serializers.ValidationError(
                {"due_at": "Due date must be after the availability start."}
            )
        if late_until is not None and due_at and late_until <= due_at:
            raise serializers.ValidationError(
                {"late_until": "Late deadline must be after the due date."}
            )
        # Only the owning teacher (or an ADMIN) may target this classroom —
        # a plain TEACHER must never publish into someone else's roster.
        # `classroom` is a required field, so it is always present here
        # (create) or on the instance (update).
        classroom = attrs.get("classroom") or getattr(self.instance, "classroom", None)
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if user is None or not user.is_authenticated:
            raise serializers.ValidationError(
                {"classroom": "Authentication required."}
            )
        if not (
            classroom.teacher_id == user.id
            or user.role == User.Roles.ADMIN
            or user.is_superuser
        ):
            raise serializers.ValidationError(
                {"classroom": "Not your classroom."}
            )
        return attrs

    def _save_problems(self, assignment, problems_data):
        for order, item in enumerate(problems_data):
            AssignmentProblem.objects.create(
                assignment=assignment,
                problem=item["problem"],
                order=order,
                points=item.get("points", 100),
            )

    def create(self, validated_data):
        problems_data = validated_data.pop("problems", [])
        assignment = Assignment.objects.create(**validated_data)
        self._save_problems(assignment, problems_data)
        return assignment

    def update(self, instance, validated_data):
        problems_data = validated_data.pop("problems", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.save()
        if problems_data is not None:
            instance.assignment_problems.all().delete()
            self._save_problems(instance, problems_data)
        return instance
