"""Coverage-extension tests for the ``submissions`` app.

Goal: 100% line+branch coverage of every module in ``submissions/`` (models,
serializers, views, urls, admin, tasks, judge_utils/*, migrations), on top of
``submissions/tests.py`` which already covers ``judge_utils/backend.py``.

Conventions:
- Factory-free: ORM objects built with ``Model.objects.create`` helpers below.
- The Celery judge task is executed eagerly via ``task.apply``; sandbox
  helpers (compile/execute/checker) are mocked at the ``submissions.tasks``
  boundary; ``compare_outputs`` stays real.
- judge_utils unit tests mock ``subprocess.run`` / ``subprocess.Popen`` only;
  ``comparison.compare_outputs`` is exercised as a pure function.
- Temp dirs via ``tempfile.TemporaryDirectory`` (never inside the repo tree).

KNOWN-DEFECT PIN (documented 2026-09-22, wave coverage work; FIXED same day, A4):
``users.permissions.IsOwnerOrAdminForSubmission`` checked ``obj.author`` but
``Submission`` has no ``author`` field (it is ``user``), so a retrieve on the
submission detail endpoint raised AttributeError before serializing.
``test_detail_currently_raises_attribute_error`` pinned that behavior; the fix
(``obj.user``) landed 2026-09-22 and the test was renamed to
``test_detail_owner_retrieves_own_submission`` asserting the FIXED behavior.
"""

import importlib
import pathlib
import subprocess
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib import admin as dj_admin
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from users.models import User

from .admin import SubmissionAdmin
from .judge_utils.checkers import run_custom_checker
from .judge_utils.compilation import CONTAINER_BOOST_INCLUDE_PATH
from .judge_utils.compilation import compile_code_in_sandbox
from .judge_utils.comparison import compare_outputs
from .judge_utils.execution import (
    CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH,
    run_code_in_sandbox,
)
from .models import Submission, SubmissionTestResult
from .serializers import (
    SubmissionCreateSerializer,
    SubmissionSerializer,
    SubmissionTestResultSerializer,
)
from .tasks import judge_submission_task

V = Submission.VerdictStatus
AC = V.ACCEPTED
WA = V.WRONG_ANSWER
TLE = V.TIME_LIMIT_EXCEEDED
MLE = V.MEMORY_LIMIT_EXCEEDED
RE = V.RUNTIME_ERROR
IE = V.INTERNAL_ERROR
CE = V.COMPILE_ERROR

CM = Problem.ComparisonMode

# A /usr/bin/time -f "%U %S %M %x %P %e" style line: 30ms cpu, 5120 KB.
RESOURCE_LINE = "0.01 0.02 5120 0 90.0% 0.03"


def make_user(username, role=User.Roles.BASIC_USER, **extra):
    fields = {
        "username": username,
        "email": "%s@example.com" % username,
        "password": "Passw0rd!tests",
        "role": role,
    }
    fields.update(extra)
    return User.objects.create_user(**fields)


def make_problem(author=None, **kw):
    defaults = {
        "title_i18n": {"en": "Sum Two", "ro": "Aduna doi"},
        "statement_i18n": {"en": "Read a and b, print a+b."},
        "author": author,
        "status": Problem.ProblemStatus.APPROVED,
        "comparison_mode": CM.LINES_STRIP_EXACT,
    }
    defaults.update(kw)
    return Problem.objects.create(**defaults)


def make_submission(user, problem, **kw):
    defaults = {"language": "python3", "code": "print(3)"}
    defaults.update(kw)
    return Submission.objects.create(user=user, problem=problem, **defaults)


def make_test_case(problem, order=1, inp="1 2\n", expected="3\n", points=10):
    return ProblemTestCase.objects.create(
        problem=problem,
        input_data=inp,
        expected_output_data=expected,
        order=order,
        points=points,
    )


class _FakeProcess:
    """Stands in for subprocess.Popen in judge_utils execution paths."""

    def __init__(self, stdout="", stderr="", returncode=0, communicate_exc=None):
        self._stdout = stdout
        self._stderr = stderr
        self._returncode = returncode
        self._communicate_exc = communicate_exc
        self.returncode = None
        self.communicate_kwargs = None

    def communicate(self, input=None, timeout=None):
        self.communicate_kwargs = {"input": input, "timeout": timeout}
        if self._communicate_exc is not None:
            raise self._communicate_exc
        self.returncode = self._returncode
        return self._stdout, self._stderr


def _run_result(returncode=0, stdout="", stderr=""):
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------


class SubmissionModelTests(TestCase):
    def test_str_submission(self):
        u = make_user("struser")
        p = make_problem(u)
        s = make_submission(u, p)
        text = str(s)
        self.assertIn("struser", text)
        self.assertIn(str(p.id), text)
        self.assertIn(Submission.VerdictStatus.PENDING, text)

    def test_str_submission_test_result(self):
        u = make_user("strresuser")
        p = make_problem(u)
        s = make_submission(u, p)
        tc = make_test_case(p, order=2)
        r = SubmissionTestResult.objects.create(
            submission=s, test_case=tc, verdict=AC
        )
        text = str(r)
        self.assertIn(str(s.id), text)
        self.assertIn(str(tc.id), text)
        self.assertIn(AC, text)


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------


