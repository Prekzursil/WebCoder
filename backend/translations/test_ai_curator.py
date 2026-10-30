"""AI curator tests — mocked HTTP transport (i18n wave, owner rule (c)).

The adapter is exercised end-to-end behind an injected transport: verdict
parsing, code-fence tolerance, clamping, timeouts, HTTP errors, malformed
replies, config-from-env (OFF unless AI_CURATOR_URL), and the two
promotion policies (human-confirm default vs AI_CURATOR_AUTO_APPROVE).
Every failure mode must fail OPEN to human review — never reject.
"""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from problems.models import Problem
from translations.ai_curator import (
    CuratorConfig,
    OpenAICompatibleCurator,
    _extract_json,
    curator_from_env,
)
from translations.models import TranslationProposal
from translations.views import curator_from_env as view_curator_from_env  # noqa: F401

User = get_user_model()

PROPOSE_URL = "/api/v1/translations/proposals/"

PROBLEM_EN = {
    "title": "Two Sum",
    "statement": "Return indices of the two numbers adding up to target.",
}
PROPOSAL_FR = {
    "language": "fr",
    "title": "Somme de deux",
    "statement": "Renvoie les indices des deux nombres qui somment à la cible.",
}


def _ok_transport(verdict="approve", confidence=0.93, notes="Faithful, fluent."):
    content = (
        '{"verdict": "%s", "confidence": %s, "notes": "%s"}' % (verdict, confidence, notes)
    )

    def transport(url, headers, payload, timeout_s):
        return {"choices": [{"message": {"content": content}}]}

    return transport


class CuratorConfigTests(TestCase):
    def test_off_when_url_missing(self):
        self.assertIsNone(CuratorConfig.from_env({}))
        self.assertIsNone(curator_from_env({}))
        self.assertIsNone(CuratorConfig.from_env({"AI_CURATOR_MODEL": "gpt-x"}))

    def test_config_from_env(self):
        config = CuratorConfig.from_env(
            {
                "AI_CURATOR_URL": "http://curator.local/v1/",
                "AI_CURATOR_API_KEY": "sekrit",
                "AI_CURATOR_MODEL": "gpt-5-mini",
                "AI_CURATOR_TIMEOUT_S": "5",
                "AI_CURATOR_AUTO_APPROVE": "true",
            }
        )
        self.assertEqual(config.url, "http://curator.local/v1")
        self.assertEqual(config.api_key, "sekrit")
        self.assertEqual(config.model, "gpt-5-mini")
        self.assertEqual(config.timeout_s, 5.0)
        self.assertTrue(config.auto_approve)

    def test_timeout_clamped_to_hard_ceiling(self):
        config = CuratorConfig.from_env(
            {"AI_CURATOR_URL": "u", "AI_CURATOR_TIMEOUT_S": "9999"}
        )
        self.assertEqual(config.timeout_s, 30.0)

    def test_bad_timeout_falls_back_to_default(self):
        config = CuratorConfig.from_env(
            {"AI_CURATOR_URL": "u", "AI_CURATOR_TIMEOUT_S": "soon"}
        )
        self.assertEqual(config.timeout_s, 10.0)

    def test_auto_approve_default_false(self):
        config = CuratorConfig.from_env({"AI_CURATOR_URL": "u"})
        self.assertFalse(config.auto_approve)
        self.assertFalse(
            CuratorConfig.from_env(
                {"AI_CURATOR_URL": "u", "AI_CURATOR_AUTO_APPROVE": "false"}
            ).auto_approve
        )
        self.assertTrue(
            CuratorConfig.from_env(
                {"AI_CURATOR_URL": "u", "AI_CURATOR_AUTO_APPROVE": "1"}
            ).auto_approve
        )

    def test_curator_from_env_builds_curator(self):
        curator = curator_from_env({"AI_CURATOR_URL": "http://x/v1"})
        self.assertIsInstance(curator, OpenAICompatibleCurator)


class ExtractJsonTests(TestCase):
    def test_plain_object(self):
        self.assertEqual(_extract_json('{"verdict": "approve"}'), {"verdict": "approve"})

    def test_code_fenced(self):
        self.assertEqual(
            _extract_json('```json\n{"verdict": "flag"}\n```'), {"verdict": "flag"}
        )

    def test_prose_wrapped(self):
        self.assertEqual(
            _extract_json('Sure! Here it is: {"verdict": "approve"} hope it helps'),
            {"verdict": "approve"},
        )

    def test_no_object_raises(self):
        for bad in ("", "no json here", "[1,2,3]"):
            with self.assertRaises(ValueError):
                _extract_json(bad)


