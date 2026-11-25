"""Cross-device code drafts (wave G item 76).

``GET    /api/v1/submissions/drafts/{problem_id}/`` — the caller's latest
draft for a problem (200 with ``{language, code, updated_at}`` or 204 when
none exists).
``PUT    /api/v1/submissions/drafts/{problem_id}/`` — upsert (autosave).
``DELETE /api/v1/submissions/drafts/{problem_id}/`` — clear (after submit).

Auth-scoped, size-capped (the code field mirrors the submission cap), and
write-throttled by the submit scope — an autosave loop must never become a
write flood.
"""

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from problems.models import Problem

from .models import CodeDraft

#: Same ceiling as a submission's source — drafts are pre-submissions.
DRAFT_CODE_CAP = 100_000


class CodeDraftSerializer(serializers.Serializer):
    language = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=DRAFT_CODE_CAP, allow_blank=True)


def _visible_problem(problem_id):
    return Problem.objects.filter(pk=problem_id).first()


class DraftView(APIView):
    """The caller's draft for one problem."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "submit"

    def get(self, request, problem_id):
        draft = CodeDraft.objects.filter(
            user=request.user, problem_id=problem_id
        ).first()
        if draft is None:
            return Response(status=status.HTTP_204_NO_CONTENT)
        return Response(
            {
                "language": draft.language,
                "code": draft.code,
                "updated_at": draft.updated_at,
            }
        )

    def put(self, request, problem_id):
        if _visible_problem(problem_id) is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        serializer = CodeDraftSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft, _created = CodeDraft.objects.update_or_create(
            user=request.user,
            problem_id=problem_id,
            defaults={
                "language": serializer.validated_data["language"],
                "code": serializer.validated_data["code"],
            },
        )
        return Response(
            {
                "language": draft.language,
                "code": draft.code,
                "updated_at": draft.updated_at,
            }
        )

    def delete(self, request, problem_id):
        deleted, _ = CodeDraft.objects.filter(
            user=request.user, problem_id=problem_id
        ).delete()
        return Response({"deleted": deleted}, status=status.HTTP_200_OK)
