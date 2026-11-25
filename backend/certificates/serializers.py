from rest_framework import serializers

from .models import Certificate


class CertificateSerializer(serializers.ModelSerializer):
    """The atestat as the holder (or a verifier) sees it.

    ``kind`` stays a stable code — the frontend translates it; ``details``
    is the frozen achievement snapshot (rank/rating/solve count + the
    contest title in both locales).
    """

    status = serializers.ReadOnlyField()
    holder = serializers.SerializerMethodField()

    class Meta:
        model = Certificate
        fields = [
            "uuid",
            "serial",
            "kind",
            "status",
            "holder",
            "details",
            "issued_at",
            "revoked_at",
            "revoked_reason",
        ]
        read_only_fields = fields

    def get_holder(self, obj) -> str:
        return obj.user.username
