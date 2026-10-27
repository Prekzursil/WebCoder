from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    actor = serializers.SerializerMethodField()
    target_type = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            "id",
            "verb",
            "actor",
            "target_type",
            "target_id",
            "data",
            "read_at",
            "created_at",
        ]

    def get_actor(self, obj):
        return obj.actor.username if obj.actor else None

    def get_target_type(self, obj):
        return obj.target_ct.model if obj.target_ct else None
