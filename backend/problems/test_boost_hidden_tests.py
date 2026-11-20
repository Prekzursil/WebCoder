"""boost_hidden_tests command (2026-11-20 sweep): spec validation, verdict
flip, idempotent testcase creation, statement rewrite + approval.
"""

from io import StringIO

import pytest
from django.core.management import call_command

from problems.data.hidden_test_specs import SPECS
from problems.management.commands.boost_hidden_tests import (
    SpecError,
    match_problem,
    run_solution,
    validate_spec,
)
from problems.models import Problem, TestCase
from users.models import User

pytestmark = pytest.mark.django_db


def run(*args):
    out = StringIO()
    call_command(*args, stdout=out)
    return out.getvalue()


@pytest.fixture
def admin():
    return User.objects.create_user(username="boost_admin", password="pw-12345678")


def make_problem(title, *, author, statement=None):
    return Problem.objects.create(
        title_i18n={"en": title},
        statement_i18n=statement or {"en": f"# {title}\n\nold"},
        status=Problem.ProblemStatus.PENDING_APPROVAL,
        author=author,
    )


CALC_SPEC = {
    "match": {"title_en": "SpecCalc"},
    "title": {"en": "Spec Calc", "ro": "Calcul de probă"},
    "statement": {"en": "# Spec Calc\n\nnew body", "ro": "# Calcul de probă\n\ncorp nou"},
    "solution": "import sys\nprint(int(sys.stdin.readline()) * 2)\n",
    "inputs": ["3\n", "0\n", "-7\n"],
}


class TestSpecValidation:
    def test_reference_and_flip_counts(self):
        outputs, flips = validate_spec(CALC_SPEC)
        assert outputs == ["6\n", "0\n", "-14\n"]
        assert flips == 3  # default wrong solution (12345) misses all three

    def test_wrong_solution_crash_counts_as_flips(self):
        spec = dict(CALC_SPEC, wrong_solution="import sys\n1/0\n")
        _, flips = validate_spec(spec)
        assert flips == 3

    def test_no_flip_aborts(self):
        spec = dict(CALC_SPEC, wrong_solution=CALC_SPEC["solution"])
        with pytest.raises(SpecError, match="wrong solution passes"):
            validate_spec(spec)

    def test_crashing_reference_raises(self):
        spec = dict(CALC_SPEC, solution="import sys\nnope\n")
        with pytest.raises(SpecError, match="crashed"):
            validate_spec(spec)

    def test_empty_inputs_rejected(self):
        with pytest.raises(SpecError, match="no inputs"):
            validate_spec(dict(CALC_SPEC, inputs=[]))

    def test_run_solution_normalizes_trailing_newline(self):
        code = "print('x', end='')"
        assert run_solution(code, "") == "x\n"

    def test_timeout_is_spec_error(self, monkeypatch):
        import subprocess as sp

        def slow(*a, **k):
            raise sp.TimeoutExpired(cmd="x", timeout=0.01)

        monkeypatch.setattr("problems.management.commands.boost_hidden_tests.subprocess.run", slow)
        with pytest.raises(SpecError, match="timed out"):
            run_solution("print(1)", "")


