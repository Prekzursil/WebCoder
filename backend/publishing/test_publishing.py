"""Wave F — publishing + licenses + follow-feed (items 61-65).

Blogs (62), the wiki with revision history + revert (63), the
explain-my-WA queue (64), author relicensing of shared AC sources (61)
and the ?following=1 feed filter (65).
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from community_depth.services import recent_feed
from problems.models import Problem
from publishing.models import (
    BlogPost,
    WaHelpAnswer,
    WaHelpRequest,
    WikiPage,
    WikiRevision,
)
from submissions.models import Submission
from users.models import Follow, User


class PublishingBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.client = APIClient()
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )

    def mk_submission(self, user, verdict="AC", score=100):
        return Submission.objects.create(
            user=user,
            problem=self.problem,
            language="python3",
            code="print(1)",
            verdict=verdict,
            score=score,
        )


class BlogTests(PublishingBase):
    def test_create_publish_and_hub_visibility(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/blogs/",
            {
                "title": "Cum am învățat binary search",
                "body": "Povestea mea...",
                "lang": "ro",
                "status": "PUBLISHED",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # Draft by bob stays out of the public hub.
        self.client.force_authenticate(self.bob)
        self.client.post(
            "/api/v1/community/blogs/",
            {"title": "Draft notes", "body": "wip", "lang": "en", "status": "DRAFT"},
            format="json",
        )
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/community/blogs/")
        titles = [row["title"] for row in response.data["results"]]
        self.assertIn("Cum am învățat binary search", titles)
        self.assertNotIn("Draft notes", titles)
        # The author filter narrows the hub.
        response = self.client.get("/api/v1/community/blogs/?author=alice")
        self.assertTrue(
            all(row["author_username"] == "alice" for row in response.data["results"])
        )

    def test_mine_includes_drafts(self):
        self.client.force_authenticate(self.bob)
        self.client.post(
            "/api/v1/community/blogs/",
            {"title": "Draft notes", "body": "wip", "lang": "en", "status": "DRAFT"},
            format="json",
        )
        response = self.client.get("/api/v1/community/blogs/?mine=1")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["status"], "DRAFT")

    def test_author_only_edit_and_delete(self):
        post = BlogPost.objects.create(
            author=self.alice, title="T", slug="t", body="b", status="PUBLISHED"
        )
        self.client.force_authenticate(self.bob)
        response = self.client.patch(
            f"/api/v1/community/blogs/{post.slug}/", {"title": "Hacked"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.delete(f"/api/v1/community/blogs/{post.slug}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Author edits + deletes fine.
        self.client.force_authenticate(self.alice)
        response = self.client.patch(
            f"/api/v1/community/blogs/{post.slug}/", {"title": "T2"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        response = self.client.delete(f"/api/v1/community/blogs/{post.slug}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_slug_uniquifying(self):
        self.client.force_authenticate(self.alice)
        first = self.client.post(
            "/api/v1/community/blogs/",
            {"title": "Same Title", "body": "a", "lang": "en", "status": "PUBLISHED"},
            format="json",
        )
        second = self.client.post(
            "/api/v1/community/blogs/",
            {"title": "Same Title", "body": "b", "lang": "en", "status": "PUBLISHED"},
            format="json",
        )
        self.assertNotEqual(first.data["slug"], second.data["slug"])

    def test_anonymous_cannot_create(self):
        response = self.client.post(
            "/api/v1/community/blogs/",
            {"title": "X", "body": "y", "lang": "en"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class WikiTests(PublishingBase):
    def test_create_edit_and_history(self):
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/community/wiki/dp/",
            {
                "title_ro": "Programare dinamică",
                "title_en": "Dynamic programming",
                "body_ro": "PD rezolvă subprobleme...",
                "body_en": "DP solves subproblems...",
                "note": "first",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # A member edit snapshots a second revision.
        self.client.force_authenticate(self.bob)
        response = self.client.put(
            "/api/v1/community/wiki/dp/",
            {
                "title_ro": "Programare dinamică",
                "title_en": "Dynamic programming",
                "body_ro": "PD rezolvă subprobleme recursiv...",
                "body_en": "DP solves subproblems recursively...",
                "note": "clarity",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        history = self.client.get("/api/v1/community/wiki/dp/history/")
        self.assertEqual(history.data["count"], 2)
        self.assertEqual(history.data["results"][0]["note"], "clarity")
        # The hub lists the page.
        hub = self.client.get("/api/v1/community/wiki/")
        self.assertEqual(hub.data["count"], 1)

    def test_ro_fields_mandatory(self):
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/community/wiki/en-only/",
            {"title_en": "Only english", "body_en": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_get_existing_page(self):
        self.client.force_authenticate(self.alice)
        self.client.put(
            "/api/v1/community/wiki/dp/",
            {"title_ro": "PD", "body_ro": "corp"},
            format="json",
        )
        response = self.client.get("/api/v1/community/wiki/dp/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["title_ro"], "PD")

    def test_authenticated_hub_includes_own_drafts(self):
        BlogPost.objects.create(
            author=self.bob, title="My draft", slug="my-draft", body="b", status="DRAFT"
        )
        BlogPost.objects.create(
            author=self.alice,
            title="Published",
            slug="published",
            body="b",
            status="PUBLISHED",
        )
        self.client.force_authenticate(self.bob)
        response = self.client.get("/api/v1/community/blogs/")
        titles = [row["title"] for row in response.data["results"]]
        self.assertIn("My draft", titles)
        self.assertIn("Published", titles)

    def test_anonymous_cannot_edit(self):
        response = self.client.put(
            "/api/v1/community/wiki/x/",
            {"title_ro": "X", "body_ro": "y"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_page_404(self):
        response = self.client.get("/api/v1/community/wiki/ghost/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/community/wiki/ghost/history/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_moderator_revert(self):
        page = WikiPage.objects.create(
            slug="r",
            title_ro="R",
            body_ro="v1",
            updated_by=self.alice,
        )
        rev1 = WikiRevision.objects.create(
            page=page, title_ro="R", body_ro="v1", editor=self.alice, note="one"
        )
        page.body_ro = "v2 (vandalized)"
        page.save()
        WikiRevision.objects.create(
            page=page, title_ro="R", body_ro="v2", editor=self.bob, note="two"
        )
        # Non-moderators are refused.
        self.client.force_authenticate(self.bob)
        response = self.client.post(f"/api/v1/community/wiki/r/revert/{rev1.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # The moderator rolls back; the revert itself is recorded.
        self.client.force_authenticate(self.admin)
        response = self.client.post(f"/api/v1/community/wiki/r/revert/{rev1.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["body_ro"], "v1")
        self.assertEqual(page.revisions.count(), 3)

    def test_revert_unknown_revision_404(self):
        WikiPage.objects.create(slug="r2", title_ro="R", body_ro="v1")
        self.client.force_authenticate(self.admin)
        response = self.client.post("/api/v1/community/wiki/r2/revert/999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/community/wiki/ghost/revert/1/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class WaHelpTests(PublishingBase):
    def test_full_flow(self):
        wa = self.mk_submission(self.alice, verdict="WA", score=10)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/wa-help/",
            {"submission_id": wa.id, "question": "Why WA on test 4?"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        request_id = response.data["id"]
        # Bob answers; alice accepts.
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/community/wa-help/{request_id}/answers/",
            {"body": "You forget to sort the array first."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        answer_id = response.data["id"]
        # Only the asker accepts.
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/community/wa-help/{request_id}/accept/{answer_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/community/wa-help/{request_id}/accept/{answer_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        # Double-accept conflicts.
        response = self.client.post(
            f"/api/v1/community/wa-help/{request_id}/accept/{answer_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertTrue(WaHelpAnswer.objects.get(pk=answer_id).is_accepted)
        # The queue hides ANSWERED rows from strangers but keeps the asker's.
        queue = self.client.get("/api/v1/community/wa-help/")
        self.assertEqual(queue.data["count"], 1)
        self.client.force_authenticate(None)
        queue = self.client.get("/api/v1/community/wa-help/")
        self.assertEqual(queue.data["count"], 0)

    def test_only_own_failed_submissions(self):
        ac = self.mk_submission(self.alice)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/community/wa-help/",
            {"submission_id": ac.id, "question": "help"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        strangers = self.mk_submission(self.bob, verdict="WA", score=0)
        response = self.client.post(
            "/api/v1/community/wa-help/",
            {"submission_id": strangers.id, "question": "help"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anonymous_post_401_and_unknowns_404(self):
        response = self.client.post(
            "/api/v1/community/wa-help/",
            {"submission_id": 1, "question": "?"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post(
            "/api/v1/community/wa-help/1/answers/", {"body": "x"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        response = self.client.post("/api/v1/community/wa-help/1/accept/1/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            "/api/v1/community/wa-help/999/answers/", {"body": "x"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/community/wa-help/999/accept/1/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # accept with mismatched answer
        wa = self.mk_submission(self.alice, verdict="WA", score=0)
        row = WaHelpRequest.objects.create(
            submission=wa, asker=self.alice, question="?"
        )
        answer = WaHelpAnswer.objects.create(request=row, author=self.bob, body="a")
        other = WaHelpRequest.objects.create(
            submission=wa, asker=self.alice, question="??"
        )
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/community/wa-help/{other.id}/accept/{answer.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class LicenseTests(PublishingBase):
    def test_author_relicenses_ac_source(self):
        sub = self.mk_submission(self.alice)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/submissions/submissions/{sub.id}/license/",
            {"license": "MIT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        sub.refresh_from_db()
        self.assertEqual(sub.license, Submission.License.MIT)

    def test_stranger_and_non_ac_rejected(self):
        sub = self.mk_submission(self.alice)
        self.client.force_authenticate(self.bob)
        response = self.client.post(
            f"/api/v1/submissions/submissions/{sub.id}/license/",
            {"license": "MIT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        wa = self.mk_submission(self.alice, verdict="WA", score=10)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/submissions/submissions/{wa.id}/license/",
            {"license": "MIT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Unknown choice rejected.
        response = self.client.post(
            f"/api/v1/submissions/submissions/{sub.id}/license/",
            {"license": "GPL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_submission_404(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/submissions/submissions/999999/license/",
            {"license": "MIT"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class FollowingFeedTests(PublishingBase):
    def test_following_filter(self):
        Follow.objects.create(follower=self.alice, target=self.bob)
        self.mk_submission(self.bob)
        self.mk_submission(self.alice)
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/community/feed/?following=1")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["user"], "bob")
        # The unfiltered feed still carries everything.
        response = self.client.get("/api/v1/community/feed/")
        self.assertEqual(response.data["count"], 2)
        # Anonymous following flag is ignored (full feed).
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/community/feed/?following=1")
        self.assertEqual(response.data["count"], 2)
        # The feed rows expose user_id (the filter's join key).
        self.assertIn("user_id", recent_feed(limit=5)[0])


class DunderTests(PublishingBase):
    def test_str_methods(self):
        post = BlogPost.objects.create(author=self.alice, title="T", slug="t", body="b")
        page = WikiPage.objects.create(slug="w", title_ro="W", body_ro="x")
        revision = WikiRevision.objects.create(page=page, title_ro="W", body_ro="x")
        wa = self.mk_submission(self.alice, verdict="WA", score=0)
        row = WaHelpRequest.objects.create(
            submission=wa, asker=self.alice, question="?"
        )
        answer = WaHelpAnswer.objects.create(request=row, author=self.bob, body="a")
        for obj in (post, page, revision, row, answer):
            self.assertTrue(str(obj))
