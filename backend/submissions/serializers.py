from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist
from .models import Submission, SubmissionTestResult # Import SubmissionTestResult
from users.serializers import UserSerializer
from contests.models import Contest
from problems.models import Problem, TestCase # Import TestCase for SubmissionTestResultSerializer
from .judge_utils.custom_libs import is_allowed_requirement
from .judge_utils.languages import SUPPORTED_LANGUAGE_IDS, get_language

class SubmissionTestResultSerializer(serializers.ModelSerializer):
    # test_case_id = serializers.ReadOnlyField(source='test_case.id') # Simple ID
    # To provide more context, like test_case order or if it's a sample
    test_case_details = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionTestResult
        fields = [
            'id', 
            # 'test_case', # Using PrimaryKeyRelatedField by default is okay for ID
            'test_case_details',
            'verdict', 
            'execution_time_ms', 
            'memory_used_kb',
            'actual_output', # Consider truncating or omitting by default if too large for lists
            'error_output'   # Same as above
        ]
        read_only_fields = fields # All fields are read-only as they are set by the judge

    def get_test_case_details(self, obj):
        try:
            if obj.test_case:
                return {
                    'id': obj.test_case.id,
                    'order': obj.test_case.order,
                    'is_sample': obj.test_case.is_sample,
                    'points': obj.test_case.points,
                }
        except ObjectDoesNotExist:
            # Unset required FK (unsaved/defensive display path) — schema stays NOT NULL.
            pass
        return None

class SubmissionSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    problem_id = serializers.IntegerField(write_only=True, source='problem.id', required=False)
    # 'problem' field will be used for read, populated by to_representation or nested serializer
    # J6: the denominator next to score, so the UI renders "30/100" with a
    # PARTIAL state instead of a bare number.
    max_score = serializers.SerializerMethodField()
    # Matrix row 61 (runtime percentile vs community): the share of AC
    # submissions on the same problem + language this run is faster than
    # (LeetCode's "beats X% in runtime"). None without a measured time or
    # a comparison pool.
    runtime_percentile = serializers.SerializerMethodField()

    test_results = SubmissionTestResultSerializer(many=True, read_only=True) # Nested serializer for test results

    class Meta:
        model = Submission
        fields = [
            'id', 'user', 'problem', 'problem_id', 'language', 'code',
            'submission_time', 'verdict', 'execution_time_ms',
            'memory_used_kb', 'score', 'max_score', 'runtime_percentile',
            'detailed_feedback',
            'contest', 'test_results' # Add test results + contest (read-only id)
        ]
        read_only_fields = [
            'id', 'user', 'problem', 'submission_time', 'verdict',
            'execution_time_ms', 'memory_used_kb', 'score', 'max_score',
            'runtime_percentile', 'detailed_feedback',
            'contest', 'test_results'
        ]

    def get_max_score(self, obj):
        return obj.problem.full_score if obj.problem_id else 0

    def get_runtime_percentile(self, obj):
        time_ms = obj.execution_time_ms
        if not time_ms:
            return None
        from submissions.models import Submission

        pool = Submission.objects.filter(
            problem_id=obj.problem_id,
            language=obj.language,
            verdict=Submission.VerdictStatus.ACCEPTED,
        ).exclude(execution_time_ms__isnull=True)
        total = pool.count()
        if total == 0:
            return None
        slower = pool.filter(execution_time_ms__gt=time_ms).count()
        return round(slower / total, 4)

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        try:
            if instance.problem:
                representation['problem'] = {
                    'id': instance.problem.id,
                    'title_i18n': instance.problem.title_i18n
                }
        except ObjectDoesNotExist:
            representation['problem'] = None
        # Ensure test_results are serialized if not handled by default due to read_only=True on field
        # This is usually handled automatically by DRF if 'test_results' is in fields.
        return representation


class SubmissionListSerializer(SubmissionSerializer):
    """Slim serializer for the LIST action (SPEC-GAPS D-B4 item 5).

    Omits ``code`` and ``test_results`` so list fetches (e.g. /my-submissions)
    stop pulling every submission's full source code + per-test rows. The
    list shape stays a strict subset of the retrieve shape (same field names).
    """

    test_results = None  # type: ignore[assignment]  # drop the nested rows

    class Meta(SubmissionSerializer.Meta):
        fields = [
            f
            for f in SubmissionSerializer.Meta.fields
            if f not in ("code", "test_results")
        ]


class SubmissionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())
    # Contest-bound submit (CON-1): optional; validated by
    # contests.gating.check_contest_submission (registered + window open +
    # problem on the board + cooldown). Write-only: reads expose the id via
    # SubmissionSerializer.contest.
    contest = serializers.PrimaryKeyRelatedField(
        queryset=Contest.objects.all(), required=False, allow_null=True, write_only=True
    )

    class Meta:
        model = Submission
        fields = ['problem', 'language', 'code', 'contest']

    def validate(self, attrs):
        """Submit-time validation: language registry + allowed_languages
        (SPEC-GAPS G10) and, for contest-bound submissions, the CON-1 gate
        (registered + window open + board membership + cooldown).
        """
        language = attrs.get("language")
        if get_language(language) is None:
            raise serializers.ValidationError(
                {
                    "language": (
                        f"Unsupported language '{language}'. "
                        f"Supported languages: {', '.join(SUPPORTED_LANGUAGE_IDS)}."
                    )
                }
            )
        problem = attrs.get("problem")
        if problem is not None:
            allowed = problem.allowed_languages or []
            if allowed and language not in allowed:
                raise serializers.ValidationError(
                    {
                        "language": (
                            f"Language '{language}' is not allowed for this "
                            f"problem. Allowed: {', '.join(map(str, allowed))}."
                        )
                    }
                )
            # Custom-library allowlist (SPEC-GAPS J3/E1): pip requirement
            # entries are judge inputs — reject URL/VCS/path/extras
            # specifiers at submit time with a 400 instead of executing
            # them anywhere near the judge. (The judge re-validates.)
            for entry in problem.custom_libraries_allowed or []:
                if not is_allowed_requirement(entry):
                    raise serializers.ValidationError(
                        {
                            "problem": (
                                f"disallowed library specifier: {entry!r} "
                                "(only 'name' or 'name==version' allowed)"
                            )
                        }
                    )
        # Contest gate (CON-1): registered + window open + board membership
        # + the OPR-4 in-contest cooldown.
        contest = attrs.get("contest")
        if contest is not None and problem is not None:
            from contests.gating import check_contest_submission

            ok, error = check_contest_submission(
                contest, self.context.get("request").user, problem.id
            )
            if not ok:
                raise serializers.ValidationError({"contest": error})
        elif problem is not None:
            # CON-5 archive gate: while the problem belongs to a contest that
            # has not reverted to practice yet, the problem page stays shut
            # (otherwise the live board leaks through practice submissions).
            from contests.gating import practice_blocked_reason

            reason = practice_blocked_reason(
                problem, getattr(self.context.get("request"), "user", None)
            )
            if reason:
                raise serializers.ValidationError({"problem": reason})
        return attrs


    def create(self, validated_data):
        # User is set in the view (e.g., self.perform_create)
        submission = Submission.objects.create(**validated_data)
        return submission