class TestCommand:
    @pytest.fixture(autouse=True)
    def _use_calc_spec(self, monkeypatch):
        # The command iterates the committed spec list; point it at the
        # in-test spec so these tests never depend on catalog contents.
        monkeypatch.setattr(
            "problems.management.commands.boost_hidden_tests.SPECS", [CALC_SPEC]
        )

    def test_dry_run_creates_nothing(self, admin):
        make_problem("SpecCalc", author=admin)
        out = run("boost_hidden_tests", "--only", "SpecCalc")
        assert "would apply" in out
        assert TestCase.objects.count() == 0

    def test_apply_rewrites_and_creates_tests(self, admin):
        problem = make_problem("SpecCalc", author=admin)
        out = run("boost_hidden_tests", "--only", "SpecCalc", "--apply")
        assert "3 new tests (3 verdict flips validated)" in out
        problem.refresh_from_db()
        assert problem.title_i18n["en"] == "Spec Calc"
        assert problem.title_i18n["ro"] == "Calcul de probă"
        assert "new body" in problem.statement_i18n["en"]
        assert problem.status == Problem.ProblemStatus.APPROVED
        assert problem.verifier == problem.author
        assert problem.reference_solution_code == CALC_SPEC["solution"]
        assert problem.reference_language == "python3"
        assert problem.allowed_languages == []
        rows = TestCase.objects.filter(problem=problem).order_by("input_data")
        assert [(r.input_data, r.expected_output_data, r.is_sample) for r in rows] == [
            ("-7\n", "-14\n", False),
            ("0\n", "0\n", False),
            ("3\n", "6\n", False),
        ]

    def test_apply_no_approve_keeps_status(self, admin):
        problem = make_problem("SpecCalc", author=admin)
        run("boost_hidden_tests", "--only", "SpecCalc", "--apply", "--no-approve")
        problem.refresh_from_db()
        assert problem.status == Problem.ProblemStatus.PENDING_APPROVAL

    def test_idempotent_rerun_adds_no_duplicates(self, admin):
        problem = make_problem("SpecCalc", author=admin)
        run("boost_hidden_tests", "--only", "SpecCalc", "--apply")
        # The retitle means the second run no longer matches the OLD title;
        # nothing is created twice either way.
        out = run("boost_hidden_tests", "--only", "SpecCalc")
        assert "skip (no match)" in out
        assert TestCase.objects.filter(problem=problem).count() == 3

    def test_existing_input_not_duplicated(self, admin):
        problem = make_problem("SpecCalc", author=admin)
        TestCase.objects.create(
            problem=problem, input_data="3\n", expected_output_data="6\n", points=10
        )
        out = run("boost_hidden_tests", "--only", "SpecCalc", "--apply")
        assert "2 new tests" in out
        assert TestCase.objects.filter(problem=problem).count() == 3

    def test_no_match_reported(self, admin):
        out = run("boost_hidden_tests", "--only", "SpecCalc")
        assert "skip (no match): SpecCalc" in out

    def test_replace_tests_drops_bad_imported_suite(self, admin, monkeypatch):
        problem = make_problem("SpecCalc", author=admin)
        TestCase.objects.create(
            problem=problem, input_data="9\n", expected_output_data="WRONG\n", points=10
        )
        monkeypatch.setattr(
            "problems.management.commands.boost_hidden_tests.SPECS",
            [dict(CALC_SPEC, replace_tests=True)],
        )
        run("boost_hidden_tests", "--apply")
        inputs = set(TestCase.objects.filter(problem=problem).values_list("input_data", flat=True))
        assert inputs == {"3\n", "0\n", "-7\n"}  # the bad row is gone

    def test_match_by_url_suffix(self, admin):
        problem = make_problem("Whatever", author=admin)
        problem.source_url = "https://example.org/problems/no/1234"
        problem.save()
        spec = dict(CALC_SPEC, match={"source_url_suffix": "no/1234"})
        assert match_problem(spec).pk == problem.pk


class TestCommittedSpecs:
    def test_every_committed_spec_validates(self):
        # The committed payload is the contract: every spec must run, and
        # every spec's wrong solution must flip at least one verdict.
        for spec in SPECS:
            outputs, flips = validate_spec(spec)
            assert outputs, spec["match"]
            assert flips >= 1, f"{spec['match']} never flips a wrong verdict"

    def test_spec_shape(self):
        for spec in SPECS:
            assert set(spec) >= {"match", "title", "statement", "solution", "inputs"}
            assert spec["title"].get("en") and spec["title"].get("ro")
            assert spec["statement"].get("en") and spec["statement"].get("ro")
            for locale, text in spec["statement"].items():
                assert "{TITLE_" not in text, (spec["match"], locale)
