"""Unit tests for the dependency-free PDF writer (problems/pdf_bundle.py)."""

from django.test import TestCase

from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from problems.pdf_bundle import (
    MAX_CHARS_PER_LINE,
    _escape,
    _wrap,
    build_pdf,
    problem_bundle_pdf,
)


class EscapeTests(TestCase):
    def test_escapes_pdf_parens_and_backslash(self):
        self.assertEqual(_escape("a(b)c"), "a\\(b\\)c")
        self.assertEqual(_escape("back\\slash"), "back\\\\slash")

    def test_non_latin1_replaced(self):
        self.assertEqual(_escape("șăÎ"), "??Î")
        self.assertEqual(_escape("plain"), "plain")


class WrapTests(TestCase):
    def test_short_lines_preserved(self):
        self.assertEqual(_wrap("one\ntwo"), ["one", "two"])

    def test_long_line_wraps_on_words(self):
        wrapped = _wrap("word " * 40)
        self.assertTrue(all(len(line) <= MAX_CHARS_PER_LINE for line in wrapped))
        self.assertGreater(len(wrapped), 1)

    def test_single_long_word_kept(self):
        wrapped = _wrap("x" * 200)
        self.assertEqual(wrapped, ["x" * 200])

    def test_empty_text(self):
        self.assertEqual(_wrap(""), [""])


class BuildPdfTests(TestCase):
    def test_valid_pdf_skeleton(self):
        pdf = build_pdf([("Title", "Body line")])
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Type /Catalog", pdf)
        self.assertIn(b"/Type /Pages", pdf)
        self.assertIn(b"/Count 1", pdf)
        self.assertIn(b"/F2 14.0 Tf", pdf)  # heading font + size
        self.assertIn(b"(Body line) Tj", pdf)
        self.assertTrue(pdf.rstrip().endswith(b"%%EOF"))
        xref_at = int(pdf.rsplit(b"startxref", 1)[1].split()[0])
        self.assertEqual(pdf[xref_at : xref_at + 4], b"xref")

    def test_multiple_pages(self):
        pdf = build_pdf([("Section", "\n".join(f"line {i}" for i in range(200)))])
        self.assertIn(b"/Count 4", pdf)

    def test_empty_sections_renders_blank_page(self):
        pdf = build_pdf([])
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        self.assertIn(b"/Count 1", pdf)

    def test_escaped_content(self):
        pdf = build_pdf([("T", "a(b)")])
        self.assertIn(b"\\(", pdf)


def _problem(**kw):
    defaults = dict(
        title_i18n={"en": "Sum", "ro": "Suma"},
        statement_i18n={"en": "Add numbers.", "ro": "Adunați numerele."},
        status=Problem.ProblemStatus.APPROVED,
    )
    defaults.update(kw)
    return Problem.objects.create(**defaults)


class ProblemBundlePdfTests(TestCase):
    def test_full_bundle(self):
        problem = _problem(
            source_contest="OJI 2024",
            source_year=2024,
            grade_group="IX-X",
        )
        ProblemTestCase.objects.create(
            problem=problem,
            input_data="1 2",
            expected_output_data="3",
            is_sample=True,
            points=10,
        )
        pdf = problem_bundle_pdf(problem, problem.test_cases.all())
        self.assertTrue(pdf.startswith(b"%PDF-1.4"))
        # Headings are PDF-escaped (parens) inside the content stream.
        escaped_en = "(Statement \\(EN\\)) Tj".encode()
        escaped_ro = "(Statement \\(RO\\)) Tj".encode()
        self.assertIn(escaped_en, pdf)
        self.assertIn(escaped_ro, pdf)
        self.assertIn(b"(Limits) Tj", pdf)
        self.assertIn(b"(Provenance) Tj", pdf)
        self.assertIn(b"(Sample 1) Tj", pdf)
        self.assertIn(b"(OJI 2024 2024 IX-X) Tj", pdf)

    def test_no_provenance_section_when_plain(self):
        problem = _problem()
        pdf = problem_bundle_pdf(problem, [])
        self.assertNotIn(b"(Provenance) Tj", pdf)

    def test_title_fallback_to_first_available(self):
        problem = _problem(title_i18n={"ro": "Doar română"})
        pdf = problem_bundle_pdf(problem, [])
        self.assertIn(b"Doar", pdf)


class PaginationBoundaryTests(TestCase):
    """The section-heading page-break path (build_pdf lines 68-70)."""

    def test_new_section_flushes_full_page(self):
        # One full page of body lines, then a second section whose heading
        # lands past the page capacity -> the heading opens page 2.
        first_body = "\n".join(f"l{i}" for i in range(50))
        pdf = build_pdf([("A", first_body), ("B", "tail")])
        self.assertIn(b"/Count 2", pdf)
        self.assertIn(b"(B) Tj", pdf)


class MissingStatementLocaleTests(TestCase):
    def test_empty_ro_statement_skips_section(self):
        problem = _problem(statement_i18n={"en": "Only EN.", "ro": ""})
        pdf = problem_bundle_pdf(problem, [])
        # Headings are paren-escaped inside the PDF content stream.
        self.assertIn("(Statement \(EN\)) Tj".encode(), pdf)
        self.assertNotIn("(Statement \(RO\)) Tj".encode(), pdf)
