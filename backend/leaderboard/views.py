from django.db.models import F
from django.db.models.functions import RowNumber
from django.db.models import Window
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from webcoder_api.pagination import StandardPageNumberPagination

from .aggregation import update_user_entry
from .models import LeaderboardEntry
from .serializers import (
    LeaderboardEntrySerializer,
    MyLeaderboardEntrySerializer,
)


class LeaderboardPagination(StandardPageNumberPagination):
    page_size = 50


class LeaderboardListView(generics.ListAPIView):
    """GET /api/v1/leaderboard/ — public standings with window-ranked rows."""

    permission_classes = [permissions.AllowAny]
    pagination_class = LeaderboardPagination
    serializer_class = LeaderboardEntrySerializer

    def get_queryset(self):
        qs = (
            LeaderboardEntry.objects.select_related("user")
            .annotate(
                rank=Window(
                    expression=RowNumber(),
                    order_by=(
                        F("total_points").desc(),
                        F("solved_count").desc(),
                        F("last_solved_at").asc(),
                    ),
                )
            )
        )
        # RO-3 (competitive roadmap): county/school segments — the Olympiad
        # geography pbinfo wires into motivation. Minors are excluded from
        # segmented boards (LEG-2: their identity fields are not public).
        county = self.request.query_params.get("county", "").strip()
        school = self.request.query_params.get("school", "").strip()
        if county or school:
            qs = qs.exclude(user__is_minor=True)
            if county:
                qs = qs.filter(user__county__iexact=county)
            if school:
                qs = qs.filter(user__school__iexact=school)
        return qs


class MyLeaderboardView(APIView):
    """GET /api/v1/leaderboard/me/ — the caller's own rank + stats.

    Rank = 1 + count of strictly better entries (points, then solved
    count, then earlier last_solved_at) — matches the list ordering and
    tie-break exactly.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        entry = update_user_entry(request.user.pk)  # get-or-create semantics
        better = LeaderboardEntry.objects.filter(
            total_points__gt=entry.total_points
        ).count()
        better += LeaderboardEntry.objects.filter(
            total_points=entry.total_points,
            solved_count__gt=entry.solved_count,
        ).count()
        if entry.last_solved_at is not None:
            # Earlier last-solve wins full ties; None (never solved) loses
            # to any non-null timestamp.
            better += LeaderboardEntry.objects.filter(
                total_points=entry.total_points,
                solved_count=entry.solved_count,
                last_solved_at__lt=entry.last_solved_at,
            ).count()
        else:
            better += LeaderboardEntry.objects.filter(
                total_points=entry.total_points,
                solved_count=entry.solved_count,
                last_solved_at__isnull=False,
            ).count()
        success_rate = (
            round(entry.ac_submissions / entry.total_submissions, 4)
            if entry.total_submissions
            else 0.0
        )
        return Response(
            MyLeaderboardEntrySerializer(
                {
                    "rank": better + 1,
                    "username": request.user.username,
                    "solved_count": entry.solved_count,
                    "total_points": entry.total_points,
                    "success_rate": success_rate,
                    "total_submissions": entry.total_submissions,
                    "ac_submissions": entry.ac_submissions,
                    "last_solved_at": entry.last_solved_at,
                }
            ).data
        )
