"""Wave F — authoring-ops tests (items 122/126/127/128).

The generator DSL (parse + deterministic generation + endpoint), variant
families (spawn + tree), statement attachments and the legacy Polygon
``tests/`` import layout.
"""

import base64
import io
import zipfile

from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from problems.generator_dsl import generate, parse_dsl
from problems.models import Problem, StatementAttachment
from problems.models import TestCase as ProblemTestCase
from users.models import User


DSL = """\n# sizes
n = int(1, 100)
q = int(1, 20)
s = str(3, 8)
print {n} {q} {s}
"""


class AuthoringOpsBase(TestCase):
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
            statement_i18n={"en": "Input. Output. Constraints. Example.", "ro": "x"},
            status=Problem.ProblemStatus.DRAFT,
            author=self.author,
        )

    def mk_zip(self, files: dict) -> str:
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            for name, content in files.items():
                zf.writestr(name, content)
        return base64.b64encode(buffer.getvalue()).decode()


class GeneratorDslTests(AuthoringOpsBase):
    def test_parse_and_determinism(self):
        parsed = parse_dsl(DSL)
        self.assertEqual(set(parsed["vars"]), {"n", "q", "s"})
        first = generate(DSL, 42)
        self.assertEqual(first, generate(DSL, 42))
        self.assertNotEqual(generate(DSL, 1), generate(DSL, 2))

    def test_parse_errors(self):
        with self.assertRaises(ValueError):
            parse_dsl("n = int(10, 1)\nprint {n}")  # lo > hi
        with self.assertRaises(ValueError):
            parse_dsl("n = int(1, 10)")  # no print
        with self.assertRaises(ValueError):
            parse_dsl("print {ghost}")  # undeclared field
        with self.assertRaises(ValueError):
            parse_dsl("nonsense line")

    def test_generate_endpoint(self):
        self.client.force_authenticate(self.author)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/generate-tests/",
            {"dsl": DSL, "count": 3, "seed": 5},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["created"], 3)
        self.assertEqual(self.problem.test_cases.count(), 3)
        # Bad DSL rejected.
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/generate-tests/",
            {"dsl": "print {ghost}", "count": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_endpoint_gates(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/generate-tests/",
            {"dsl": DSL, "count": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.author)
        response = self.client.post(
            "/api/v1/problems/problems/999999/generate-tests/",
            {"dsl": DSL, "count": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class VariantTests(AuthoringOpsBase):
    def test_spawn_and_tree(self):
        child_body = {"note": "bounds doubled"}
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/variants/",
            child_body,
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        child_id = response.data["variant_id"]
        self.assertEqual(response.data["root_id"], self.problem.id)
        # Grandchildren attach to the ROOT, not the child.
        response = self.client.post(
            f"/api/v1/problems/problems/{child_id}/variants/",
            {"note": "offline queries"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["root_id"], self.problem.id)
        # Family tree from the child's perspective includes everyone.
        response = self.client.get(
            f"/api/v1/problems/problems/{child_id}/variants/list/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["count"], 3)
        notes = {row["note"] for row in response.data["variants"]}
        self.assertIn("bounds doubled", notes)
        self.assertIn("offline queries", notes)

    def test_spawn_copies_samples(self):
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="2",
            is_sample=True,
            points=10,
            order=0,
        )
        self.client.force_authenticate(self.author)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/variants/", {}, format="json"
        )
        child = Problem.objects.get(pk=response.data["variant_id"])
        self.assertEqual(child.test_cases.filter(is_sample=True).count(), 1)

    def test_variant_anon_gate_and_list_404(self):
        # Anonymous spawn hits the auth gate (401) before the view body.
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/variants/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_variant_gates_and_404(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/variants/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.author)
        response = self.client.post(
            "/api/v1/problems/problems/999999/variants/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/problems/problems/999999/variants/list/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class AttachmentTests(AuthoringOpsBase):
    def _upload(self, name="fig.png", content=b"pngbytes", kind="inline"):
        payload = base64.b64encode(content).decode()
        return self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/",
            {"name": name, "content_base64": payload, "kind": kind},
            format="json",
        )

    @override_settings()
    def test_upload_and_list(self):
        self.client.force_authenticate(self.author)
        response = self._upload()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["kind"], "inline")
        self.assertIn("url", response.data)
        listing = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/"
        )
        self.assertEqual(listing.data["count"], 1)
        self.assertTrue(
            StatementAttachment.objects.filter(problem=self.problem).exists()
        )

    def test_upload_validation(self):
        self.client.force_authenticate(self.author)
        response = self._upload(name="../evil")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/",
            {"name": "x.png", "content_base64": "not!valid!base64!!"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self._upload(content=b"a" * (2 * 1024 * 1024 + 1))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upload_cap_and_gates(self):
        self.client.force_authenticate(self.basic)
        response = self._upload()
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.author)
        for i in range(10):
            response = self._upload(name=f"f{i}.png")
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response = self._upload(name="over.png")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.client.force_authenticate(self.verifier)
        listing = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/"
        )
        self.assertEqual(listing.data["count"], 10)
        response = self.client.get("/api/v1/problems/problems/999999/attachments/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_attachment_get_and_post_gates(self):
        # Authors can list; basic users are refused on GET and POST.
        self.client.force_authenticate(self.basic)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/",
            {"name": "x.png", "content_base64": base64.b64encode(b"x").decode()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_attachment_anonymous_oversize_and_404(self):
        # Anonymous upload (401), the oversize guard, and unknown problems.
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/",
            {"name": "x.png", "content_base64": base64.b64encode(b"x").decode()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.author)
        from unittest import mock

        from problems import authoring_ops as ops

        with mock.patch.object(ops, "MAX_ATTACHMENT_BYTES", 4):
            big = base64.b64encode(b"toolongpayload").decode()
            response = self.client.post(
                f"/api/v1/problems/problems/{self.problem.id}/attachments/",
                {"name": "big.bin", "content_base64": big},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        big = base64.b64encode(b"a" * (2 * 1024 * 1024 + 1)).decode()
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/attachments/",
            {"name": "big.bin", "content_base64": big},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            "/api/v1/problems/problems/999999/attachments/",
            {"name": "x.png", "content_base64": base64.b64encode(b"x").decode()},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_str_method(self):
        self.client.force_authenticate(self.author)
        response = self._upload()
        row = StatementAttachment.objects.get(pk=response.data["id"])
        self.assertIn("attachment", str(row))


class PolygonLegacyImportTests(AuthoringOpsBase):
    def _import(self, files):
        self.client.force_authenticate(self.verifier)
        return self.client.post(
            "/api/v1/problems/tools/import-package/",
            {
                "package_base64": self.mk_zip(files),
                "declare_own_content": True,
            },
            format="json",
        )

    def test_legacy_tests_layout(self):
        response = self._import(
            {
                "tests/1": "5\n1 2 3 4 5",
                "tests/1.a": "15",
                "tests/2": "3\n1 2 3",
                "tests/2.ans": "6",
                "tests/3": "orphan",
            }
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["tests_imported"], 2)
        created = Problem.objects.get(pk=response.data["problem_id"])
        inputs = list(
            created.test_cases.order_by("order").values_list("input_data", flat=True)
        )
        self.assertEqual(inputs[0].strip(), "5\n1 2 3 4 5")
        self.assertEqual(inputs[1].strip(), "3\n1 2 3")

    def test_legacy_mixed_with_kattis(self):
        response = self._import(
            {
                "data/sample/a.in": "1",
                "data/sample/a.ans": "2",
                "tests/9": "7",
                "tests/9.a": "8",
            }
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["tests_imported"], 2)
        self.assertEqual(response.data["samples"], 1)


class PolygonDedupTests(AuthoringOpsBase):
    def test_extensionless_skipped_when_kattis_pair_exists(self):
        # tests/1.in pairs Kattis-style; the extensionless tests/1 is then
        # already covered (seen) and the legacy loop must skip it.
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            "/api/v1/problems/tools/import-package/",
            {
                "package_base64": self.mk_zip(
                    {
                        "tests/1.in": "5",
                        "tests/1.ans": "6",
                        "tests/1": "5",
                        "tests/1.a": "6",
                        "tests/2": "7",
                        "tests/2.a": "8",
                    }
                ),
                "declare_own_content": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["tests_imported"], 2)
        created = Problem.objects.get(pk=response.data["problem_id"])
        self.assertEqual(created.test_cases.count(), 2)
