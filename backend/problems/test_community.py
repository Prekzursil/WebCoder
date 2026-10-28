"""Wave C community-content tests (EDT-3 community editorials, EDT-4 lang
flags, COM-2 editorial threads, EDT-6 articles + related reading)."""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from forum.models import Thread
from problems.models import Article, CommunityEditorial, Problem, Tag
from users.models import User


class CommunityBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.verifier = User.objects.create_user(
            username="verif", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.creator = User.objects.create_user(
            username="creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.student = User.objects.create_user(username="stud", password="pw")
        self.problem = Problem.objects.create(
            title_i18n={"en": "Two Sum", "ro": "Suma a două"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.client = APIClient()

    def mk_editorial(self, **kwargs):
        defaults = dict(
            problem=self.problem,
            author=self.creator,
            title="Hash map approach",
            body="Use a dictionary of complements.",
            lang="en",
            status=CommunityEditorial.Status.APPROVED,
        )
        defaults.update(kwargs)
        return CommunityEditorial.objects.create(**defaults)


class CommunityEditorialTests(CommunityBase):
    """EDT-3 — author-attributed rows on the approval queue."""

    def test_create_requires_creator_role_and_defaults_to_pending(self):
        self.client.force_authenticate(self.student)
        denied = self.client.post(
            f"/api/v1/problems/{self.problem.id}/community-editorials/",
            {"title": "T", "body": "B", "lang": "en"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.creator)
        created = self.client.post(
            f"/api/v1/problems/{self.problem.id}/community-editorials/",
            {"title": "Two pointers", "body": "Walk inward.", "lang": "ro"},
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["status"], "PENDING")
        self.assertEqual(created.data["author_username"], "creator")
        self.assertEqual(created.data["license"], "CC BY-SA 4.0")

    def test_create_draft_without_submit(self):
        self.client.force_authenticate(self.creator)
        created = self.client.post(
            f"/api/v1/problems/{self.problem.id}/community-editorials/",
            {"title": "WIP", "body": "half", "lang": "en", "submit": False},
            format="json",
        )
        self.assertEqual(created.data["status"], "DRAFT")

    def test_visibility_and_lang_filter(self):
        approved_ro = self.mk_editorial(lang="ro", title="Soluție ro")
        self.mk_editorial(
            status=CommunityEditorial.Status.PENDING, title="Pending one"
        )
        self.mk_editorial(
            status=CommunityEditorial.Status.APPROVED,
            is_hidden=True,
            title="Hidden",
        )
        # Anonymous: approved + visible only.
        listing = self.client.get(
            f"/api/v1/problems/{self.problem.id}/community-editorials/"
        )
        self.assertEqual(listing.status_code, 200)
        titles = [row["title"] for row in listing.data["results"]]
        self.assertEqual(titles, ["Soluție ro"])  # ordering: newest first
        # Lang filter narrows further.
        only_en = self.client.get(
            f"/api/v1/problems/{self.problem.id}/community-editorials/?lang=ro"
        )
        self.assertEqual([r["lang"] for r in only_en.data["results"]], ["ro"])
        # Author sees their pending rows too.
        self.client.force_authenticate(self.creator)
        mine = self.client.get(
            f"/api/v1/problems/{self.problem.id}/community-editorials/"
        )
        self.assertEqual(len(mine.data["results"]), 3)
        # Staff sees the hidden row as well (3 rows total).
        self.client.force_authenticate(self.admin)
        everything = self.client.get(
            f"/api/v1/problems/{self.problem.id}/community-editorials/"
        )
        self.assertEqual(len(everything.data["results"]), 3)
        self.assertTrue(approved_ro.title in [r["title"] for r in everything.data["results"]])

    def test_review_approve_and_reject_with_notification(self):
        pending = self.mk_editorial(
            status=CommunityEditorial.Status.PENDING, title="Awaiting"
        )
        self.client.force_authenticate(self.student)
        denied = self.client.post(
            f"/api/v1/problems/community-editorials/{pending.id}/review/",
            {"decision": "approve"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.verifier)
        approved = self.client.post(
            f"/api/v1/problems/community-editorials/{pending.id}/review/",
            {"decision": "approve"},
            format="json",
        )
        self.assertEqual(approved.status_code, 200, approved.data)
        pending.refresh_from_db()
        self.assertEqual(pending.status, CommunityEditorial.Status.APPROVED)
        self.assertEqual(pending.verifier, self.verifier)

        other = self.mk_editorial(
            status=CommunityEditorial.Status.PENDING, title="Second"
        )
        rejected = self.client.post(
            f"/api/v1/problems/community-editorials/{other.id}/review/",
            {"decision": "reject", "feedback": "too terse"},
            format="json",
        )
        self.assertEqual(rejected.status_code, 200)
        other.refresh_from_db()
        self.assertEqual(other.status, CommunityEditorial.Status.REJECTED)
        self.assertEqual(other.verifier_feedback, "too terse")
        # Both decisions notified the author (D-B10).
        from notifications.models import Notification

        kinds = list(
            Notification.objects.filter(recipient=self.creator).values_list(
                "data", flat=True
            )
        )
        self.assertEqual(len([k for k in kinds if k.get("kind") == "editorial_review"]), 2)

    def test_author_edit_resubmits_and_visibility_rules(self):
        row = self.mk_editorial(status=CommunityEditorial.Status.REJECTED, title="V1")
        self.client.force_authenticate(self.creator)
        edited = self.client.patch(
            f"/api/v1/problems/community-editorials/{row.id}/",
            {"title": "V2", "body": "better", "submit": True},
            format="json",
        )
        self.assertEqual(edited.status_code, 200, edited.data)
        row.refresh_from_db()
        self.assertEqual(row.status, CommunityEditorial.Status.PENDING)
        self.assertEqual(row.title, "V2")

        # A stranger cannot edit or read an invisible row.
        row.status = CommunityEditorial.Status.DRAFT
        row.save()
        self.client.force_authenticate(self.student)
        missing = self.client.get(f"/api/v1/problems/community-editorials/{row.id}/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        forbidden = self.client.patch(
            f"/api/v1/problems/community-editorials/{row.id}/",
            {"title": "hijack"},
            format="json",
        )
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)

        # The author deletes their draft.
        self.client.force_authenticate(self.creator)
        deleted = self.client.delete(f"/api/v1/problems/community-editorials/{row.id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_editorial_detail_visible_row(self):
        row = self.mk_editorial()
        response = self.client.get(f"/api/v1/problems/community-editorials/{row.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["license"], "CC BY-SA 4.0")


class ArticleTests(CommunityBase):
    """EDT-6 — the tag-linked lecture hub."""

    def setUp(self):
        super().setUp()
        self.tag_hash = Tag.objects.create(
            name_i18n={"en": "Hashing", "ro": "Hashing"}, slug="hashing"
        )
        self.problem.tags.add(self.tag_hash)

    def mk_article(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Hash tables 101", "ro": "Tabele de dispersie 101"},
            body_en="Open addressing vs chaining.",
            body_ro="Adresare deschisă versus înlănțuire.",
            author=self.creator,
            status=Article.Status.APPROVED,
        )
        defaults.update(kwargs)
        article = Article.objects.create(**defaults)
        article.tags.add(self.tag_hash)
        return article

    def test_list_reads_and_tag_filter(self):
        self.mk_article()
        hidden = self.mk_article(is_hidden=True, title_i18n={"en": "Hidden"})
        listing = self.client.get("/api/v1/problems/articles/")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["results"]), 1)
        by_tag = self.client.get("/api/v1/problems/articles/?tag=hashing")
        self.assertEqual(len(by_tag.data["results"]), 1)
        self.assertEqual(by_tag.data["results"][0]["license"], "CC BY-SA 4.0")
        # Staff sees both.
        self.client.force_authenticate(self.admin)
        everything = self.client.get("/api/v1/problems/articles/")
        self.assertEqual(len(everything.data["results"]), 2)
        self.assertIn("Hidden", str(everything.data["results"]))
        del hidden

    def test_authoring_and_review_lifecycle(self):
        self.client.force_authenticate(self.student)
        denied = self.client.post(
            "/api/v1/problems/articles/",
            {"title_i18n": {"en": "X"}, "body_en": "b"},
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.creator)
        created = self.client.post(
            "/api/v1/problems/articles/",
            {
                "title_i18n": {"en": "Two pointers", "ro": "Doi pointeri"},
                "body_en": "Walk inward.",
                "tags": ["hashing"],
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["status"], "PENDING")
        article_id = created.data["id"]

        # Author edit resubmits; verifier can publish.
        edited = self.client.patch(
            f"/api/v1/problems/articles/{article_id}/",
            {"body_en": "Walk inward from both ends."},
            format="json",
        )
        self.assertEqual(edited.status_code, 200)
        self.client.force_authenticate(self.verifier)
        published = self.client.patch(
            f"/api/v1/problems/articles/{article_id}/",
            {"status": "APPROVED"},
            format="json",
        )
        self.assertEqual(published.status_code, 200, published.data)
        self.assertEqual(published.data["status"], "APPROVED")
        bad_status = self.client.patch(
            f"/api/v1/problems/articles/{article_id}/",
            {"status": "NONSENSE"},
            format="json",
        )
        self.assertEqual(bad_status.status_code, status.HTTP_400_BAD_REQUEST)
        # Now visible: a stranger's delete is forbidden (not 404).
        self.client.force_authenticate(self.student)
        forbidden = self.client.delete(f"/api/v1/problems/articles/{article_id}/")
        self.assertEqual(forbidden.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.creator)
        deleted = self.client.delete(f"/api/v1/problems/articles/{article_id}/")
        self.assertEqual(deleted.status_code, status.HTTP_204_NO_CONTENT)

    def test_related_articles_strip_and_reverse_link(self):
        article = self.mk_article()
        unrelated = Problem.objects.create(
            title_i18n={"en": "No tags", "ro": "Fără"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        strip = self.client.get(
            f"/api/v1/problems/{self.problem.id}/related-articles/"
        )
        self.assertEqual(strip.status_code, 200)
        self.assertEqual(strip.data["count"], 1)
        self.assertEqual(
            strip.data["results"][0]["title_i18n"]["en"], "Hash tables 101"
        )
        empty = self.client.get(f"/api/v1/problems/{unrelated.id}/related-articles/")
        self.assertEqual(empty.data["count"], 0)

        reverse = self.client.get(
            f"/api/v1/problems/articles/{article.id}/related-problems/"
        )
        self.assertEqual(reverse.status_code, 200)
        self.assertEqual(reverse.data["count"], 1)
        self.assertEqual(reverse.data["results"][0]["id"], self.problem.id)

    def test_model_str(self):
        article = self.mk_article()
        self.assertIn("Hash tables 101", str(article))
        row = self.mk_editorial()
        self.assertIn("Hash map approach", str(row))


class EditorialThreadTests(CommunityBase):
    """EDT-4 lang flags + COM-2 editorial threads on the forum."""

    def test_thread_create_with_lang_and_editorial(self):
        editorial = self.mk_editorial()
        self.client.force_authenticate(self.student)
        created = self.client.post(
            "/api/v1/forum/threads/",
            {
                "title": "Question about step 2",
                "editorial": editorial.id,
                "lang": "en",
                "content": "Why is the lookup O(1)?",
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["lang"], "en")
        self.assertEqual(created.data["editorial"], editorial.id)
        thread = Thread.objects.get(pk=created.data["id"])
        self.assertEqual(thread.editorial_id, editorial.id)

    def test_list_filters_lang_and_topic(self):
        editorial = self.mk_editorial()
        Thread.objects.create(
            title="RO thread", author=self.student, lang="ro", post_count=1
        )
        Thread.objects.create(
            title="EN thread", author=self.student, lang="en", post_count=1
        )
        Thread.objects.create(
            title="Editorial talk",
            author=self.student,
            lang="en",
            editorial=editorial,
            post_count=1,
        )
        ro_only = self.client.get("/api/v1/forum/threads/?lang=ro")
        self.assertEqual(
            sorted(t["title"] for t in ro_only.data["results"]), ["RO thread"]
        )
        editorial_topic = self.client.get("/api/v1/forum/threads/?topic=editorial")
        self.assertEqual(
            [t["title"] for t in editorial_topic.data["results"]], ["Editorial talk"]
        )
        problem_topic = self.client.get("/api/v1/forum/threads/?topic=problem")
        self.assertEqual(len(problem_topic.data["results"]), 2)
        by_editorial = self.client.get(
            f"/api/v1/forum/threads/?editorial_id={editorial.id}"
        )
        self.assertEqual(len(by_editorial.data["results"]), 1)


class CoverageClosureTests(CommunityBase):
    """Drive the remaining Wave C branches to the 100% gate."""

    def test_editorial_patch_without_submit_and_missing_rows(self):
        row = self.mk_editorial(status=CommunityEditorial.Status.DRAFT)
        self.client.force_authenticate(self.creator)
        edited = self.client.patch(
            f"/api/v1/problems/community-editorials/{row.id}/",
            {"title": "Still drafting"},
            format="json",
        )
        self.assertEqual(edited.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, CommunityEditorial.Status.DRAFT)
        # 404s on unknown rows for every verb.
        self.assertEqual(
            self.client.get("/api/v1/problems/community-editorials/999/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.patch(
                "/api/v1/problems/community-editorials/999/", {"title": "x"}
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.delete(
                "/api/v1/problems/community-editorials/999/"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        # Review on a missing row: 404 for everyone (object fetch first).
        self.assertEqual(
            self.client.post(
                "/api/v1/problems/community-editorials/999/review/",
                {"decision": "approve"},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        # Review on a real row: non-verifiers are 403.
        row = self.mk_editorial(status=CommunityEditorial.Status.PENDING)
        self.assertEqual(
            self.client.post(
                f"/api/v1/problems/community-editorials/{row.id}/review/",
                {"decision": "approve"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_review_on_authorless_row_and_get_detail(self):
        row = self.mk_editorial(
            status=CommunityEditorial.Status.PENDING, author=None
        )
        self.client.force_authenticate(self.verifier)
        reviewed = self.client.post(
            f"/api/v1/problems/community-editorials/{row.id}/review/",
            {"decision": "approve"},
            format="json",
        )
        self.assertEqual(reviewed.status_code, 200)

    def test_post_editorial_on_missing_problem(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/999999/community-editorials/",
            {"title": "T", "body": "B", "lang": "en"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        missing_strip = self.client.get("/api/v1/problems/999999/related-articles/")
        self.assertEqual(missing_strip.status_code, status.HTTP_404_NOT_FOUND)

    def test_stranger_cannot_delete_visible_editorial_or_edit_article(self):
        row = self.mk_editorial()  # APPROVED + visible
        article = Article.objects.create(
            title_i18n={"en": "Visible"},
            body_en="b",
            author=self.creator,
            status=Article.Status.APPROVED,
        )
        self.client.force_authenticate(self.student)
        denied_delete = self.client.delete(
            f"/api/v1/problems/community-editorials/{row.id}/"
        )
        self.assertEqual(denied_delete.status_code, status.HTTP_403_FORBIDDEN)
        denied_edit = self.client.patch(
            f"/api/v1/problems/articles/{article.id}/",
            {"body_en": "hijack"},
            format="json",
        )
        self.assertEqual(denied_edit.status_code, status.HTTP_403_FORBIDDEN)

    def test_article_model_str_fallback(self):
        odd = Article.objects.create(title_i18n="not-a-dict")
        self.assertEqual(str(odd), "Article %s" % odd.id)
