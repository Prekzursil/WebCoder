"""JDG-9 (competitive roadmap): the judge registry exposed as public
toolchain docs (/help/judge reads exactly what the sandbox runs)."""

from django.test import TestCase
from rest_framework.test import APIClient

from submissions.judge_utils.languages import LANGUAGES


class PublicLanguagesTest(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_lists_the_full_registry(self):
        resp = self.client.get("/api/v1/public/languages/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], len(LANGUAGES))
        ids = {row["id"] for row in data["results"]}
        self.assertEqual(ids, set(LANGUAGES))
        # Sorted for stable docs.
        self.assertEqual(
            [row["id"] for row in data["results"]],
            sorted(row["id"] for row in data["results"]),
        )

    def test_row_shape_matches_the_specs(self):
        resp = self.client.get("/api/v1/public/languages/")
        rows = {row["id"]: row for row in resp.json()["results"]}
        py = rows["python3"]
        self.assertEqual(py["name"], "Python 3")
        self.assertEqual(py["compile_command"], [])  # interpreted
        self.assertTrue(py["run_command"])
        cpp = rows["cpp17"]
        self.assertTrue(cpp["compile_command"])  # compiled toolchain

    def test_root_directory_lists_languages(self):
        resp = self.client.get("/api/v1/public/")
        self.assertIn("/api/v1/public/languages/", resp.json()["endpoints"])

    def test_rows_expose_fairness_multipliers(self):
        """Language-fair limits (J5): the public registry carries the exact
        multipliers/floors the judge applies, so the creator form, problem
        page and /help/judge can never drift from the sandbox."""
        resp = self.client.get("/api/v1/public/languages/")
        rows = {row["id"]: row for row in resp.json()["results"]}
        self.assertEqual(rows["python3"]["time_multiplier"], 3.0)
        self.assertEqual(rows["python3"]["memory_multiplier"], 1.5)
        self.assertEqual(rows["java11"]["memory_floor_kb"], 524288)
        self.assertEqual(rows["cpp17"]["time_multiplier"], 1.0)
        self.assertEqual(rows["rust"]["time_multiplier"], 1.0)
        # Checker capability is part of the contract surface too.
        self.assertFalse(rows["go"]["checker_capable"])
        self.assertTrue(rows["python3"]["checker_capable"])
