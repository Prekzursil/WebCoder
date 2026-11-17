"""Pre-submit assistance (wave E items 8/9/10).

Two read-only helpers behind the problem-scoped endpoints:

- :func:`lint_submission_code` — a rule-based static analyzer that never
  executes anything. Rules are deliberately conservative: every warning is
  a well-known competitive-programming pitfall (bare ``except:``,
  ``std::endl`` in hot loops, ``pow()`` for integer math, missing flush on
  INTERACTIVE problems) plus the constraint-aware overflow reading (item
  10): when the author declares ``Problem.constraint_max_value`` and the
  constraints exceed 32-bit range while the C/C++ source still declares
  plain ``int`` accumulators, the linter says so BEFORE the judge burns a
  submission on it.

- :func:`run_submission_samples` — item 8: compile the draft once and run
  it against every SAMPLE test of the problem (samples are public by
  design), comparing with the problem's real comparison mode so the author
  sees exactly what the judge would see — without spending a submission
  (the submit throttle stays the scarce resource).

Every warning carries its message in both RO and EN (the site's parity
discipline) so the frontend renders the viewer's locale without extra
lookup tables.
"""

from __future__ import annotations

import pathlib
import re

from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from submissions.judge_utils.comparison import compare_outputs_detailed
from submissions.judge_utils.compilation import compile_code_in_sandbox
from submissions.judge_utils.execution import run_code_in_sandbox
from submissions.judge_utils.languages import effective_limits, get_language
from submissions.models import Submission
from submissions.tasks import _judge_workspace
from scratch.models import ScratchRun

from .models import Problem

#: Capped so a huge paste can never make the linter slow.
LINT_SOURCE_CAP = 200_000

#: Sample runs are judge executions — outputs stay bounded.
SAMPLE_OUTPUT_CAP = 10_000

_CPP_FAMILY = ("cpp17", "cpp20", "c11")


def _warn(rule: str, line: int, en: str, ro: str, severity: str = "hint") -> dict:
    return {
        "rule": rule,
        "line": line,
        "severity": severity,
        "message_en": en,
        "message_ro": ro,
    }


def _first_line(pattern: re.Pattern, source: str) -> int | None:
    for idx, line in enumerate(source.splitlines(), start=1):
        if pattern.search(line):
            return idx
    return None


