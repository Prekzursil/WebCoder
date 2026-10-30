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
