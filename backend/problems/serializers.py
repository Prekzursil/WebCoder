from django.contrib.auth import get_user_model  # Import get_user_model
from rest_framework import serializers
from .models import ProblemEditorial, ProblemRating, Tag, Problem, TestCase
from users.serializers import UserSerializer  # To represent author/verifier


class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ["id", "name_i18n", "slug"]


class TestCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestCase
        fields = [
            "id",
            "problem",
            "input_data",
            "expected_output_data",
            "is_sample",
            "points",
            "order",
        ]

    def to_representation(self, instance):
        """
        Conditionally hide expected_output_data for non-sample test cases
        from non-authorized users.
        """
        ret = super().to_representation(instance)
        user = self.context["request"].user

        is_authorized = False
        if user and user.is_authenticated:
            # Check if user is admin, verifier, or author of the problem
            is_admin_or_verifier = user.role in [
                get_user_model().Roles.ADMIN,
                get_user_model().Roles.PROBLEM_VERIFIER,
            ]
            is_author = instance.problem.author == user
            is_authorized = is_admin_or_verifier or is_author

        if not instance.is_sample and not is_authorized:
            ret.pop("expected_output_data", None)

        return ret


class ProblemSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)  # Read-only representation of tags
    # For writing tags, typically a list of tag IDs or slugs would be accepted and handled in create/update
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        source="tags",  # Link this field to the 'tags' model field for writing
        required=False,
    )
    author = UserSerializer(read_only=True)  # Display author details
    author_id = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all(),  # Use get_user_model()
        write_only=True,
        source="author",  # Link to author field for writing
        required=False,  # Author can be set automatically based on logged-in user
        allow_null=True,
    )
    # Catalog stats (SPEC-GAPS D-B8 add-on): annotated on the queryset in
    # ProblemViewSet.get_queryset ("X tried / Y solved" per card).
    submission_count = serializers.IntegerField(read_only=True)
    solved_count = serializers.IntegerField(read_only=True)
    # test_cases = TestCaseSerializer(many=True, read_only=True) # To show test cases when retrieving a problem

    class Meta:
        model = Problem
        fields = [
            "id",
            "title_i18n",
            "statement_i18n",
            "author",
            "author_id",
            "verifier",
            "status",
            "difficulty",
            "default_time_limit_ms",
            "default_memory_limit_kb",
            "allowed_languages",
            "custom_libraries_allowed",
            "comparison_mode",
            "float_comparison_epsilon",
            "checker_code",
            "checker_language",  # Added checker fields
            "hints_ro",
            "hints_en",
            "creation_date",
            "last_modified_date",
            "submission_count",
            "solved_count",
            "tags",
            "tag_ids",
            # 'test_cases' # Add if you want to nest test cases in problem detail view
        ]
        read_only_fields = ["author", "verifier", "creation_date", "last_modified_date"]

    def validate_allowed_languages(self, value):
        """Every declared allowed language must be a judge-registry id.

        The list is enforced at submission time
        (submissions.serializers.SubmissionCreateSerializer), so entries the
        judge could never accept would silently block every submission for
        the problem — reject them at authoring time instead. An empty list
        means "no restriction" and stays valid.
        """
        from submissions.judge_utils.languages import (
            SUPPORTED_LANGUAGE_IDS,
            get_language,
        )

        if not value:
            return value
        unknown = [
            lang for lang in value if get_language(str(lang)) is None
        ]
        if unknown:
            raise serializers.ValidationError(
                f"Unknown language ids in allowed_languages: "
                f"{', '.join(map(str, unknown))}. Supported languages: "
                f"{', '.join(SUPPORTED_LANGUAGE_IDS)}."
            )
        return value

    def create(self, validated_data):
        # If author_id is not provided in request, set current user as author
        if (
            "author" not in validated_data
            and self.context["request"].user.is_authenticated
        ):
            validated_data["author"] = self.context["request"].user
        return super().create(validated_data)


# More detailed serializer for Problem including its test cases for specific views
class ProblemEditorialSerializer(serializers.ModelSerializer):
    author = UserSerializer(read_only=True)

    class Meta:
        model = ProblemEditorial
        fields = [
            "problem",
            "content_ro",
            "content_en",
            "publish_policy",
            "author",
            "created_at",
            "updated_at",
        ]
        # problem comes from the URL path, not the payload.
        read_only_fields = ["problem", "author", "created_at", "updated_at"]


class ProblemDetailSerializer(ProblemSerializer):
    test_cases = TestCaseSerializer(many=True, read_only=True)
    # Editorial presence/lock state (competitive roadmap EDT-1): the problem
    # page renders an Editorial tab from these two flags without needing the
    # (possibly gated) content itself — locked editorial state is honest UI.
    has_editorial = serializers.SerializerMethodField()
    editorial_locked = serializers.SerializerMethodField()

    class Meta(ProblemSerializer.Meta):
        fields = ProblemSerializer.Meta.fields + [
            "test_cases",
            "has_editorial",
            "editorial_locked",
        ]

    def _editorial(self, obj):
        # Reverse OneToOne: a missing editorial raises RelatedObjectDoesNotExist
        # (an AttributeError subclass), so getattr returns None cleanly.
        return getattr(obj, "editorial", None)

    def get_has_editorial(self, obj):
        return self._editorial(obj) is not None

    def get_editorial_locked(self, obj):
        from .views import editorial_visible_to

        editorial = self._editorial(obj)
        if editorial is None:
            return False
        user = self.context.get("request").user if self.context.get("request") else None
        return not editorial_visible_to(editorial, user)


# settings import moved to the top