class SerializerTests(TestCase):
    def test_submission_serializer_full_representation(self):
        u = make_user("seruser")
        p = make_problem(u, title_i18n={"en": "Cool Problem"})
        s = make_submission(
            u,
            p,
            verdict=AC,
            execution_time_ms=12,
            memory_used_kb=2048,
            score=10.0,
            detailed_feedback="fb",
        )
        tc = make_test_case(p, order=1, points=7)
        SubmissionTestResult.objects.create(
            submission=s,
            test_case=tc,
            verdict=AC,
            execution_time_ms=5,
            memory_used_kb=512,
            actual_output="3\n",
            error_output="",
        )
        data = SubmissionSerializer(s).data
        self.assertEqual(
            data["problem"], {"id": p.id, "title_i18n": {"en": "Cool Problem"}}
        )
        self.assertEqual(data["user"]["username"], "seruser")
        self.assertEqual(data["verdict"], AC)
        self.assertEqual(len(data["test_results"]), 1)
        tr = data["test_results"][0]
        self.assertEqual(
            tr["test_case_details"],
            {"id": tc.id, "order": 1, "is_sample": False, "points": 7},
        )
        self.assertEqual(tr["verdict"], AC)

    def test_submission_serializer_without_problem(self):
        u = make_user("sernoprob")
        p = make_problem(u)
        s = make_submission(u, p)
        fetched = Submission.objects.get(pk=s.pk)
        fetched.problem = None  # in-memory falsy arm of to_representation
        data = SubmissionSerializer(fetched).data
        self.assertIsNone(data["problem"])
        self.assertEqual(data["user"]["username"], "sernoprob")

    def test_test_result_serializer_without_test_case(self):
        bare = SubmissionTestResult()
        data = SubmissionTestResultSerializer(bare).data
        self.assertIsNone(data["test_case_details"])

    def test_create_serializer_creates_submission(self):
        u = make_user("sercreate")
        p = make_problem(u)
        ser = SubmissionCreateSerializer(
            data={"problem": p.id, "language": "cpp17", "code": "int main(){}"}
        )
        self.assertTrue(ser.is_valid(), ser.errors)
        obj = ser.create(ser.validated_data)
        self.assertEqual(obj.problem_id, p.id)
        self.assertEqual(obj.language, "cpp17")


# ---------------------------------------------------------------------------
# Views + urls
# ---------------------------------------------------------------------------


class SubmissionViewTests(TestCase):
    LIST_URL_NAME = "submissions_api_v1:submission-list"
    DETAIL_URL_NAME = "submissions_api_v1:submission-detail"
    CREATE_URL_NAME = "submissions_api_v1:submission_create"

    @classmethod
    def setUpTestData(cls):
        cls.owner = make_user("viewowner")
        cls.other = make_user("viewother")
        cls.staff = make_user("viewstaff", is_staff=True)
        cls.role_admin = make_user("viewroleadmin", role=User.Roles.ADMIN)
        cls.problem = make_problem(cls.owner)
        cls.sub_owner = make_submission(cls.owner, cls.problem)
        cls.sub_other = make_submission(cls.other, cls.problem)

    def _api(self, user=None):
        client = APIClient()
        if user is not None:
            client.force_authenticate(user=user)
        return client

    def _ids(self, resp):
        self.assertEqual(resp.status_code, 200, resp.content)
        return {row["id"] for row in resp.data}

    def test_urls_registered(self):
        list_url = reverse(self.LIST_URL_NAME)
        create_url = reverse(self.CREATE_URL_NAME)
        self.assertTrue(list_url.startswith("/api/v1/submissions/"))
        self.assertEqual(create_url, "/api/v1/submissions/submit/")

    def test_list_returns_own_submissions_only(self):
        resp = self._api(self.owner).get(reverse(self.LIST_URL_NAME))
        self.assertEqual(self._ids(resp), {self.sub_owner.id})

    def test_list_staff_sees_all(self):
        resp = self._api(self.staff).get(reverse(self.LIST_URL_NAME))
        self.assertEqual(self._ids(resp), {self.sub_owner.id, self.sub_other.id})

    def test_list_role_admin_sees_all(self):
        resp = self._api(self.role_admin).get(reverse(self.LIST_URL_NAME))
        self.assertEqual(self._ids(resp), {self.sub_owner.id, self.sub_other.id})

    def test_list_anonymous_rejected(self):
        resp = self._api().get(reverse(self.LIST_URL_NAME))
        self.assertIn(resp.status_code, (401, 403))

    def test_detail_owner_retrieves_own_submission(self):
        # FIXED 2026-09-22 (wave A4): IsOwnerOrAdminForSubmission now reads
        # obj.user (the actual Submission FK) instead of obj.author, so the
        # detail GET returns 200 for the owner instead of AttributeError.
        url = reverse(self.DETAIL_URL_NAME, args=[self.sub_owner.id])
        resp = self._api(self.owner).get(url)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["id"], self.sub_owner.id)

    def test_create_dispatches_judge_task(self):
        client = self._api(self.owner)
        with patch("submissions.views.judge_submission_task") as mock_task:
            resp = client.post(
                reverse(self.CREATE_URL_NAME),
                {"problem": self.problem.id, "language": "python3", "code": "print(42)"},
                format="json",
            )
        self.assertEqual(resp.status_code, 201, resp.content)
        sub_id = resp.data["id"]
        self.assertEqual(resp.data["verdict"], "PENDING")
        self.assertEqual(resp.data["user"]["username"], "viewowner")
        mock_task.delay.assert_called_once_with(sub_id)
        self.assertTrue(
            Submission.objects.filter(id=sub_id, user=self.owner).exists()
        )

    def test_create_invalid_payload(self):
        client = self._api(self.owner)
        resp = client.post(
            reverse(self.CREATE_URL_NAME), {"language": "python3"}, format="json"
        )
        self.assertEqual(resp.status_code, 400)
        self.assertIn("problem", resp.data)

    def test_create_anonymous_rejected(self):
        resp = self._api().post(
            reverse(self.CREATE_URL_NAME),
            {"problem": self.problem.id, "language": "python3", "code": "x"},
            format="json",
        )
        self.assertIn(resp.status_code, (401, 403))


# ---------------------------------------------------------------------------
# Admin helpers
# ---------------------------------------------------------------------------


