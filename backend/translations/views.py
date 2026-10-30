"""Community-translation endpoints (i18n wave, owner rule (c)).

Flow: an authenticated (rate-limited) user proposes a translation for a
PUBLISHED problem into any UI locale except English → the proposal sits in
the PENDING curation queue (optionally pre-screened by the pluggable AI
curator) → a VERIFIER/ADMIN approves or rejects → approval promotes the
proposal atomically into the problem's title_i18n/statement_i18n and the
contributor is notified via the notifications app.

The propose + list + mine + approve/reject surface doubles as the mobile
contract (a later phase builds the app on these endpoints).
"""

import logging

from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from notifications.services import notify
from problems.models import Problem
from users.permissions import IsProblemVerifier
from webcoder_api.pagination import StandardPageNumberPagination

from .ai_curator import curator_from_env
from .models import TranslationProposal
from .serializers import (
    LanguageCatalogEntrySerializer,
    TranslationProposalCreateSerializer,
    TranslationProposalSerializer,
    TranslationReviewSerializer,
    language_catalog,
)

logger = logging.getLogger(__name__)


class LanguageCatalogView(APIView):
    """The translatable-language catalog — propose-form picker + mobile."""

    permission_classes = [permissions.AllowAny]

    def get(self, request):
        serializer = LanguageCatalogEntrySerializer(language_catalog(), many=True)
        return Response({"results": serializer.data})


def promote_proposal(proposal: TranslationProposal, *, reviewer, note: str = "") -> None:
    """Atomically publish a proposal into its problem (idempotent-guarded).

    Runs inside ``select_for_update`` on BOTH the proposal and the problem
    so two verifiers clicking approve concurrently cannot interleave a
    half-promoted state, and so the i18n write can never land on a problem
    row that changed in between. The caller wraps this in
    ``transaction.atomic``; the contributor notification is emitted on
    commit so a rolled-back promotion never notifies.
    """
    rows = TranslationProposal.objects.select_for_update().filter(pk=proposal.pk)
    locked_proposal = rows.first()
    if locked_proposal is None or locked_proposal.status != TranslationProposal.Status.PENDING:
        from rest_framework.exceptions import ValidationError

        raise ValidationError(
            {"detail": "Only pending proposals can be approved."}
        )

    problem = (
        Problem.objects.select_for_update().filter(pk=locked_proposal.problem_id).first()
    )
    if problem is None:  # pragma: no cover — CASCADE keeps rows in step
        from rest_framework.exceptions import ValidationError

        raise ValidationError({"detail": "The problem no longer exists."})

    language = locked_proposal.language
    title_i18n = dict(problem.title_i18n) if isinstance(problem.title_i18n, dict) else {}
    statement_i18n = (
        dict(problem.statement_i18n)
        if isinstance(problem.statement_i18n, dict)
        else {}
    )
    title_i18n[language] = locked_proposal.title
    statement_i18n[language] = locked_proposal.statement
    problem.title_i18n = title_i18n
    problem.statement_i18n = statement_i18n
    problem.save(update_fields=["title_i18n", "statement_i18n", "last_modified_date"])

    locked_proposal.status = TranslationProposal.Status.APPROVED
    locked_proposal.reviewer = reviewer
    locked_proposal.review_note = note
    locked_proposal.reviewed_at = timezone.now()
    locked_proposal.save(
        update_fields=[
            "status",
            "reviewer",
            "review_note",
            "reviewed_at",
            "updated_at",
        ]
    )

    def _notify():
        notify(
            locked_proposal.contributor,
            "TRANSLATION_APPROVED",
            actor=reviewer,
            target=problem,
            data={
                "problem_id": problem.pk,
                "problem_title": (problem.title_i18n or {}).get("en", ""),
                "language": language,
                "proposal_id": locked_proposal.pk,
            },
        )

    transaction.on_commit(_notify)


