"""Wave E — partial-code problems: template parsing, the locked-region
integrity policy, authoring-time validation, the submit-time 400 gate,
and the judge-time defense-in-depth re-check."""

from django.test import TestCase
from rest_framework.test import APIClient

from problems.code_template import (
    TemplateError,
    parse_template,
    verify_locked_integrity,
)
from problems.models import Problem
from problems.serializers import ProblemSerializer
from submissions.models import Submission
from submissions.tasks import judge_submission_task
from users.models import User

CPP_TEMPLATE = """#include <cstdio>

int sum_digits(int n) {
    // WC_EDIT_START
    // WC_EDIT_END
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", sum_digits(n));
    return 0;
}
"""

CPP_SOLUTION = """#include <cstdio>

int sum_digits(int n) {
    // WC_EDIT_START
    int total = 0;
    while (n > 0) { total += n % 10; n /= 10; }
    return total;
    // WC_EDIT_END
}

int main() {
    int n;
    scanf("%d", &n);
    printf("%d\\n", sum_digits(n));
    return 0;
}
"""


class ParseTemplateTests(TestCase):
    def test_splits_locked_and_editable_segments(self):
        segments = parse_template(CPP_TEMPLATE)
        self.assertTrue(any(seg.locked for seg in segments))
        self.assertTrue(any(not seg.locked for seg in segments))
        # Locked scaffolding keeps its exact text (includes/main).
        joined = "".join(seg.text for seg in segments if seg.locked)
        self.assertIn("#include <cstdio>", joined)
        self.assertIn("int main() {", joined)

    def test_empty_template_is_empty(self):
        self.assertEqual(parse_template(""), [])
        self.assertEqual(parse_template(None), [])

    def test_unclosed_start_rejected(self):
        with self.assertRaises(TemplateError):
            parse_template("a\nWC_EDIT_START\nb\n")

    def test_end_without_start_rejected(self):
        with self.assertRaises(TemplateError):
            parse_template("a\nWC_EDIT_END\n")

    def test_nested_start_rejected(self):
        with self.assertRaises(TemplateError):
            parse_template("WC_EDIT_START\nWC_EDIT_START\nWC_EDIT_END\n")

    def test_no_editable_region_rejected(self):
        with self.assertRaises(TemplateError):
            parse_template("int main() {}\n")

    def test_multiple_editable_regions_supported(self):
        template = "a\nWC_EDIT_START\nb\nWC_EDIT_END\nc\nWC_EDIT_START\nd\nWC_EDIT_END\ne\n"
        segments = parse_template(template)
        self.assertEqual([seg.locked for seg in segments], [True, False, True, False, True])

    def test_oversized_template_rejected(self):
        with self.assertRaises(TemplateError):
            parse_template("WC_EDIT_START\n" + "x" * 100_001 + "\nWC_EDIT_END\n")


class IntegrityPolicyTests(TestCase):
    """The documented whitespace policy + tamper detection."""

    def test_faithful_solution_passes(self):
        ok, msg = verify_locked_integrity(CPP_TEMPLATE, CPP_SOLUTION)
        self.assertTrue(ok, msg)

    def test_locked_line_edited_rejected_with_line_number(self):
        tampered = CPP_SOLUTION.replace("return 0;", "return 1;")
        ok, msg = verify_locked_integrity(CPP_TEMPLATE, tampered)
        self.assertFalse(ok)
        self.assertIn("Locked region modified", msg)
        self.assertIn("return 0;", msg)

    def test_locked_region_deleted_rejected(self):
        tampered = CPP_SOLUTION.replace("int main() {", "")
        ok, _msg = verify_locked_integrity(CPP_TEMPLATE, tampered)
        self.assertFalse(ok)

    def test_scaffolding_reordered_rejected(self):
        # main moved above the function: locked order matters.
        head, tail = CPP_SOLUTION.split("int main() {", 1)
        tampered = "int main() {" + tail + head
        ok, _msg = verify_locked_integrity(CPP_TEMPLATE, tampered)
        self.assertFalse(ok)

    def test_crlf_and_trailing_whitespace_tolerated(self):
        # The documented policy: CRLF -> LF, per-line trailing ws ignored,
        # trailing newline optional.
        crlf = CPP_SOLUTION.replace("\n", "   \r\n")
        ok, msg = verify_locked_integrity(CPP_TEMPLATE, crlf)
        self.assertTrue(ok, msg)
        ok2, _ = verify_locked_integrity(CPP_TEMPLATE, CPP_SOLUTION.rstrip("\n"))
        self.assertTrue(ok2)

    def test_empty_submission_rejected(self):
        ok, _msg = verify_locked_integrity(CPP_TEMPLATE, "")
        self.assertFalse(ok)

    def test_broken_template_reported_as_broken_problem(self):
        ok, msg = verify_locked_integrity("WC_EDIT_START\nx\n", "anything")
        self.assertFalse(ok)
        self.assertIn("Broken problem template", msg)


