"""Setter CVs, solve cards and embeddable widgets (wave F items 70-72).

Endpoints (all public where noted):

- ``GET  /users/{username}/setter-cv/``      the derived portfolio + profile
- ``PUT  /users/{username}/setter-cv/``      owner edits blurb/links
- ``GET  /cards/solve/{username}/{problem_id}/``   the solve-card payload
- ``GET  /cards/solve/{username}/{problem_id}/svg`` the shareable SVG card
- ``GET  /embed/problems/{problem_id}/``     the embeddable widget payload
"""

from __future__ import annotations

import html

from django.contrib.auth import get_user_model
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from problems.models import Problem
from submissions.models import Submission

from .setter import setter_cv, solve_card

User = get_user_model()


class SetterProfileSerializer(serializers.Serializer):
    blurb = serializers.CharField(max_length=600, required=False, allow_blank=True)
    links = serializers.ListField(
        child=serializers.URLField(), required=False, max_length=5
    )


class SetterCVView(APIView):
    """Item 70 — the public setter CV; owners PUT their blurb/links."""

    def get(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(setter_cv(user))

    def put(self, request, username):
        user = User.objects.filter(username=username).first()
        if user is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.id != request.user.id:
            return Response(
                {"detail": "Only the setter edits their CV."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = SetterProfileSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        from .models import SetterProfile

        profile, _ = SetterProfile.objects.get_or_create(user=user)
        if "blurb" in payload.validated_data:
            profile.blurb = payload.validated_data["blurb"]
        if "links" in payload.validated_data:
            profile.links = payload.validated_data["links"]
        profile.save()
        return Response(setter_cv(user))


class SolveCardView(APIView):
    """Item 71 — the deterministic solve-card payload."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username, problem_id):
        user = User.objects.filter(username=username).first()
        problem = Problem.objects.filter(pk=problem_id).first()
        if user is None or problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        return Response(solve_card(user, problem))


class SolveCardSvgView(APIView):
    """Item 71 — the shareable SVG render of the solve card."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, username, problem_id):
        user = User.objects.filter(username=username).first()
        problem = Problem.objects.filter(pk=problem_id).first()
        if user is None or problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        card = solve_card(user, problem)
        # The viewer's own solve stays private: the SVG only renders for
        # public facts (solved-on date + ordinal) — never code or feedback.
        solved_date = (
            card["solved_at"].strftime("%Y-%m-%d") if card["solved_at"] else ""
        )
        title = html.escape(card["problem_title"][:60])
        handle = html.escape(card["username"][:30])
        svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="600" height="200" viewBox="0 0 600 200">
  <rect width="600" height="200" rx="16" fill="#0f172a"/>
  <rect x="8" y="8" width="584" height="184" rx="12" fill="#1e293b"/>
  <text x="32" y="58" fill="#38bdf8" font-family="sans-serif" font-size="22" font-weight="bold">SOLVED</text>
  <text x="32" y="96" fill="#f8fafc" font-family="sans-serif" font-size="24" font-weight="bold">{handle}</text>
  <text x="32" y="128" fill="#cbd5e1" font-family="sans-serif" font-size="18">{title}</text>
  <text x="32" y="162" fill="#94a3b8" font-family="sans-serif" font-size="14">solver #{card["ordinal"]} · {solved_date} · webcoder</text>
</svg>"""
        from django.http import HttpResponse

        return HttpResponse(svg, content_type="image/svg+xml")


class EmbedProblemView(APIView):
    """Item 72 — the embeddable problem-widget payload (statement summary
    + sample I/O + a CTA link; never hidden tests or full statements of
    contest-fresh problems)."""

    permission_classes = [permissions.AllowAny]

    def get(self, request, problem_id):
        problem = get_object_or_404(Problem, pk=problem_id)
        from contests.models import ContestProblem

        live_contest = ContestProblem.objects.filter(
            problem=problem,
            contest__end_at__gt=timezone.now(),
        ).exists()
        if live_contest:
            return Response(
                {"detail": "This problem is not embeddable right now."},
                status=status.HTTP_403_FORBIDDEN,
            )
        title = (
            problem.title_i18n.get("en", f"Problem {problem.id}")
            if isinstance(problem.title_i18n, dict)
            else f"Problem {problem.id}"
        )
        samples = list(
            problem.test_cases.filter(is_sample=True)
            .order_by("order")
            .values("input_data", "expected_output_data")[:3]
        )
        solved = (
            Submission.objects.filter(
                problem=problem, verdict=Submission.VerdictStatus.ACCEPTED
            )
            .values_list("user_id")
            .distinct()
            .count()
        )
        return Response(
            {
                "problem_id": problem.id,
                "title": title,
                "difficulty": problem.difficulty,
                "time_limit_ms": problem.default_time_limit_ms,
                "memory_limit_kb": problem.default_memory_limit_kb,
                "samples": samples,
                "solved_by": solved,
                "solve_url": f"/problems/{problem.id}",
            }
        )
