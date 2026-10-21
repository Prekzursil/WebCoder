from rest_framework import serializers
from django.core.exceptions import ObjectDoesNotExist
from .models import Submission, SubmissionTestResult # Import SubmissionTestResult
from users.serializers import UserSerializer
from problems.models import Problem, TestCase # Import TestCase for SubmissionTestResultSerializer
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
    
    test_results = SubmissionTestResultSerializer(many=True, read_only=True) # Nested serializer for test results

    class Meta:
        model = Submission
        fields = [
            'id', 'user', 'problem', 'problem_id', 'language', 'code', 
            'submission_time', 'verdict', 'execution_time_ms', 
            'memory_used_kb', 'score', 'detailed_feedback',
            'test_results' # Add the new field
        ]
        read_only_fields = [
            'id', 'user', 'problem', 'submission_time', 'verdict', 
            'execution_time_ms', 'memory_used_kb', 'score', 'detailed_feedback',
            'test_results'
        ]

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

    class Meta:
        model = Submission
        fields = ['problem', 'language', 'code']

    def validate(self, attrs):
        """Submit-time language validation + Problem.allowed_languages
        enforcement (SPEC-GAPS G10 / SECURITY-AUDIT-judge.md §0).

        - ``language`` must be a judge-supported registry id (unknown ids
          used to fall through to the judge's unsupported-language
          INTERNAL_ERROR branch);
        - when the problem declares ``allowed_languages`` (non-empty), the
          submission's language must be one of them.
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
        return attrs

    def create(self, validated_data):
        # User is set in the view (e.g., self.perform_create)
        submission = Submission.objects.create(**validated_data)
        return submission
