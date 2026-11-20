"""Generate proper hidden test suites for thin-import problems.

The 2026-11-20 polish sweep found the imported catalog thin on tests:
most pbinfo rows carry only their public sample, and 38 parked PENDING
rows (Bac-style "write the subprogram" tasks) carry none at all because
the stdin/stdout judge cannot grade a bare function definition.

This command consumes ``problems/data/hidden_test_specs.py`` — a
committed, reviewable spec list where each entry carries:

- a problem match (exact EN title or source-URL suffix);
- replacement bilingual title + statement (the parked Bac rows are
  rewritten into equivalent whole-program Input/Output form — same task,
  our own words, so the statement is original expression);
- a reference solution (python3) used to compute expected outputs for
  every generated input;
- the input list itself (edge + scale cases);
- an optional known-wrong solution for verdict-flip validation.

For every spec the command: validates the reference solution runs, runs
the wrong solution and requires at least one output mismatch (the suite
must actually flip a wrong verdict), then (with ``--apply``) rewrites
title/statement, stores the reference on the problem
(``reference_solution_code`` — feeding the hack/judging/strength
tooling), creates the hidden testcases idempotently (matched on input
data), and approves the problem for the public catalog.

Dry-run by default. ``--only`` restricts to specs whose match key
contains the given substring.
"""

import subprocess
import sys
import tempfile
from pathlib import Path

from django.core.management.base import BaseCommand
from django.db import transaction

from problems.data.hidden_test_specs import SPECS
from problems.models import Problem, TestCase

RUN_TIMEOUT_S = 15


class SpecError(ValueError):
    """A spec failed validation — its problem is skipped untouched."""


def run_solution(code, stdin_text):
    """Run a python solution on stdin_text, return stdout (str)."""
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False, encoding="utf-8") as fh:
        fh.write(code)
        path = fh.name
    try:
        proc = subprocess.run(
            [sys.executable, path],
            input=stdin_text,
            capture_output=True,
            text=True,
            timeout=RUN_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise SpecError("solution timed out") from exc
    finally:
        Path(path).unlink(missing_ok=True)
    if proc.returncode != 0:
        raise SpecError(f"solution crashed: {proc.stderr.strip()[:300]}")
    if not proc.stdout.endswith("\n"):
        return proc.stdout + "\n"
    return proc.stdout


def default_wrong_solution():
    # The weakest possible wrong answer: a constant. Any non-constant
    # task flips at least one test; specs with constant-ish outputs
    # (e.g. 0/1 answers on inputs chosen to cover both) must supply
    # their own wrong solution.
    return "print(12345)\n"


def validate_spec(spec):
    """Run reference + wrong solutions, return (tests, wrong_flips)."""
    inputs = spec["inputs"]
    if not inputs:
        raise SpecError("no inputs")
    outputs = []
    for stdin_text in inputs:
        out = run_solution(spec["solution"], stdin_text)
        if not out.endswith("\n"):
            out += "\n"
        outputs.append(out)
    wrong_code = spec.get("wrong_solution") or default_wrong_solution()
    flips = 0
    for stdin_text, expected in zip(inputs, outputs):
        try:
            wrong_out = run_solution(wrong_code, stdin_text)
        except SpecError:
            return outputs, len(inputs)  # wrong solution crashing = every test catches it
        if wrong_out != expected:
            flips += 1
    if flips == 0:
        raise SpecError("wrong solution passes every generated test")
    return outputs, flips


def match_problem(spec):
    match = spec["match"]
    qs = Problem.objects.all()
    if "title_en" in match:
        qs = qs.filter(title_i18n__en=match["title_en"])
    elif "source_url_suffix" in match:
        qs = qs.filter(source_url__endswith=match["source_url_suffix"])
    else:  # pragma: no cover - guarded by the spec loader tests
        raise SpecError("spec match needs title_en or source_url_suffix")
    return qs.first()


class Command(BaseCommand):
    help = (
        "Generate + validate hidden test suites for thin-import problems from "
        "the committed spec list (dry-run by default; --apply writes)."
    )

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument(
            "--only", default="", help="Restrict to specs whose match key contains this."
        )
        parser.add_argument(
            "--no-approve",
            action="store_true",
            help="Create tests but leave the problem's status untouched.",
        )

    def handle(self, *args, **options):
        apply = options["apply"]
        only = options["only"]
        done = skipped = 0
        for spec in SPECS:
            key = spec["match"].get("title_en") or spec["match"].get("source_url_suffix") or ""
            if only and only not in key:
                continue
            try:
                problem = match_problem(spec)
                if problem is None:
                    self.stdout.write(f"skip (no match): {key}")
                    skipped += 1
                    continue
                outputs, flips = validate_spec(spec)
            except SpecError as exc:
                self.stdout.write(self.style.ERROR(f"FAIL {key}: {exc}"))
                skipped += 1
                continue
            existing_inputs = set(
                TestCase.objects.filter(problem=problem).values_list("input_data", flat=True)
            )
            new_tests = [
                (stdin_text, expected)
                for stdin_text, expected in zip(spec["inputs"], outputs)
                if stdin_text not in existing_inputs
            ]
            label = (
                f"{problem.pk} '{key}': {len(new_tests)} new tests "
                f"({flips} verdict flips validated)"
            )
            if apply:
                with transaction.atomic():
                    self._apply_spec(problem, spec, new_tests, approve=not options["no_approve"])
            self.stdout.write(("applied: " if apply else "would apply: ") + label)
            done += 1
        suffix = "" if apply else " (dry-run)"
        self.stdout.write(self.style.SUCCESS(f"{done} specs processed, {skipped} skipped{suffix}"))

    def _apply_spec(self, problem, spec, new_tests, *, approve):
        problem.title_i18n = {
            **(problem.title_i18n or {}),
            **spec["title"],
        }
        problem.statement_i18n = {
            **(problem.statement_i18n or {}),
            **spec["statement"],
        }
        problem.reference_solution_code = spec["solution"]
        problem.reference_language = "python3"
        # The import pinned allowed_languages to cpp17 (pbinfo heritage);
        # the rewritten statement is language-neutral, so the pin goes.
        problem.allowed_languages = []
        if approve:
            problem.status = Problem.ProblemStatus.APPROVED
            if problem.verifier_id is None:
                problem.verifier = problem.author
        problem.save()
        if spec.get("replace_tests"):
            # The imported suite contradicted the statement (verified against
            # the statement's own sample) — drop it before laying down the
            # regenerated one.
            TestCase.objects.filter(problem=problem).delete()
        for stdin_text, expected in new_tests:
            TestCase.objects.create(
                problem=problem,
                input_data=stdin_text,
                expected_output_data=expected,
                is_sample=False,
                points=10,
            )