class SubmissionAdminTests(TestCase):
    def _admin(self):
        return SubmissionAdmin(Submission, dj_admin.site)

    def test_links_render(self):
        u = make_user("admuser")
        p = make_problem(u, title_i18n={"en": "Linked"})
        s = make_submission(u, p)
        model_admin = self._admin()
        user_html = str(model_admin.user_link(s))
        self.assertIn("/user/%d/change/" % u.id, user_html)
        self.assertIn("admuser", user_html)
        prob_html = str(model_admin.problem_link(s))
        self.assertIn("/problem/%d/change/" % p.id, prob_html)
        self.assertIn("Linked", prob_html)

    def test_problem_link_without_english_title(self):
        u = make_user("admnoen")
        p = make_problem(u, title_i18n={"ro": "Problema"})
        s = make_submission(u, p)
        html = str(self._admin().problem_link(s))
        self.assertIn("ID: %d" % p.id, html)

    def test_problem_link_with_non_dict_title(self):
        u = make_user("admnondict")
        p = make_problem(u, title_i18n="plain-title")
        s = make_submission(u, p)
        html = str(self._admin().problem_link(s))
        self.assertIn("ID: %d" % p.id, html)

    def test_links_render_na_for_missing_relations(self):
        model_admin = self._admin()
        self.assertEqual(model_admin.user_link(Submission()), "N/A")
        self.assertEqual(model_admin.problem_link(Submission()), "N/A")


# ---------------------------------------------------------------------------
# Migrations (imported directly: --nomigrations never imports them)
# ---------------------------------------------------------------------------


class MigrationImportTests(unittest.TestCase):
    def test_migrations_import_cleanly(self):
        m1 = importlib.import_module("submissions.migrations.0001_initial")
        m2 = importlib.import_module(
            "submissions.migrations.0002_submissiontestresult"
        )
        self.assertTrue(hasattr(m1, "Migration"))
        self.assertTrue(hasattr(m2, "Migration"))


# ---------------------------------------------------------------------------
# judge_utils.comparison (pure function)
# ---------------------------------------------------------------------------


class CompareOutputsTests(unittest.TestCase):
    def test_exact_mode(self):
        self.assertTrue(compare_outputs("3\n", "3\n", CM.EXACT))
        self.assertFalse(compare_outputs("3\n", "3 \n", CM.EXACT))

    def test_strip_exact_mode(self):
        self.assertTrue(compare_outputs("  3\n ", "3", CM.STRIP_EXACT))
        self.assertFalse(compare_outputs("3", "4", CM.STRIP_EXACT))

    def test_lines_strip_exact_matches_despite_noise(self):
        self.assertTrue(
            compare_outputs(" 1 \r\n 2 \n\n", "1\n2", CM.LINES_STRIP_EXACT)
        )

    def test_lines_strip_exact_mismatch(self):
        self.assertFalse(
            compare_outputs("1\n2\n", "1\n3\n", CM.LINES_STRIP_EXACT)
        )

    def test_lines_strip_exact_all_empty_lines(self):
        self.assertTrue(compare_outputs("\n\n\n", "", CM.LINES_STRIP_EXACT))

    def test_float_precise_match(self):
        self.assertTrue(compare_outputs("1.0 2.5\n", "1.0 2.5\n", CM.FLOAT_PRECISE))

    def test_float_precise_default_epsilon_when_none(self):
        self.assertTrue(
            compare_outputs("1.0000001\n", "1.0\n", CM.FLOAT_PRECISE, None)
        )
        self.assertFalse(compare_outputs("1.01\n", "1.0\n", CM.FLOAT_PRECISE, None))

    def test_float_precise_line_count_mismatch(self):
        self.assertFalse(compare_outputs("1\n2\n", "1\n", CM.FLOAT_PRECISE))

    def test_float_precise_token_count_mismatch(self):
        self.assertFalse(compare_outputs("1 2\n", "1\n", CM.FLOAT_PRECISE))

    def test_float_precise_non_numeric_tokens(self):
        self.assertTrue(compare_outputs("ok 1\n", "ok 1\n", CM.FLOAT_PRECISE))
        self.assertFalse(compare_outputs("ok\n", "nope\n", CM.FLOAT_PRECISE))

    def test_float_precise_exception_returns_false(self):
        # generated_output=None -> AttributeError inside the try block.
        self.assertFalse(compare_outputs(None, "1\n", CM.FLOAT_PRECISE))

    def test_unknown_mode_falls_back_to_lines_strip(self):
        self.assertTrue(compare_outputs("1 \n2\n", "1\n2", "WEIRD-MODE"))


# ---------------------------------------------------------------------------
# judge_utils.compilation (subprocess.run mocked)
# ---------------------------------------------------------------------------


class CompilationTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="wc_compile_")
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)

    def test_python3_writes_file_no_compile(self):
        ok, out, path = compile_code_in_sandbox("print(1)\n", "python3", self.dir)
        self.assertTrue(ok)
        self.assertIn("no compilation", out)
        self.assertEqual(pathlib.Path(path).read_text(), "print(1)\n")

    def test_python3_with_empty_libs_list(self):
        ok, _, path = compile_code_in_sandbox(
            "print(1)\n", "python3", self.dir, []
        )
        self.assertTrue(ok)
        self.assertTrue(pathlib.Path(path).exists())

    def _compile_cpp(self, mock_result=None, side_effect=None, libs=None):
        exe = self.dir / "user_program"
        exe.write_text("")
        with patch(
            "submissions.judge_utils.compilation.subprocess.run"
        ) as mock_run:
            if side_effect is not None:
                mock_run.side_effect = side_effect
            else:
                mock_run.return_value = mock_result
            result = compile_code_in_sandbox(
                "int main(){}", "cpp17", self.dir, libs
            )
            argv = mock_run.call_args[0][0] if mock_run.call_count else None
        return result, argv

    def test_cpp17_success(self):
        result, argv = self._compile_cpp(mock_result=_run_result(0, "ok", ""))
        ok, out, path = result
        self.assertTrue(ok)
        self.assertEqual(path, str(self.dir / "user_program"))
        for expected in (
            "docker", "run", "--rm", "--user", "1000:1000",
            "--cap-drop=ALL", "--security-opt=no-new-privileges",
            "--network", "none", "-w", "/app", "gcc:latest",
            "g++", "user_code.cpp", "-o", "user_program",
        ):
            self.assertIn(expected, argv)
        self.assertIn("Compilation successful", out)

    def test_cpp17_compile_failure(self):
        result, _ = self._compile_cpp(mock_result=_run_result(1, "", "err: x"))
        ok, out, path = result
        self.assertFalse(ok)
        self.assertIsNone(path)
        self.assertIn("failed (return code 1)", out)

    def test_cpp17_timeout(self):
        result, _ = self._compile_cpp(
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=30)
        )
        ok, out, path = result
        self.assertFalse(ok)
        self.assertIn("timed out", out)
        self.assertIsNone(path)

    def test_cpp17_docker_missing(self):
        result, _ = self._compile_cpp(side_effect=FileNotFoundError("docker"))
        ok, out, path = result
        self.assertFalse(ok)
        self.assertIn("Docker command not found", out)
        self.assertIsNone(path)

    def test_cpp17_generic_error(self):
        result, _ = self._compile_cpp(side_effect=OSError("nope"))
        ok, out, path = result
        self.assertFalse(ok)
        self.assertIn("system error", out)
        self.assertIsNone(path)

    def test_cpp17_boost_mounted_when_configured(self):
        boost_tmp = tempfile.TemporaryDirectory(prefix="wc_boost_")
        self.addCleanup(boost_tmp.cleanup)
        with override_settings(JUDGE_BOOST_HEADERS_PATH=boost_tmp.name):
            result, argv = self._compile_cpp(
                mock_result=_run_result(0, "", ""), libs=["boost_headers"]
            )
        ok, _, _ = result
        self.assertTrue(ok)
        self.assertIn(
            ["-v", "%s:%s:ro" % (boost_tmp.name, CONTAINER_BOOST_INCLUDE_PATH)],
            [argv[i:i + 2] for i in range(len(argv) - 1)],
        )
        self.assertIn("-I%s" % CONTAINER_BOOST_INCLUDE_PATH, argv)

    def test_cpp17_boost_path_missing(self):
        with override_settings(JUDGE_BOOST_HEADERS_PATH=str(self.dir / "missing")):
            result, argv = self._compile_cpp(
                mock_result=_run_result(0, "", ""), libs=["boost_headers"]
            )
        self.assertTrue(result[0])
        self.assertNotIn("-I%s" % CONTAINER_BOOST_INCLUDE_PATH, argv)

    def test_cpp17_boost_not_configured(self):
        with override_settings(JUDGE_BOOST_HEADERS_PATH=""):
            result, argv = self._compile_cpp(
                mock_result=_run_result(0, "", ""), libs=["boost_headers"]
            )
        self.assertTrue(result[0])
        self.assertNotIn("-I%s" % CONTAINER_BOOST_INCLUDE_PATH, argv)

    def _compile_java(self, mock_result=None, side_effect=None):
        (self.dir / "Main.class").write_text("")
        with patch(
            "submissions.judge_utils.compilation.subprocess.run"
        ) as mock_run:
            if side_effect is not None:
                mock_run.side_effect = side_effect
            else:
                mock_run.return_value = mock_result
            result = compile_code_in_sandbox(
                "class Main{}", "java11", self.dir, []
            )
            argv = mock_run.call_args[0][0] if mock_run.call_count else None
        return result, argv

    def test_java11_success(self):
        result, argv = self._compile_java(mock_result=_run_result(0, "", ""))
        ok, out, path = result
        self.assertTrue(ok)
        self.assertEqual(path, str(self.dir))
        self.assertIn("javac", argv)
        self.assertIn("openjdk:11-jdk-slim", argv)

    def test_java11_compile_failure(self):
        result, _ = self._compile_java(mock_result=_run_result(2, "", "bad"))
        ok, out, path = result
        self.assertFalse(ok)
        self.assertIsNone(path)
        self.assertIn("failed (return code 2)", out)

    def test_java11_timeout(self):
        result, _ = self._compile_java(
            side_effect=subprocess.TimeoutExpired(cmd="docker", timeout=30)
        )
        self.assertFalse(result[0])
        self.assertIn("timed out", result[1])

    def test_java11_docker_missing(self):
        result, _ = self._compile_java(side_effect=FileNotFoundError("docker"))
        self.assertFalse(result[0])
        self.assertIn("Docker command not found", result[1])

    def test_java11_generic_error(self):
        result, _ = self._compile_java(side_effect=OSError("nope"))
        self.assertFalse(result[0])
        self.assertIn("system error", result[1])

    def test_unsupported_language(self):
        ok, out, path = compile_code_in_sandbox("x", "cobol", self.dir, [])
        self.assertFalse(ok)
        self.assertIn("Unsupported language", out)
        self.assertIsNone(path)


# ---------------------------------------------------------------------------
# judge_utils.execution (subprocess.Popen mocked)
# ---------------------------------------------------------------------------


class ExecutionTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="wc_exec_")
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)

    def _run(self, process=None, popen_exc=None, **kwargs):
        kwargs.setdefault("language", "python3")
        kwargs.setdefault("input_data", "1\n")
        kwargs.setdefault("time_limit_ms", 1000)
        kwargs.setdefault("memory_limit_kb", 262144)
        kwargs.setdefault("source_code", "print(3)")
        kwargs.setdefault("libs", None)
        if kwargs["language"] == "java11":
            executable = str(self.dir)
        else:
            executable = str(self.dir / "user_code.py")
        with patch(
            "submissions.judge_utils.execution.subprocess.Popen",
            side_effect=popen_exc,
            return_value=process,
        ) as mock_popen:
            result = run_code_in_sandbox(
                executable,
                kwargs["language"],
                kwargs["input_data"],
                kwargs["time_limit_ms"],
                kwargs["memory_limit_kb"],
                self.dir,
                kwargs["source_code"],
                kwargs["libs"],
            )
        argv = None
        if mock_popen.call_count:
            argv = mock_popen.call_args[0][0]
        return result, argv, process

    def test_python3_accepted(self):
        proc = _FakeProcess(stdout="3\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), argv, proc = self._run(process=proc)
        self.assertEqual(verdict, AC)
        self.assertEqual(t_ms, 30)
        self.assertEqual(mem_kb, 5120)
        self.assertEqual(out, "3\n")
        self.assertEqual(err, "")
        self.assertEqual(argv[0], "docker")
        self.assertIn("python:3.11-slim", argv)
        mount = "%s:/app:ro" % str(self.dir.resolve())
        self.assertIn(mount, argv)
        self.assertIn(
            ["--network", "none"],
            [argv[i:i + 2] for i in range(len(argv) - 1)],
        )
        self.assertEqual(proc.communicate_kwargs, {"input": "1\n", "timeout": 4.0})

    def test_python3_custom_libs_flow(self):
        stderr = "\n".join(
            [
                "Collecting numpy",
                "Installing collected packages: numpy",
                "Successfully installed numpy",
                "Requirement already satisfied: requests",
                "Attempting to install custom Python libraries...",
                "Finished library installation attempt.",
                "WARNING: The script demo is installed in 'C:\\x' which is not on PATH.",
                "WARNING: The script partial is installed somewhere else.",
                "my program stderr",
                RESOURCE_LINE,
            ]
        )
        proc = _FakeProcess(stdout="9\n", stderr=stderr, returncode=0)
        (verdict, t_ms, mem_kb, out, err), argv, proc = self._run(
            process=proc, libs=["numpy"]
        )
        self.assertEqual(verdict, AC)
        self.assertIn("my program stderr", err)
        self.assertIn("partial is installed somewhere else", err)
        self.assertNotIn("Collecting", err)
        self.assertNotIn("Successfully installed", err)
        req = self.dir / "requirements_custom.txt"
        self.assertEqual(req.read_text(), "numpy\n")
        mount = "%s:/app:rw" % str(self.dir.resolve())
        self.assertIn(mount, argv)
        self.assertIn(
            ["--network", "bridge"],
            [argv[i:i + 2] for i in range(len(argv) - 1)],
        )
        self.assertIn("sh", argv)
        self.assertIn("-c", argv)
        self.assertEqual(proc.communicate_kwargs["timeout"], 11.0)

    def test_python3_libs_pip_failure(self):
        proc = _FakeProcess(
            stderr="ERROR: Could not find a version that satisfies the "
                   "requirement numpy (from versions: none)\n",
            returncode=1,
        )
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(
            process=proc, libs=["numpy"]
        )
        self.assertEqual(verdict, RE)
        self.assertTrue(err.startswith("Python Library Install Error"))
        self.assertIn("Exit code: 1.", err)

    def test_runtime_error_without_resource_line(self):
        proc = _FakeProcess(
            stderr="Traceback (most recent call last):\nRuntimeError: boom\n",
            returncode=1,
        )
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, RE)
        self.assertIn("RuntimeError: boom", err)
        self.assertIn("Exit code: 1.", err)

    def test_runtime_error_with_resource_line(self):
        proc = _FakeProcess(stderr="prog error\n" + RESOURCE_LINE, returncode=1)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, RE)
        self.assertEqual(t_ms, 30)
        self.assertIn("Exit code: 1.", err)

    def test_cpp17_accepted(self):
        proc = _FakeProcess(stdout="7\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), argv, _ = self._run(
            process=proc, language="cpp17"
        )
        self.assertEqual(verdict, AC)
        self.assertIn("gcc:latest", argv)
        self.assertIn("/app/user_code.py", argv)

    def test_exit_code_124_is_tle(self):
        proc = _FakeProcess(stderr="", returncode=124)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, TLE)
        self.assertEqual(t_ms, 1000)
        self.assertIn("Timeout (>", err)

    def test_cpu_time_over_limit_is_tle(self):
        proc = _FakeProcess(
            stderr="5.00 5.00 5120 0 90.0% 10.00", returncode=0
        )
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, TLE)
        self.assertIn("CPU TLE", err)

    def test_resource_line_parse_failure(self):
        proc = _FakeProcess(stderr="xx 0.02 5120 0 90.0% 0.03", returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, AC)
        self.assertEqual(t_ms, -1)

    def test_empty_stderr(self):
        proc = _FakeProcess(stdout="out", stderr="", returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, AC)
        self.assertEqual(err, "")

    def test_whitespace_stderr_skips_line_parsing(self):
        proc = _FakeProcess(stdout="out", stderr="   ", returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, AC)
        self.assertEqual(err, "")

    def test_stderr_without_resource_line(self):
        proc = _FakeProcess(stdout="out", stderr="just a warning", returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, AC)
        self.assertEqual(err, "just a warning")

    def test_java11_plain_run(self):
        proc = _FakeProcess(stdout="5\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), argv, _ = self._run(
            process=proc, language="java11"
        )
        self.assertEqual(verdict, AC)
        self.assertIn("openjdk:11-jre-slim", argv)
        self.assertEqual(argv[-4:], ["java", "-cp", "/app", "Main"])

    def test_java11_libs_mounted_and_filtered(self):
        libs_tmp = tempfile.TemporaryDirectory(prefix="wc_javalibs_")
        self.addCleanup(libs_tmp.cleanup)
        (pathlib.Path(libs_tmp.name) / "ok.jar").write_text("")
        proc = _FakeProcess(stdout="5\n", stderr=RESOURCE_LINE, returncode=0)
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=libs_tmp.name):
            (verdict, _, _, _, _), argv, _ = self._run(
                process=proc,
                language="java11",
                libs=["ok.jar", "../evil.jar", "a/b.jar", "c\\d.jar"],
            )
        self.assertEqual(verdict, AC)
        cp = argv[argv.index("-cp") + 1]
        self.assertEqual(
            cp, "/app:%s/ok.jar" % CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH
        )
        mount = "%s:%s:ro" % (
            str(pathlib.Path(libs_tmp.name).resolve()),
            CONTAINER_JAVA_HOST_LIBS_MOUNT_PATH,
        )
        self.assertIn(mount, argv)

    def test_java11_libs_dir_missing(self):
        proc = _FakeProcess(stdout="", stderr=RESOURCE_LINE, returncode=0)
        with override_settings(
            JUDGE_JAVA_LIBS_DIR_HOST=str(self.dir / "no_such_libs")
        ):
            (verdict, _, _, _, _), argv, _ = self._run(
                process=proc, language="java11", libs=["ok.jar"]
            )
        self.assertEqual(verdict, AC)
        self.assertEqual(argv[argv.index("-cp") + 1], "/app")

    def test_java11_libs_dir_not_a_directory(self):
        libs_file = self.dir / "libs_file"
        libs_file.write_text("")
        proc = _FakeProcess(stdout="", stderr=RESOURCE_LINE, returncode=0)
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=str(libs_file)):
            (verdict, _, _, _, _), argv, _ = self._run(
                process=proc, language="java11", libs=["ok.jar"]
            )
        self.assertEqual(verdict, AC)
        self.assertEqual(argv[argv.index("-cp") + 1], "/app")

    def test_java11_libs_not_configured(self):
        proc = _FakeProcess(stdout="", stderr=RESOURCE_LINE, returncode=0)
        with override_settings(JUDGE_JAVA_LIBS_DIR_HOST=""):
            (verdict, _, _, _, _), argv, _ = self._run(
                process=proc, language="java11", libs=["ok.jar"]
            )
        self.assertEqual(verdict, AC)
        self.assertEqual(argv[argv.index("-cp") + 1], "/app")

    def test_unsupported_language(self):
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(language="cobol")
        self.assertEqual(verdict, IE)
        self.assertIn("Unsupported language for execution: cobol", err)

    def test_communicate_timeout(self):
        proc = _FakeProcess(
            communicate_exc=subprocess.TimeoutExpired(cmd="docker", timeout=4)
        )
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(process=proc)
        self.assertEqual(verdict, TLE)
        self.assertEqual(t_ms, 4000)
        self.assertEqual(mem_kb, 262144)
        self.assertIn("Communicate timeout after 4.0s", err)

    def test_docker_not_found(self):
        (verdict, _, _, out, err), _, _ = self._run(
            popen_exc=FileNotFoundError("docker")
        )
        self.assertEqual(verdict, IE)
        self.assertIn("Docker command not found", err)

    def test_generic_execution_error(self):
        (verdict, _, _, out, err), _, _ = self._run(
            popen_exc=OSError("spawn failed")
        )
        self.assertEqual(verdict, IE)
        self.assertIn("Execution error for python3", err)

    def test_tle_trigger(self):
        proc = _FakeProcess(stdout="3\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(
            process=proc, input_data="please TLE_TRIGGER\n"
        )
        self.assertEqual(verdict, TLE)
        self.assertEqual(t_ms, 1000)
        self.assertEqual(out, "")

    def test_mle_trigger(self):
        proc = _FakeProcess(stdout="3\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(
            process=proc, input_data="mle_trigger"
        )
        self.assertEqual(verdict, MLE)
        self.assertEqual(mem_kb, 262144)
        self.assertEqual(out, "")

    def test_re_trigger(self):
        proc = _FakeProcess(stdout="3\n", stderr=RESOURCE_LINE, returncode=0)
        (verdict, t_ms, mem_kb, out, err), _, _ = self._run(
            process=proc, source_code="x = re_trigger_value"
        )
        self.assertEqual(verdict, RE)
        self.assertIn("Simulated RE by trigger", err)

    def test_zero_time_limit_uses_one_second(self):
        proc = _FakeProcess(stdout="", stderr=RESOURCE_LINE, returncode=0)
        (verdict, _, _, _, _), argv, proc = self._run(
            process=proc, time_limit_ms=0
        )
        self.assertEqual(verdict, AC)
        self.assertIn("2.00s", argv)
        self.assertEqual(proc.communicate_kwargs["timeout"], 4.0)


