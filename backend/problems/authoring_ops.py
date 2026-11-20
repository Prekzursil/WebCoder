"""Wave F authoring-ops API (items 122/126/127/128).

- ``POST /problems/{id}/generate-tests/``   render the DSL into TestCases
- ``POST /problems/{id}/variants/``         spawn a variant child
- ``GET  /problems/{id}/variants/``         the family tree
- ``POST /problems/{id}/attachments/``      upload a statement attachment
- ``GET  /problems/{id}/attachments/``      list them
- ``POST /problems/tools/import-package/``  (existing) now also accepts the
  legacy Polygon ``tests/<name>`` + ``tests/<name>.a`` layout.
"""

from __future__ import annotations

import base64
import binascii
import re

from django.core.files.storage import default_storage
from django.db import models as dj_models
from django.utils import timezone
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .models import Problem, TestCase
from .generator_dsl import generate, parse_dsl

MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024
ATTACHMENT_NAME_RE = re.compile(r"^[\w\-. ]+$")
MAX_ATTACHMENTS = 10


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


class GenerateTestsSerializer(serializers.Serializer):
    dsl = serializers.CharField(max_length=20_000)
    count = serializers.IntegerField(min_value=1, max_value=50, default=5)
    seed = serializers.IntegerField(min_value=0, default=0)
    is_sample = serializers.BooleanField(default=False)


class GenerateTestsView(APIView):
    """Item 122 — render the generator DSL into real TestCase rows."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = GenerateTestsSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        try:
            parse_dsl(data["dsl"])
        except ValueError as exc:
            # The DSL parser raises ValueError with a clean, self-authored
            # message as args[0]; surface exactly that (never str(exc),
            # which could carry interpreter internals).
            return Response({"dsl": exc.args[0]}, status=status.HTTP_400_BAD_REQUEST)
        base_order = problem.test_cases.count()
        created = 0
        for offset in range(data["count"]):
            rendered = generate(data["dsl"], data["seed"] + offset)
            TestCase.objects.create(
                problem=problem,
                input_data=rendered,
                expected_output_data="",
                is_sample=data["is_sample"],
                points=10,
                order=base_order + offset,
            )
            created += 1
        return Response(
            {
                "created": created,
                "first": generate(data["dsl"], data["seed"]),
                "note": "Inputs generated; fill expected outputs via the "
                "expected-output tool or a reference solution.",
            },
            status=status.HTTP_201_CREATED,
        )


class VariantSerializer(serializers.Serializer):
    note = serializers.CharField(max_length=200, required=False, allow_blank=True)


class VariantSpawnView(APIView):
    """Item 126 — spawn a variant child from a family parent."""

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, problem_id):
        parent = Problem.objects.filter(pk=problem_id).first()
        if parent is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = VariantSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        note = payload.validated_data.get("note", "")
        base_title = (
            parent.title_i18n.get("en", f"Problem {parent.id}")
            if isinstance(parent.title_i18n, dict)
            else f"Problem {parent.id}"
        )
        root = parent.variant_root
        child_count = Problem.objects.filter(variant_parent=root).count()
        child = Problem.objects.create(
            title_i18n={
                "en": f"{base_title} — variant {child_count + 1}",
                "ro": f"{base_title} — varianta {child_count + 1}",
            },
            statement_i18n=dict(parent.statement_i18n),
            status=Problem.ProblemStatus.DRAFT,
            author=request.user,
            difficulty=parent.difficulty,
            default_time_limit_ms=parent.default_time_limit_ms,
            default_memory_limit_kb=parent.default_memory_limit_kb,
            variant_parent=root,
            variant_note=note,
        )
        # Copy the samples so the variant starts from the parent's worked
        # examples; hidden tests stay per-variant by design.
        for sample in parent.test_cases.filter(is_sample=True):
            TestCase.objects.create(
                problem=child,
                input_data=sample.input_data,
                expected_output_data=sample.expected_output_data,
                is_sample=True,
                points=sample.points,
                order=sample.order,
            )
        return Response(
            {
                "variant_id": child.id,
                "root_id": root.id,
                "title": child.title_i18n["en"],
            },
            status=status.HTTP_201_CREATED,
        )


class VariantListView(APIView):
    """Item 126 — the family tree for one problem (root + siblings)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, problem_id):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        root = problem.variant_root
        family = Problem.objects.filter(
            dj_models.Q(pk=root.pk) | dj_models.Q(variant_parent=root)
        ).order_by("id")
        return Response(
            {
                "root": root.id,
                "count": family.count(),
                "variants": [
                    {
                        "id": row.id,
                        "title": (
                            row.title_i18n.get("en", f"Problem {row.id}")
                            if isinstance(row.title_i18n, dict)
                            else f"Problem {row.id}"
                        ),
                        "note": row.variant_note,
                        "status": row.status,
                    }
                    for row in family
                ],
            }
        )


class AttachmentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    content_base64 = serializers.CharField()
    kind = serializers.ChoiceField(choices=["inline", "download"], default="inline")


class AttachmentView(APIView):
    """Items 128 — statement attachments stored on the media storage."""

    permission_classes = [permissions.IsAuthenticated]

    def _problem_or_none(self, problem_id):
        return Problem.objects.filter(pk=problem_id).first()

    def get(self, request, problem_id):
        problem = self._problem_or_none(problem_id)
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from .models import StatementAttachment

        rows = StatementAttachment.objects.filter(problem=problem).order_by("id")
        return Response(
            {
                "count": rows.count(),
                "results": [
                    {
                        "id": row.id,
                        "name": row.name,
                        "kind": row.kind,
                        "size_bytes": row.size_bytes,
                        "url": row.file.url if row.file else "",
                        "uploaded_at": row.uploaded_at,
                    }
                    for row in rows
                ],
            }
        )

    def post(self, request, problem_id):
        problem = self._problem_or_none(problem_id)
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        from .models import StatementAttachment

        if (
            StatementAttachment.objects.filter(problem=problem).count()
            >= MAX_ATTACHMENTS
        ):
            return Response(
                {
                    "detail": f"A statement may carry at most {MAX_ATTACHMENTS} attachments."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        payload = AttachmentSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        if not ATTACHMENT_NAME_RE.match(data["name"]):
            return Response(
                {"name": "Letters, digits, dash, underscore, dot and space only."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            raw = base64.b64decode(data["content_base64"], validate=True)
        except (binascii.Error, ValueError):
            return Response(
                {"content_base64": "Invalid base64 payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(raw) > MAX_ATTACHMENT_BYTES:
            return Response(
                {"content_base64": "Attachments are capped at 2 MB."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        safe_name = f"attachments/p{problem.id}/{timezone.now().strftime('%Y%m%d%H%M%S')}-{data['name']}"
        from django.core.files.base import ContentFile

        saved = default_storage.save(safe_name, ContentFile(raw, name=data["name"]))
        row = StatementAttachment.objects.create(
            problem=problem,
            name=data["name"],
            kind=data["kind"],
            file=saved,
            size_bytes=len(raw),
            uploaded_by=request.user,
        )
        return Response(
            {
                "id": row.id,
                "name": row.name,
                "kind": row.kind,
                "size_bytes": row.size_bytes,
                "url": row.file.url if row.file else "",
                "uploaded_at": row.uploaded_at,
            },
            status=status.HTTP_201_CREATED,
        )


class AuthoringDraftView(APIView):
    """Item A — autosaved rich-authoring drafts.

    One draft per (author, problem slot): ``/problems/authoring-drafts/new/``
    is the create-page scratchpad (problem=None), ``.../{problem_id}/`` the
    edit-page draft. GET returns the saved payload (404 when none), PUT
    upserts, DELETE clears. Only the owner ever sees their draft.
    """

    permission_classes = [permissions.IsAuthenticated]

    def _slot(self, request, problem_id: str):
        """Resolve (problem-or-None, existing draft); 404 on a bad id."""
        from .models import AuthoringDraft

        problem = None
        if problem_id not in ("new", "0"):
            try:
                problem = Problem.objects.get(id=int(problem_id))
            except (ValueError, Problem.DoesNotExist):
                return None, None
        draft = AuthoringDraft.objects.filter(
            user=request.user, problem=problem
        ).first()
        return problem, draft

    def get(self, request, problem_id: str):
        problem, draft = self._slot(request, problem_id)
        if problem is None and problem_id not in ("new", "0"):
            return Response({"detail": "problem not found"}, status=404)
        if draft is None:
            return Response({"detail": "no draft"}, status=404)
        return Response({"payload": draft.payload, "updated_at": draft.updated_at})

    def put(self, request, problem_id: str):
        from .models import AuthoringDraft

        problem, _draft = self._slot(request, problem_id)
        if problem is None and problem_id not in ("new", "0"):
            return Response({"detail": "problem not found"}, status=404)
        payload = request.data.get("payload")
        if not isinstance(payload, dict):
            return Response({"detail": "payload must be a JSON object"}, status=400)
        draft, _created = AuthoringDraft.objects.update_or_create(
            user=request.user,
            problem=problem,
            defaults={"payload": payload},
        )
        return Response({"payload": draft.payload, "updated_at": draft.updated_at})

    def delete(self, request, problem_id: str):
        problem, draft = self._slot(request, problem_id)
        if problem is None and problem_id not in ("new", "0"):
            return Response({"detail": "problem not found"}, status=404)
        if draft is not None:
            draft.delete()
        return Response(status=204)
