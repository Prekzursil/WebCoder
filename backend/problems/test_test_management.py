"""Test-management tests (problem-page wave, item B).

Covers at the 100% bar:
- ``problems.test_archive`` — zip/tar/tar.gz parsing, pairing conventions
  (.in/.ans|.out|.a, sample dirs, legacy Polygon), bomb guards (ratio,
  total, per-file, member count), traversal rejection, unsupported type;
- ``problems.test_archive_views`` — import archive (dry-run preview,
  bulk create, permissions, bad payloads), distribute points;
- the TestCase serializer's size/editability projection + the raw
  ``download`` action (public samples, gated hidden tests).
"""

import io
import tarfile
import zipfile

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from problems.test_archive import (
    parse_archive,
    pair_tests,
    read_archive,
    safe_member_name,
)
from users.models import User


def _problem(**kwargs):
    defaults = {
        "title_i18n": {"en": "P"},
        "statement_i18n": {"en": "S"},
        "difficulty": "MEDIUM",
        "target_points": 100,
        "status": Problem.ProblemStatus.DRAFT,
    }
    defaults.update(kwargs)
    return Problem.objects.create(**defaults)


def _zip_bytes(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, content in files.items():
            zf.writestr(name, content)
    return buf.getvalue()


def _tar_bytes(files: dict[str, str], mode: str = "w") -> bytes:
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode=mode) as tf:
        for name, content in files.items():
            data = content.encode()
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tf.addfile(info, io.BytesIO(data))
    return buf.getvalue()


class SafeNameTest(TestCase):
    def test_rejects_bad_names(self):
        for bad in ("/abs", "../up", "a/../b", "C:\\win", "", "back\\slash"):
            self.assertFalse(safe_member_name(bad), bad)

    def test_accepts_good_names(self):
        for good in ("data/01.in", "tests/3", "x.ans", "a/b/c.out"):
            self.assertTrue(safe_member_name(good), good)