class CuratorScreeningTests(TestCase):
    def _curator(self, transport, **env):
        config = CuratorConfig.from_env(
            {"AI_CURATOR_URL": "http://curator.local/v1", "AI_CURATOR_MODEL": "m", **env}
        )
        return OpenAICompatibleCurator(config, transport=transport)

    def test_screen_returns_approve(self):
        result = self._curator(_ok_transport()).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(result.verdict, "approve")
        self.assertEqual(result.confidence, 0.93)
        self.assertEqual(result.notes, "Faithful, fluent.")

    def test_screen_returns_flag(self):
        result = self._curator(_ok_transport(verdict="flag", confidence=0.4)).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(result.verdict, "flag")
        self.assertEqual(result.confidence, 0.4)

    def test_confidence_clamped(self):
        result = self._curator(_ok_transport(confidence=7)).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(result.confidence, 1.0)
        result = self._curator(_ok_transport(confidence=-3)).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(result.confidence, 0.0)

    def test_non_numeric_confidence_becomes_zero(self):
        result = self._curator(
            _ok_transport(confidence='"high"')
        ).screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(result.confidence, 0.0)

    def test_unknown_verdict_is_error_fail_open(self):
        result = self._curator(_ok_transport(verdict="maybe")).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(result.verdict, "error")

    def test_transport_exception_fails_open(self):
        def boom(url, headers, payload, timeout_s):
            raise TimeoutError("read timed out")

        result = self._curator(boom).screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(result.verdict, "error")
        self.assertIn("unavailable", result.notes)

    def test_malformed_reply_fails_open(self):
        def garbage(url, headers, payload, timeout_s):
            return {"choices": [{"message": {"content": "I cannot judge this."}}]}

        result = self._curator(garbage).screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(result.verdict, "error")

    def test_http_structure_mismatch_fails_open(self):
        def weird(url, headers, payload, timeout_s):
            return {"unexpected": True}

        result = self._curator(weird).screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(result.verdict, "error")

    def test_missing_model_id_is_error(self):
        config = CuratorConfig.from_env({"AI_CURATOR_URL": "http://x/v1"})
        curator = OpenAICompatibleCurator(config, transport=_ok_transport())
        result = curator.screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(result.verdict, "error")
        self.assertIn("AI_CURATOR_MODEL", result.notes)

    def test_payload_shape_and_timeout_forwarded(self):
        seen = {}

        def recorder(url, headers, payload, timeout_s):
            seen.update(url=url, headers=headers, payload=payload, timeout_s=timeout_s)
            return {"choices": [{"message": {"content": '{"verdict": "approve", "confidence": 1, "notes": "ok"}'}}]}

        self._curator(recorder).screen(problem_en=PROBLEM_EN, proposal=PROPOSAL_FR)
        self.assertEqual(seen["url"], "http://curator.local/v1/chat/completions")
        self.assertEqual(seen["timeout_s"], 10.0)
        self.assertEqual(seen["payload"]["model"], "m")
        self.assertEqual(seen["payload"]["temperature"], 0)
        self.assertIn("Two Sum", seen["payload"]["messages"][1]["content"])
        self.assertIn("Somme de deux", seen["payload"]["messages"][1]["content"])
        self.assertIn("French", seen["payload"]["messages"][1]["content"])

    def test_api_key_becomes_bearer_header(self):
        seen = {}

        def recorder(url, headers, payload, timeout_s):
            seen["headers"] = headers
            return {"choices": [{"message": {"content": '{"verdict": "approve", "confidence": 1, "notes": "ok"}'}}]}

        config = CuratorConfig.from_env(
            {"AI_CURATOR_URL": "http://x/v1", "AI_CURATOR_MODEL": "m", "AI_CURATOR_API_KEY": "k1"}
        )
        OpenAICompatibleCurator(config, transport=recorder).screen(
            problem_en=PROBLEM_EN, proposal=PROPOSAL_FR
        )
        self.assertEqual(seen["headers"]["Authorization"], "Bearer k1")


