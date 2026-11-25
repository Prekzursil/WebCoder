"""Statement-quality API (wave F items 123/124/134) + wizard scaffold (121).

- ``POST /problems/{id}/statement-lint/``  warnings (author/verifier only)
- ``GET  /problems/{id}/readability/``     per-locale reading ease
- ``GET  /problems/{id}/translation-status/``  the sidecar gaps report
- ``GET  /problems/wizard/steps/``        the visual wizard checklist
"""

from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from users.models import User

from .models import Problem
from .statement_quality import (
    problem_readability,
    statement_lint,
    translation_gaps,
)

WIZARD_STEPS = [
    {
        "key": "basics",
        "title_en": "Basics",
        "description_en": "Title, statement, difficulty, tags.",
        "fields": ["title_i18n", "statement_i18n", "difficulty", "tags"],
    },
    {
        "key": "limits",
        "title_en": "Limits & languages",
        "description_en": "Time/memory limits and allowed languages.",
        "fields": [
            "default_time_limit_ms",
            "default_memory_limit_kb",
            "allowed_languages",
        ],
    },
    {
        "key": "samples",
        "title_en": "Samples",
        "description_en": "At least two worked examples.",
        "fields": ["test_cases.is_sample"],
    },
    {
        "key": "tests",
        "title_en": "Hidden tests",
        "description_en": "The full suite beyond the samples.",
        "fields": ["test_cases"],
    },
    {
        "key": "reference",
        "title_en": "Reference solution",
        "description_en": "The model solution powering hacks & expected outputs.",
        "fields": ["reference_solution_code", "reference_language"],
    },
    {
        "key": "translation",
        "title_en": "Translation sidecar",
        "description_en": "RO mirror of every localized field.",
        "fields": ["statement_i18n.ro", "hints_ro"],
    },
    {
        "key": "review",
        "title_en": "Review & submit",
        "description_en": "Lint clean, readability band, then send for verification.",
        "fields": [],
    },
]


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


class StatementLintView(APIView):
    """Item 123 — run the statement linter on one problem."""

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
        warnings = statement_lint(problem)
        return Response({"count": len(warnings), "warnings": warnings})


class ReadabilityView(APIView):
    """Item 134 — the per-locale readability report."""

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
        return Response(problem_readability(problem))


class TranslationStatusView(APIView):
    """Item 124 — the sidecar gaps report (which locale fields are missing)."""

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
        return Response(translation_gaps(problem))


class WizardStepsView(APIView):
    """Item 121 — the visual authoring wizard: the ordered step checklist
    plus a live per-step completion probe for one problem (?problem_id=)."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        if not _authoring_gate(request.user):
            return Response(
                {"detail": "Authors and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        problem = None
        raw_id = request.query_params.get("problem_id")
        if raw_id:
            problem = Problem.objects.filter(pk=raw_id).first()
            if problem is None:
                return Response(
                    {"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND
                )
        steps = []
        for step in WIZARD_STEPS:
            entry = dict(step)
            entry["complete"] = (
                _step_complete(step["key"], problem) if problem else False
            )
            steps.append(entry)
        return Response({"count": len(steps), "steps": steps})


def _step_complete(key: str, problem) -> bool:

    if key == "basics":
        statement = (
            problem.statement_i18n.get("en", "")
            if isinstance(problem.statement_i18n, dict)
            else ""
        )
        return bool(statement.strip())
    if key == "limits":
        return problem.default_time_limit_ms > 0 and problem.default_memory_limit_kb > 0
    if key == "samples":
        return problem.test_cases.filter(is_sample=True).count() >= 2
    if key == "tests":
        return problem.test_cases.count() >= 3
    if key == "reference":
        return bool(problem.reference_solution_code and problem.reference_language)
    if key == "translation":
        statement_ro = (
            problem.statement_i18n.get("ro", "")
            if isinstance(problem.statement_i18n, dict)
            else ""
        )
        return bool(statement_ro.strip())
    if key == "review":
        return problem.status in (
            Problem.ProblemStatus.PENDING_APPROVAL,
            Problem.ProblemStatus.APPROVED,
        )
    return False
