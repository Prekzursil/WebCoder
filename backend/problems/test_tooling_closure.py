"""Wave C closure tests: JDG-11 remainder (validator runner, expected-output
generation, Kattis/Polygon package import) + RO-6 (archive browse axis,
ledger publication gate, offline PDF bundle)."""

import base64
import io
import zipfile
from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import ImportSource, Problem
from problems.models import TestCase as ProblemTestCase
from problems import tooling
from users.models import User


def _mk_problem(title, **kw):
    problem = Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "s", "ro": "s"},
        status=kw.pop("status", Problem.ProblemStatus.APPROVED),
        **kw,
    )
    ProblemTestCase.objects.create(
        problem=problem,
        input_data="1",
        expected_output_data="2",
        points=10,
        is_sample=True,
    )
    return problem


class ClosureBase(TestCase):
    def setUp(self):
        from django.core.cache import cache

        cache.clear()
        self.admin = User.objects.create_user(
            username="cl_admin", password="pw", role=User.Roles.ADMIN
        )
        self.verifier = User.objects.create_user(
            username="cl_verif", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.creator = User.objects.create_user(
            username="cl_creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.student = User.objects.create_user(username="cl_stud", password="pw")
        self.client = APIClient()


# ---------------------------------------------------------------------------
# JDG-11: validator runner
# ---------------------------------------------------------------------------


class ValidatorRunTests(ClosureBase):
    def payload(self):
        return {
            "generator_language": "python3",
            "generator_code": "print(3)",
            "validator_language": "python3",
            "validator_code": "exit(0)",
            "iterations": 3,
        }

    def test_role_gate(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            "/api/v1/problems/tools/validate/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_language_rejected(self):
        self.client.force_authenticate(self.creator)
        bad = self.payload()
        bad["validator_language"] = "cobol"
        response = self.client.post(
            "/api/v1/problems/tools/validate/", bad, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cobol", str(response.data["validator_language"]))

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_all_valid(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        calls = iter(
            [
                ("AC", 10, 1024, "3\n", ""),  # generator
                ("AC", 10, 1024, "", ""),  # validator exit 0
            ]
            * 10
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/validate/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["valid"])
        self.assertEqual(response.data["iterations"], 3)
        self.assertIsNone(response.data["violation"])

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_first_violation_surfaced(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        calls = iter(
            [
                ("AC", 10, 1024, "42\n", ""),  # generator
                ("RE", 10, 1024, "", "n too big"),  # validator rejects
            ]
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            "/api/v1/problems/tools/validate/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["valid"])
        self.assertEqual(response.data["violation"]["phase"], "validator")
        self.assertEqual(response.data["violation"]["input"], "42\n")
        self.assertEqual(response.data["violation"]["message"], "n too big")

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_generator_crash(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        run_mock.return_value = ("RE", 10, 1024, "", "boom")
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/validate/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["violation"]["phase"], "generator")

    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_compile_failure_returns_compiler_text(self, compile_mock):
        compile_mock.return_value = (False, "SyntaxError: bad", None)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/validate/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # The generator compiles first, so its diagnostics come back first.
        self.assertIn("SyntaxError", str(response.data["generator_code"]))


# ---------------------------------------------------------------------------
# JDG-11: expected-output generation
# ---------------------------------------------------------------------------


class GenerateOutputsTests(ClosureBase):
    def payload(self):
        return {
            "reference_language": "python3",
            "reference_code": "print(int(input())*2)",
            "inputs": ["1", "2"],
        }

    def test_role_gate(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_reference_language(self):
        self.client.force_authenticate(self.creator)
        bad = self.payload()
        bad["reference_language"] = "cobol"
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", bad, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_inputs_and_generator(self):
        self.client.force_authenticate(self.creator)
        bad = self.payload()
        del bad["inputs"]
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", bad, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_explicit_inputs_happy_path(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        calls = iter(
            [
                ("AC", 10, 1024, "2\n", ""),
                ("AC", 10, 1024, "4\n", ""),
            ]
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 2)
        self.assertEqual(response.data["results"][0]["output"], "2\n")
        self.assertEqual(response.data["results"][1]["input"], "2")

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_non_ac_reference_reported_per_input(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        run_mock.return_value = ("TLE", 10, 1024, "", "slow")
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["results"][0]["verdict"], "TLE")
        self.assertEqual(response.data["results"][0]["message"], "slow")

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_generator_batch_mode(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        calls = iter(
            [
                ("AC", 10, 1024, "9\n", ""),  # generator
                ("AC", 10, 1024, "18\n", ""),  # reference
            ]
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        payload = {
            "reference_language": "python3",
            "reference_code": "print(int(input())*2)",
            "generator_language": "python3",
            "generator_code": "print(9)",
            "count": 1,
        }
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", payload, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["output"], "18\n")

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_generator_bad_verdict_400(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        run_mock.return_value = ("RE", 10, 1024, "", "boom")
        self.client.force_authenticate(self.creator)
        payload = {
            "reference_language": "python3",
            "reference_code": "print(1)",
            "generator_language": "python3",
            "generator_code": "boom",
            "count": 2,
        }
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_reference_compile_failure(self, compile_mock):
        compile_mock.return_value = (False, "bad ref", None)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bad ref", str(response.data["reference_code"]))

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_generator_compile_failure(self, compile_mock, run_mock):
        compile_mock.side_effect = [
            (True, "", "/tmp/ref.exe"),
            (False, "bad gen", None),
        ]
        self.client.force_authenticate(self.creator)
        payload = {
            "reference_language": "python3",
            "reference_code": "print(1)",
            "generator_language": "python3",
            "generator_code": "boom",
            "count": 1,
        }
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("bad gen", str(response.data["generator_code"]))


# ---------------------------------------------------------------------------
# JDG-11 / RO-6: Kattis/Polygon package import
# ---------------------------------------------------------------------------


def _package_bytes():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as package:
        package.writestr(
            "problem.yaml",
            "name: sum-two\nauthor: OJI\nlimits:\n  time_seconds: 2\n"
            "  memory_limit_bytes: 536870912\n",
        )
        package.writestr(
            "statements/en/problem.tex",
            "\\title{Sum Two}\nRead two integers and print their sum.\n",
        )
        package.writestr("data/sample/1.in", "1 2\n")
        package.writestr("data/sample/1.ans", "3\n")
        package.writestr("data/secret/2.in", "3 4\n")
        package.writestr("data/secret/2.out", "7\n")
        # An .in without an answer is skipped.
        package.writestr("data/secret/3.in", "9 9\n")
        # Legacy Polygon-style flat tests also pair.
        package.writestr("tests/legacy.in", "5 5\n")
        package.writestr("tests/legacy.a", "10\n")
        # Statements never pair as tests.
        package.writestr("statements/ro/problem.tex", "Aduna doi intregi.\n")
    return base64.b64encode(buffer.getvalue()).decode()


class ImportPackageTests(ClosureBase):
    def setUp(self):
        super().setUp()
        self.granted = ImportSource.objects.create(
            name="OJI archive",
            status=ImportSource.Status.GRANTED,
            contact="isj@example.ro",
            terms="Educational re-use with attribution.",
            evidence_url="https://example.ro/license",
        )
        self.pending = ImportSource.objects.create(
            name="Pending archive", status=ImportSource.Status.PENDING
        )

    def payload(self, **overrides):
        base = {"package_base64": _package_bytes(), "import_source_id": self.granted.id}
        base.update(overrides)
        for key in [k for k, v in overrides.items() if v is None]:
            del base[key]
        return base

    def test_role_gate_rejects_creator(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_import_with_granted_ledger(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(
                source_contest="OJI 2024",
                source_year=2024,
                grade_group="IX-X",
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        problem = Problem.objects.get(pk=response.data["problem_id"])
        self.assertEqual(problem.status, Problem.ProblemStatus.DRAFT)
        self.assertEqual(problem.title_i18n["en"], "Sum Two")
        self.assertIn("their sum", problem.statement_i18n["en"])
        self.assertEqual(problem.default_time_limit_ms, 2000)
        self.assertEqual(problem.default_memory_limit_kb, 524288)
        self.assertEqual(problem.source_contest, "OJI 2024")
        self.assertEqual(problem.source_year, 2024)
        self.assertEqual(problem.import_source_id, self.granted.id)
        # 1 sample + 1 secret + 1 legacy Polygon pair = 3 tests; the
        # answer-less 3.in is skipped; statements never pair.
        self.assertEqual(response.data["tests_imported"], 3)
        self.assertEqual(response.data["samples"], 1)
        self.assertTrue(
            ProblemTestCase.objects.filter(
                problem=problem, is_sample=True, input_data="1 2\n"
            ).exists()
        )
        self.assertTrue(
            ProblemTestCase.objects.filter(
                problem=problem, is_sample=False, input_data="5 5\n"
            ).exists()
        )

    def test_import_with_declared_own_content(self):
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(import_source_id=None, declare_own_content=True),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["import_source"], "declared own content")
        self.assertIsNone(
            Problem.objects.get(pk=response.data["problem_id"]).import_source_id
        )

    def test_pending_ledger_blocked(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(import_source_id=self.pending.id),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("PENDING", str(response.data["import_source_id"]))

    def test_unknown_ledger_blocked(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(import_source_id=99999),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_neither_ledger_nor_declaration_blocked(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(import_source_id=None),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("declare_own_content", str(response.data["detail"]))

    def test_invalid_base64(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64="!!!not-base64!!!"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_not_a_zip(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64=base64.b64encode(b"plain text").decode()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_test_pairs(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr("problem.yaml", "name: empty\n")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64=base64.b64encode(buffer.getvalue()).decode()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_package_too_large(self):
        self.client.force_authenticate(self.admin)
        with mock.patch.object(tooling, "MAX_PACKAGE_BYTES", 10):
            response = self.client.post(
                "/api/v1/problems/tools/import-package/",
                self.payload(),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_too_many_entries(self):
        self.client.force_authenticate(self.admin)
        with mock.patch.object(tooling, "MAX_PACKAGE_ENTRIES", 2):
            response = self.client.post(
                "/api/v1/problems/tools/import-package/",
                self.payload(),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_yaml_without_name_uses_fallback_title(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr("data/sample/a.in", "1\n")
            package.writestr("data/sample/a.out", "2\n")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64=base64.b64encode(buffer.getvalue()).decode()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn("Imported problem", response.data["title"])

    def test_import_caps_test_count(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            for index in range(5):
                package.writestr(f"data/secret/{index}.in", f"{index}\n")
                package.writestr(f"data/secret/{index}.out", f"{index}\n")
        self.client.force_authenticate(self.admin)
        with mock.patch.object(tooling, "MAX_IMPORT_TESTS", 2):
            response = self.client.post(
                "/api/v1/problems/tools/import-package/",
                self.payload(
                    package_base64=base64.b64encode(buffer.getvalue()).decode()
                ),
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["tests_imported"], 2)

    def test_traversal_names_never_pair(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr("data/sample/ok.in", "1\n")
            package.writestr("data/sample/ok.out", "2\n")
            package.writestr("../evil.in", "3\n")
            package.writestr("../evil.out", "4\n")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64=base64.b64encode(buffer.getvalue()).decode()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["tests_imported"], 1)

    def test_yaml_limits_garbage_falls_back(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr(
                "problem.yaml",
                "name: x\nlimits:\n  time_seconds: banana\n"
                "  memory_limit_bytes: nope\n",
            )
            package.writestr("data/sample/a.in", "1\n")
            package.writestr("data/sample/a.out", "2\n")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            self.payload(package_base64=base64.b64encode(buffer.getvalue()).decode()),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        problem = Problem.objects.get(pk=response.data["problem_id"])
        self.assertEqual(problem.default_time_limit_ms, 1000)
        self.assertEqual(problem.default_memory_limit_kb, 262144)


class FlatYamlParserTests(TestCase):
    """The tiny problem.yaml subset parser (no PyYAML dependency)."""

    def test_flat_and_nested_keys(self):
        parsed = tooling.parse_flat_yaml(
            '# comment\nname: sum-two\nauthor: "OJI"\nlimits:\n'
            "  time_seconds: 2\n  memory_limit_bytes: 536870912\n"
            "\tjunk: skipped\nno_colon_line\n"
        )
        self.assertEqual(parsed["name"], "sum-two")
        self.assertEqual(parsed["author"], "OJI")
        self.assertEqual(
            parsed["limits"],
            {"time_seconds": "2", "memory_limit_bytes": "536870912"},
        )

    def test_empty_and_comments_only(self):
        self.assertEqual(tooling.parse_flat_yaml(""), {})
        self.assertEqual(tooling.parse_flat_yaml("# nothing\n\n"), {})


# ---------------------------------------------------------------------------
# RO-6: archive browse axis + ledger publication gate
# ---------------------------------------------------------------------------


class ArchiveAxisTests(ClosureBase):
    def setUp(self):
        super().setUp()
        self.granted = ImportSource.objects.create(
            name="Granted", status=ImportSource.Status.GRANTED
        )
        self.revoked = ImportSource.objects.create(
            name="Revoked", status=ImportSource.Status.REJECTED
        )
        self.archive_problem = _mk_problem(
            "OJI 2024 problem",
            source_contest="OJI 2024",
            source_year=2024,
            grade_group="IX-X",
        )
        self.plain_problem = _mk_problem("Plain problem")

    def list_ids(self, query=""):
        response = self.client.get(f"/api/v1/problems/problems/{query}")
        return {row["id"] for row in response.data["results"]}

    def test_archive_filter(self):
        ids = self.list_ids("?archive=1")
        self.assertIn(self.archive_problem.id, ids)
        self.assertNotIn(self.plain_problem.id, ids)
        # Equivalent truthy spellings.
        self.assertEqual(ids, self.list_ids("?archive=true"))
        self.assertEqual(ids, self.list_ids("?archive=yes"))

    def test_source_year_filter(self):
        ids = self.list_ids("?source_year=2024")
        self.assertEqual(ids, {self.archive_problem.id})
        self.assertFalse(self.list_ids("?source_year=1999"))

    def test_grade_group_filter(self):
        ids = self.list_ids("?grade_group=IX-X")
        self.assertEqual(ids, {self.archive_problem.id})

    def test_serializer_roundtrip_provenance(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/problems/",
            {
                "title_i18n": {"en": "Imported", "ro": "Importat"},
                "statement_i18n": {"en": "s", "ro": "s"},
                "difficulty": "EASY",
                "source_contest": "ONI 2023",
                "source_year": 2023,
                "grade_group": "XI-XII",
                "import_source": self.granted.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        body = response.data
        self.assertEqual(body["source_contest"], "ONI 2023")
        self.assertEqual(body["import_source"], self.granted.id)
        self.assertEqual(body["import_source_name"], "Granted")
        detail = self.client.get(f"/api/v1/problems/problems/{body['id']}/").data
        self.assertEqual(detail["import_source_name"], "Granted")

    def test_serializer_null_import_source_renders(self):
        response = self.client.get(
            f"/api/v1/problems/problems/{self.plain_problem.id}/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["import_source_name"])
        self.assertIsNone(response.data["import_source"])

    def test_submit_blocked_without_granted_ledger(self):
        problem = _mk_problem(
            "Blocked import",
            status=Problem.ProblemStatus.DRAFT,
            author=self.creator,
            import_source=self.revoked,
        )
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            f"/api/v1/problems/problems/{problem.id}/submit-for-approval/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Revoked", str(response.data["status"]))
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.DRAFT)

    def test_submit_allowed_with_granted_ledger(self):
        problem = _mk_problem(
            "Allowed import",
            status=Problem.ProblemStatus.DRAFT,
            author=self.creator,
            import_source=self.granted,
        )
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            f"/api/v1/problems/problems/{problem.id}/submit-for-approval/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.PENDING_APPROVAL)

    def test_approve_blocked_when_ledger_not_granted(self):
        problem = _mk_problem(
            "Approve blocked",
            status=Problem.ProblemStatus.PENDING_APPROVAL,
            author=self.creator,
            import_source=self.revoked,
        )
        self.client.force_authenticate(self.verifier)
        response = self.client.post(f"/api/v1/problems/problems/{problem.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        problem.refresh_from_db()
        self.assertEqual(problem.status, Problem.ProblemStatus.PENDING_APPROVAL)

    def test_public_api_exposes_provenance(self):
        response = self.client.get(
            f"/api/v1/public/problems/{self.archive_problem.id}/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["source_contest"], "OJI 2024")
        self.assertEqual(response.data["source_year"], 2024)
        listed = self.client.get("/api/v1/public/problems/")
        row = next(
            r for r in listed.data["results"] if r["id"] == self.archive_problem.id
        )
        self.assertEqual(row["grade_group"], "IX-X")


# ---------------------------------------------------------------------------
# RO-6: offline study bundle (PDF)
# ---------------------------------------------------------------------------


class OfflineBundleTests(ClosureBase):
    def test_pdf_download(self):
        response = self.client.get(
            f"/api/v1/problems/{_mk_problem('Bundled').id}/offline-bundle/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn("attachment", response["Content-Disposition"])
        body = (
            b"".join(response.streaming_content)
            if hasattr(response, "streaming_content")
            else response.content
        )
        self.assertTrue(body.startswith(b"%PDF-1.4"))
        self.assertIn(b"%%EOF", body)

    def test_unknown_problem_404(self):
        response = self.client.get("/api/v1/problems/999999/offline-bundle/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unapproved_problem_404(self):
        draft = _mk_problem("Draft", status=Problem.ProblemStatus.DRAFT)
        response = self.client.get(f"/api/v1/problems/{draft.id}/offline-bundle/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ToolingCoverageClosureTests(ClosureBase):
    """Branch-closure cases for the validator/generator/import lanes."""

    def test_safe_member_name_direct(self):
        self.assertFalse(tooling._safe_member_name(""))
        self.assertFalse(tooling._safe_member_name("/abs/path"))
        self.assertFalse(tooling._safe_member_name("rel/../../etc"))
        self.assertTrue(tooling._safe_member_name("data/sample/1.in"))

    def test_generate_outputs_unknown_generator_language(self):
        self.client.force_authenticate(self.creator)
        payload = {
            "reference_language": "python3",
            "reference_code": "print(1)",
            "generator_language": "cobol",
            "generator_code": "MOVE 1 TO X",
            "count": 1,
        }
        response = self.client.post(
            "/api/v1/problems/tools/generate-outputs/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cobol", str(response.data["generator_language"]))

    def test_yaml_orphan_indented_lines(self):
        parsed = tooling.parse_flat_yaml(
            "name: x\n  orphan_no_colon\nlimits:\n  ok: 1\n"
        )
        self.assertEqual(parsed["name"], "x")
        self.assertEqual(parsed["limits"], {"ok": "1"})
        # An indented line before any nested block opens nothing.
        self.assertEqual(tooling.parse_flat_yaml("top: v\n  stray: 1"), {"top": "v"})

    def test_statement_in_unknown_language_and_stray_markdown(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr("statements/fr/problem.tex", "Bonjour\n")
            package.writestr("docs/notes.md", "not a statement\n")
            # Statement-dir .in files never pair as tests; no \title either.
            package.writestr("statements/meta.in", "1\n")
            package.writestr("statements/meta.out", "2\n")
            package.writestr("data/sample/a.in", "1\n")
            package.writestr("data/sample/a.out", "2\n")
        self.client.force_authenticate(self.admin)
        source = ImportSource.objects.create(
            name="Own", status=ImportSource.Status.GRANTED
        )
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            {
                "package_base64": base64.b64encode(buffer.getvalue()).decode(),
                "import_source_id": source.id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # fr text ignored, no \title -> fallback title, statements/x.in skipped.
        self.assertNotEqual(response.data["title"], "Bonjour")
        self.assertEqual(response.data["tests_imported"], 1)
        problem = Problem.objects.get(pk=response.data["problem_id"])
        self.assertIn("statement pending", problem.statement_i18n["en"])


class ToolingFinalBranchTests(ClosureBase):
    """The last two flat-yaml/statement branches."""

    def test_colonless_line_inside_nested_block(self):
        parsed = tooling.parse_flat_yaml("limits:\n  no colon here\n  ok: 1\n")
        self.assertEqual(parsed["limits"], {"ok": "1"})

    def test_english_statement_without_title(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as package:
            package.writestr("statements/en/problem.tex", "No title command.\n")
            package.writestr("data/sample/a.in", "1\n")
            package.writestr("data/sample/a.out", "2\n")
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            {
                "package_base64": base64.b64encode(buffer.getvalue()).decode(),
                "declare_own_content": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # No \title -> falls back to the generic imported-problem title.
        self.assertIn("Imported problem", response.data["title"])
        problem = Problem.objects.get(pk=response.data["problem_id"])
        self.assertEqual(problem.statement_i18n["en"], "No title command.\n")
