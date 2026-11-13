"""Wave D engine 2 — Scratch submission pipeline tests.

Covers the submit-time validation (400 paths), the judge-time transpile
hook (transpiled source is compiled under python3; failures land as
COMPILE_ERROR), and the language-fair limits resolution for the scratch
pseudo-language (python3 multipliers, per-problem 'scratch' override).
"""

from __future__ import annotations

import json
from unittest import mock

from django.test import TestCase
from problems.models import Problem, TestCase as ProblemTestCase
from rest_framework import status
from rest_framework.test import APIClient
from users.models import User

from .models import Submission
from .tasks import judge_submission_task

TASKS = "submissions.tasks"


def _project_json(say_text: str = "hi") -> str:
    """A one-script Scratch project: flag → say <literal>."""
    return json.dumps(
        {
            "targets": [
                {
                    "isStage": True,
                    "name": "Stage",
                    "variables": {},
                    "blocks": {},
                },
                {
                    "isStage": False,
                    "name": "Sprite1",
                    "variables": {},
                    "blocks": {
                        "hat": {
                            "opcode": "event_whenflagclicked",
                            "next": "first",
                            "parent": None,
                            "inputs": {},
                            "fields": {},
                            "topLevel": True,
                            "shadow": False,
                            "x": 40,
                            "y": 40,
                        },
                        "first": {
                            "opcode": "looks_say",
                            "next": None,
                            "parent": "hat",
                            "inputs": {"MESSAGE": [1, [3, say_text]]},
                            "fields": {},
                            "topLevel": False,
                            "shadow": False,
                        },
                    },
                },
            ],
            "monitors": [],
            "extensions": [],
            "meta": {"semvem": "3.0.0", "semver": "3.0.0"},
        }
    )


def _call(submission_id):
    return judge_submission_task.apply(args=[submission_id]).get()


class ScratchSubmitValidationTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="su", password="p")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.problem = Problem.objects.create(
            title_i18n={"en": "Scratch P"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            allowed_languages=["scratch"],
            block_config={
                "engine": "scratch",
                "scratch_blocks": ["event_whenflagclicked", "looks_say"],
            },
        )

    def test_valid_scratch_submission_accepted(self):
        with mock.patch("submissions.views.judge_task") as task:
            resp = self.client.post(
                "/api/v1/submissions/submit/",
                {
                    "problem": self.problem.id,
                    "language": "scratch",
                    "code": _project_json(),
                },
                format="json",
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        task.delay.assert_called_once()

    def test_scratch_to_non_scratch_problem_rejected(self):
        plain = Problem.objects.create(
            title_i18n={"en": "Plain"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            allowed_languages=["python3"],
        )
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {"problem": plain.id, "language": "scratch", "code": _project_json()},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("not allowed for this problem", str(resp.json()))

    def test_scratch_to_blockly_problem_rejected(self):
        # allowed_languages lists scratch, but the block engine is Blockly:
        # the engine check names the mismatch precisely.
        blockly = Problem.objects.create(
            title_i18n={"en": "B"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            allowed_languages=["scratch"],
            block_config={"generator": "python3"},
        )
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {"problem": blockly.id, "language": "scratch", "code": _project_json()},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("does not accept Scratch", str(resp.json()))

    def test_disallowed_block_rejected(self):
        # A project that also uses a variable block, which this problem's
        # curated set does not allow.
        project = json.loads(_project_json())
        project["targets"][1]["blocks"]["first"]["next"] = "setter"
        project["targets"][1]["blocks"]["setter"] = {
            "opcode": "data_setvariableto",
            "next": None,
            "parent": "first",
            "inputs": {"VALUE": [1, [4, "1"]]},
            "fields": {"VARIABLE": ["n", "var-n"]},
            "topLevel": False,
            "shadow": False,
        }
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {
                "problem": self.problem.id,
                "language": "scratch",
                "code": json.dumps(project),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("data_setvariableto", str(resp.json()))

    def test_unmapped_block_rejected(self):
        project = json.loads(_project_json())
        project["targets"][1]["blocks"]["first"]["opcode"] = "motion_movesteps"
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {
                "problem": self.problem.id,
                "language": "scratch",
                "code": json.dumps(project),
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("no judged mapping", str(resp.json()))

    def test_invalid_json_rejected(self):
        resp = self.client.post(
            "/api/v1/submissions/submit/",
            {"problem": self.problem.id, "language": "scratch", "code": "{oops"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ScratchJudgeTaskTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="ju", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "Scratch J"},
            statement_i18n={"en": "S"},
            comparison_mode=Problem.ComparisonMode.EXACT,
            allowed_languages=["scratch"],
        )
        self.tc = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="",
            expected_output_data="hi",
            points=10,
            order=1,
        )

    def _sub(self, code):
        return Submission.objects.create(
            user=self.user, problem=self.problem, language="scratch", code=code
        )

    def test_scratch_transpiles_and_judges_as_python3(self):
        sub = self._sub(_project_json("hi"))
        with (
            mock.patch(f"{TASKS}.compile_code_in_sandbox") as compile_mock,
            mock.patch(
                f"{TASKS}.run_code_in_sandbox",
                return_value=(Submission.VerdictStatus.ACCEPTED, 5, 100, "hi", ""),
            ),
            mock.patch(f"{TASKS}.compare_outputs_detailed", return_value=(True, None)),
        ):
            compile_mock.return_value = (True, "ok", "/tmp/exe")
            msg = _call(sub.id)
        # The JUDGE sees the transpiled PYTHON source under python3 —
        # the scratch project JSON itself never reaches the sandbox.
        compile_mock.assert_called_once()
        args = compile_mock.call_args[0]
        self.assertEqual(args[1], "python3")
        self.assertIn("print(_wc_fmt", args[0])
        self.assertIn("Generated by WebCoder", args[0])
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.ACCEPTED)
        self.assertEqual(sub.score, 10)
        self.assertIn("judged", msg)

    def test_transpile_failure_is_compile_error(self):
        sub = self._sub("not json at all")
        with mock.patch(f"{TASKS}.compile_code_in_sandbox") as compile_mock:
            msg = _call(sub.id)
        compile_mock.assert_not_called()
        sub.refresh_from_db()
        self.assertEqual(sub.verdict, Submission.VerdictStatus.COMPILE_ERROR)
        self.assertIn("could not be translated", sub.detailed_feedback)
        self.assertIn("transpile error", msg)


class ScratchEffectiveLimitsTest(TestCase):
    """Scratch inherits python3's J5 multipliers; overrides still win."""

    def test_scratch_uses_python3_multipliers(self):
        from .judge_utils.languages import SCRATCH_LANGUAGE_ID, effective_limits

        time_ms, memory_kb = effective_limits(1000, 65536, SCRATCH_LANGUAGE_ID)
        py_time, py_mem = effective_limits(1000, 65536, "python3")
        self.assertEqual(time_ms, py_time)
        self.assertEqual(memory_kb, py_mem)
        self.assertEqual(time_ms, 3000)

    def test_scratch_override_beats_multipliers(self):
        from .judge_utils.languages import SCRATCH_LANGUAGE_ID, effective_limits

        time_ms, memory_kb = effective_limits(
            1000,
            65536,
            SCRATCH_LANGUAGE_ID,
            {"scratch": {"time_ms": 1500, "memory_kb": 999999}},
        )
        self.assertEqual(time_ms, 1500)
        self.assertEqual(memory_kb, 999999)

    def test_judged_language_mapping(self):
        from .judge_utils.languages import SCRATCH_LANGUAGE_ID, judged_language

        self.assertEqual(judged_language(SCRATCH_LANGUAGE_ID), "python3")
        self.assertEqual(judged_language("cpp17"), "cpp17")


class ScratchProblemSerializerTest(TestCase):
    """Authoring-side: block_config engine validation + scratch allowlist."""

    def _data(self, **overrides):
        base = {
            "title_i18n": {"en": "T"},
            "statement_i18n": {"en": "S"},
            "allowed_languages": ["scratch"],
            "block_config": {
                "engine": "scratch",
                "scratch_blocks": ["event_whenflagclicked", "looks_say"],
            },
        }
        base.update(overrides)
        return base

    def _check(self, data):
        from problems.serializers import ProblemSerializer

        serializer = ProblemSerializer(data=data)
        return serializer.is_valid(), serializer.errors

    def test_scratch_engine_config_valid(self):
        ok, errors = self._check(self._data())
        self.assertTrue(ok, errors)

    def test_bad_engine_rejected(self):
        ok, errors = self._check(self._data(block_config={"engine": "scratchjr"}))
        self.assertFalse(ok)
        self.assertIn("block_config", errors)

    def test_unknown_opcode_in_allowlist_rejected(self):
        ok, errors = self._check(
            self._data(
                block_config={
                    "engine": "scratch",
                    "scratch_blocks": ["event_whenflagclicked", "motion_glide"],
                }
            )
        )
        self.assertFalse(ok)
        self.assertIn("motion_glide", str(errors))

    def test_scratch_project_must_be_string(self):
        ok, errors = self._check(
            self._data(
                block_config={
                    "engine": "scratch",
                    "scratch_project": {"not": "a string"},
                }
            )
        )
        self.assertFalse(ok)
        self.assertIn("scratch_project", str(errors))

    def test_scratch_blocks_must_be_list_of_strings(self):
        ok, errors = self._check(
            self._data(
                block_config={
                    "engine": "scratch",
                    "scratch_blocks": "looks_say",
                }
            )
        )
        self.assertFalse(ok)
        self.assertIn("scratch_blocks", str(errors))

    def test_unknown_scratch_key_rejected(self):
        ok, errors = self._check(
            self._data(block_config={"engine": "scratch", "generator": "python3"})
        )
        self.assertFalse(ok)
        self.assertIn("Unknown block_config keys", str(errors))

    def test_blockly_keys_still_valid(self):
        ok, errors = self._check(
            self._data(
                allowed_languages=["python3"],
                block_config={"generator": "python3"},
            )
        )
        self.assertTrue(ok, errors)

    def test_scratch_language_allowed_in_list(self):
        ok, errors = self._check(self._data())
        self.assertTrue(ok, errors)

    def test_unknown_language_still_rejected(self):
        ok, errors = self._check(self._data(allowed_languages=["turbo-pascal"]))
        self.assertFalse(ok)
        self.assertIn("turbo-pascal", str(errors))

    def test_effective_limits_include_scratch_row(self):
        from problems.serializers import ProblemSerializer
        from users.models import User

        user = User.objects.create_user(
            username="scratchser", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        serializer = ProblemSerializer(data=self._data())
        self.assertTrue(serializer.is_valid(), serializer.errors)
        problem = serializer.save(author=user)
        detail = ProblemSerializer(problem)
        limits = detail.data["effective_limits"]
        self.assertIn("scratch", limits)
        # Python3 row: 3x the 1000ms C-baseline default.
        self.assertEqual(limits["scratch"]["time_ms"], 3000)
