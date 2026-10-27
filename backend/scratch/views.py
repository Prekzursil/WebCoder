"""Custom invocation / scratch run endpoint (competitive roadmap JDG-6/X7).

``POST /api/v1/scratch/`` — run code on user-supplied input with fixed
modest limits and get the raw output back. NOT a submission: no score, no
testcases, no leaderboard. This is exactly the unthrottled judge-DoS
surface SP4 worries about, so the endpoint carries its own scoped
throttle and an audit-log row per run.
"""

import pathlib

from django.conf import settings
from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from submissions.judge_utils.compilation import compile_code_in_sandbox
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.judge_utils.languages import get_language
from submissions.models import Submission
from submissions.tasks import _judge_workspace

from .models import ScratchRun

#: X7: fixed modest limits — 5s CPU / 256MB, any language.
SCRATCH_TIME_LIMIT_MS = 5000
SCRATCH_MEMORY_LIMIT_KB = 262144
#: Outputs beyond this are truncated (the response stays bounded).
SCRATCH_OUTPUT_CAP = 10_000
SCRATCH_INPUT_CAP = 64_000


class ScratchRequestSerializer(serializers.Serializer):
    language = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=SCRATCH_INPUT_CAP)
    input = serializers.CharField(
        required=False, allow_blank=True, default="", max_length=SCRATCH_INPUT_CAP
    )


class ScratchRunView(APIView):
    """Authenticated, throttled custom invocation."""

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "scratch"

    def post(self, request):
        serializer = ScratchRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        language = serializer.validated_data["language"]
        code = serializer.validated_data["code"]
        stdin_data = serializer.validated_data["input"]

        if get_language(language) is None:
            return Response(
                {"language": f"Unsupported language: {language}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        run_kwargs = dict(
            user=request.user,
            language=language,
            source_code=code,
            stdin_data=stdin_data,
        )
        with _judge_workspace("scratch_") as workspace:
            workspace_dir = pathlib.Path(workspace)
            compile_ok, compiler_output, executable_path = compile_code_in_sandbox(
                code, language, workspace_dir, None
            )
            if not compile_ok:
                run_kwargs.update(
                    status=ScratchRun.Status.COMPILE_ERROR,
                    error_data=compiler_output[:SCRATCH_OUTPUT_CAP],
                )
                record = ScratchRun.objects.create(**run_kwargs)
                return Response(
                    {
                        "id": record.id,
                        "status": record.status,
                        "output": "",
                        "error": record.error_data,
                    }
                )

            verdict, time_ms, mem_kb, output, error = run_code_in_sandbox(
                executable_path,
                language,
                stdin_data,
                SCRATCH_TIME_LIMIT_MS,
                SCRATCH_MEMORY_LIMIT_KB,
                workspace_dir,
                None,
            )
            status_label = ScratchRun.Status.OK
            if verdict == Submission.VerdictStatus.TIME_LIMIT_EXCEEDED:
                status_label = ScratchRun.Status.TIMEOUT
            elif verdict != Submission.VerdictStatus.ACCEPTED:
                status_label = ScratchRun.Status.RUNTIME_ERROR

        run_kwargs.update(
            status=status_label,
            stdout_data=output[:SCRATCH_OUTPUT_CAP],
            error_data=error[:SCRATCH_OUTPUT_CAP],
            execution_time_ms=time_ms if time_ms and time_ms > 0 else -1,
            memory_used_kb=mem_kb if mem_kb and mem_kb > 0 else -1,
        )
        record = ScratchRun.objects.create(**run_kwargs)
        return Response(
            {
                "id": record.id,
                "status": record.status,
                "output": record.stdout_data,
                "error": record.error_data,
                "time_ms": record.execution_time_ms,
                "memory_kb": record.memory_used_kb,
            }
        )
