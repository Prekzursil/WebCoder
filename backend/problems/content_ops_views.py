"""Wave F content-ops API (items 125/129/131/132/133).

- ``GET  /problems/{id}/changelog/``          full version ledger (125)
- ``POST /problems/{id}/revisions/{rid}/restore/``  roll back (125)
- ``GET  /problems/drops/``                   scheduled-drop calendar (131)
- ``GET  /problems/author-analytics/``        the author dashboard (132)
- ``GET/POST/DELETE /problems/searches/``     saved queries (129)
- ``GET/POST /problems/{id}/bounties/``      bounty board (133)
- ``POST /problems/bounties/{id}/claim/``    contributor claim (133)
- ``POST /problems/bounties/{id}/resolve/``  verifier fulfillment (133)
"""

from __future__ import annotations

from django.db.models import Sum
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .content_ops import (
    author_analytics,
    problem_changelog,
    restore_revision,
    upcoming_drops,
)
from .models import Problem, SavedSearch, ProblemBounty


def _authoring_gate(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (
                User.Roles.ADMIN,
                User.Roles.PROBLEM_VERIFIER,
                User.Roles.PROBLEM_CREATOR,
                User.Roles.TEACHER,
            )
        )
    )


def _verifier_gate(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (User.Roles.ADMIN, User.Roles.PROBLEM_VERIFIER)
        )
    )


class ChangelogView(APIView):
    """Item 125 — the version ledger (staff/author view)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response({"count": 50, "results": problem_changelog(problem)})


class RestoreRevisionView(APIView):
    """Item 125 — roll a statement back to a recorded revision."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, problem_id, revision_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        ok, message = restore_revision(problem, revision_id, request.user)
        if not ok:
            return Response({"detail": message}, status=status.HTTP_404_NOT_FOUND)
        return Response({"detail": message})


class DropsView(APIView):
    """Item 131 — the scheduled-drop calendar (staff)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        rows = upcoming_drops()
        return Response({"count": len(rows), "results": rows})


class AuthorAnalyticsView(APIView):
    """Item 132 — the caller's (or ?username=) authoring dashboard."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        target = request.user
        username = request.query_params.get("username", "").strip()
        if username:
            target = User.objects.filter(username=username).first()
            if target is None:
                return Response(
                    {"detail": "No such user."}, status=status.HTTP_404_NOT_FOUND
                )
        if target.id != request.user.id and not _verifier_gate(request.user):
            return Response(
                {"detail": "Own analytics only (verifiers may view others')."},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(author_analytics(target))


class SavedSearchSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=80)
    params = serializers.DictField()