# ---------------------------------------------------------------------------
# judge_utils.checkers (subprocess.run + Popen mocked)
# ---------------------------------------------------------------------------


class CheckerTests(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory(prefix="wc_checker_")
        self.addCleanup(tmp.cleanup)
        self.dir = pathlib.Path(tmp.name)
        for name in ("input.txt", "user_output.txt", "answer.txt"):
            (self.dir / name).write_text("data\n")
        self.in_path = self.dir / "input.txt"
        self.user_out_path = self.dir / "user_output.txt"
        self.ans_path = self.dir / "answer.txt"

    def _checker(self, process=None, popen_exc=None, run_result=None,
                 run_side_effect=None, language="python3",
                 checker_code="print('ok')"):
        with patch(
            "submissions.judge_utils.checkers.subprocess.run"
        ) as mock_run, patch(
            "submissions.judge_utils.checkers.subprocess.Popen",
            side_effect=popen_exc,
            return_value=process,
        ) as mock_popen:
            if run_side_effect is not None:
                mock_run.side_effect = run_side_effect
            else:
                mock_run.return_value = run_result
            result = run_custom_checker(
                checker_code,
                language,
                self.in_path,
                self.user_out_path,
                self.ans_path,
                self.dir,
            )
        argv = None
        if mock_popen.call_count:
            argv = mock_popen.call_args[0][0]
        return result, argv, mock_run

    def test_python_checker_accepted_with_resources(self):
        proc = _FakeProcess(stdout="OK", stderr=RESOURCE_LINE, returncode=0)
        (verdict, msg), argv, _ = self._checker(process=proc)
        self.assertEqual(verdict, AC)
        self.assertIn("OK", msg)
        self.assertIn("Checker Resources", msg)
        self.assertIn("python:3.11-slim", argv)
        self.assertEqual(
            argv[-5:],
            [
                "python", "/app/checker.py",
                "/app/input.txt", "/app/user_output.txt", "/app/answer.txt",
            ],
        )
        self.assertEqual((self.dir / "checker.py").read_text(), "print('ok')")

    def test_python_checker_times_out(self):
        proc = _FakeProcess(returncode=124)
        (verdict, msg), _, _ = self._checker(process=proc)
        self.assertEqual(verdict, IE)
        self.assertIn("Checker timed out", msg)

    def test_python_checker_signals_wrong_answer(self):
        proc = _FakeProcess(returncode=5)
        (verdict, msg), _, _ = self._checker(process=proc)
        self.assertEqual(verdict, WA)
        self.assertIn("code 5", msg)

    def test_python_checker_communicate_timeout(self):
        proc = _FakeProcess(
            communicate_exc=subprocess.TimeoutExpired(cmd="docker", timeout=13)
        )
        (verdict, msg), _, _ = self._checker(process=proc)
        self.assertEqual(verdict, IE)
        self.assertIn("Checker communication timeout", msg)

    def test_python_checker_docker_missing(self):
        (verdict, msg), _, _ = self._checker(
            popen_exc=FileNotFoundError("docker")
        )
        self.assertEqual(verdict, IE)
        self.assertIn("Docker/checker cmd not found", msg)

    def test_python_checker_generic_error(self):
        (verdict, msg), _, _ = self._checker(popen_exc=ValueError("bad"))
        self.assertEqual(verdict, IE)
        self.assertIn("Checker run error", msg)

    def test_checker_plain_stderr_no_resource_line(self):
        proc = _FakeProcess(stdout="", stderr="note", returncode=0)
        (verdict, msg), _, _ = self._checker(process=proc)
        self.assertEqual(verdict, AC)
        self.assertIn("note", msg)
        self.assertNotIn("Checker Resources", msg)

    def test_checker_empty_stderr(self):
        proc = _FakeProcess(stdout="", stderr="", returncode=0)
        (verdict, msg), _, _ = self._checker(process=proc)
        self.assertEqual(verdict, AC)

    def test_cpp_checker_success(self):
        (self.dir / "checker_program").write_text("")
        proc = _FakeProcess(stdout="", stderr=RESOURCE_LINE, returncode=0)
        (verdict, msg), argv, mock_run = self._checker(
            process=proc,
            run_result=_run_result(0, "", ""),
            language="cpp17",
        )
        self.assertEqual(verdict, AC)
        compile_argv = mock_run.call_args[0][0]
        for expected in ("g++", "checker.cpp", "-o", "checker_program"):
            self.assertIn(expected, compile_argv)
        self.assertIn("/app/checker_program", argv)
        self.assertIn("gcc:latest", argv)

    def test_cpp_checker_compile_failure(self):
        (verdict, msg), _, _ = self._checker(
            run_result=_run_result(1, "", "syntax error"),
            language="cpp17",
        )
        self.assertEqual(verdict, IE)
        self.assertIn("Checker compile failed", msg)
        self.assertIn("syntax error", msg)

    def test_cpp_checker_compile_exception(self):
        (verdict, msg), _, _ = self._checker(
            run_side_effect=OSError("docker down"),
            language="cpp17",
        )
        self.assertEqual(verdict, IE)
        self.assertIn("Checker compile error", msg)

    def test_unsupported_checker_language(self):
        (verdict, msg), _, _ = self._checker(language="ruby")
        self.assertEqual(verdict, IE)
        self.assertIn("Unsupported checker language: ruby", msg)


# ---------------------------------------------------------------------------
# tasks.judge_submission_task (sandbox helpers mocked, compare_outputs real)
# ---------------------------------------------------------------------------


class JudgeSubmissionTaskTests(TestCase):
    def setUp(self):
        self.user = make_user("taskuser")
        self.problem = make_problem(self.user)
        self.submission = make_submission(self.user, self.problem)

    def _apply(self, submission_id):
        return judge_submission_task.apply(args=[submission_id]).get()

    def test_skips_submission_not_pending(self):
        self.submission.verdict = AC
        self.submission.save(update_fields=["verdict"])
        message = self._apply(self.submission.id)
        self.assertIn("not PENDING", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, AC)

    def test_compile_error_path(self):
        make_test_case(self.problem)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(False, "boom: syntax", None),
        ):
            message = self._apply(self.submission.id)
        self.assertIn("Compile Error", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, CE)
        self.assertEqual(self.submission.detailed_feedback, "boom: syntax")
        self.assertEqual(SubmissionTestResult.objects.count(), 0)

    def test_all_accepted_with_compiler_output(self):
        tc = make_test_case(self.problem, expected="3\n", points=10)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "done", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            return_value=(AC, 30, 5120, "3\n", ""),
        ):
            message = self._apply(self.submission.id)
        self.assertIn("judged", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, AC)
        self.assertEqual(self.submission.score, 10)
        self.assertEqual(self.submission.execution_time_ms, 30)
        self.assertEqual(self.submission.memory_used_kb, 5120)
        self.assertIn(
            "Compiler Output:\ndone", self.submission.detailed_feedback
        )
        self.assertIn(
            "Overall Verdict: Accepted", self.submission.detailed_feedback
        )
        result = SubmissionTestResult.objects.get(submission=self.submission)
        self.assertEqual(result.verdict, AC)
        self.assertEqual(result.test_case_id, tc.id)
        self.assertEqual(result.execution_time_ms, 30)

    def test_no_test_cases_and_empty_compiler_output(self):
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "", "fake-exe"),
        ):
            message = self._apply(self.submission.id)
        self.assertIn("judged", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, AC)
        self.assertEqual(self.submission.score, 0)
        self.assertNotIn("Compiler Output", self.submission.detailed_feedback)

    def test_executable_missing_after_compile(self):
        make_test_case(self.problem)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", None),
        ):
            message = self._apply(self.submission.id)
        self.assertIn("judged", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, IE)
        result = SubmissionTestResult.objects.get(submission=self.submission)
        self.assertEqual(result.verdict, IE)
        self.assertIn("Executable path missing", result.error_output)

    def test_wrong_answer_via_comparison(self):
        make_test_case(self.problem, expected="7\n")
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            return_value=(AC, -1, -1, "3\n", ""),
        ):
            self._apply(self.submission.id)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, WA)
        self.assertEqual(self.submission.score, 0)
        result = SubmissionTestResult.objects.get(submission=self.submission)
        self.assertEqual(result.verdict, WA)
        self.assertIsNone(result.execution_time_ms)
        self.assertIsNone(result.memory_used_kb)

    def test_test_case_verdict_not_accepted_skips_comparison(self):
        make_test_case(self.problem, expected="3\n")
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            return_value=(WA, 30, 100, "3\n", "partial mismatch"),
        ), patch(
            "submissions.tasks.compare_outputs"
        ) as mock_compare:
            self._apply(self.submission.id)
        self.assertFalse(mock_compare.called)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, WA)
        result = SubmissionTestResult.objects.get(submission=self.submission)
        self.assertIn("partial mismatch", result.error_output)

    def test_custom_checker_flow(self):
        problem = make_problem(
            self.user,
            comparison_mode=CM.CUSTOM_CHECKER,
            checker_code="print('judge me')",
            checker_language="python3",
        )
        submission = make_submission(self.user, problem)
        make_test_case(problem, order=1, expected="3\n", points=4)
        make_test_case(problem, order=2, expected="4\n", points=6)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            side_effect=[(AC, 10, 100, "o1", ""), (AC, 10, 100, "o2", "warn")],
        ), patch(
            "submissions.tasks.run_custom_checker",
            side_effect=[(AC, "fine"), (WA, "nope")],
        ) as mock_checker:
            message = self._apply(submission.id)
        self.assertIn("judged", message)
        submission.refresh_from_db()
        self.assertEqual(submission.verdict, WA)
        self.assertEqual(submission.score, 4)
        self.assertEqual(mock_checker.call_count, 2)
        results = SubmissionTestResult.objects.filter(
            submission=submission
        ).order_by("test_case__order")
        self.assertEqual(results[0].verdict, AC)
        self.assertIn(
            "Custom Checker Feedback:\nfine", results[0].error_output
        )
        self.assertEqual(results[1].verdict, WA)
        self.assertIn(
            "warn\nCustom Checker Feedback:\nnope", results[1].error_output
        )

    def test_custom_checker_without_code_is_internal_error(self):
        problem = make_problem(
            self.user,
            comparison_mode=CM.CUSTOM_CHECKER,
            checker_code=None,
            checker_language=None,
        )
        submission = make_submission(self.user, problem)
        make_test_case(problem)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            return_value=(AC, 10, 100, "o", ""),
        ):
            self._apply(submission.id)
        submission.refresh_from_db()
        self.assertEqual(submission.verdict, IE)
        result = SubmissionTestResult.objects.get(submission=submission)
        self.assertIn("no checker code/lang", result.error_output)

    def test_second_failure_keeps_first_verdict(self):
        make_test_case(self.problem, order=1)
        make_test_case(self.problem, order=2)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            return_value=(True, "ok", "fake-exe"),
        ), patch(
            "submissions.tasks.run_code_in_sandbox",
            side_effect=[
                (WA, 10, 100, "o1", "e1"),
                (TLE, 10, 100, "o2", "e2"),
            ],
        ):
            self._apply(self.submission.id)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, WA)
        self.assertEqual(
            SubmissionTestResult.objects.filter(
                submission=self.submission
            ).count(),
            2,
        )

    def test_missing_submission(self):
        message = self._apply(999999)
        self.assertIn("not found", message)

    def test_generic_exception_marks_internal_error(self):
        make_test_case(self.problem)
        with patch(
            "submissions.tasks.compile_code_in_sandbox",
            side_effect=RuntimeError("kaboom"),
        ):
            message = self._apply(self.submission.id)
        self.assertIn("Judge internal error", message)
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.verdict, IE)
        self.assertIn(
            "Judge system internal error: kaboom",
            self.submission.detailed_feedback,
        )

    def test_generic_exception_recovery_fails(self):
        submission_id = self.submission.id

        def boom(*args, **kwargs):
            Submission.objects.filter(id=submission_id).delete()
            raise RuntimeError("kaboom")

        with patch(
            "submissions.tasks.compile_code_in_sandbox", side_effect=boom
        ):
            message = judge_submission_task.apply(args=[submission_id]).get()
        self.assertEqual(
            message, "Judge internal error for sub %d." % submission_id
        )