class ReadArchiveTest(TestCase):
    def test_zip(self):
        raw = _zip_bytes({"a.in": "1", "a.ans": "2"})
        members = read_archive("t.zip", raw)
        self.assertEqual(sorted(m.name for m in members), ["a.ans", "a.in"])

    def test_tar_and_targz(self):
        raw = _tar_bytes({"a.in": "1"})
        self.assertEqual(len(read_archive("t.tar", raw)), 1)
        gz = _tar_bytes({"a.in": "1"}, mode="w:gz")
        self.assertEqual(len(read_archive("t.tar.gz", gz)), 1)
        self.assertEqual(len(read_archive("t.tgz", gz)), 1)

    def test_unsupported_extension_rejected(self):
        with self.assertRaises(ValidationError):
            read_archive("t.rar", b"xx")

    def test_empty_rejected(self):
        with self.assertRaises(ValidationError):
            read_archive("t.zip", b"")

    def test_member_cap(self):
        raw = _zip_bytes({f"{i}.in": "x" for i in range(5)})
        with override_settings(TEST_ARCHIVE_MAX_MEMBERS=3):
            with self.assertRaises(ValidationError):
                read_archive("t.zip", raw)

    def test_per_file_cap(self):
        raw = _zip_bytes({"big.in": "x" * 100})
        with override_settings(TEST_ARCHIVE_MAX_FILE_BYTES=10):
            with self.assertRaises(ValidationError):
                read_archive("t.zip", raw)

    def test_total_cap(self):
        raw = _zip_bytes({"a.in": "x" * 60, "b.in": "x" * 60})
        with override_settings(TEST_ARCHIVE_MAX_TOTAL_BYTES=100):
            with self.assertRaises(ValidationError):
                read_archive("t.zip", raw)

    def test_ratio_cap_zip_bomb(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("bomb.in", "0" * 100_000)
        with override_settings(TEST_ARCHIVE_MAX_RATIO=100):
            with self.assertRaises(ValidationError):
                read_archive("t.zip", buf.getvalue())

    def test_traversal_rejected(self):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("../evil.in", "x")
        with self.assertRaises(ValidationError):
            read_archive("t.zip", buf.getvalue())

    def test_tar_member_cap_and_file_cap(self):
        raw = _tar_bytes({f"{i}.in": "x" for i in range(5)})
        with override_settings(TEST_ARCHIVE_MAX_MEMBERS=3):
            with self.assertRaises(ValidationError):
                read_archive("t.tar", raw)
        raw2 = _tar_bytes({"big.in": "x" * 100})
        with override_settings(TEST_ARCHIVE_MAX_FILE_BYTES=10):
            with self.assertRaises(ValidationError):
                read_archive("t.tar", raw2)

    def test_tar_total_cap(self):
        raw = _tar_bytes({"a.in": "x" * 60, "b.in": "x" * 60})
        with override_settings(TEST_ARCHIVE_MAX_TOTAL_BYTES=100):
            with self.assertRaises(ValidationError):
                read_archive("t.tar", raw)


class PairTests(TestCase):
    def _members(self, files):
        return read_archive("t.zip", _zip_bytes(files))

    def test_basic_pairing_all_answer_suffixes(self):
        for ext in (".ans", ".out", ".a"):
            members = self._members({"x.in": "IN", f"x{ext}": "OUT"})
            pairs, skipped = pair_tests(members)
            self.assertEqual(len(pairs), 1, ext)
            self.assertEqual(pairs[0]["expected"], "OUT")
            self.assertEqual(skipped, [])

    def test_kattis_layout_marks_samples(self):
        members = self._members(
            {
                "data/sample/01.in": "s",
                "data/sample/01.ans": "a",
                "data/secret/02.in": "x",
                "data/secret/02.out": "y",
            }
        )
        pairs, _ = pair_tests(members)
        by_name = {p["name"]: p for p in pairs}
        self.assertTrue(by_name["data/sample/01"]["is_sample"])
        self.assertFalse(by_name["data/secret/02"]["is_sample"])

    def test_legacy_polygon_layout(self):
        members = self._members(
            {
                "tests/1": "IN1",
                "tests/1.a": "OUT1",
                "tests/2": "IN2",
                "tests/2.ans": "OUT2",
            }
        )
        pairs, _ = pair_tests(members)
        self.assertEqual(len(pairs), 2)
        by_name = {p["name"]: p for p in pairs}
        self.assertEqual(by_name["tests/1"]["expected"], "OUT1")
        self.assertEqual(by_name["tests/2"]["expected"], "OUT2")

    def test_unpaired_input_reported(self):
        members = self._members({"x.in": "IN", "stray.txt": "z"})
        pairs, skipped = pair_tests(members)
        self.assertEqual(pairs, [])
        self.assertEqual(skipped, ["x.in"])

    def test_parse_archive_shape(self):
        parsed = parse_archive(
            "t.zip", _zip_bytes({"x.in": "IN", "x.ans": "O", "n.txt": "?", "y.in": "Y"})
        )
        self.assertEqual(len(parsed["pairs"]), 1)
        self.assertEqual(parsed["skipped"], ["y.in"])
        self.assertEqual(parsed["other_files"], ["n.txt"])
        self.assertEqual(parsed["total_members"], 4)


class ImportArchiveAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.other = User.objects.create_user(username="other", password="p")
        self.problem = _problem(author=self.author)

    def _upload(self, raw, filename="tests.zip", **extra):
        from django.core.files.uploadedfile import SimpleUploadedFile

        self.client.force_authenticate(self.author)
        return self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/import-archive/",
            data={
                "archive": SimpleUploadedFile(filename, raw),
                **extra,
            },
            format="multipart",
        )

    def test_requires_auth(self):
        resp = APIClient().post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/import-archive/"
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_404_unknown_problem(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post("/api/v1/problems/problems/99999/tests/import-archive/")
        self.assertEqual(resp.status_code, 404)

    def test_non_author_forbidden(self):
        client = APIClient()
        client.force_authenticate(self.other)
        resp = client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/import-archive/"
        )
        self.assertEqual(resp.status_code, 403)

    def test_missing_file_400(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/import-archive/",
            data={},
            format="multipart",
        )
        self.assertEqual(resp.status_code, 400)

    def test_bad_archive_400(self):
        resp = self._upload(b"not an archive", "tests.rar")
        self.assertEqual(resp.status_code, 400)

    def test_no_pairs_400(self):
        resp = self._upload(_zip_bytes({"only.in": "x"}))
        self.assertEqual(resp.status_code, 400)
        self.assertIn("no input/answer pairs", resp.json()["detail"])

    def test_dry_run_previews_without_creating(self):
        raw = _zip_bytes({"01.in": "1", "01.ans": "2"})
        resp = self._upload(raw, dry_run="1")
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()["created"], 0)
        self.assertEqual(len(resp.json()["pairs"]), 1)
        self.assertEqual(
            ProblemTestCase.objects.filter(problem=self.problem).count(), 0
        )

    def test_bulk_create(self):
        raw = _zip_bytes(
            {
                "data/sample/01.in": "s",
                "data/sample/01.ans": "a",
                "data/secret/02.in": "x",
                "data/secret/02.ans": "y",
            }
        )
        resp = self._upload(raw)
        self.assertEqual(resp.status_code, 201, resp.json())
        self.assertEqual(resp.json()["created"], 2)
        tests = ProblemTestCase.objects.filter(problem=self.problem).order_by("order")
        self.assertEqual([t.is_sample for t in tests], [True, False])
        self.assertEqual([t.points for t in tests], [10, 10])
        self.assertEqual(tests.first().input_data, "s")

    def test_bulk_create_custom_points_and_ordering(self):
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            points=1,
            order=1,
        )
        raw = _zip_bytes({"a.in": "1", "a.out": "2"})
        resp = self._upload(raw, points="25")
        self.assertEqual(resp.status_code, 201, resp.json())
        self.assertEqual(resp.json()["points_each"], 25)
        new_test = ProblemTestCase.objects.filter(problem=self.problem).get(
            input_data="1"
        )
        self.assertEqual(new_test.points, 25)
        self.assertEqual(new_test.order, 2)

    def test_bad_points_400(self):
        resp = self._upload(_zip_bytes({"a.in": "1", "a.out": "2"}), points="ten")
        self.assertEqual(resp.status_code, 400)
        resp = self._upload(_zip_bytes({"a.in": "1", "a.out": "2"}), points="0")
        self.assertEqual(resp.status_code, 400)

    def test_tar_upload(self):
        raw = _tar_bytes({"a.in": "1", "a.ans": "2"})
        resp = self._upload(raw, "tests.tar")
        self.assertEqual(resp.status_code, 201, resp.json())
        self.assertEqual(resp.json()["created"], 1)

    def test_targz_upload(self):
        raw = _tar_bytes({"a.in": "1", "a.ans": "2"}, mode="w:gz")
        resp = self._upload(raw, "tests.tar.gz")
        self.assertEqual(resp.status_code, 201, resp.json())

    def test_verifier_allowed(self):
        verifier = User.objects.create_user(
            username="ver", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        client = APIClient()
        client.force_authenticate(verifier)
        from django.core.files.uploadedfile import SimpleUploadedFile

        resp = client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/import-archive/",
            data={
                "archive": SimpleUploadedFile(
                    "t.zip", _zip_bytes({"a.in": "1", "a.ans": "2"})
                )
            },
            format="multipart",
        )
        self.assertEqual(resp.status_code, 201, resp.json())


class DistributePointsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.problem = _problem(author=self.author, target_points=100)
        for i in range(1, 4):
            ProblemTestCase.objects.create(
                problem=self.problem,
                input_data=f"i{i}",
                expected_output_data="o",
                points=1,
                order=i,
            )

    def test_requires_auth(self):
        resp = APIClient().post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/"
        )
        self.assertIn(resp.status_code, (401, 403))

    def test_404_unknown_problem(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post("/api/v1/problems/problems/99999/tests/distribute/")
        self.assertEqual(resp.status_code, 404)

    def test_non_author_forbidden(self):
        other = User.objects.create_user(username="x", password="p")
        client = APIClient()
        client.force_authenticate(other)
        resp = client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/"
        )
        self.assertEqual(resp.status_code, 403)

    def test_even_distribution_with_remainder(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/",
            {"target": 100},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.json())
        self.assertEqual(resp.json()["points"], [34, 33, 33])
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.full_score, 100)

    def test_default_target_uses_declared_points(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/"
        )
        self.assertEqual(resp.json()["target"], 100)

    def test_target_below_test_count_400(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/",
            {"target": 2},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_bad_target_400(self):
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/tests/distribute/",
            {"target": "lots"},
            format="json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_no_tests_400(self):
        empty = _problem(author=self.author)
        self.client.force_authenticate(self.author)
        resp = self.client.post(
            f"/api/v1/problems/problems/{empty.id}/tests/distribute/"
        )
        self.assertEqual(resp.status_code, 400)


class TestCaseMetadataTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.author = User.objects.create_user(
            username="author", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.problem = _problem(
            status=Problem.ProblemStatus.APPROVED, author=self.author
        )
        self.small = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            points=10,
            order=1,
            is_sample=True,
        )
        self.big = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="x" * 200,
            expected_output_data="y" * 200,
            points=10,
            order=2,
        )

    def test_serializer_sizes_and_editability(self):
        from problems.serializers import TestCaseSerializer

        # 200-byte fields vs a 100-byte threshold: sizes report exactly,
        # editability flips off.
        with override_settings(TESTCASE_INLINE_EDIT_THRESHOLD_BYTES=100):
            data = TestCaseSerializer(self.big, context={"request": None}).data
        self.assertEqual(data["input_size"], 200)
        self.assertEqual(data["expected_size"], 200)
        self.assertFalse(data["input_editable"])
        self.assertFalse(data["expected_editable"])

    def test_threshold_override(self):
        from problems.serializers import TestCaseSerializer

        with override_settings(TESTCASE_INLINE_EDIT_THRESHOLD_BYTES=300):
            data = TestCaseSerializer(self.big, context={"request": None}).data
            self.assertTrue(data["input_editable"])
            self.assertTrue(data["expected_editable"])

    def test_small_fields_editable_by_default(self):
        from problems.serializers import TestCaseSerializer

        data = TestCaseSerializer(self.big, context={"request": None}).data
        self.assertTrue(data["input_editable"])
        self.assertTrue(data["expected_editable"])

    def test_detail_includes_threshold_fields(self):
        self.client.force_authenticate(self.author)
        with override_settings(TESTCASE_INLINE_EDIT_THRESHOLD_BYTES=100):
            resp = self.client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        tests = resp.json()["test_cases"]
        self.assertEqual(tests[1]["input_size"], 200)
        self.assertFalse(tests[1]["input_editable"])

    def test_download_sample_public(self):
        resp = APIClient().get(
            f"/api/v1/problems/testcases/{self.small.id}/download/?kind=input"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.content, b"i")
        self.assertIn("attachment", resp["Content-Disposition"])

    def test_download_expected_kind(self):
        resp = APIClient().get(
            f"/api/v1/problems/testcases/{self.small.id}/download/?kind=expected"
        )
        self.assertEqual(resp.content, b"o")

    def test_download_bad_kind_400(self):
        resp = APIClient().get(
            f"/api/v1/problems/testcases/{self.small.id}/download/?kind=nope"
        )
        self.assertEqual(resp.status_code, 400)

    def test_download_hidden_requires_rights(self):
        resp = APIClient().get(
            f"/api/v1/problems/testcases/{self.big.id}/download/?kind=input"
        )
        self.assertEqual(resp.status_code, 403)
        solver = User.objects.create_user(username="s", password="p")
        client = APIClient()
        client.force_authenticate(solver)
        self.assertEqual(
            client.get(
                f"/api/v1/problems/testcases/{self.big.id}/download/?kind=input"
            ).status_code,
            403,
        )
        client.force_authenticate(self.author)
        self.assertEqual(
            client.get(
                f"/api/v1/problems/testcases/{self.big.id}/download/?kind=input"
            ).status_code,
            200,
        )