class SavedSearchView(APIView):
    """Item 129 — the caller's saved catalog queries."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        rows = SavedSearch.objects.filter(user=request.user)
        return Response(
            {
                "count": rows.count(),
                "results": [
                    {"id": row.id, "name": row.name, "params": row.params}
                    for row in rows
                ],
            }
        )

    def post(self, request):
        payload = SavedSearchSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        row, created = SavedSearch.objects.update_or_create(
            user=request.user,
            name=payload.validated_data["name"],
            defaults={"params": payload.validated_data["params"]},
        )
        return Response(
            {"id": row.id, "name": row.name, "params": row.params},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    def delete(self, request):
        raw = request.query_params.get("id", "")
        try:
            row = SavedSearch.objects.get(pk=int(raw), user=request.user)
        except (ValueError, SavedSearch.DoesNotExist):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        row.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class BountySerializer(serializers.Serializer):
    points = serializers.IntegerField(min_value=1)
    description = serializers.CharField(max_length=2000)


class BountyListView(APIView):
    """Item 133 — the bounties on one problem (open ones for everyone,
    the full history for verifiers)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        qs = problem.test_bounties.select_related("requester", "claimed_by")
        if not _verifier_gate(request.user):
            qs = qs.filter(status=ProblemBounty.Status.OPEN)
        return Response(
            {
                "count": qs.count(),
                "results": [self._row(bounty) for bounty in qs],
            }
        )

    @staticmethod
    def _row(bounty) -> dict:
        return {
            "id": bounty.id,
            "problem": bounty.problem_id,
            "requester": bounty.requester.username,
            "points": bounty.points,
            "description": bounty.description,
            "status": bounty.status,
            "claimed_by": bounty.claimed_by.username if bounty.claimed_by else None,
            "resolution_note": bounty.resolution_note,
            "created_at": bounty.created_at,
        }

    def post(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = BountySerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        points = payload.validated_data["points"]
        if points > ProblemBounty.MAX_POINTS:
            return Response(
                {
                    "points": f"Bounties are capped at {ProblemBounty.MAX_POINTS} points."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        # The pledge cap: one user may not lock more than 4x the cap across
        # OPEN bounties (anti-hoarding).
        locked = (
            ProblemBounty.objects.filter(
                requester=request.user, status=ProblemBounty.Status.OPEN
            ).aggregate(total=Sum("points"))["total"]
            or 0
        )
        if locked + points > ProblemBounty.MAX_POINTS * 4:
            return Response(
                {"points": "Too many points locked in open bounties."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bounty = ProblemBounty.objects.create(
            problem=problem,
            requester=request.user,
            points=points,
            description=payload.validated_data["description"],
        )
        return Response(self._row(bounty), status=status.HTTP_201_CREATED)


class BountyClaimView(APIView):
    """Item 133 — a contributor claims an open bounty."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, bounty_id):
        bounty = ProblemBounty.objects.filter(pk=bounty_id).first()
        if bounty is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if bounty.status != ProblemBounty.Status.OPEN:
            return Response(
                {"detail": "This bounty is no longer open."},
                status=status.HTTP_409_CONFLICT,
            )
        if bounty.requester_id == request.user.id:
            return Response(
                {"detail": "You cannot claim your own bounty."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        bounty.claimed_by = request.user
        bounty.save(update_fields=["claimed_by"])
        return Response(
            {"detail": "Claimed — submit the strengthened tests for review."}
        )


class BountyResolveView(APIView):
    """Item 133 — a verifier marks a claimed bounty fulfilled (crediting
    the claimant) or the requester cancels it."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, bounty_id):
        bounty = ProblemBounty.objects.filter(pk=bounty_id).first()
        if bounty is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        action = (request.data.get("action") or "").upper()
        if action == "CANCEL":
            if bounty.requester_id != request.user.id:
                return Response(
                    {"detail": "Only the requester cancels."},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if bounty.status != ProblemBounty.Status.OPEN:
                return Response(
                    {"detail": "Only open bounties can be cancelled."},
                    status=status.HTTP_409_CONFLICT,
                )
            bounty.status = ProblemBounty.Status.CANCELLED
            bounty.resolution_note = (request.data.get("note") or "")[:200]
            bounty.save(update_fields=["status", "resolution_note"])
            return Response({"detail": "Cancelled."})
        if action != "FULFILL":
            return Response(
                {"action": "Provide FULFILL or CANCEL."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not _verifier_gate(request.user):
            return Response(
                {"detail": "Verifiers only."}, status=status.HTTP_403_FORBIDDEN
            )
        if bounty.status != ProblemBounty.Status.OPEN or bounty.claimed_by_id is None:
            return Response(
                {"detail": "Only a claimed, open bounty can be fulfilled."},
                status=status.HTTP_409_CONFLICT,
            )
        bounty.status = ProblemBounty.Status.FULFILLED
        bounty.resolution_note = (
            request.data.get("note")
            or f"Credited {bounty.claimed_by.username} ({bounty.points} points)"
        )[:200]
        bounty.save(update_fields=["status", "resolution_note"])
        return Response(
            {
                "detail": "Fulfilled.",
                "credited_to": bounty.claimed_by.username,
                "points": bounty.points,
            }
        )
