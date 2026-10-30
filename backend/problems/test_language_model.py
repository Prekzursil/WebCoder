"""EN-mandatory problem language model (i18n & translation platform wave).

Owner rule (b): problems are authored in ONE language — English mandatory
(``title_i18n['en']`` + ``statement_i18n['en']``), other languages optional,
one or many. Rule (d): EN is the universal fallback, so legacy rows are
repaired into that invariant and readers get an availability list.
"""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APIClient, APITestCase

from problems.i18n_fields import (
    LocalizedFieldError,
    available_languages,
    ensure_english,
    normalize_localized_dict,
)
from problems.models import Problem
from webcoder_api.languages import (
    FALLBACK_LANGUAGE,
    SUPPORTED_LANGUAGES,
    SUPPORTED_LANGUAGES_SET,
    TRANSLATABLE_LANGUAGES,
)

User = get_user_model()


class LanguageRegistryTests(APITestCase):
    """The ten-locale registry is the single source of truth."""

    def test_registry_shape(self):
        self.assertEqual(
            SUPPORTED_LANGUAGES,
            ["en", "ro", "es", "fr", "de", "pt", "it", "ru", "pl", "uk"],
        )
        # English mandatory + home market + eight globals; no RTL locale
        # because no RTL layout ships.
        self.assertIn("en", SUPPORTED_LANGUAGES)
        self.assertIn("ro", SUPPORTED_LANGUAGES)
        for rtl in ("ar", "he", "fa"):
            self.assertNotIn(rtl, SUPPORTED_LANGUAGES)
        self.assertEqual(SUPPORTED_LANGUAGES_SET, frozenset(SUPPORTED_LANGUAGES))
        # English is the mandatory authoring language, never a proposal target.
        self.assertNotIn("en", TRANSLATABLE_LANGUAGES)
        self.assertEqual(len(TRANSLATABLE_LANGUAGES), 9)
        self.assertEqual(FALLBACK_LANGUAGE, "en")


class NormalizeLocalizedDictTests(APITestCase):
    """Validation rules for title_i18n / statement_i18n writes."""

    def test_english_only_is_valid(self):
        self.assertEqual(
            normalize_localized_dict({"en": "Two Sum"}, field_name="title_i18n"),
            {"en": "Two Sum"},
        )

    def test_english_plus_many_optional_languages(self):
        value = {"en": "Sum", "ro": "Suma", "fr": "Somme", "pl": "Suma"}
        self.assertEqual(normalize_localized_dict(value, field_name="title_i18n"), value)

    def test_missing_english_is_rejected(self):
        with self.assertRaises(LocalizedFieldError) as ctx:
            normalize_localized_dict({"ro": "Suma"}, field_name="title_i18n")
        self.assertIn("English", str(ctx.exception))

    def test_blank_english_is_rejected(self):
        with self.assertRaises(LocalizedFieldError):
            normalize_localized_dict({"en": "   ", "ro": "Suma"}, field_name="statement_i18n")

    def test_non_dict_is_rejected(self):
        for bad in ("Suma", ["en", "Suma"], 12, None):
            with self.assertRaises(LocalizedFieldError):
                normalize_localized_dict(bad, field_name="title_i18n")

    def test_non_string_value_is_dropped(self):
        # A non-string value is "no translation", dropped — unless it is
        # the English entry, which must exist as a string.
        self.assertEqual(
            normalize_localized_dict({"en": "Sum", "ro": None}, field_name="title_i18n"),
            {"en": "Sum"},
        )

    def test_blank_optional_language_entries_are_dropped(self):
        self.assertEqual(
            normalize_localized_dict(
                {"en": "Sum", "ro": "   "}, field_name="title_i18n"
            ),
            {"en": "Sum"},
        )

    def test_invalid_language_key_is_rejected(self):
        with self.assertRaises(LocalizedFieldError) as ctx:
            normalize_localized_dict(
                {"en": "Sum", "english-please": "Sum"}, field_name="title_i18n"
            )
        self.assertIn("english-please", str(ctx.exception))


class EnsureEnglishTests(APITestCase):
    """Legacy-row repair: EN fallback must always exist after the pass."""

    def test_row_with_english_is_untouched(self):
        value = {"en": "Sum", "ro": "Suma"}
        self.assertIs(ensure_english(value, field_name="title_i18n"), value)

    def test_missing_english_copies_romanian(self):
        repaired = ensure_english({"ro": "Suma"}, field_name="title_i18n")
        self.assertEqual(repaired, {"ro": "Suma", "en": "Suma"})

    def test_missing_english_and_ro_copies_first_available(self):
        repaired = ensure_english({"fr": "Somme"}, field_name="statement_i18n")
        self.assertEqual(repaired, {"fr": "Somme", "en": "Somme"})

    def test_blank_english_is_repaired(self):
        repaired = ensure_english({"en": "", "ro": "Suma"}, field_name="title_i18n")
        self.assertEqual(repaired["en"], "Suma")

    def test_empty_dict_left_alone(self):
        self.assertEqual(ensure_english({}, field_name="title_i18n"), {})

    def test_no_usable_fallback_returns_input_unchanged(self):
        # Every entry blank or non-string: there is nothing honest to copy
        # into ``en`` — the row is left for the data migration to log.
        value = {"fr": "   ", "de": None}
        self.assertEqual(ensure_english(value, field_name="title_i18n"), value)
        self.assertNotIn("en", value)

    def test_non_dict_left_alone(self):
        self.assertEqual(ensure_english("legacy", field_name="title_i18n"), "legacy")