def lint_submission_code(problem, language: str, code: str) -> list[dict]:
    """Rule-based pre-submit lint (item 9) + overflow reading (item 10).

    Returns a list of warning dicts (rule/line/severity + RO/EN messages);
    never raises on odd sources — unknown shapes simply produce no warnings.
    """
    if not code or len(code) > LINT_SOURCE_CAP:
        return []
    warnings: list[dict] = []
    lines = code.splitlines()

    if language == "python3":
        for idx, line in enumerate(lines, start=1):
            if re.search(r"\bexcept\s*:", line):
                warnings.append(
                    _warn(
                        "py_bare_except",
                        idx,
                        "A bare 'except:' also catches Ctrl+C and system exits — "
                        "catch the specific exception instead.",
                        "Un 'except:' gol prinde și Ctrl+C și ieșirile de sistem — "
                        "prinde excepția concretă.",
                        severity="warning",
                    )
                )
                break
        if re.search(r"[!=]=\s*None\b", code):
            warnings.append(
                _warn(
                    "py_eq_none",
                    _first_line(re.compile(r"[!=]=\s*None\b"), code) or 1,
                    "Compare with None using 'is' / 'is not', not '==' / '!='.",
                    "Compară cu None folosind 'is' / 'is not', nu '==' / '!='.",
                )
            )
        m = re.search(r"def\s+\w+\([^)]*=(\[\]|\{\})", code)
        if m:
            warnings.append(
                _warn(
                    "py_mutable_default",
                    code[: m.start()].count("\n") + 1,
                    "A mutable default argument ([] or {}) is shared across all "
                    "calls — use None and build it inside the function.",
                    "Un argument implicit mutabil ([] sau {}) e partajat între "
                    "toate apelurile — folosește None și construiește-l în funcție.",
                    severity="warning",
                )
            )
    elif language in _CPP_FAMILY:
        endl_count = len(re.findall(r"\bendl\b", code))
        if endl_count >= 3:
            warnings.append(
                _warn(
                    "cpp_endl_flush",
                    _first_line(re.compile(r"\bendl\b"), code) or 1,
                    "std::endl flushes the stream on every call — in loops use "
                    "'\\n' instead or output will be far slower.",
                    "std::endl goolește bufferul la fiecare apel — în bucle "
                    "folosește '\\n', altfel afișarea e mult mai lentă.",
                    severity="warning",
                )
            )
        if re.search(r"\bpow\s*\(", code):
            warnings.append(
                _warn(
                    "cpp_pow_integer",
                    _first_line(re.compile(r"\bpow\s*\("), code) or 1,
                    "pow() returns floating point — for integer powers (squares, "
                    "cubes) multiply directly to avoid precision errors.",
                    "pow() întoarce numere zecimale — pentru puteri întregi "
                    "(pătrate, cuburi) înmulțește direct, fără erori de precizie.",
                )
            )

    # Item 10 — constraint-aware overflow warnings: the author declares the
    # biggest value computations can reach; if that exceeds 32-bit range and
    # the C/C++ source still uses plain int, say it before the judge does.
    max_value = getattr(problem, "constraint_max_value", None)
    if (
        max_value
        and language in _CPP_FAMILY
        and max_value > 2**31 - 1
        and re.search(r"\bint\b", code)
        and "long long" not in code
    ):
        if max_value > 2**63 - 1:
            warnings.append(
                _warn(
                    "int_overflow_128",
                    _first_line(re.compile(r"\bint\b"), code) or 1,
                    "The constraints exceed 64-bit integer range — use __int128, "
                    "Python, or modular arithmetic as the statement requires.",
                    "Restricțiile depășesc intervalul pe 64 de biți — folosește "
                    "__int128, Python sau aritmetică modulară, cum cere enunțul.",
                    severity="warning",
                )
            )
        else:
            warnings.append(
                _warn(
                    "int_overflow_64",
                    _first_line(re.compile(r"\bint\b"), code) or 1,
                    "Values can reach {max_value:,} which overflows 32-bit int — "
                    "use 'long long' for sums, counters and indices.".format(
                        max_value=max_value
                    ),
                    "Valorile pot ajunge la {max_value:,} și depășesc int pe 32 "
                    "de biți — folosește 'long long' pentru sume, contori și "
                    "indici.".format(max_value=max_value),
                    severity="warning",
                )
            )
    if max_value and language == "python3" and max_value > 2**63 - 1:
        warnings.append(
            _warn(
                "py_big_int_note",
                1,
                "Python integers are arbitrary precision — no overflow risk; "
                "watch the time limit on big-number math instead.",
                "Întregii Python au precizie nelimitată — fără risc de "
                "overflow; atenție la limita de timp la calcule mari.",
            )
        )

    # Interactive problems: the classic silent-WA cause is a missing flush.
    if getattr(problem, "problem_type", None) == "INTERACTIVE":
        has_flush = bool(
            re.search(
                r"fflush|std::endl|<<\s*endl|cout\.flush|sys\.stdout\.flush|flush=True",
                code,
            )
        )
        if not has_flush:
            warnings.append(
                _warn(
                    "interactive_no_flush",
                    1,
                    "Interactive problem: your program must flush after every "
                    "message (fflush(stdout) / std::endl / flush=True) or the "
                    "interactor will wait forever.",
                    "Problemă interactivă: programul trebuie să goolească "
                    "bufferul după fiecare mesaj (fflush(stdout) / std::endl / "
                    "flush=True), altfel evaluatorul așteaptă la infinit.",
                    severity="warning",
                )
            )
    return warnings


class PreSubmitRequestSerializer(serializers.Serializer):
    language = serializers.CharField(max_length=20)
    code = serializers.CharField(max_length=LINT_SOURCE_CAP)


def _visible_problem(problem: Problem, user) -> bool:
    """Mirror of ProblemViewSet.get_queryset visibility for one problem."""
    if problem.status == Problem.ProblemStatus.APPROVED:
        return True
    if not user.is_authenticated:
        return False
    if user.is_staff or getattr(user, "role", "") in ("ADMIN", "VERIFIER"):
        return True
    return problem.author_id == user.pk


