from django.conf import settings
from django.contrib.auth import get_user_model # Import get_user_model
from rest_framework import serializers
from .models import Tag, Problem, TestCase
from users.serializers import UserSerializer # To represent author/verifier

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name_i18n', 'slug']

class TestCaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = TestCase
        fields = ['id', 'problem', 'input_data', 'expected_output_data', 'is_sample', 'points', 'order']

    def to_representation(self, instance):
        """
        Conditionally hide expected_output_data for non-sample test cases
        from non-authorized users.
        """
        ret = super().to_representation(instance)
        user = self.context['request'].user

        is_authorized = False
        if user and user.is_authenticated:
            # Check if user is admin, verifier, or author of the problem
            is_admin_or_verifier = user.role in [get_user_model().Roles.ADMIN, get_user_model().Roles.PROBLEM_VERIFIER]
            is_author = instance.problem.author == user
            is_authorized = is_admin_or_verifier or is_author

        if not instance.is_sample and not is_authorized:
            ret.pop('expected_output_data', None)
            
        return ret

class ProblemSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True) # Read-only representation of tags
    # For writing tags, typically a list of tag IDs or slugs would be accepted and handled in create/update
    tag_ids = serializers.PrimaryKeyRelatedField(
        queryset=Tag.objects.all(),
        many=True,
        write_only=True,
        source='tags', # Link this field to the 'tags' model field for writing
        required=False
    )
    author = UserSerializer(read_only=True) # Display author details
    author_id = serializers.PrimaryKeyRelatedField(
        queryset=get_user_model().objects.all(), # Use get_user_model()
        write_only=True,
        source='author', # Link to author field for writing
        required=False, # Author can be set automatically based on logged-in user
        allow_null=True
    )
    # test_cases = TestCaseSerializer(many=True, read_only=True) # To show test cases when retrieving a problem

    class Meta:
        model = Problem
        fields = [
            'id', 'title_i18n', 'statement_i18n', 'author', 'author_id', 'verifier', 'status',
            'difficulty', 'default_time_limit_ms', 'default_memory_limit_kb',
            'allowed_languages', 'custom_libraries_allowed',
            'comparison_mode', 'float_comparison_epsilon', 
            'checker_code', 'checker_language', # Added checker fields
            'creation_date', 'last_modified_date', 'tags', 'tag_ids'
            # 'test_cases' # Add if you want to nest test cases in problem detail view
        ]
        read_only_fields = ['author', 'verifier', 'creation_date', 'last_modified_date']

    def create(self, validated_data):
        # If author_id is not provided in request, set current user as author
        if 'author' not in validated_data and self.context['request'].user.is_authenticated:
            validated_data['author'] = self.context['request'].user
        return super().create(validated_data)

# More detailed serializer for Problem including its test cases for specific views
class ProblemDetailSerializer(ProblemSerializer):
    test_cases = TestCaseSerializer(many=True, read_only=True)

    class Meta(ProblemSerializer.Meta):
        fields = ProblemSerializer.Meta.fields + ['test_cases']

# settings import moved to the top
