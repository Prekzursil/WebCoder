"""Integrity views (wave G items 113-119)."""

from __future__ import annotations

from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from problems.models import Problem
from users.models import User
from users.permissions import IsAdminUser

from .models import Appeal, ModerationAction, SimilarityFlag
from .services import (
    abuse_queue,
    multi_account_clusters,
    scan_boilerplate,
    scan_problem_plagiarism,
)


#: Moderators = VERIFIER/ADMIN (the forum's IsModerator rule).
def _is_moderator(user) -> bool:
    return bool(
        user
        and user.is_authenticated
        and (user.role in ("VERIFIER", "ADMIN") or user.is_superuser)
    )


class ScanView(APIView):
    """POST /api/v1/integrity/scan/ (VERIFIER/ADMIN, items 113/114).

    Body: ``{"problem": id, "kinds": ["plagiarism", "boilerplate"]}``.
    Advisory flags only — the diff review rides the existing admin view.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        problem_id = request.data.get("problem")
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        kinds = request.data.get("kinds") or ["plagiarism", "boilerplate"]
        created = {"plagiarism": 0, "boilerplate": 0}
        if "plagiarism" in kinds:
            created["plagiarism"] = scan_problem_plagiarism(problem)
        if "boilerplate" in kinds:
            created["boilerplate"] = scan_boilerplate(problem)
        return Response({"problem": problem.id, "flags_created": created})


class SimilarityFlagsView(APIView):
    """GET /api/v1/integrity/flags/ (VERIFIER/ADMIN, items 113/114)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rows = SimilarityFlag.objects.select_related(
            "submission__user", "other_submission__user"
        )[:200]
        return Response(
            [
                {
                    "id": row.id,
                    "kind": row.kind,
                    "status": row.status,
                    "score": row.score,
                    "submission": {
                        "id": row.submission.id,
                        "user": row.submission.user.username,
                        "problem": row.submission.problem_id,
                    },
                    "other": {
                        "id": row.other_submission.id,
                        "user": row.other_submission.user.username,
                    }
                    if row.other_submission_id
                    else None,
                }
                for row in rows
            ]
        )


class SimilarityReviewView(APIView):
    """POST /api/v1/integrity/flags/{id}/review/ (VERIFIER/ADMIN).

    Body: ``{"decision": "confirmed"|"dismissed"}`` — resolves the flag
    and writes the ModerationAction audit row (item 118).
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, flag_id):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        flag = SimilarityFlag.objects.filter(pk=flag_id).first()
        if flag is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        decision = (request.data.get("decision") or "").strip().lower()
        if decision not in ("confirmed", "dismissed"):
            return Response(
                {"detail": "decision must be 'confirmed' or 'dismissed'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        flag.status = (
            SimilarityFlag.Status.CONFIRMED
            if decision == "confirmed"
            else SimilarityFlag.Status.DISMISSED
        )
        flag.reviewed_by = request.user
        flag.reviewed_at = timezone.now()
        flag.save()
        ModerationAction.objects.create(
            moderator=request.user,
            target_user=flag.submission.user,
            action=ModerationAction.ActionKind.SIMILARITY_REVIEWED,
            target_ct_id=None,
            target_id=flag.id,
            note=f"{flag.kind} {decision} (score {flag.score})",
        )
        return Response({"id": flag.id, "status": flag.status})


class MultiAccountView(APIView):
    """GET /api/v1/integrity/multi-accounts/ (ADMIN, item 115)."""

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def get(self, request):
        clusters = multi_account_clusters()
        # Resolve usernames for the advisory view.
        ids = {uid for row in clusters for uid in row["user_ids"]}
        names = dict(User.objects.filter(id__in=ids).values_list("id", "username"))
        for row in clusters:
            row["usernames"] = [names.get(uid, f"#{uid}") for uid in row["user_ids"]]
        return Response({"clusters": clusters})


class AbuseQueueView(APIView):
    """GET /api/v1/integrity/abuse-queue/ (VERIFIER/ADMIN, item 117)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(abuse_queue())


class ModerationAuditView(APIView):
    """GET /api/v1/integrity/audit/ (VERIFIER/ADMIN, item 118)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        target = request.query_params.get("user")
        rows = ModerationAction.objects.select_related(
            "moderator", "target_user"
        ).order_by("-created_at")
        if target:
            rows = rows.filter(target_user__username=target)
        rows = rows[:200]
        return Response(
            [
                {
                    "id": row.id,
                    "moderator": row.moderator.username,
                    "action": row.action,
                    "target_user": row.target_user.username
                    if row.target_user_id
                    else None,
                    "note": row.note,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        )


class AppealView(APIView):
    """POST/GET /api/v1/integrity/appeals/ (item 118).

    POST: appeal a moderation action that targeted the caller.
    GET (ADMIN): the pending appeals; POST
    /appeals/{id}/decide/ settles one.
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        action_id = request.data.get("action")
        action = ModerationAction.objects.filter(pk=action_id).first()
        if action is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if action.target_user_id != request.user.id:
            return Response(
                {"detail": "You may only appeal actions against you."},
                status=status.HTTP_403_FORBIDDEN,
            )
        text = (request.data.get("text") or "").strip()
        if len(text) < 10:
            return Response(
                {"detail": "Say a little more than that (min 10 chars)."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if Appeal.objects.filter(action=action, appellant=request.user).exists():
            return Response(
                {"detail": "Already appealed."}, status=status.HTTP_409_CONFLICT
            )
        appeal = Appeal.objects.create(
            action=action, appellant=request.user, text=text[:4000]
        )
        return Response({"id": appeal.id, "status": appeal.status}, status=201)

    def get(self, request):
        if not _is_moderator(request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        rows = Appeal.objects.filter(status=Appeal.Status.PENDING).select_related(
            "action__moderator", "action__target_user", "appellant"
        )[:100]
        return Response(
            [
                {
                    "id": row.id,
                    "action": row.action.action,
                    "appellant": row.appellant.username,
                    "text": row.text,
                    "created_at": row.created_at,
                }
                for row in rows
            ]
        )


class AppealDecideView(APIView):
    """POST /api/v1/integrity/appeals/{id}/decide/ (ADMIN, item 118)."""

    permission_classes = [permissions.IsAuthenticated, IsAdminUser]

    def post(self, request, appeal_id):
        appeal = Appeal.objects.filter(pk=appeal_id).first()
        if appeal is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if appeal.status != Appeal.Status.PENDING:
            return Response(
                {"detail": "Already decided."}, status=status.HTTP_409_CONFLICT
            )
        decision = (request.data.get("decision") or "").strip().lower()
        if decision not in ("accepted", "rejected"):
            return Response(
                {"detail": "decision must be 'accepted' or 'rejected'."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        appeal.status = (
            Appeal.Status.ACCEPTED if decision == "accepted" else Appeal.Status.REJECTED
        )
        appeal.decided_by = request.user
        appeal.decision_note = (request.data.get("note") or "").strip()[:2000]
        appeal.decided_at = timezone.now()
        appeal.save()
        ModerationAction.objects.create(
            moderator=request.user,
            target_user=appeal.appellant,
            action=ModerationAction.ActionKind.REPORT_RESOLVED
            if decision == "accepted"
            else ModerationAction.ActionKind.REPORT_DISMISSED,
            target_id=appeal.id,
            note=f"appeal {appeal.id} {decision}",
        )
        return Response({"id": appeal.id, "status": appeal.status})
