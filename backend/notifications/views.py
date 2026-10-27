from django.utils import timezone
from rest_framework import mixins, permissions, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from webcoder_api.pagination import NewestFirstCursorPagination

from .models import Notification
from .serializers import NotificationSerializer


class NotificationCursorPagination(NewestFirstCursorPagination):
    # Constant inserts shift page-number pages; cursor keeps them stable.
    ordering = ("-created_at", "-id")


class NotificationViewSet(
    mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet
):
    """API endpoint for the authenticated user's own notifications.

    Hard scoping: get_queryset filters recipient=request.user — one user
    can never read another's notifications (unknown ids 404).
    """

    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = NotificationCursorPagination

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        if self.request.query_params.get("unread", "").lower() in (
            "1",
            "true",
            "yes",
        ):
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notification = self.get_object()  # scoped by get_queryset
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=["read_at"])
        return Response(NotificationSerializer(notification).data)

    @action(detail=False, methods=["post"], url_path="mark-all-read")
    def mark_all_read(self, request):
        updated = (
            Notification.objects.filter(recipient=request.user, read_at__isnull=True)
            .update(read_at=timezone.now())
        )
        return Response({"marked": updated})

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Notification.objects.filter(
            recipient=request.user, read_at__isnull=True
        ).count()
        return Response({"count": count})
