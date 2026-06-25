"""Full line+branch coverage for judge_utils.comparison.compare_outputs."""

from django.test import TestCase

from submissions.judge_utils.comparison import compare_outputs


class CompareOutputsTest(TestCase):
    def test_exact_match(self):
        self.assertTrue(compare_outputs("abc", "abc", "EXACT"))
        self.assertFalse(compare_outputs("abc ", "abc", "EXACT"))

    def test_strip_exact(self):
        self.assertTrue(compare_outputs("  abc  ", "abc", "STRIP_EXACT"))
        self.assertFalse(compare_outputs("a b", "ab", "STRIP_EXACT"))

    def test_lines_strip_exact_match_with_crlf_and_trailing_blanks(self):
        gen = "line1 \r\n line2\n\n"
        exp = "line1\nline2"
        self.assertTrue(compare_outputs(gen, exp, "LINES_STRIP_EXACT"))

    def test_lines_strip_exact_mismatch(self):
        self.assertFalse(
            compare_outputs("line1\nline2", "line1\nlineX", "LINES_STRIP_EXACT")
        )

    def test_float_precise_within_epsilon(self):
        self.assertTrue(compare_outputs("1.0000001", "1.0", "FLOAT_PRECISE", 1e-3))

    def test_lines_strip_exact_no_trailing_blank(self):
        # Neither side has a trailing empty line -> the `while ... pop()` loop
        # conditions are immediately false (covers those branch arms).
        self.assertTrue(compare_outputs("a\nb", "a\nb", "LINES_STRIP_EXACT"))

    def test_lines_strip_exact_expected_has_trailing_blanks(self):
        # Expected side has trailing blanks while generated does not -> exercises
        # the exp_lines `while ... pop()` true arm.
        self.assertTrue(compare_outputs("a\nb", "a\nb\n\n", "LINES_STRIP_EXACT"))

    def test_float_precise_expected_has_trailing_blanks(self):
        self.assertTrue(compare_outputs("1.0", "1.0\n\n", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_generated_has_trailing_blanks(self):
        # Generated side has trailing blanks -> exercises the gen_lines pop loop
        # body inside the FLOAT_PRECISE branch.
        self.assertTrue(compare_outputs("1.0\n\n", "1.0", "FLOAT_PRECISE", 1e-6))

    def test_unknown_mode_no_trailing_blank(self):
        self.assertTrue(compare_outputs("a\nb", "a\nb", "UNKNOWN_MODE_NO_BLANK"))

    def test_unknown_mode_expected_trailing_blanks(self):
        self.assertTrue(compare_outputs("a\nb", "a\nb\n\n", "UNKNOWN_MODE_BLANK"))

    def test_float_precise_none_epsilon_defaults(self):
        # float_epsilon=None branch -> defaults to 1e-6, exact equality passes.
        self.assertTrue(compare_outputs("2.0", "2.0", "FLOAT_PRECISE", None))

    def test_float_precise_outside_epsilon(self):
        self.assertFalse(compare_outputs("1.5", "1.0", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_line_count_mismatch(self):
        self.assertFalse(compare_outputs("1.0\n2.0", "1.0", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_token_count_mismatch(self):
        self.assertFalse(compare_outputs("1.0 2.0", "1.0", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_non_numeric_tokens_equal(self):
        self.assertTrue(compare_outputs("yes 1.0", "yes 1.0", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_non_numeric_tokens_differ(self):
        self.assertFalse(compare_outputs("yes 1.0", "no 1.0", "FLOAT_PRECISE", 1e-6))

    def test_float_precise_exception_returns_false(self):
        # Force an exception inside the try block by passing a non-string that
        # has no .replace -> hits the broad except + print path.
        class Boom:
            def replace(self, *_):
                raise RuntimeError("boom")

        self.assertFalse(
            compare_outputs(Boom(), "1.0", "FLOAT_PRECISE", 1e-6)  # type: ignore[arg-type]
        )

    def test_unknown_mode_defaults_to_lines_strip(self):
        # Falls through every elif to the trailing default LINES_STRIP behavior.
        self.assertTrue(compare_outputs("a \nb\n\n", "a\nb", "SOME_UNKNOWN_MODE"))
        self.assertFalse(compare_outputs("a\nb", "a\nc", "SOME_UNKNOWN_MODE"))
