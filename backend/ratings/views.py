"""Ratings API (competitive roadmap RAT-1/2/3 + SAF-2).

- ``GET /ratings/``                     rated ladder (display rating, bands)
- ``GET /ratings/me/``                  the caller's state + band
- ``GET /ratings/colors/``              RAT-3 band table for the UI
- ``GET /ratings/users/{username}/``    public profile block + history chart
Contest-scoped (mounted under /contests/):
- ``GET  /contests/{id}/rating-changes/`` CF-style per-contest deltas
- ``POST /contests/{id}/rating-rollback/`` organizer SAF-2 discard+replay
"""

from django.contrib.auth import get_user_model
from rest_framework import permissions, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView
from webcoder_api.pagination import StandardPageNumberPagination

from contests.views import _fetch_contest, can_manage_contest

from .glicko import RATING_BANDS, rating_band
from .models import RatingHistory, UserRating
from .divisions import (
    division_thresholds,
    graph_annotations,
    percentiles,
    user_division,
)
from .services import user_public_summary

User = get_user_model()


class RatingsPagination(StandardPageNumberPagination):
    page_size = 50


def _state_payload(state: UserRating) -> dict:
    return {
        "user": {"id": state.user_id, "username": state.user.username},
        "rating": state.display_rating,
        "internal_rating": state.rating,
        "rd": round(state.rd, 1),
        "contests_count": state.contests_count,
        "band": rating_band(state.display_rating),
    }


class RatingLadderView(APIView):
    """GET /api/v1/ratings/ — the public ladder (rated players only)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        qs = (
            UserRating.objects.filter(contests_count__gt=0)
            .select_related("user")
            .order_by("-rating", "-contests_count")
        )
        paginator = RatingsPagination()
        page = paginator.paginate_queryset(list(qs), request)
        results = []
        for position, state in enumerate(page, start=paginator.page.start_index()):
            payload = _state_payload(state)
            payload["rank"] = position
            results.append(payload)
        return paginator.get_paginated_response(results)


class MyRatingView(APIView):
    """GET /api/v1/ratings/me/ — the caller's rating or an unrated stub."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        state = UserRating.objects.filter(user=request.user).first()
        if state is None or state.contests_count == 0:
            return Response({"rated": False, "rating": None, "band": rating_band(0)})
        return Response({"rated": True, **_state_payload(state)})


class RatingColorsView(APIView):
    """GET /api/v1/ratings/colors/ — RAT-3 band table."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"bands": RATING_BANDS})


class UserRatingHistoryView(APIView):
    """GET /api/v1/ratings/users/{username}/ — public profile block + chart."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        # Wave G item 90 (LEG-2 completion): a minor's public profile is
        # private by default — only the handle and a private marker go
        # out to anyone but the account itself or an admin. The rating
        # history, bio and annotations stay off the public internet.
        viewer = getattr(request, "user", None)
        if user.is_minor and not (
            viewer
            and viewer.is_authenticated
            and (viewer.id == user.id or viewer.role == "ADMIN" or viewer.is_superuser)
        ):
            return Response({"username": user.username, "private": True})
        summary = user_public_summary(user)
        history = (
            RatingHistory.objects.filter(user=user)
            .select_related("contest")
            .order_by("contest__end_at")
        )
        return Response(
            {
                "username": user.username,
                # Matrix row 59: the self-authored bio on the public
                # profile (blank when unset; minors' privacy fields are a
                # separate LEG-2 concern — bio is deliberately published).
                "bio": user.bio,
                "rating": summary,
                "history": [
                    {
                        "contest": h.contest_id,
                        "contest_title": h.contest.title_i18n,
                        "end_at": h.contest.end_at,
                        "rank": h.rank,
                        "rating": h.rating,
                        "display_rating": h.display_rating,
                        "delta": h.delta,
                        "rating_before": h.rating_before,
                    }
                    for h in history
                ],
                # Item 51 — per-point annotations (career highs, medals,
                # division crossings) + the current division chip.
                "annotations": graph_annotations(user),
                "division": user_division(user)["division"],
            }
        )


@api_view(["GET"])
def contest_rating_changes(request, contest_id):
    """GET /api/v1/contests/{id}/rating-changes/ — CF-style per-contest page."""
    contest = _fetch_contest(contest_id)
    if contest is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    rows = (
        RatingHistory.objects.filter(contest=contest)
        .select_related("user")
        .order_by("rank")
    )
    return Response(
        {
            "contest": contest.id,
            "is_rated": contest.is_rated,
            "discarded": contest.ratings_discarded,
            "changes": [
                {
                    "rank": row.rank,
                    "username": row.user.username,
                    "rating_before": row.rating_before,
                    "rating_after": row.rating,
                    "delta": row.delta,
                    "display_rating": row.display_rating,
                    "band": rating_band(row.display_rating),
                }
                for row in rows
            ],
        }
    )


@api_view(["POST"])
def contest_rating_rollback(request, contest_id):
    """POST /api/v1/contests/{id}/rating-rollback/ — SAF-2 organizer action."""
    from .services import rollback_contest_ratings

    if not request.user.is_authenticated:
        return Response(
            {"detail": "Authentication required."},
            status=status.HTTP_401_UNAUTHORIZED,
        )
    contest = _fetch_contest(contest_id)
    if contest is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    if not can_manage_contest(request.user, contest):
        return Response({"detail": "Organizer only."}, status=status.HTTP_403_FORBIDDEN)
    message = rollback_contest_ratings(contest)
    return Response({"detail": message})


class UserCalibrationView(APIView):
    """GET /api/v1/ratings/users/{username}/calibration/ — the item-55
    self-prediction profile: every prediction paired with the actual rank,
    mean absolute error and the optimism/pessimism bias."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        from contests.teams import calibration

        return Response(calibration(user))


class DivisionsView(APIView):
    """GET /api/v1/ratings/divisions/ — item 53: the promotion cutoff table
    with the current population per division."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({"divisions": division_thresholds()})


class UserDivisionsView(APIView):
    """GET /api/v1/ratings/users/{username}/divisions/ — the user's current
    division and every promotion/demotion they earned."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(user_division(user))


class UserPercentilesView(APIView):
    """GET /api/v1/ratings/users/{username}/percentiles/ — item 52: the
    display-rating percentile overall and inside the user's school/county
    cohorts (empty cohorts stay null)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(percentiles(user))
