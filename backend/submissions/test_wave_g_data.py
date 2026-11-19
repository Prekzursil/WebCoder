"""Wave G PR2 backend tests — items 76 (cross-device drafts), 78
(statement annotations), 86 (localized sample comments), 87 (timezone),
92 (offline statement packs)."""

from django.test import TestCase
from problems.models import Problem, StatementAnnotation
from problems.models import TestCase as ProblemTestCase
from rest_framework.test import APIClient
from users.models import User

from .models import CodeDraft


def _problem(**extra):
    return Problem.objects.create(
        title_i18n={"en": "Sum", "ro": "Suma"},
        statement_i18n={
            "en": "Read two numbers.\nPrint their sum.",
            "ro": "Citește două numere.\nAfișează suma.",
        },
        status=Problem.ProblemStatus.APPROVED,
        **extra,
    )


class DraftsTest(TestCase):
    """Item 76 — one draft per (user, problem), cross-device by design."""

    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.problem = _problem()
        self.client = APIClient()
        self.client.force_authenticate(self.alice)
        self.url = f"/api/v1/submissions/drafts/{self.problem.id}/"

    def test_anonymous_requires_auth(self):
        anon = APIClient()
        self.assertEqual(anon.get(self.url).status_code, 401)

    def test_empty_returns_204(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 204)

    def test_put_upserts_and_get_roundtrips(self):
        first = self.client.put(
            self.url, {"language": "python3", "code": "print(1)"}, format="json"
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.data["code"], "print(1)")
        self.client.put(
            self.url, {"language": "python3", "code": "print(2)"}, format="json"
        )
        self.assertEqual(CodeDraft.objects.count(), 1)  # upsert, not append
        fetched = self.client.get(self.url)
        self.assertEqual(fetched.data["code"], "print(2)")
        self.assertEqual(fetched.data["language"], "python3")

    def test_drafts_are_per_user(self):
        self.client.put(
            self.url, {"language": "python3", "code": "alice code"}, format="json"
        )
        bob_client = APIClient()
        bob_client.force_authenticate(self.bob)
        self.assertEqual(bob_client.get(self.url).status_code, 204)
        bob_client.put(
            self.url, {"language": "cpp17", "code": "bob code"}, format="json"
        )
        self.assertEqual(CodeDraft.objects.count(), 2)

    def test_delete_clears_own_draft_only(self):
        self.client.put(self.url, {"language": "python3", "code": "x"}, format="json")
        response = self.client.delete(self.url)
        self.assertEqual(response.data["deleted"], 1)
        self.assertEqual(self.client.get(self.url).status_code, 204)

    def test_put_unknown_problem_404(self):
        response = self.client.put(
            "/api/v1/submissions/drafts/999999/",
            {"language": "python3", "code": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_oversized_code_rejected(self):
        response = self.client.put(
            self.url, {"language": "python3", "code": "x" * 100_001}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_str(self):
        draft = CodeDraft.objects.create(
            user=self.alice, problem=self.problem, language="python3", code="x"
        )
        self.assertIn("python3", str(draft))


class AnnotationsTest(TestCase):
    """Item 78 — private per-user statement annotations."""

    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.problem = _problem()
        self.client = APIClient()
        self.client.force_authenticate(self.alice)
        self.url = f"/api/v1/problems/{self.problem.id}/annotations/"

    def test_requires_auth(self):
        self.assertEqual(APIClient().get(self.url).status_code, 401)

    def test_create_list_delete_roundtrip(self):
        created = self.client.post(
            self.url,
            {"quote": "two numbers", "note": "careful with overflow"},
            format="json",
        )
        self.assertEqual(created.status_code, 201)
        annotation_id = created.data["id"]
        listed = self.client.get(self.url)
        self.assertEqual(len(listed.data), 1)
        self.assertEqual(listed.data[0]["quote"], "two numbers")

        # Bob never sees Alice's annotations.
        bob_client = APIClient()
        bob_client.force_authenticate(self.bob)
        self.assertEqual(bob_client.get(self.url).data, [])
        self.assertEqual(
            bob_client.delete(f"{self.url}?annotation_id={annotation_id}").status_code,
            404,
        )

        deleted = self.client.delete(f"{self.url}?annotation_id={annotation_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get(self.url).data, [])

    def test_delete_requires_annotation_id(self):
        self.assertEqual(self.client.delete(self.url).status_code, 400)

    def test_create_unknown_problem_404(self):
        response = self.client.post(
            "/api/v1/problems/999999/annotations/",
            {"quote": "q", "note": "n"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)

    def test_str(self):
        row = StatementAnnotation.objects.create(
            user=self.alice, problem=self.problem, quote="q", note="n"
        )
        self.assertIn("annotation", str(row))


class SampleCommentsTest(TestCase):
    """Item 86 — localized sample comments ride the TestCase serializer."""

    def setUp(self):
        author = User.objects.create_user(username="auth", password="pw")
        self.problem = _problem(author=author)
        self.sample = ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1 2",
            expected_output_data="3",
            is_sample=True,
            comment_ro="Suma clasică.",
            comment_en="The classic sum.",
        )
        staff = User.objects.create_user(username="staff", password="pw", is_staff=True)
        self.client = APIClient()
        self.client.force_authenticate(staff)

    def test_serializer_exposes_both_comments(self):
        response = self.client.get(f"/api/v1/problems/testcases/{self.sample.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["comment_ro"], "Suma clasică.")
        self.assertEqual(response.data["comment_en"], "The classic sum.")


class TimezoneTest(TestCase):
    """Item 87 — the display-timezone field is self-service PATCHable."""

    def setUp(self):
        self.user = User.objects.create_user(username="tz", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_me_exposes_timezone_default_empty(self):
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.data["timezone"], "")

    def test_patch_sets_timezone(self):
        response = self.client.patch(
            "/api/v1/users/me/", {"timezone": "Europe/Bucharest"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.timezone, "Europe/Bucharest")


class StatementPackTest(TestCase):
    """Item 92 — the self-contained HTML offline pack."""

    def setUp(self):
        self.problem = _problem(hints_en=["Think loops.", "Watch overflow."])
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1 2",
            expected_output_data="3",
            is_sample=True,
            comment_en="The classic sum.",
            comment_ro="Suma clasică.",
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="9 9",
            expected_output_data="18",
            is_sample=False,
        )
        self.client = APIClient()

    def test_pack_is_self_contained_html(self):
        response = self.client.get(
            f"/api/v1/problems/{self.problem.id}/statement-pack/"
        )
        self.assertEqual(response.status_code, 200)
        html = response.data["html"]
        self.assertIn("<!DOCTYPE html>", html)
        self.assertIn("Read two numbers.", html)
        self.assertIn("1 2", html)  # sample input inlined
        self.assertNotIn("9 9", html)  # hidden tests never enter the pack
        self.assertIn("The classic sum.", html)
        self.assertIn("Think loops.", html)
        # The RO statement ships as the collapsed other-locale section.
        self.assertIn("Citește două numere.", html)
        # No external references — truly offline.
        self.assertNotIn("http://", html)
        self.assertNotIn("https://", html)

    def test_pack_locale_switches_statement_and_comments(self):
        response = self.client.get(
            f"/api/v1/problems/{self.problem.id}/statement-pack/?lang=ro"
        )
        html = response.data["html"]
        self.assertIn("Suma clasică.", html)
        self.assertIn("Afișează suma.", html)

    def test_unknown_locale_falls_back_to_en(self):
        response = self.client.get(
            f"/api/v1/problems/{self.problem.id}/statement-pack/?lang=xx"
        )
        self.assertEqual(response.data["lang"], "en")

    def test_unknown_or_unapproved_problem_404(self):
        self.assertEqual(
            self.client.get("/api/v1/problems/999999/statement-pack/").status_code,
            404,
        )
        draft = Problem.objects.create(
            title_i18n={"en": "D"},
            statement_i18n={"en": "D"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/problems/{draft.id}/statement-pack/").status_code,
            404,
        )


class StatementPackEdgeTest(TestCase):
    """Item 92 — pack assembly edge arms: string i18n fields, no hints,
    no samples, and a statement whose text is a plain string."""

    def test_pack_with_string_statement_and_no_samples(self):
        problem = Problem.objects.create(
            title_i18n="Plain title",
            statement_i18n="One-line statement.",
            status=Problem.ProblemStatus.APPROVED,
        )
        client = APIClient()
        response = client.get(f"/api/v1/problems/{problem.id}/statement-pack/")
        self.assertEqual(response.status_code, 200)
        html = response.data["html"]
        self.assertIn("Plain title", html)
        self.assertIn("One-line statement.", html)
        self.assertNotIn("<h2>Hints</h2>", html)
        self.assertNotIn("<h2>Samples</h2>", html)


class StatementPackMonoLangTest(TestCase):
    """Item 92 — a mono-locale problem ships no collapsed other-language
    section (the falsy other_statement branch)."""

    def test_no_other_locale_section(self):
        problem = Problem.objects.create(
            title_i18n={"en": "Mono"},
            statement_i18n={"en": "Only English here."},
            status=Problem.ProblemStatus.APPROVED,
        )
        client = APIClient()
        html = client.get(f"/api/v1/problems/{problem.id}/statement-pack/").data["html"]
        self.assertIn("Only English here.", html)
        self.assertNotIn("<details>", html)