class TemplateAuthoringTests(TestCase):
    def _serializer(self, **extra):
        data = {
            "title_i18n": {"en": "T"},
            "statement_i18n": {"en": "S"},
            "code_template": CPP_TEMPLATE,
            "code_template_language": "cpp17",
        }
        data.update(extra)
        return ProblemSerializer(data=data)

    def test_valid_template_authoring_round_trip(self):
        serializer = self._serializer()
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = User.objects.create_user(
            username="tplauthor", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        problem = serializer.save(author=user)
        self.assertEqual(problem.code_template_language, "cpp17")

    def test_template_without_language_rejected(self):
        serializer = self._serializer(code_template_language="")
        self.assertFalse(serializer.is_valid())
        self.assertIn("code_template_language", str(serializer.errors))

    def test_unknown_template_language_rejected(self):
        serializer = self._serializer(code_template_language="cobol")
        self.assertFalse(serializer.is_valid())

    def test_blank_template_passes_through(self):
        serializer = self._serializer(code_template="", code_template_language="")
        self.assertTrue(serializer.is_valid(), serializer.errors)

    def test_malformed_template_rejected_at_authoring(self):
        serializer = self._serializer(code_template="WC_EDIT_START\nno close\n")
        self.assertFalse(serializer.is_valid())
        self.assertIn("code_template", str(serializer.errors))


class SubmitTimeTemplateGateTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="tplsub", password="p")
        self.client.force_authenticate(self.user)
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum digits (template)"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            code_template=CPP_TEMPLATE,
            code_template_language="cpp17",
        )

    def _submit(self, code, language="cpp17"):
        from unittest import mock

        with mock.patch("submissions.views.judge_task"):
            return self.client.post(
                "/api/v1/submissions/submit/",
                {"problem": self.problem.id, "language": language, "code": code},
                format="json",
            )

    def test_faithful_solution_accepted(self):
        resp = self._submit(CPP_SOLUTION)
        self.assertEqual(resp.status_code, 201, resp.data)

    def test_tampered_scaffold_rejected_with_400(self):
        tampered = CPP_SOLUTION.replace("return 0;", "return 1;")
        resp = self._submit(tampered)
        self.assertEqual(resp.status_code, 400)
        self.assertIn("Locked region modified", str(resp.data))

    def test_wrong_language_rejected(self):
        resp = self._submit(CPP_SOLUTION, language="python3")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("partial-code problem", str(resp.data))


