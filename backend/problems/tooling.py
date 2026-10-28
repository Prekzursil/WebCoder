"""Authoring & integrity tooling (competitive roadmap Wave C).

JDG-11 — the stress-test helper: run a generator + two solutions N times
inside the same sandboxed mechanics the scratch pad uses, report the first
input where the outputs diverge. This is the "find the failing test"
loop every competitive programmer runs by hand; the platform runs it
inside its own throttled, audited lane.

JDG-13 (v1 slice) — the teacher/admin "download all solutions for this
homework" export: per-assignment CSV of every counted submission with
source code (the #1 teacher pain point per the roadmap; batch MOSS/Dolos
stays deferred until contest volume justifies it — round-2 D.8).
"""

import csv
import io
import pathlib

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from classroom.models import Assignment
from scratch.models import StressRun
from submissions.judge_utils.compilation import compile_code_in_sandbox
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.judge_utils.languages import get_language
from submissions.models import Submission
from submissions.tasks import _judge_workspace
from users.models import User

from .models import Problem, TestCase

#: Safety ceiling for stress iterations (the loop is user-paced, sandboxed
#: and throttled; the cap keeps one request from monopolizing the lane).
MAX_STRESS_ITERATIONS = 50
STRESS_TIME_LIMIT_MS = 5000
STRESS_MEMORY_LIMIT_KB = 262144


def _run_compiled(
    executable_path, language: str, stdin_data: str, workspace_dir
) -> tuple[str, str, str]:
    """Run one compiled artifact; returns (verdict, stdout, stderr)."""
    verdict, _time, _mem, output, error = run_code_in_sandbox(
        executable_path,
        language,
        stdin_data,
        STRESS_TIME_LIMIT_MS,
        STRESS_MEMORY_LIMIT_KB,
        workspace_dir,
        None,
    )
    return verdict, output or "", error or ""


class StressRequestSerializer(serializers.Serializer):
    generator_language = serializers.CharField(max_length=50)
    generator_code = serializers.CharField()
    solution_language = serializers.CharField(max_length=50)
    solution_code = serializers.CharField()
    reference_language = serializers.CharField(max_length=50)
    reference_code = serializers.CharField()
    iterations = serializers.IntegerField(min_value=1, default=10)