class AvailableLanguagesTests(APITestCase):
    def _problem(self, title, statement):
        return Problem.objects.create(
            title_i18n=title,
            statement_i18n=statement,
            status=Problem.ProblemStatus.APPROVED,
        )

    def test_union_of_title_and_statement_languages(self):
        problem = self._problem(
            {"en": "Sum", "ro": "Suma"}, {"en": "Body", "ro": "Corp", "fr": "Corps"}
        )
        self.assertEqual(available_languages(problem), ["en", "fr", "ro"])

    def test_blank_entries_do_not_count(self):
        problem = self._problem({"en": "Sum", "ro": "  "}, {"en": "Body"})
        self.assertEqual(available_languages(problem), ["en"])

    def test_non_dict_statement_is_ignored(self):
        # Legacy rows may carry a non-dict statement; availability must
        # still report the title languages without crashing.
        problem = self._problem({"en": "Sum", "ro": "Suma"}, "legacy text")
        self.assertEqual(available_languages(problem), ["en", "ro"])


def _problem_payload(**overrides):
    payload = {
        "title_i18n": {"en": "Two Sum"},
        "statement_i18n": {"en": "Return indices adding up to target."},
        "difficulty": "EASY",
    }
    payload.update(overrides)
    return payload


class ProblemLanguageSerializerTests(APITestCase):
    """The authoring API enforces EN-mandatory at the serializer boundary."""

    def setUp(self):
        self.creator = User.objects.create_user(
            username="creator", password="pw-12345678", role=User.Roles.PROBLEM_CREATOR
        )
        self.client = APIClient()
        self.client.force_authenticate(self.creator)

    def test_create_with_english_only_succeeds(self):
        response = self.client.post("/api/v1/problems/problems/", _problem_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["title_i18n"], {"en": "Two Sum"})
        self.assertEqual(response.data["available_languages"], ["en"])

    def test_create_with_english_plus_optional_languages(self):
        response = self.client.post(
            "/api/v1/problems/problems/",
            _problem_payload(
                title_i18n={"en": "Two Sum", "ro": "Suma a două", "pl": "Suma dwóch"},
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["available_languages"], ["en", "pl", "ro"])

    def test_create_without_english_is_rejected(self):
        response = self.client.post(
            "/api/v1/problems/problems/",
            _problem_payload(title_i18n={"ro": "Suma a două"}, statement_i18n={"ro": "…"}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("English", str(response.data["title_i18n"]))
        self.assertIn("English", str(response.data["statement_i18n"]))

    def test_create_with_non_dict_i18n_is_rejected(self):
        response = self.client.post(
            "/api/v1/problems/problems/",
            _problem_payload(title_i18n="Two Sum"),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("JSON object", str(response.data["title_i18n"]))

    def test_update_removing_english_is_rejected(self):
        created = self.client.post(
            "/api/v1/problems/problems/", _problem_payload(), format="json"
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.content)
        problem_id = created.data["id"]

        response = self.client.patch(
            f"/api/v1/problems/problems/{problem_id}/",
            {"title_i18n": {"ro": "Doar română"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("English", str(response.data["title_i18n"]))

    def test_update_adding_optional_language_keeps_english(self):
        created = self.client.post(
            "/api/v1/problems/problems/", _problem_payload(), format="json"
        )
        problem_id = created.data["id"]

        response = self.client.patch(
            f"/api/v1/problems/problems/{problem_id}/",
            {"statement_i18n": {"en": "EN body", "de": "DE-Text"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.content)
        self.assertEqual(response.data["available_languages"], ["de", "en"])

    def test_blank_optional_language_entry_is_dropped_on_write(self):
        response = self.client.post(
            "/api/v1/problems/problems/",
            _problem_payload(title_i18n={"en": "Two Sum", "ro": "   "}),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.content)
        self.assertEqual(response.data["title_i18n"], {"en": "Two Sum"})
        self.assertEqual(response.data["available_languages"], ["en"])

    def test_detail_serializer_exposes_available_languages(self):
        created = self.client.post(
            "/api/v1/problems/problems/",
            _problem_payload(title_i18n={"en": "T", "ru": "Задача"}),
            format="json",
        )
        detail = self.client.get(f"/api/v1/problems/problems/{created.data['id']}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK, detail.content)
        self.assertEqual(detail.data["available_languages"], ["en", "ru"])
