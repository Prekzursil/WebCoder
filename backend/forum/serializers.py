from rest_framework import serializers

from problems.models import CommunityEditorial, Problem

from .models import Post, Report, Thread


class ThreadListSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    problem = serializers.SerializerMethodField()

    class Meta:
        model = Thread
        fields = [
            "id",
            "title",
            "problem",
            "editorial",
            "lang",
            "author",
            "post_count",
            "is_pinned",
            "is_locked",
            "is_announcement",
            "last_activity",
            "created_at",
        ]

    def get_author(self, obj):
        return obj.author.username if obj.author else None

    def get_problem(self, obj):
        if not obj.problem:
            return None
        return {"id": obj.problem.id, "title_i18n": obj.problem.title_i18n}


class ThreadCreateSerializer(serializers.Serializer):
    """{title, problem?, content} — creates the thread + its first post."""

    title = serializers.CharField(max_length=255)
    problem = serializers.PrimaryKeyRelatedField(
        queryset=Problem.objects.all(),
        required=False,
        allow_null=True,
    )
    editorial = serializers.PrimaryKeyRelatedField(
        queryset=CommunityEditorial.objects.all(),
        required=False,
        allow_null=True,
    )
    lang = serializers.ChoiceField(choices=["", "ro", "en"], required=False)
    content = serializers.CharField()


class ThreadUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Thread
        fields = ["title", "problem", "is_announcement"]


class PostSerializer(serializers.ModelSerializer):
    author = serializers.SerializerMethodField()
    thread_id = serializers.IntegerField(read_only=True, source="thread.id")
    parent_id = serializers.IntegerField(read_only=True, source="parent.id")
    hidden_reason = serializers.CharField(read_only=True)

    class Meta:
        model = Post
        fields = [
            "id",
            "thread_id",
            "author",
            "content",
            "parent_id",
            "is_edited",
            "upvotes",
            "is_hidden",
            "hidden_reason",
            "created_at",
        ]

    def get_author(self, obj):
        return obj.author.username if obj.author else None


class PostCreateSerializer(serializers.Serializer):
    content = serializers.CharField()
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Post.objects.all(), required=False, allow_null=True
    )


class PostUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Post
        fields = ["content"]
        read_only_fields = ["is_edited"]

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        instance.is_edited = True
        instance.save(update_fields=["is_edited"])
        return instance


class VoteSerializer(serializers.Serializer):
    value = serializers.IntegerField()  # 1, -1, or 0 (remove vote)


class ReportCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Report
        fields = ["post", "reason", "details"]


class ReportSerializer(serializers.ModelSerializer):
    reporter = serializers.SerializerMethodField()
    post_id = serializers.IntegerField(read_only=True, source="post.id")
    resolved_by = serializers.SerializerMethodField()

    class Meta:
        model = Report
        fields = [
            "id",
            "post_id",
            "reporter",
            "reason",
            "details",
            "status",
            "resolution_note",
            "resolved_by",
            "created_at",
        ]

    def get_reporter(self, obj):
        return obj.reporter.username if obj.reporter else None

    def get_resolved_by(self, obj):
        return obj.resolved_by.username if obj.resolved_by else None