class ProposeWithCuratorTests(TestCase):
    """The propose endpoint with the curator ON (mocked transport)."""

    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw-12345678")
        self.verifier = User.objects.create_user(
            username="verifier", password="pw-12345678", role=User.Roles.PROBLEM_VERIFIER
        )
        self.problem = Problem.objects.create(
            title_i18n={"en": "Two Sum"},
            statement_i18n={"en": "Return indices of the two numbers adding up to target."},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def _env(self, **extra):
        return {
            "AI_CURATOR_URL": "http://curator.local/v1",
            "AI_CURATOR_MODEL": "m",
            **extra,
        }

    def _propose(self):
        return self.client.post(
            PROPOSE_URL,
            {
                "problem": self.problem.id,
                "language": "fr",
                "title": "Somme de deux",
                "statement": "Renvoie les indices…",
            },
            format="json",
        )

    def test_curator_off_leaves_ai_fields_empty(self):
        with mock.patch.dict("os.environ", {}, clear=False):
            import os

            saved = {k: os.environ.pop(k, None) for k in list(os.environ) if k.startswith("AI_CURATOR_")}
            try:
                response = self._propose()
            finally:
                for k, v in saved.items():
                    if v is not None:
                        os.environ[k] = v
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["ai_verdict"], "")

    def test_high_confidence_pass_marked_but_needs_human(self):
        curator = OpenAICompatibleCurator(
            CuratorConfig.from_env(self._env()), transport=_ok_transport()
        )
        with mock.patch("translations.views.curator_from_env", return_value=curator):
            response = self._propose()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["ai_verdict"], "approve")
        self.assertEqual(response.data["ai_confidence"], 0.93)
        # Default policy: humans confirm — still PENDING, problem untouched.
        self.assertEqual(response.data["status"], "PENDING")
        self.problem.refresh_from_db()
        self.assertNotIn("fr", self.problem.title_i18n)

    def test_auto_approve_promotes_immediately(self):
        curator = OpenAICompatibleCurator(
            CuratorConfig.from_env(self._env(AI_CURATOR_AUTO_APPROVE="true")),
            transport=_ok_transport(),
        )
        with mock.patch("translations.views.curator_from_env", return_value=curator):
            response = self._propose()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["status"], "APPROVED")
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.title_i18n["fr"], "Somme de deux")

    def test_auto_approve_does_not_promote_flagged_results(self):
        curator = OpenAICompatibleCurator(
            CuratorConfig.from_env(self._env(AI_CURATOR_AUTO_APPROVE="true")),
            transport=_ok_transport(verdict="flag"),
        )
        with mock.patch("translations.views.curator_from_env", return_value=curator):
            response = self._propose()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(response.data["ai_verdict"], "flag")
        self.problem.refresh_from_db()
        self.assertNotIn("fr", self.problem.title_i18n)

    def test_curator_error_fails_open_to_human_queue(self):
        def boom(url, headers, payload, timeout_s):
            raise ConnectionError("curator down")

        curator = OpenAICompatibleCurator(
            CuratorConfig.from_env(self._env()), transport=boom
        )
        with mock.patch("translations.views.curator_from_env", return_value=curator):
            response = self._propose()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(response.data["ai_verdict"], "error")
        self.assertIn("unavailable", response.data["ai_notes"])

    def test_flagged_proposal_can_still_be_human_approved(self):
        curator = OpenAICompatibleCurator(
            CuratorConfig.from_env(self._env()), transport=_ok_transport(verdict="flag")
        )
        with mock.patch("translations.views.curator_from_env", return_value=curator):
            self._propose()
        admin = APIClient()
        admin.force_authenticate(self.verifier)
        proposal = TranslationProposal.objects.get()
        decision = admin.post(f"{PROPOSE_URL}{proposal.id}/approve/")
        self.assertEqual(decision.status_code, status.HTTP_200_OK, decision.content)
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.title_i18n["fr"], "Somme de deux")


class DefaultTransportTests(TestCase):
    """The real requests-backed transport (mocked socket, real code path)."""

    def test_posts_with_timeout_and_returns_json(self):
        import translations.ai_curator as ai_curator

        seen = {}

        class FakeResponse:
            def raise_for_status(self):
                pass

            def json(self):
                return {"ok": True}

        def fake_post(url, headers=None, json=None, timeout=None):
            seen.update(url=url, headers=headers, json=json, timeout=timeout)
            return FakeResponse()

        with mock.patch.object(ai_curator.requests, "post", side_effect=fake_post):
            result = ai_curator._default_transport(
                "http://x/v1/chat/completions",
                {"Authorization": "Bearer k"},
                {"model": "m"},
                7.5,
            )
        self.assertEqual(result, {"ok": True})
        self.assertEqual(seen["url"], "http://x/v1/chat/completions")
        self.assertEqual(seen["timeout"], 7.5)
        self.assertEqual(seen["headers"]["Authorization"], "Bearer k")
        self.assertEqual(seen["json"], {"model": "m"})

    def test_http_error_status_propagates(self):
        import translations.ai_curator as ai_curator

        class FakeResponse:
            def raise_for_status(self):
                raise ai_curator.requests.HTTPError("500")

            def json(self):  # pragma: no cover - unreachable after raise
                return {}

        with mock.patch.object(
            ai_curator.requests, "post", return_value=FakeResponse()
        ):
            with self.assertRaises(ai_curator.requests.HTTPError):
                ai_curator._default_transport("http://x", {}, {}, 1.0)


class ProposeRaceTests(TestCase):
    def test_unique_constraint_race_returns_409(self):
        """A duplicate slipping past the pre-check (unique-constraint race)
        degrades to the same friendly 409, never a 500."""
        from django.db import IntegrityError

        user = User.objects.create_user(username="alice", password="pw-12345678")
        problem = Problem.objects.create(
            title_i18n={"en": "Two Sum"},
            statement_i18n={"en": "Body"},
            status=Problem.ProblemStatus.APPROVED,
        )
        client = APIClient()
        client.force_authenticate(user)
        with mock.patch.object(
            TranslationProposal,
            "save",
            side_effect=IntegrityError("UNIQUE constraint failed"),
        ):
            response = client.post(
                PROPOSE_URL,
                {
                    "problem": problem.id,
                    "language": "ro",
                    "title": "T",
                    "statement": "S",
                },
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn("pending proposal", response.data["detail"])
