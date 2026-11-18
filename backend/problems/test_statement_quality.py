"""Wave F — statement quality tests (items 121/123/124/134).

The statement linter, readability scoring, the translation sidecar report
and the wizard steps checklist.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from problems.statement_quality import (
    problem_readability,
    readability_score,
    statement_lint,
    translation_gaps,
)
from users.models import User


class QualityBase(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.verifier = User.objects.create_user(
            username="verifier", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.basic = User.objects.create_user(username="basic", password="pw")
        self.client = APIClient()
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={
                "en": "Read n numbers. Print their sum.",
                "ro": "Citește n numere. Afișează suma lor.",
            },
            status=Problem.ProblemStatus.DRAFT,
            author=self.author,
        )

    def mk_problem(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "T"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.DRAFT,
        )
        defaults.update(kwargs)
        return Problem.objects.create(**defaults)


class StatementLintTests(QualityBase):
    def test_sections_and_examples_warnings(self):
        problem = self.mk_problem(
            statement_i18n={"en": "Just read things and compute. No sections."}
        )
        warnings = statement_lint(problem)
        codes = [w["code"] for w in warnings]
        self.assertIn("missing_input_en", codes)
        self.assertIn("missing_output_en", codes)
        self.assertIn("missing_constraints_en", codes)
        self.assertIn("missing_examples_en", codes)

    def test_clean_statement_no_warnings(self):
        problem = self.mk_problem(
            statement_i18n={
                "en": (
                    "Input: n. Output: sum. Constraints: 1 <= n <= 10. "
                    "Example: 1 2 -> 3."
                ),
                "ro": (
                    "Input: n. Output: suma. Constraints: 1 <= n <= 10. "
                    "Exemplu: 1 2 -> 3."
                ),
            }
        )
        self.assertEqual(statement_lint(problem), [])

    def test_unbalanced_math(self):
        problem = self.mk_problem(
            statement_i18n={
                "en": "Compute $x + 1 for $n cases with $ extra. Input. Output. Example."
            }
        )
        codes = [w["code"] for w in statement_lint(problem)]
        self.assertIn("unbalanced_math_en", codes)

    def test_runaway_sentence(self):
        words = " ".join(["word"] * 80)
        problem = self.mk_problem(
            statement_i18n={"en": f"Input. Output. Constraints. Example. {words}."}
        )
        codes = [w["code"] for w in statement_lint(problem)]
        self.assertIn("runaway_sentence_en", codes)

    def test_statement_missing_but_title_present(self):
        problem = self.mk_problem(
            title_i18n={"en": "EN", "ro": "RO"}, statement_i18n={"en": "text"}
        )
        codes = [w["code"] for w in statement_lint(problem)]
        self.assertIn("statement_missing_ro", codes)

    def test_endpoint_gate_and_404(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/statement-lint/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.author)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/statement-lint/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("warnings", response.data)
        response = self.client.post("/api/v1/problems/problems/999999/statement-lint/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ReadabilityTests(QualityBase):
    def test_easy_english(self):
        result = readability_score("The cat sat on the mat. The dog ran.", "en")
        self.assertIsNotNone(result["score"])
        self.assertIn(result["band"], ("very_easy", "plain"))

    def test_difficult_english(self):
        text = (
            "Notwithstanding the preponderance of institutional arrangements, "
            "the amelioration of fundamental perceptual phenomena necessitates "
            "considerable methodological sophistication and rigorous analysis."
        )
        result = readability_score(text, "en")
        self.assertLess(result["score"], 40)

    def test_romanian_vowel_groups(self):
        result = readability_score(
            "Ana are mere. Ion citește o carte lungă și frumoasă.", "ro"
        )
        self.assertIsNotNone(result["score"])
        self.assertGreater(result["score"], 0)

    def test_empty_text(self):
        self.assertEqual(
            readability_score("", "en"),
            {
                "score": None,
                "band": None,
                "words": 0,
                "sentences": 0,
            },
        )

    def test_problem_report_consistency(self):
        problem = self.mk_problem(
            statement_i18n={
                "en": "Read n. Print the sum. Easy.",
                "ro": "Citește n. Afișează suma. Ușor.",
            }
        )
        report = problem_readability(problem)
        self.assertIn("en", report["locales"])
        self.assertIn("ro", report["locales"])
        self.assertIsNotNone(report["consistent"])

    def test_single_locale_report(self):
        problem = self.mk_problem(statement_i18n={"en": "Only english text here."})
        report = problem_readability(problem)
        self.assertIsNone(report["consistent"])

    def test_endpoint(self):
        self.client.force_authenticate(self.verifier)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/readability/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("locales", response.data)
        response = self.client.get("/api/v1/problems/problems/999999/readability/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.basic)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/readability/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class TranslationStatusTests(QualityBase):
    def test_full_coverage(self):
        problem = self.mk_problem(
            title_i18n={"en": "T", "ro": "T"},
            statement_i18n={"en": "body", "ro": "corp"},
            hints_en=["think"],
            hints_ro=["gândește"],
        )
        report = translation_gaps(problem)
        self.assertTrue(report["complete"])
        self.assertTrue(all(report["locales"]["ro"].values()))

    def test_gap_detection(self):
        report = translation_gaps(self.problem)  # no hints set
        self.assertFalse(report["complete"])
        self.assertFalse(report["locales"]["ro"]["hints"])

    def test_endpoint(self):
        self.client.force_authenticate(self.author)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/translation-status/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("fields", response.data)
        response = self.client.get(
            "/api/v1/problems/problems/999999/translation-status/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.basic)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/translation-status/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class WizardStepsTests(QualityBase):
    def test_steps_listing(self):
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/problems/wizard/steps/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 7)
        keys = [step["key"] for step in response.data["steps"]]
        self.assertEqual(keys[0], "basics")
        self.assertEqual(keys[-1], "review")

    def test_completion_probe(self):
        problem = self.mk_problem(
            title_i18n={"en": "T", "ro": "R"},
            statement_i18n={"en": "statement text", "ro": "text românesc"},
            default_time_limit_ms=1000,
            default_memory_limit_kb=262144,
            reference_solution_code="print(1)",
            reference_language="python3",
        )
        ProblemTestCase.objects.create(
            problem=problem,
            input_data="1",
            expected_output_data="2",
            is_sample=True,
            order=0,
        )
        ProblemTestCase.objects.create(
            problem=problem,
            input_data="2",
            expected_output_data="3",
            is_sample=True,
            order=1,
        )
        ProblemTestCase.objects.create(
            problem=problem, input_data="3", expected_output_data="4", order=2
        )
        self.client.force_authenticate(self.author)
        response = self.client.get(
            f"/api/v1/problems/wizard/steps/?problem_id={problem.id}"
        )
        self.assertEqual(response.status_code, 200)
        by_key = {step["key"]: step["complete"] for step in response.data["steps"]}
        self.assertTrue(by_key["basics"])
        self.assertTrue(by_key["limits"])
        self.assertTrue(by_key["samples"])
        self.assertTrue(by_key["tests"])
        self.assertTrue(by_key["reference"])
        self.assertTrue(by_key["translation"])
        self.assertFalse(by_key["review"])  # still DRAFT

    def test_gate_and_unknown_problem(self):
        response = self.client.get("/api/v1/problems/wizard/steps/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.basic)
        response = self.client.get("/api/v1/problems/wizard/steps/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/problems/wizard/steps/?problem_id=999999")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class BandEdgeTests(QualityBase):
    def test_very_difficult_band(self):
        # Dense polysyllabic text scores < 20 -> very_difficult.
        text = (
            "Interdisciplinary methodological considerations notwithstanding, "
            "quintessential institutional amelioration necessitates considerable "
            "sophistication, notwithstanding preponderating perceptual phenomena."
        )
        result = readability_score(text, "en")
        self.assertEqual(result["band"], "very_difficult")
        self.assertLess(result["score"], 20)

    def test_difficult_band(self):
        # Moderately dense text lands in the 20-40 "difficult" band.
        text = (
            "Scientists discovered a new method last year. The technique helps "
            "farmers grow more food. The evaluation demonstrated considerable "
            "improvement across agriculture."
        )
        result = readability_score(text, "en")
        self.assertEqual(result["band"], "difficult")

    def test_unknown_wizard_key_returns_false(self):
        from problems.statement_quality_views import _step_complete

        self.assertFalse(_step_complete("nonexistent", self.problem))
