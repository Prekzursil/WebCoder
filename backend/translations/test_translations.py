"""Community translation pipeline tests (i18n wave, owner rule (c)).

Propose → curate → promote → notify, with the EN-mandatory interaction
(English is the source, never a proposal target) and atomic promotion
(two verifiers can never half-promote). AI-curator integration (including
the mocked-HTTP timeout/fail-open/auto-approve paths) lives in
test_ai_curator.py.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from notifications.models import Notification
from problems.models import Problem
from translations.models import TranslationProposal

User = get_user_model()

PROPOSE_URL = "/api/v1/translations/proposals/"


def _approved_problem(**overrides):
    fields = dict(
        title_i18n={"en": "Two Sum", "ro": "Suma a două numere"},
        statement_i18n={
            "en": "Return indices of the two numbers adding up to target.",
            "ro": "Returnează indicii celor două numere care adună la țintă.",
        },
        status=Problem.ProblemStatus.APPROVED,
        difficulty=Problem.DifficultyLevel.EASY,
    )
    fields.update(overrides)
    return Problem.objects.create(**fields)


class ProposeFlowTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw-12345678")
        self.bob = User.objects.create_user(username="bob", password="pw-12345678")
        self.verifier = User.objects.create_user(
            username="verifier",
            password="pw-12345678",
            role=User.Roles.PROBLEM_VERIFIER,
        )
        self.problem = _approved_problem()
        self.client = APIClient()

    def _propose(
        self, language="ro", title=None, statement=None, problem_id=None, client=None
    ):
        payload = {
            "problem": problem_id if problem_id is not None else self.problem.id,
            "language": language,
            # `is None` (not truthiness) so tests can pass explicit blanks.
            "title": "Suma a două numere" if title is None else title,
            "statement": (
                "Returnează indicii celor două numere care adună la țintă."
                if statement is None
                else statement
            ),
        }
        return (client or self.client).post(PROPOSE_URL, payload, format="json")

    def test_anonymous_cannot_propose(self):
        response = self._propose()
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_proposal_is_created_pending(self):
        self.client.force_authenticate(self.alice)
        response = self._propose()
        self.assertEqual(
            response.status_code, status.HTTP_201_CREATED, response.content
        )
        self.assertEqual(response.data["status"], "PENDING")
        self.assertEqual(response.data["contributor_username"], "alice")
        self.assertEqual(response.data["ai_verdict"], "")
        proposal = TranslationProposal.objects.get(pk=response.data["id"])
        self.assertEqual(proposal.problem_id, self.problem.id)
        self.assertEqual(proposal.language, "ro")

    def test_english_cannot_be_proposed(self):
        # Owner rule (b): EN is the mandatory authoring source — corrections
        # go through the problem-edit/verification flow, not translations.
        self.client.force_authenticate(self.alice)
        response = self._propose(language="en")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_language_is_rejected(self):
        self.client.force_authenticate(self.alice)
        response = self._propose(language="xx")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_only_published_problems_accept_proposals(self):
        draft = _approved_problem(
            title_i18n={"en": "Draft"},
            statement_i18n={"en": "Draft body"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.client.force_authenticate(self.alice)
        response = self._propose(problem_id=draft.id)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_one_pending_per_problem_language_user(self):
        self.client.force_authenticate(self.alice)
        first = self._propose()
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self._propose(title="Alt titlu", statement="Alt corp")
        self.assertEqual(second.status_code, status.HTTP_409_CONFLICT)

    def test_after_rejection_a_new_proposal_is_allowed(self):
        self.client.force_authenticate(self.alice)
        self._propose()
        admin = APIClient()
        admin.force_authenticate(self.verifier)
        proposal = TranslationProposal.objects.get()
        decision = admin.post(
            f"{PROPOSE_URL}{proposal.id}/reject/",
            {"note": "mistranslation"},
            format="json",
        )
        self.assertEqual(decision.status_code, status.HTTP_200_OK, decision.content)
        again = self._propose(title="Titlu corect", statement="Corp corect.")
        self.assertEqual(again.status_code, status.HTTP_201_CREATED, again.content)

    def test_different_users_may_propose_same_language(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(self._propose().status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(self.bob)
        self.assertEqual(self._propose().status_code, status.HTTP_201_CREATED)

    def test_empty_title_or_statement_rejected(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self._propose(title="  ").status_code, status.HTTP_400_BAD_REQUEST
        )
        self.assertEqual(
            self._propose(statement="").status_code, status.HTTP_400_BAD_REQUEST
        )

    def test_languages_catalog_endpoint_lists_translatable_locales(self):
        response = self.client.get("/api/v1/translations/languages/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        codes = [entry["code"] for entry in response.data["results"]]
        self.assertEqual(
            codes,
            [
                "ro",
                "es",
                "fr",
                "de",
                "pt",
                "it",
                "ca",
                "pl",
                "hu",
                "hr",
                "sr-Latn",
                "ru",
                "uk",
                "bg",
                "el",
                "zh-Hans",
                "zh-Hant",
                "ja",
                "ko",
                "hi",
                "vi",
                "th",
                "id",
                "tr",
                "kk",
                "ar",
                "fa",
            ],  # TRANSLATABLE_LANGUAGES: every registry locale except 'en'
        )
        self.assertIn("endonym", response.data["results"][0])


class CurationQueueTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw-12345678")
        self.verifier = User.objects.create_user(
            username="verifier",
            password="pw-12345678",
            role=User.Roles.PROBLEM_VERIFIER,
        )
        self.admin = User.objects.create_user(
            username="admin", password="pw-12345678", role=User.Roles.ADMIN
        )
        self.problem = _approved_problem()
        self.proposal = TranslationProposal.objects.create(
            problem=self.problem,
            language="fr",
            title="Somme de deux",
            statement="Renvoie les indices des deux nombres…",
            contributor=self.alice,
        )
        TranslationProposal.objects.create(
            problem=self.problem,
            language="de",
            title="Summe zweier Zahlen",
            statement="Gib die Indizes der beiden Zahlen zurück…",
            contributor=self.alice,
        )

    def test_queue_requires_verifier_role(self):
        for user in (None, self.alice):
            client = APIClient()
            if user:
                client.force_authenticate(user)
            response = client.get(PROPOSE_URL)
            expected = (
                status.HTTP_401_UNAUTHORIZED
                if user is None
                else status.HTTP_403_FORBIDDEN
            )
            self.assertEqual(response.status_code, expected)

    def test_queue_lists_proposals_for_verifier(self):
        client = APIClient()
        client.force_authenticate(self.verifier)
        response = client.get(PROPOSE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)

    def test_queue_filters_status_language_problem(self):
        client = APIClient()
        client.force_authenticate(self.verifier)
        by_language = client.get(PROPOSE_URL, {"language": "fr"})
        self.assertEqual(by_language.data["count"], 1)
        self.assertEqual(by_language.data["results"][0]["language"], "fr")

        by_problem = client.get(
            PROPOSE_URL, {"problem": self.problem.id, "language": "de"}
        )
        self.assertEqual(by_problem.data["count"], 1)

        decided = client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        self.assertEqual(decided.status_code, status.HTTP_200_OK, decided.content)
        pending_only = client.get(PROPOSE_URL, {"status": "PENDING"})
        self.assertEqual(pending_only.data["count"], 1)
        approved_only = client.get(PROPOSE_URL, {"status": "APPROVED"})
        self.assertEqual(approved_only.data["count"], 1)

    def test_mine_lists_own_proposals_with_decisions(self):
        client = APIClient()
        client.force_authenticate(self.alice)
        response = client.get(f"{PROPOSE_URL}mine/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 2)
        # mine/ is scoped — the verifier's queue and alice's list agree on
        # nothing else (no cross-user leakage).
        other = User.objects.create_user(username="other", password="pw-12345678")
        client.force_authenticate(other)
        empty = client.get(f"{PROPOSE_URL}mine/")
        self.assertEqual(empty.data["count"], 0)


class ApproveRejectTests(APITestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw-12345678")
        self.verifier = User.objects.create_user(
            username="verifier",
            password="pw-12345678",
            role=User.Roles.PROBLEM_VERIFIER,
        )
        self.admin = User.objects.create_user(
            username="admin", password="pw-12345678", role=User.Roles.ADMIN
        )
        self.basic = User.objects.create_user(username="basic", password="pw-12345678")
        self.problem = _approved_problem()
        self.proposal = TranslationProposal.objects.create(
            problem=self.problem,
            language="fr",
            title="Somme de deux",
            statement="Renvoie les indices des deux nombres…",
            contributor=self.alice,
        )
        self.admin_client = APIClient()
        self.admin_client.force_authenticate(self.admin)

    def test_basic_user_cannot_approve(self):
        client = APIClient()
        client.force_authenticate(self.basic)
        response = client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_approve_promotes_translation_atomically(self):
        response = self.admin_client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)

        self.problem.refresh_from_db()
        self.assertEqual(self.problem.title_i18n["fr"], "Somme de deux")
        self.assertEqual(
            self.problem.statement_i18n["fr"], "Renvoie les indices des deux nombres…"
        )
        # The English source and existing Romanian survive untouched.
        self.assertEqual(self.problem.title_i18n["en"], "Two Sum")
        self.assertEqual(self.problem.title_i18n["ro"], "Suma a două numere")

        self.proposal.refresh_from_db()
        self.assertEqual(self.proposal.status, TranslationProposal.Status.APPROVED)
        self.assertEqual(self.proposal.reviewer, self.admin)
        self.assertIsNotNone(self.proposal.reviewed_at)

        # Availability now includes the approved locale.
        from problems.i18n_fields import available_languages

        self.assertIn("fr", available_languages(self.problem))

    def test_approve_is_idempotent_guarded(self):
        first = self.admin_client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        second = self.admin_client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        # …and the translation was written exactly once.
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.title_i18n["fr"], "Somme de deux")

    def test_approve_normalizes_legacy_non_dict_i18n(self):
        legacy = Problem.objects.create(
            title_i18n="plain legacy title",
            statement_i18n="plain legacy body",
            status=Problem.ProblemStatus.APPROVED,
        )
        proposal = TranslationProposal.objects.create(
            problem=legacy,
            language="ro",
            title="Suma",
            statement="Corpul problemei.",
            contributor=self.alice,
        )
        response = self.admin_client.post(f"{PROPOSE_URL}{proposal.id}/approve/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        legacy.refresh_from_db()
        self.assertEqual(legacy.title_i18n, {"ro": "Suma"})
        self.assertEqual(legacy.statement_i18n, {"ro": "Corpul problemei."})

    def test_approve_notifies_contributor(self):
        with self.captureOnCommitCallbacks(execute=True):
            self.admin_client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        notification = Notification.objects.filter(
            recipient=self.alice, verb="TRANSLATION_APPROVED"
        ).get()
        self.assertEqual(notification.actor, self.admin)
        self.assertEqual(notification.data["language"], "fr")
        self.assertEqual(notification.data["problem_id"], self.problem.id)

    def test_reject_keeps_problem_untouched_and_notifies_with_note(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.admin_client.post(
                f"{PROPOSE_URL}{self.proposal.id}/reject/",
                {"note": "Mistranslated 'indices'."},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.problem.refresh_from_db()
        self.assertNotIn("fr", self.problem.title_i18n)

        self.proposal.refresh_from_db()
        self.assertEqual(self.proposal.status, TranslationProposal.Status.REJECTED)
        self.assertEqual(self.proposal.review_note, "Mistranslated 'indices'.")

        notification = Notification.objects.filter(
            recipient=self.alice, verb="TRANSLATION_REJECTED"
        ).get()
        self.assertEqual(notification.data["note"], "Mistranslated 'indices'.")

    def test_reject_twice_is_rejected(self):
        self.admin_client.post(
            f"{PROPOSE_URL}{self.proposal.id}/reject/", format="json"
        )
        second = self.admin_client.post(
            f"{PROPOSE_URL}{self.proposal.id}/reject/", format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_problem_detail_carries_attribution(self):
        self.admin_client.post(f"{PROPOSE_URL}{self.proposal.id}/approve/")
        detail = self.admin_client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        translations = detail.data["translations"]
        self.assertEqual(len(translations), 1)
        self.assertEqual(translations[0]["language"], "fr")
        self.assertEqual(translations[0]["contributor_username"], "alice")
        self.assertIn("reviewed_at", translations[0])


class ProposeThrottleTests(APITestCase):
    """The propose endpoint is rate-limited under its own scope.

    settings_ci disables default throttle classes (see
    users/test_throttling.py) — this opts back in by patching the class
    attributes the same way, with a unique REMOTE_ADDR as the cache key.
    """

    def test_third_proposal_in_an_hour_is_429(self):
        from unittest import mock

        from django.core.cache import cache
        from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle

        from translations.views import TranslationProposalViewSet

        # The throttle history lives in the process-global cache and keys on
        # user pk — which repeats across rolled-back tests. Start clean.
        cache.clear()
        user = User.objects.create_user(username="alice", password="pw-12345678")
        problem = _approved_problem()
        client = APIClient()
        client.force_authenticate(user)
        ip = {"REMOTE_ADDR": "10.7.9.1"}

        payload = {
            "problem": problem.id,
            "title": "Titlu",
            "statement": "Corpul traducerii.",
        }
        with (
            mock.patch.object(
                SimpleRateThrottle,
                "THROTTLE_RATES",
                {
                    "anon": "10000/min",
                    "user": "10000/min",
                    "translation_propose": "2/hour",
                },
            ),
            mock.patch.object(
                TranslationProposalViewSet, "throttle_classes", [ScopedRateThrottle]
            ),
        ):
            for language in ("ro", "de"):
                response = client.post(
                    PROPOSE_URL, dict(payload, language=language), format="json", **ip
                )
                self.assertEqual(
                    response.status_code, status.HTTP_201_CREATED, response.content
                )
            third = client.post(
                PROPOSE_URL, dict(payload, language="fr"), format="json", **ip
            )
            self.assertEqual(third.status_code, status.HTTP_429_TOO_MANY_REQUESTS)


class ModelStringTests(APITestCase):
    def test_str_repr(self):
        from translations.models import TranslationProposal

        user = User.objects.create_user(username="alice", password="pw-12345678")
        problem = _approved_problem()
        proposal = TranslationProposal.objects.create(
            problem=problem,
            language="ro",
            title="Suma",
            statement="Corp",
            contributor=user,
        )
        text = str(proposal)
        self.assertIn("ro", text)
        self.assertIn(str(problem.id), text)
        self.assertIn("PENDING", text)