class StressTestView(APIView):
    """POST /api/v1/problems/tools/stress/ (JDG-11).

    The caller supplies a generator (produces stdin), a solution (the code
    under test) and a trusted reference; the loop runs generator → both
    programs → output compare, and returns the FIRST mismatching input so
    the author can turn it into a real TestCase. CREATOR/TEACHER/verifier
    only; its own throttle lane beside scratch.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "stress"  # scratch-adjacent ceiling, its own bucket

    def post(self, request):
        user = request.user
        if not (
            user.is_superuser
            or user.is_staff
            or getattr(user, "role", "")
            in (
                User.Roles.ADMIN,
                User.Roles.PROBLEM_VERIFIER,
                User.Roles.PROBLEM_CREATOR,
                User.Roles.TEACHER,
            )
        ):
            return Response(
                {"detail": "Creators, teachers and verifiers only."},
                status=status.HTTP_403_FORBIDDEN,
            )
        payload = StressRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        iterations = min(data["iterations"], MAX_STRESS_ITERATIONS)
        for key, lang_key in (
            ("generator", "generator_language"),
            ("solution", "solution_language"),
            ("reference", "reference_language"),
        ):
            if get_language(data[lang_key]) is None:
                return Response(
                    {lang_key: f"Unsupported language: {data[lang_key]}."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        mismatch = None
        runs = 0
        with _judge_workspace("stress_") as workspace:
            workspace_dir = pathlib.Path(workspace)
            compiled: dict[str, tuple] = {}
            for key, lang_key, code_key in (
                ("generator", "generator_language", "generator_code"),
                ("solution", "solution_language", "solution_code"),
                ("reference", "reference_language", "reference_code"),
            ):
                ok, compiler_output, executable = compile_code_in_sandbox(
                    data[code_key], data[lang_key], workspace_dir, None
                )
                if not ok:
                    # Persist first, respond from the row (ScratchRun
                    # pattern): the audit trail AND the serialization
                    # boundary for sandbox diagnostics.
                    record = StressRun.objects.create(
                        user=request.user,
                        iterations=0,
                        found=False,
                        detail={f"{key}_code": compiler_output[:2000]},
                    )
                    return Response(
                        record.detail, status=status.HTTP_400_BAD_REQUEST
                    )
                compiled[key] = (executable, data[lang_key])

            gen_exec, gen_lang = compiled["generator"]
            sol_exec, sol_lang = compiled["solution"]
            ref_exec, ref_lang = compiled["reference"]

            for _index in range(iterations):
                gen_verdict, gen_out, gen_err = _run_compiled(
                    gen_exec, gen_lang, "", workspace_dir
                )
                runs += 1
                if gen_verdict != "AC":
                    mismatch = {
                        "phase": "generator",
                        "verdict": gen_verdict,
                        "stderr": gen_err[:2000],
                    }
                    break
                sol_verdict, sol_out, sol_err = _run_compiled(
                    sol_exec, sol_lang, gen_out, workspace_dir
                )
                ref_verdict, ref_out, ref_err = _run_compiled(
                    ref_exec, ref_lang, gen_out, workspace_dir
                )
                if sol_verdict != "AC":
                    mismatch = {
                        "phase": "solution",
                        "input": gen_out[:4000],
                        "verdict": sol_verdict,
                        "stderr": sol_err[:2000],
                    }
                    break
                if ref_verdict != "AC":
                    mismatch = {
                        "phase": "reference",
                        "input": gen_out[:4000],
                        "verdict": ref_verdict,
                        "stderr": ref_err[:2000],
                    }
                    break
                if sol_out.strip() != ref_out.strip():
                    mismatch = {
                        "phase": "mismatch",
                        "input": gen_out[:4000],
                        "solution_output": sol_out[:4000],
                        "reference_output": ref_out[:4000],
                    }
                    break

        record = StressRun.objects.create(
            user=request.user,
            iterations=runs,
            found=mismatch is not None,
            detail={"mismatch": mismatch} if mismatch else {},
        )
        # Respond from the persisted row (audit + serialization boundary).
        return Response(
            {
                "id": record.id,
                "iterations": record.iterations,
                "found": record.found,
                "mismatch": record.detail.get("mismatch"),
            }
        )


class AssignmentSolutionsExportView(APIView):
    """GET /api/v1/problems/tools/assignment-solutions/{assignment_id}/

    JDG-13 v1: the teacher/admin CSV export of every submission counted
    for the temă (EDU-3 window rule) INCLUDING source code — the teacher's
    "download all solutions" button. Batch similarity scanning (MOSS/Dolos)
    stays deferred per round-2 D.8; the diff-based admin review rides the
    regular submission views.
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, assignment_id):
        assignment = Assignment.objects.filter(pk=assignment_id).first()
        if assignment is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        is_manager = (
            request.user.is_superuser
            or request.user.is_staff
            or getattr(request.user, "role", "") == User.Roles.ADMIN
            or assignment.classroom.teacher_id == request.user.id
        )
        if not is_manager:
            return Response(
                {"detail": "Only the teacher can export solutions."},
                status=status.HTTP_403_FORBIDDEN,
            )
        submissions = (
            Submission.objects.filter(
                problem__in=assignment.assignment_problems.values_list(
                    "problem_id", flat=True
                ),
                user__in=assignment.classroom.memberships.values_list(
                    "student_id", flat=True
                ),
                submission_time__gte=assignment.available_from,
                submission_time__lte=assignment.effective_due_at,
            )
            .select_related("user", "problem")
            .order_by("user__username", "submission_time")
        )
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "student",
                "problem_id",
                "problem_title_en",
                "submission_time",
                "verdict",
                "score",
                "language",
                "code",
            ]
        )
        for row in submissions:
            writer.writerow(
                [
                    row.user.username,
                    row.problem_id,
                    (
                        row.problem.title_i18n.get("en", "")
                        if isinstance(row.problem.title_i18n, dict)
                        else ""
                    ),
                    row.submission_time.isoformat(),
                    row.verdict,
                    row.score,
                    row.language,
                    row.code,
                ]
            )
        response = Response(
            {"count": submissions.count(), "csv": buffer.getvalue()}
        )
        return response


class SampleTestsDownloadView(APIView):
    """GET /api/v1/problems/{problem_id}/samples/ (UXP-3).

    Public download of the SAMPLE-flagged tests only (the ones the
    statement already shows) as one bundled text file — offline/olympiad
    practice without exposing hidden data.
    """

    permission_classes = [permissions.AllowAny]

    def get(self, request, problem_id):
        problem = Problem.objects.filter(
            pk=problem_id, status=Problem.ProblemStatus.APPROVED
        ).first()
        if problem is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        samples = TestCase.objects.filter(problem=problem, is_sample=True).order_by(
            "order"
        )
        if not samples.exists():
            return Response(
                {"detail": "No sample tests on this problem."},
                status=status.HTTP_404_NOT_FOUND,
            )
        sections = []
        for index, test in enumerate(samples, start=1):
            sections.append(
                f"--- sample {index} input ---\n{test.input_data}\n"
                f"--- sample {index} output ---\n{test.expected_output_data}\n"
            )
        return Response(
            {
                "count": len(samples),
                "filename": f"problem-{problem.id}-samples.txt",
                "content": "\n".join(sections),
            }
        )
