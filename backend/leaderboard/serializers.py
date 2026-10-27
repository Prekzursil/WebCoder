from rest_framework import serializers

from .models import LeaderboardEntry


class LeaderboardEntrySerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    rank = serializers.IntegerField(read_only=True)  # annotated on the queryset
    success_rate = serializers.SerializerMethodField()

    class Meta:
        model = LeaderboardEntry
        fields = [
            "rank",
            "username",
            "solved_count",
            "total_points",
            "success_rate",
            "last_solved_at",
        ]

    def get_success_rate(self, obj):
        """AC submissions / total submissions over APPROVED problems."""
        if not obj.total_submissions:
            return 0.0
        return round(obj.ac_submissions / obj.total_submissions, 4)


class MyLeaderboardEntrySerializer(serializers.Serializer):
    """Shape of GET /api/v1/leaderboard/me/."""

    rank = serializers.IntegerField()
    username = serializers.CharField()
    solved_count = serializers.IntegerField()
    total_points = serializers.IntegerField()
    success_rate = serializers.FloatField()
    total_submissions = serializers.IntegerField()
    ac_submissions = serializers.IntegerField()
    last_solved_at = serializers.DateTimeField()