class JudgeTimeTemplateTests(TestCase):
    """Defense in depth: judge re-verifies even without the API gate."""

    def test_tampered_scaffolding_short_circuits_to_compile_error(self):
        user = User.objects.create_user(username="tpljt", password="p")
        problem = Problem.objects.create(
            title_i18n={"en": "T"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            code_template=CPP_TEMPLATE,
            code_template_language="cpp17",
        )
        submission = Submission.objects.create(
            user=user,
            problem=problem,
            language="cpp17",
            code=CPP_SOLUTION.replace("scanf", "cin"),  # locked tamper
        )
        judge_submission_task.run(submission.id)
        submission.refresh_from_db()
        self.assertEqual(
            submission.verdict, Submission.VerdictStatus.COMPILE_ERROR
        )
        self.assertIn("Template integrity", submission.detailed_feedback)


class CoverageCompletenessTests(TestCase):
    """Branch gates for the template matcher's edge arms."""

    def test_trailing_editable_hole_with_empty_locked_tail(self):
        # Head is empty (skipped), the hole is the only real segment, the
        # tail after END is blank -> the trailing-hole arm returns True.
        template = "# WC_EDIT_START\nyour code\n# WC_EDIT_END\n"
        ok, msg = verify_locked_integrity(template, "anything at all")
        self.assertTrue(ok, msg)

    def test_empty_locked_head_is_skipped(self):
        template = "WC_EDIT_START\nx\nWC_EDIT_END\nint main() {}\n"
        ok, _msg = verify_locked_integrity(
            template, "replacement code\nint main() {}\n"
        )
        self.assertTrue(ok)

    def test_locked_lines_present_but_misordered_names_fallback(self):
        # Every locked line exists somewhere, but not where the walk needs
        # it -> the generic mismatch fallback message.
        template = (
            "#include <cstdio>\n"
            "// WC_EDIT_START\n// WC_EDIT_END\n"
            "int a() { return 1; }\n"
            "int b() { return 2; }\n"
        )
        misordered = (
            "int b() { return 2; }\n"
            "#include <cstdio>\n"
            "// WC_EDIT_START\nfiller\n// WC_EDIT_END\n"
            "int a() { return 1; }\n"
        )
        ok, msg = verify_locked_integrity(template, misordered)
        self.assertFalse(ok)
        self.assertTrue(
            "does not match" in msg or "Locked region" in msg or "missing" in msg,
            msg,
        )

    def test_faithful_template_submission_judges_normally(self):
        """The judge path with a VALID template runs the full pipeline
        (branch: template present + integrity passes)."""
        from unittest import mock

        TASKS = "submissions.tasks"
        user = User.objects.create_user(username="tplfull", password="p")
        problem = Problem.objects.create(
            title_i18n={"en": "T"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            code_template=CPP_TEMPLATE,
            code_template_language="cpp17",
        )
        submission = Submission.objects.create(
            user=user,
            problem=problem,
            language="cpp17",
            code=CPP_SOLUTION,
        )
        with (
            mock.patch(
                f"{TASKS}.compile_code_in_sandbox",
                return_value=(True, "ok", "/tmp/user_program"),
            ),
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(
                    Submission.VerdictStatus.ACCEPTED,
                    5,
                    1024,
                    "15",
                    "",
                ),
            ),
        ):
            judge_submission_task.run(submission.id)
        submission.refresh_from_db()
        self.assertEqual(submission.verdict, Submission.VerdictStatus.ACCEPTED)


class OrderedMatcherUnitTests(TestCase):
    """Direct gates for _verify_ordered's defensive arms (empty locked
    segments never come out of parse_template, but the matcher tolerates
    them by contract)."""

    def test_empty_locked_segments_are_skipped(self):
        from problems.code_template import Segment, _verify_ordered

        segments = [
            Segment(True, ""),
            Segment(False, "hole"),
            Segment(True, "int main() {}\n"),
        ]
        ok, _msg = _verify_ordered(segments, "edited hole\nint main() {}\n")
        self.assertTrue(ok)

    def test_locked_missing_at_cursor_reports_first_diff(self):
        from problems.code_template import Segment, _verify_ordered

        segments = [
            Segment(True, "int a() { return 1; }\n"),
            Segment(False, "hole"),
            Segment(True, "int b() { return 2; }\n"),
        ]
        # The cursor reaches the tail but the text there was edited.
        ok, msg = _verify_ordered(
            segments, "int a() { return 1; }\nhole\nint b() { return 3; }\n"
        )
        self.assertFalse(ok)
        self.assertIn("return 2", msg)

    def test_consecutive_locked_segments_walk_into_mismatch(self):
        """Two locked segments back-to-back: the cursor lands where the
        second must begin; garbage in between trips the startswith arm."""
        from problems.code_template import Segment, _verify_ordered

        segments = [
            Segment(True, "int a() {}\n"),
            Segment(True, "int b() {}\n"),
        ]
        ok, msg = _verify_ordered(segments, "int a() {}\ngarbage\nint b() {}\n")
        self.assertFalse(ok)
        # Every locked line exists somewhere (out of place) -> the generic
        # mismatch fallback names the scaffolding requirement.
        self.assertIn("does not match", msg)