class TranslationProposalViewSet(viewsets.ModelViewSet):
    """Propose / curate problem translations.

    - ``POST /`` (any authenticated user, throttled): create a proposal.
    - ``GET /`` (VERIFIER/ADMIN): the curation queue (?status=&language=&problem=).
    - ``GET /mine/`` (any authenticated user): your own proposals + decisions.
    - ``POST /{id}/approve/`` and ``POST /{id}/reject/`` (VERIFIER/ADMIN).
    """

    queryset = TranslationProposal.objects.select_related(
        "problem", "contributor", "reviewer"
    )
    serializer_class = TranslationProposalSerializer
    pagination_class = StandardPageNumberPagination

    def get_permissions(self):
        if self.action in ("create", "mine"):
            return [permissions.IsAuthenticated()]
        # list/retrieve/approve/reject are the curation surface.
        return [permissions.IsAuthenticated(), IsProblemVerifier()]

    def get_throttles(self):
        if self.action == "create":
            self.throttle_scope = "translation_propose"
            return [ScopedRateThrottle()]
        return super().get_throttles()

    def get_serializer_class(self):
        if self.action == "create":
            return TranslationProposalCreateSerializer
        return TranslationProposalSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.action == "mine":
            return queryset.filter(contributor=self.request.user)
        params = self.request.query_params
        status_filter = params.get("status")
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        language = params.get("language")
        if language:
            queryset = queryset.filter(language=language)
        problem = params.get("problem")
        if problem:
            queryset = queryset.filter(problem_id=problem)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        problem = serializer.validated_data["problem"]
        language = serializer.validated_data["language"]

        if TranslationProposal.objects.filter(
            problem=problem,
            language=language,
            contributor=request.user,
            status=TranslationProposal.Status.PENDING,
        ).exists():
            return Response(
                {
                    "detail": (
                        "You already have a pending proposal for this problem "
                        "and language — wait for a decision before proposing again."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        proposal = TranslationProposal(
            problem=problem,
            language=language,
            title=serializer.validated_data["title"],
            statement=serializer.validated_data["statement"],
            contributor=request.user,
        )

        # Pluggable AI screening (owner rule (c); OFF unless AI_CURATOR_URL
        # is set). Fail-open: every failure mode flags for humans — the
        # proposal is still accepted into the human queue.
        curator = curator_from_env()
        if curator is not None:
            titles = problem.title_i18n if isinstance(problem.title_i18n, dict) else {}
            statements = (
                problem.statement_i18n
                if isinstance(problem.statement_i18n, dict)
                else {}
            )
            result = curator.screen(
                problem_en={
                    "title": titles.get("en", ""),
                    "statement": statements.get("en", ""),
                },
                proposal={
                    "language": language,
                    "title": proposal.title,
                    "statement": proposal.statement,
                },
            )
            proposal.ai_verdict = result.verdict
            proposal.ai_confidence = result.confidence
            proposal.ai_notes = result.notes

        try:
            with transaction.atomic():
                proposal.save()
                if (
                    curator is not None
                    and curator.auto_approve
                    and proposal.ai_verdict == "approve"
                ):
                    promote_proposal(
                        proposal,
                        reviewer=None,
                        note="Auto-approved by the AI curator.",
                    )
        except IntegrityError:
            # Lost the unique-pending race against a concurrent duplicate.
            return Response(
                {
                    "detail": (
                        "You already have a pending proposal for this problem "
                        "and language — wait for a decision before proposing again."
                    )
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Auto-promotion (when enabled) rewrites the row via its own locked
        # fetch — reload so the response reflects the final state.
        proposal.refresh_from_db()
        return Response(
            TranslationProposalSerializer(
                proposal, context=self.get_serializer_context()
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["get"])
    def mine(self, request):
        page = self.paginate_queryset(self.get_queryset())
        serializer = self.get_serializer(page, many=True)
        return self.get_paginated_response(serializer.data)

    @action(detail=True, methods=["post"])
    def approve(self, request, pk=None):
        proposal = self.get_object()
        with transaction.atomic():
            promote_proposal(proposal, reviewer=request.user)
        proposal.refresh_from_db()
        return Response(self.get_serializer(proposal).data)

    @action(detail=True, methods=["post"])
    def reject(self, request, pk=None):
        serializer = TranslationReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        proposal = self.get_object()
        with transaction.atomic():
            rows = TranslationProposal.objects.select_for_update().filter(pk=proposal.pk)
            locked = rows.first()
            if locked is None or locked.status != TranslationProposal.Status.PENDING:
                return Response(
                    {"detail": "Only pending proposals can be rejected."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            locked.status = TranslationProposal.Status.REJECTED
            locked.reviewer = request.user
            locked.review_note = serializer.validated_data["note"]
            locked.reviewed_at = timezone.now()
            locked.save(
                update_fields=[
                    "status",
                    "reviewer",
                    "review_note",
                    "reviewed_at",
                    "updated_at",
                ]
            )
            problem = locked.problem

            def _notify():
                notify(
                    locked.contributor,
                    "TRANSLATION_REJECTED",
                    actor=request.user,
                    target=problem,
                    data={
                        "problem_id": problem.pk,
                        "problem_title": (problem.title_i18n or {}).get("en", ""),
                        "language": locked.language,
                        "proposal_id": locked.pk,
                        "note": locked.review_note,
                    },
                )

            transaction.on_commit(_notify)
        proposal.refresh_from_db()
        return Response(self.get_serializer(proposal).data)