class PreSubmitLintView(APIView):
    """POST /api/v1/problems/problems/{id}/lint/ (items 9/10).

    Static pre-submit checks — nothing is executed, so the endpoint rides
    the cheap anonymous-safe surface but still requires authentication
    (the lint reads the problem's constraint/type metadata).
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sample_run"  # shared pre-submit bucket (cheap calls)

    def post(self, request, problem_id: int):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None or not _visible_problem(problem, request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = PreSubmitRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        language = payload.validated_data["language"]
        if get_language(language) is None:
            return Response(
                {"language": f"Unsupported language: {language}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        warnings = lint_submission_code(
            problem, language, payload.validated_data["code"]
        )
        return Response({"count": len(warnings), "warnings": warnings})


class PreSubmitSamplesView(APIView):
    """POST /api/v1/problems/problems/{id}/run-samples/ (item 8).

    Compile the draft once, run it on every SAMPLE test with the problem's
    real comparison mode, and report per-sample verdicts — a dress
    rehearsal that costs no submission. Raw judge execution: its own
    throttle scope beside scratch.
    """

    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "sample_run"

    def post(self, request, problem_id: int):
        problem = Problem.objects.filter(pk=problem_id).first()
        if problem is None or not _visible_problem(problem, request.user):
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
        payload = PreSubmitRequestSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        language = payload.validated_data["language"]
        code = payload.validated_data["code"]
        if get_language(language) is None:
            return Response(
                {"language": f"Unsupported language: {language}."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        allowed = problem.allowed_languages or []
        if allowed and language not in allowed:
            return Response(
                {"language": "Language not allowed for this problem."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if problem.problem_type == Problem.ProblemType.INTERACTIVE:
            return Response(
                {
                    "detail": (
                        "Interactive problems cannot be sample-run — the "
                        "interactor drives the conversation. Use the scratch "
                        "console for free runs."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        samples = list(problem.test_cases.filter(is_sample=True).order_by("order"))
        if not samples:
            return Response(
                {"detail": "This problem has no sample tests."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        eff_time_ms, eff_mem_kb = effective_limits(
            problem.default_time_limit_ms,
            problem.default_memory_limit_kb,
            language,
            problem.limit_overrides,
        )

        # OUTPUT_ONLY (JDG-3): the answer text is the candidate output; no
        # compile, no run — straight to comparison.
        if problem.problem_type == Problem.ProblemType.OUTPUT_ONLY:
            return Response(
                {
                    "compile_error": None,
                    "samples": self._compare_samples(problem, samples, code),
                }
            )

        with _judge_workspace("samples_") as workspace:
            workspace_dir = pathlib.Path(workspace)
            compile_ok, compiler_output, executable_path = compile_code_in_sandbox(
                code, language, workspace_dir, None
            )
            if not compile_ok:
                # Audit row first (the scratch discipline): compiler output
                # — which can embed stack traces — is persisted and the
                # RESPONSE carries the persisted field, never the raw
                # taint (CodeQL py/stack-trace-exposure; same pattern as
                # the scratch console).
                record = ScratchRun.objects.create(
                    user=request.user,
                    language=language,
                    source_code=code,
                    status=ScratchRun.Status.COMPILE_ERROR,
                    error_data=compiler_output[:SAMPLE_OUTPUT_CAP],
                )
                return Response(
                    {
                        "compile_error": record.error_data,
                        "samples": [],
                    }
                )
            assert executable_path is not None
            results = []
            worst_status = ScratchRun.Status.OK
            for tc in samples:
                verdict, time_ms, _mem, output, _err = run_code_in_sandbox(
                    executable_path,
                    language,
                    tc.input_data,
                    eff_time_ms,
                    eff_mem_kb,
                    workspace_dir,
                    None,
                )
                if verdict != Submission.VerdictStatus.ACCEPTED:
                    if verdict == Submission.VerdictStatus.TIME_LIMIT_EXCEEDED:
                        worst_status = ScratchRun.Status.TIMEOUT
                    elif worst_status != ScratchRun.Status.TIMEOUT:
                        worst_status = ScratchRun.Status.RUNTIME_ERROR
                    results.append(
                        {
                            "test_id": tc.id,
                            "order": tc.order,
                            "verdict": str(verdict),
                            "time_ms": time_ms if time_ms > 0 else None,
                            "output": (output or "")[:SAMPLE_OUTPUT_CAP],
                            "expected": None,
                            "mismatch_hint": None,
                        }
                    )
                    continue
                row = self._one_comparison(problem, tc, output or "")
                row["time_ms"] = time_ms if time_ms > 0 else None
                results.append(row)
            # The audit row for the executed rehearsal (inputs are the
            # problem's own samples, so stdin carries just the marker).
            ScratchRun.objects.create(
                user=request.user,
                language=language,
                source_code=code,
                stdin_data=f"samples:{problem.pk}",
                status=worst_status,
            )
        return Response({"compile_error": None, "samples": results})

    @staticmethod
    def _one_comparison(problem, tc, output: str) -> dict:
        outputs_match, mismatch_hint = compare_outputs_detailed(
            output,
            tc.expected_output_data,
            problem.comparison_mode,
            problem.float_comparison_epsilon,
            problem.case_insensitive,
        )
        return {
            "test_id": tc.id,
            "order": tc.order,
            "verdict": (
                Submission.VerdictStatus.ACCEPTED
                if outputs_match
                else Submission.VerdictStatus.WRONG_ANSWER
            ),
            "time_ms": None,
            "output": output[:SAMPLE_OUTPUT_CAP],
            "expected": tc.expected_output_data[:SAMPLE_OUTPUT_CAP],
            "mismatch_hint": mismatch_hint,
        }

    def _compare_samples(self, problem, samples, answer_text: str) -> list[dict]:
        return [self._one_comparison(problem, tc, answer_text) for tc in samples]
