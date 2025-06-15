from rest_framework import serializers
from .models import Submission, SubmissionTestResult # Import SubmissionTestResult
from users.serializers import UserSerializer 
from problems.models import Problem, TestCase # Import TestCase for SubmissionTestResultSerializer

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
        if obj.test_case:
            return {
                'id': obj.test_case.id,
                'order': obj.test_case.order,
                'is_sample': obj.test_case.is_sample,
                'points': obj.test_case.points,
            }
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
        if instance.problem:
            representation['problem'] = {
                'id': instance.problem.id,
                'title_i18n': instance.problem.title_i18n 
            }
        # Ensure test_results are serialized if not handled by default due to read_only=True on field
        # This is usually handled automatically by DRF if 'test_results' is in fields.
        return representation

class SubmissionCreateSerializer(serializers.ModelSerializer):
    problem = serializers.PrimaryKeyRelatedField(queryset=Problem.objects.all())

    class Meta:
        model = Submission
        fields = ['problem', 'language', 'code'] 

    def create(self, validated_data):
        # User is set in the view (e.g., self.perform_create)
        submission = Submission.objects.create(**validated_data)
        return submission
