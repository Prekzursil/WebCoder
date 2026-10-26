"""Attribution surface tests: model fields, source_line, serializer rules."""

from django.test import TestCase
from rest_framework.test import APIRequestFactory, APIClient
from rest_framework import status

from problems.models import CatalogEntry, Problem
from problems.serializers import ProblemSerializer
from users.models import User


def make_problem(**extra):
    base = dict(
        title_i18n={"en": "T", "ro": "T"},
        statement_i18n={"en": "S", "ro": "S"},
    )
    base.update(extra)
    return Problem(**base)


class SourceLineTest(TestCase):
    def test_full_line(self):
        p = make_problem(
            source_name="ONI 2014, Clasa a IX-a",
            source_authors=["Constantin Galatan"],
        )
        self.assertEqual(
            p.source_line, "Source: ONI 2014, Clasa a IX-a · Author(s): Constantin Galatan"
        )

    def test_source_only(self):
        p = make_problem(source_name="pbinfo.ro", source_authors=[])
        self.assertEqual(p.source_line, "Source: pbinfo.ro")

    def test_authors_only(self):
        p = make_problem(source_name="", source_authors=["Ana", "Bo"])
        self.assertEqual(p.source_line, "Author(s): Ana, Bo")

    def test_blank_line(self):
        self.assertEqual(make_problem().source_line, "")

    def test_blank_author_entries_ignored(self):
        p = make_problem(source_authors=["Ana", "  ", ""])
        self.assertEqual(p.source_line, "Author(s): Ana")


class AttributionFieldsTest(TestCase):
    def test_defaults_are_blank(self):
        p = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )
        self.assertEqual(p.source_name, "")
        self.assertEqual(p.source_url, "")
        self.assertEqual(p.source_authors, [])
        self.assertEqual(p.license_status, "")
        self.assertEqual(p.license_basis, "")

    def test_license_choices(self):
        self.assertEqual(
            {c[0] for c in Problem.LicenseStatus.choices},
            {"own", "licensed", "public-exam", "trivial", "reference-only"},
        )


class CatalogEntryModelTest(TestCase):
    def setUp(self):
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def test_str(self):
        e = CatalogEntry(
            cluster_id="c1",
            source="pbinfo",
            source_id="10",
            license_status=Problem.LicenseStatus.REFERENCE_ONLY,
        )
        self.assertIn("pbinfo:10", str(e))
        self.assertIn("reference-only", str(e))

    def test_unique_source_problem_constraint(self):
        CatalogEntry.objects.create(
            cluster_id="c1", source="pbinfo", source_id="10"
        )
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CatalogEntry.objects.create(
                    cluster_id="c2", source="pbinfo", source_id="10"
                )

    def test_cluster_id_unique(self):
        CatalogEntry.objects.create(
            cluster_id="c1", source="pbinfo", source_id="10"
        )
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CatalogEntry.objects.create(
                    cluster_id="c1", source="dmoj", source_id="20"
                )

    def test_imported_problem_link_survives_problem_delete(self):
        entry = CatalogEntry.objects.create(
            cluster_id="c1", source="pbinfo", source_id="10",
            imported_problem=self.problem,
        )
        self.problem.delete()
        entry.refresh_from_db()
        self.assertIsNone(entry.imported_problem)


def payload(**extra):
    base = dict(
        title_i18n={"en": "T"},
        statement_i18n={"en": "S"},
        difficulty="EASY",
    )
    base.update(extra)
    return base


class AttributionSerializerTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="creator",
            password="pw",
            role=User.Roles.ADMIN,
        )
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.factory = APIRequestFactory()

    def serialize(self, data, instance=None):
        request = self.factory.post("/")
        request.user = self.user
        return ProblemSerializer(
            data=data, instance=instance, context={"request": request}
        )

    def test_fields_present_in_api(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            source_name="ONI 2014",
            source_authors=["A"],
        )
        resp = self.client.get(f"/api/v1/problems/problems/{problem.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["source_name"], "ONI 2014")
        self.assertEqual(resp.data["source_authors"], ["A"])
        self.assertEqual(resp.data["source_line"], "Source: ONI 2014 · Author(s): A")
        self.assertIn("license_status", resp.data)
        self.assertIn("license_basis", resp.data)
        self.assertIn("source_url", resp.data)

    def test_non_own_import_requires_source_name(self):
        s = self.serialize(payload(license_status="public-exam", license_basis="x"))
        self.assertFalse(s.is_valid())
        self.assertIn("source_name", s.errors)

    def test_non_own_import_requires_license_basis(self):
        s = self.serialize(payload(license_status="trivial", source_name="pbinfo.ro"))
        self.assertFalse(s.is_valid())
        self.assertIn("license_basis", s.errors)

    def test_own_import_is_exempt(self):
        s = self.serialize(payload(license_status="own"))
        self.assertTrue(s.is_valid(), s.errors)

    def test_original_authoring_is_exempt(self):
        s = self.serialize(payload())
        self.assertTrue(s.is_valid(), s.errors)

    def test_update_uses_existing_attribution_when_absent(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            license_status="licensed",
            source_name="site",
            license_basis="cc",
        )
        s = self.serialize(
            payload(license_status="licensed", source_name="site", license_basis="cc"),
            instance=problem,
        )
        self.assertTrue(s.is_valid(), s.errors)
        # Partial update (PATCH semantics) keeps stored attribution.
        request = self.factory.post("/")
        request.user = self.user
        s2 = ProblemSerializer(
            problem, data={"difficulty": "MEDIUM"}, partial=True,
            context={"request": request},
        )
        self.assertTrue(s2.is_valid(), s2.errors)

    def test_update_to_non_own_without_name_rejected(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            license_status="",
        )
        s = self.serialize(
            payload(license_status="public-exam", license_basis="b"),
            instance=problem,
        )
        self.assertFalse(s.is_valid())
        self.assertIn("source_name", s.errors)

    def test_source_authors_must_be_list_of_strings(self):
        s = self.serialize(payload(source_authors="not-a-list"))
        self.assertFalse(s.is_valid())
        self.assertIn("source_authors", s.errors)
        s2 = self.serialize(payload(source_authors=["ok", 5]))
        self.assertFalse(s2.is_valid())
        self.assertIn("source_authors", s2.errors)

    def test_source_authors_stripped_and_empties_dropped(self):
        s = self.serialize(payload(source_authors=[" Ana ", ""]))
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["source_authors"], ["Ana"])
        s2 = self.serialize(payload(source_authors=[]))
        self.assertTrue(s2.is_valid(), s2.errors)
        self.assertEqual(s2.validated_data["source_authors"], [])



    def test_source_authors_none_normalizes_to_empty(self):
        s = self.serialize(payload(source_authors=None))
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["source_authors"], [])

    def test_alt_sources_validation(self):
        ok = [
            {
                "source": "infoarena",
                "sourceId": "sum",
                "sourceUrl": "https://ex/ia/sum",
                "title": "Suma",
                "junk": "dropped",
            }
        ]
        s = self.serialize(payload(alt_sources=ok))
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(
            s.validated_data["alt_sources"],
            [
                {
                    "source": "infoarena",
                    "sourceId": "sum",
                    "sourceUrl": "https://ex/ia/sum",
                    "title": "Suma",
                }
            ],
        )
        for bad in (
            "not-a-list",
            [{"source": "x"}],  # missing sourceId
            [{"sourceId": "1", "source": 5}],  # non-string source
        ):
            s = self.serialize(payload(alt_sources=bad))
            self.assertFalse(s.is_valid(), bad)
            self.assertIn("alt_sources", s.errors)

    def test_alt_sources_none_normalizes_to_empty(self):
        s = self.serialize(payload(alt_sources=None))
        self.assertTrue(s.is_valid(), s.errors)
        self.assertEqual(s.validated_data["alt_sources"], [])

    def test_alt_sources_in_api_response(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            source_name="ONI 2014",
            alt_sources=[
                {
                    "source": "infoarena",
                    "sourceId": "sum",
                    "sourceUrl": "https://ex/ia/sum",
                    "title": "Suma",
                }
            ],
        )
        resp = self.client.get(f"/api/v1/problems/problems/{problem.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["alt_sources"][0]["source"], "infoarena")

    def test_invalid_license_status_rejected(self):
        s = self.serialize(payload(license_status="pirated"))
        self.assertFalse(s.is_valid())
        self.assertIn("license_status", s.errors)


class CurriculumNodeStrTest(TestCase):
    def test_str_with_and_without_i18n(self):
        from problems.models import CurriculumNode

        n = CurriculumNode(slug="g9", name_i18n={"en": "Grade 9"})
        self.assertEqual(str(n), "g9 (Grade 9)")
        n2 = CurriculumNode(slug="g10", name_i18n="not-a-dict")
        self.assertEqual(str(n2), "g10")
