from django.contrib.auth import get_user_model  # Import get_user_model
from rest_framework import serializers
from .models import (
    CurriculumNode,
    ProblemEditorial,
    ProblemRating,
    Tag,
    Problem,
    TestCase,
)
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
            "subtask",
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
    # Effective per-language limits (language-fair judging, J5): resolved
    # from the registry multipliers/floors + this problem's overrides. A
    # read-only projection — authors edit limit_overrides, not this.
    effective_limits = serializers.SerializerMethodField()

    def get_effective_limits(self, obj) -> dict:
        """{language_id: {"time_ms": int, "memory_kb": int}} for the
        problem's allowed languages (every registry language when the
        problem declares no restriction)."""
        from submissions.judge_utils.languages import (
            LANGUAGES,
            effective_limits,
        )

        languages = obj.allowed_languages or list(LANGUAGES)
        return {
            lang: dict(
                zip(
                    ("time_ms", "memory_kb"),
                    effective_limits(
                        obj.default_time_limit_ms,
                        obj.default_memory_limit_kb,
                        lang,
                        obj.limit_overrides,
                    ),
                )
            )
            for lang in languages
            if lang in LANGUAGES
        }
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
            "difficulty_source",
            "default_time_limit_ms",
            "default_memory_limit_kb",
            # Language-fair limits (J5): the shipped per-language multiplier
            # resolution, surfaced so the problem page can SHOW the effective
            # limit for every allowed language (owner requirement).
            "limit_overrides",
            "effective_limits",
            "io_mode",
            "io_input_filename",
            "io_output_filename",
            "allowed_languages",
            "custom_libraries_allowed",
            "library_policy",
            "block_config",
            "code_template",
            "code_template_language",
            "comparison_mode",
            "float_comparison_epsilon",
            "checker_code",
            "checker_language",  # Added checker fields
            "problem_type",
            "interactor_code",
            "interactor_language",  # JDG-2 interactive fields
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

    def validate_io_input_filename(self, value):
        """FILES-mode filenames must be plain basenames (RO-4)."""
        return self._validate_io_filename(value)

    def validate_io_output_filename(self, value):
        return self._validate_io_filename(value)

    @staticmethod
    def _validate_io_filename(value):
        import re as _re

        if value in (None, ""):
            return value
        if not _re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", value):
            raise serializers.ValidationError(
                f"Invalid I/O filename '{value}': use a plain file name "
                f"(letters, digits, dot, dash, underscore; no paths)."
            )
        return value

    def validate_code_template(self, value):
        """Wave E: parse the skeleton at authoring time — a broken
        sentinel structure must be an authoring error, never a judge-side
        surprise; the template's language must be a registry id."""
        from .code_template import TemplateError, parse_template  # noqa: F401 (kept for clarity)

        if not value:
            return value
        try:
            parse_template(value)
        except TemplateError:
            # Static message (no exception interpolation): CodeQL taints
            # str(exception) flows into API responses; the parse errors are
            # enumerated so the message stays actionable either way.
            raise serializers.ValidationError(
                "Invalid code template: WC_EDIT_START/WC_EDIT_END sentinel "
                "lines must be balanced (no nesting, every START closed), "
                "with at least one editable region between them, under the "
                "100KB cap."
            )
        return value

    def validate_block_config(self, value):
        """Wave D: a block config names a generator the judge runs and
        optional Blockly XML documents (size-capped)."""
        if value in (None, {}):
            return value
        if not isinstance(value, dict):
            raise serializers.ValidationError("block_config must be an object.")
        from submissions.judge_utils.languages import get_language

        generator = value.get("generator", "python3")
        spec = get_language(str(generator))
        if spec is None or spec.language_id not in ("python3", "nodejs20"):
            raise serializers.ValidationError(
                "block_config.generator must be 'python3' or 'nodejs20'."
            )
        for key in ("toolbox", "starter"):
            xml = value.get(key)
            if xml is None:
                continue
            if not isinstance(xml, str) or len(xml) > 100_000:
                raise serializers.ValidationError(
                    f"block_config.{key} must be an XML string under 100KB."
                )
        unknown = set(value) - {"generator", "toolbox", "starter"}
        if unknown:
            raise serializers.ValidationError(
                f"Unknown block_config keys: {', '.join(sorted(unknown))}."
            )
        return value

    def validate_library_policy(self, value):
        """Structural validation of the per-problem library/feature policy
        (wave C): unknown languages/keys/feature bans are authoring
        errors, not silent no-ops the judge would then ignore."""
        from .feature_policy import validate_policy_shape

        problems = validate_policy_shape(value)
        if problems:
            raise serializers.ValidationError(" ".join(problems))
        return value

    def validate(self, attrs):
        """JDG-2/JDG-3: cross-field problem-type rules at authoring time.

        INTERACTIVE problems must carry a compilable interactor (the rule
        below keeps a broken interactive problem off the queue; the judge's
        missing-interactor branch stays a defense-in-depth IE). OUTPUT_ONLY
        problems never execute anything, so an interactor there is always a
        misconfiguration — reject it instead of silently ignoring it.
        """
        # RO-4: FILES-mode problems must name their input/output files (the
        # model defaults cover blanks, but a bad extension-less name is
        # still the author's call — keep the default when blank).
        io_mode = attrs.get(
            "io_mode", getattr(self.instance, "io_mode", Problem.IOMode.STDIO)
        )
        if io_mode == Problem.IOMode.FILES:
            for field in ("io_input_filename", "io_output_filename"):
                name = attrs.get(field) or getattr(self.instance, field, "")
                if name in (None, ""):
                    attrs[field] = (
                        Problem._meta.get_field(field).get_default()
                    )
        # Wave E (partial-code): a skeleton implies its registry language.
        template = attrs.get(
            "code_template", getattr(self.instance, "code_template", "")
        )
        template_language = attrs.get(
            "code_template_language",
            getattr(self.instance, "code_template_language", ""),
        )
        if template and not template_language:
            raise serializers.ValidationError(
                "code_template requires code_template_language."
            )
        if template_language:
            from submissions.judge_utils.languages import get_language

            if get_language(template_language) is None:
                raise serializers.ValidationError(
                    f"Unknown code_template_language: {template_language!r}."
                )

        problem_type = attrs.get(
            "problem_type",
            getattr(self.instance, "problem_type", Problem.ProblemType.NORMAL),
        )
        if problem_type == Problem.ProblemType.INTERACTIVE:
            code = attrs.get(
                "interactor_code",
                getattr(self.instance, "interactor_code", None),
            )
            language = attrs.get(
                "interactor_language",
                getattr(self.instance, "interactor_language", None),
            )
            if not code or not language:
                raise serializers.ValidationError(
                    "INTERACTIVE problems require interactor_code and "
                    "interactor_language."
                )
        if problem_type == Problem.ProblemType.OUTPUT_ONLY:
            code = attrs.get(
                "interactor_code",
                getattr(self.instance, "interactor_code", None),
            )
            if code:
                raise serializers.ValidationError(
                    "OUTPUT_ONLY problems are not executed — an interactor "
                    "cannot apply. Remove interactor_code."
                )
        return attrs

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
    # Community-translation attribution (i18n wave, owner rule (c)): the
    # "translated by @user" credits on the problem page, sourced from
    # APPROVED proposals. Detail-only — the list serializer stays N+1-free.
    translations = serializers.SerializerMethodField()

    class Meta(ProblemSerializer.Meta):
        fields = ProblemSerializer.Meta.fields + [
            "test_cases",
            "has_editorial",
            "editorial_locked",
            "translations",
        ]

    def get_translations(self, obj) -> list:
        from translations.models import TranslationProposal

        rows = (
            obj.translation_proposals.filter(
                status=TranslationProposal.Status.APPROVED
            )
            .select_related("contributor")
            .order_by("language")
        )
        return [
            {
                "language": row.language,
                "contributor_username": row.contributor.username,
                "reviewed_at": row.reviewed_at,
            }
            for row in rows
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


class CurriculumNodeSerializer(serializers.ModelSerializer):
    """Curriculum tree node (competitive roadmap EDU-9).

    ``problem_count`` counts APPROVED problems only — the public catalog's
    honesty rule — and ``children`` nests chapters (and later topics) under
    their grade, giving the browse axis its tree in one request.
    """

    problem_count = serializers.SerializerMethodField()
    children = serializers.SerializerMethodField()

    class Meta:
        model = CurriculumNode
        fields = [
            "id",
            "parent",
            "kind",
            "name_i18n",
            "slug",
            "version",
            "order",
            "problem_count",
            "children",
        ]

    def get_problem_count(self, obj):
        return obj.problems.filter(status=Problem.ProblemStatus.APPROVED).count()

    def get_children(self, obj):
        return [
            CurriculumNodeSerializer(child, context=self.context).data
            for child in obj.children.all()
        ]
