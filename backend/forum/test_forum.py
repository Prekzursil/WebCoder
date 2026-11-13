"""Forum tests (SPEC-GAPS D-B9): permissions (anon/author/moderator),
moderation states (pin/lock/hide), vote toggling, denormalized counters,
report queue semantics, THREAD_REPLY notification emission."""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from forum.models import Post, PostVote, Report, Thread
from notifications.models import Notification
from problems.models import Problem
from users.models import User


def _user(name, role=User.Roles.BASIC_USER, staff=False):
    return User.objects.create_user(
        username=name, password="p", role=role, is_staff=staff
    )


class ForumTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.basic = _user("fb-basic")
        self.other = _user("fb-other")
        self.author = _user("fb-author")
        self.verifier = _user("fb-verifier", role=User.Roles.PROBLEM_VERIFIER)
        self.thread = Thread.objects.create(
            title="T1", author=self.author, post_count=1
        )
        self.first_post = Post.objects.create(
            thread=self.thread, author=self.author, content="hello"
        )

    def _posts(self, thread=None):
        resp = self.client.get(
            f"/api/v1/forum/threads/{(thread or self.thread).id}/posts/"
        )
        return resp


class ThreadVisibilityTest(ForumTestBase):
    def test_anon_can_list_and_read(self):
        resp = self.client.get("/api/v1/forum/threads/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        body = resp.json()
        self.assertIn("count", body)  # page-number pagination
        self.assertEqual(body["results"][0]["title"], "T1")
        detail = self.client.get(f"/api/v1/forum/threads/{self.thread.id}/")
        self.assertEqual(detail.status_code, status.HTTP_200_OK)

    def test_anon_cannot_create_thread(self):
        resp = self.client.post(
            "/api/v1/forum/threads/", {"title": "x", "content": "y"}
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_thread_creates_first_post_atomically(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            "/api/v1/forum/threads/",
            {"title": "New", "content": "first!"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        thread = Thread.objects.get(pk=resp.json()["id"])
        self.assertEqual(thread.post_count, 1)
        self.assertEqual(thread.posts.count(), 1)
        self.assertEqual(thread.posts.get().content, "first!")

    def test_create_thread_with_problem_link(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            "/api/v1/forum/threads/",
            {"title": "About P", "content": "hint?", "problem": problem.id},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.json()["problem"]["id"], problem.id)

    def test_hidden_thread_excluded_for_non_moderators(self):
        Thread.objects.create(title="hidden", author=self.author, is_hidden=True)
        resp = self.client.get("/api/v1/forum/threads/")
        titles = {r["title"] for r in resp.json()["results"]}
        self.assertNotIn("hidden", titles)

    def test_moderator_sees_hidden_with_include_hidden(self):
        Thread.objects.create(title="hidden", author=self.author, is_hidden=True)
        self.client.force_authenticate(self.verifier)
        resp = self.client.get("/api/v1/forum/threads/?include_hidden=1")
        titles = {r["title"] for r in resp.json()["results"]}
        self.assertIn("hidden", titles)
        # ...and not without the flag
        resp = self.client.get("/api/v1/forum/threads/")
        titles = {r["title"] for r in resp.json()["results"]}
        self.assertNotIn("hidden", titles)


class ThreadPermissionTest(ForumTestBase):
    def test_author_can_edit_own_thread(self):
        self.client.force_authenticate(self.author)
        resp = self.client.patch(
            f"/api/v1/forum/threads/{self.thread.id}/", {"title": "Retitled"}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.thread.refresh_from_db()
        self.assertEqual(self.thread.title, "Retitled")

    def test_other_user_cannot_edit(self):
        self.client.force_authenticate(self.other)
        resp = self.client.patch(
            f"/api/v1/forum/threads/{self.thread.id}/", {"title": "Nope"}
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy_is_soft(self):
        self.client.force_authenticate(self.author)
        resp = self.client.delete(f"/api/v1/forum/threads/{self.thread.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.thread.refresh_from_db()
        self.assertTrue(self.thread.is_hidden)  # soft delete keeps the row
        # and disappears from the public list
        resp = self.client.get("/api/v1/forum/threads/")
        self.assertEqual(resp.json()["count"], 0)

    def test_verifier_can_pin_and_lock_but_basic_cannot(self):
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(f"/api/v1/forum/threads/{self.thread.id}/pin/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["is_pinned"])
        resp = self.client.post(f"/api/v1/forum/threads/{self.thread.id}/lock/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.json()["is_locked"])
        # toggle back
        resp = self.client.post(f"/api/v1/forum/threads/{self.thread.id}/lock/")
        self.assertFalse(resp.json()["is_locked"])

        self.client.force_authenticate(self.basic)
        resp = self.client.post(f"/api/v1/forum/threads/{self.thread.id}/pin/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_pinned_thread_sorts_first(self):
        Thread.objects.create(title="second", author=self.author)
        Thread.objects.create(title="pinned", author=self.author, is_pinned=True)
        resp = self.client.get("/api/v1/forum/threads/")
        self.assertEqual(resp.json()["results"][0]["title"], "pinned")


class PostTest(ForumTestBase):
    def test_anon_can_read_posts_but_not_reply(self):
        resp = self._posts()
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        rows = resp.json()["results"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["content"], "hello")

        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/", {"content": "x"}
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_reply_bumps_post_count_and_last_activity(self):
        self.client.force_authenticate(self.basic)
        before = self.thread.last_activity
        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/",
            {"content": "a reply"},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.thread.refresh_from_db()
        self.assertEqual(self.thread.post_count, 2)
        self.assertGreaterEqual(self.thread.last_activity, before)

    def test_locked_thread_rejects_new_posts(self):
        self.thread.is_locked = True
        self.thread.save()
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/",
            {"content": "late reply"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("locked", str(resp.json()))

    def test_hidden_thread_rejects_new_posts(self):
        self.thread.is_hidden = True
        self.thread.save()
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/",
            {"content": "reply to hidden"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reply_notifies_thread_author_on_commit(self):
        self.client.force_authenticate(self.basic)
        with self.captureOnCommitCallbacks(execute=True):
            resp = self.client.post(
                f"/api/v1/forum/threads/{self.thread.id}/posts/",
                {"content": "notify me"},
            )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        n = Notification.objects.get(recipient=self.author)
        self.assertEqual(n.verb, Notification.Verb.THREAD_REPLY)
        self.assertEqual(n.actor, self.basic)
        self.assertEqual(n.target_id, self.thread.id)
        self.assertEqual(n.data["title"], "T1")

    def test_self_reply_does_not_self_notify(self):
        self.client.force_authenticate(self.author)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.post(
                f"/api/v1/forum/threads/{self.thread.id}/posts/",
                {"content": "bump"},
            )
        self.assertEqual(Notification.objects.count(), 0)

    def test_author_can_edit_post_sets_is_edited(self):
        self.client.force_authenticate(self.author)
        resp = self.client.patch(
            f"/api/v1/forum/posts/{self.first_post.id}/",
            {"content": "hello (edited)"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.first_post.refresh_from_db()
        self.assertEqual(self.first_post.content, "hello (edited)")
        self.assertTrue(self.first_post.is_edited)

    def test_other_user_cannot_edit_post(self):
        self.client.force_authenticate(self.other)
        resp = self.client.patch(
            f"/api/v1/forum/posts/{self.first_post.id}/",
            {"content": "hax"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    def test_post_destroy_is_soft(self):
        self.client.force_authenticate(self.author)
        resp = self.client.delete(f"/api/v1/forum/posts/{self.first_post.id}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.first_post.refresh_from_db()
        self.assertTrue(self.first_post.is_hidden)
        self.assertTrue(self.first_post.hidden_reason)
        # hidden posts vanish from the thread's post list
        rows = self._posts().json()["results"]
        self.assertEqual(len(rows), 0)

    def test_quote_reply_with_parent(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/",
            {"content": "quoting", "parent": self.first_post.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.json()["parent_id"], self.first_post.id)

    def test_cross_thread_parent_rejected(self):
        other_thread = Thread.objects.create(title="T2", author=self.author)
        cross_post = Post.objects.create(
            thread=other_thread, author=self.author, content="elsewhere"
        )
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            f"/api/v1/forum/threads/{self.thread.id}/posts/",
            {"content": "bad parent", "parent": cross_post.id},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


def _grant_vote_trust(user):
    """RAT-10 floor: give the user one AC on an APPROVED problem so their
    vote counts (the trust rule ships WITH the forum — roadmap day-one)."""
    from problems.models import Problem, TestCase
    from submissions.models import Submission

    problem = Problem.objects.create(
        title_i18n={"en": f"Vote trust {user.username}", "ro": "x"},
        statement_i18n={"en": "s", "ro": "s"},
        status=Problem.ProblemStatus.APPROVED,
    )
    TestCase.objects.create(
        problem=problem, input_data="1", expected_output_data="2", points=10
    )
    Submission.objects.create(
        user=user,
        problem=problem,
        language="python3",
        code="pass",
        verdict="AC",
        score=10,
    )


class VoteTest(ForumTestBase):
    def test_vote_toggle_updates_upvotes(self):
        _grant_vote_trust(self.basic)
        _grant_vote_trust(self.other)
        self.client.force_authenticate(self.basic)
        url = f"/api/v1/forum/posts/{self.first_post.id}/vote/"

        resp = self.client.post(url, {"value": 1})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["upvotes"], 1)
        self.first_post.refresh_from_db()
        self.assertEqual(self.first_post.upvotes, 1)

        # second user votes too
        self.client.force_authenticate(self.other)
        resp = self.client.post(url, {"value": 1})
        self.assertEqual(resp.json()["upvotes"], 2)

        # first user flips to down
        self.client.force_authenticate(self.basic)
        resp = self.client.post(url, {"value": -1})
        self.assertEqual(resp.json()["upvotes"], 0)

        # ...and removes the vote entirely
        resp = self.client.post(url, {"value": 0})
        self.assertEqual(resp.json()["upvotes"], 1)
        self.assertFalse(
            PostVote.objects.filter(user=self.basic, post=self.first_post).exists()
        )

    def test_invalid_vote_value_rejected(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post(
            f"/api/v1/forum/posts/{self.first_post.id}/vote/", {"value": 5}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anon_cannot_vote(self):
        resp = self.client.post(
            f"/api/v1/forum/posts/{self.first_post.id}/vote/", {"value": 1}
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)


class ReportTest(ForumTestBase):
    def _report(self, user, reason="SPAM", details="junk"):
        self.client.force_authenticate(user)
        return self.client.post(
            "/api/v1/forum/reports/",
            {"post": self.first_post.id, "reason": reason, "details": details},
        )

    def test_authenticated_can_report(self):
        resp = self._report(self.basic)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.content)
        self.assertEqual(Report.objects.count(), 1)

    def test_duplicate_report_409(self):
        self._report(self.basic)
        resp = self._report(self.basic, reason="OTHER", details="again")
        self.assertEqual(resp.status_code, status.HTTP_409_CONFLICT)

    def test_anon_cannot_report(self):
        resp = self.client.post(
            "/api/v1/forum/reports/",
            {"post": self.first_post.id, "reason": "SPAM"},
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_report_list_moderator_only(self):
        self._report(self.basic)
        self.client.force_authenticate(self.other)
        resp = self.client.get("/api/v1/forum/reports/")
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.verifier)
        resp = self.client.get("/api/v1/forum/reports/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["count"], 1)

    def test_resolve_and_dismiss_actions(self):
        self._report(self.basic)
        report = Report.objects.get()
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/forum/reports/{report.id}/resolve/",
            {"action": "resolved", "note": "handled"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        report.refresh_from_db()
        self.assertEqual(report.status, Report.Status.RESOLVED)
        self.assertEqual(report.resolved_by, self.verifier)
        self.assertEqual(report.resolution_note, "handled")

        # dismissed path
        self._report(self.other, reason="ABUSE")
        report2 = Report.objects.filter(reporter=self.other).get()
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/forum/reports/{report2.id}/resolve/",
            {"action": "dismissed"},
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        report2.refresh_from_db()
        self.assertEqual(report2.status, Report.Status.DISMISSED)

    def test_resolve_requires_valid_action(self):
        self._report(self.basic)
        report = Report.objects.get()
        self.client.force_authenticate(self.verifier)
        resp = self.client.post(
            f"/api/v1/forum/reports/{report.id}/resolve/", {"action": "wat"}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_basic_cannot_resolve(self):
        self._report(self.basic)
        report = Report.objects.get()
        self.client.force_authenticate(self.other)
        resp = self.client.post(
            f"/api/v1/forum/reports/{report.id}/resolve/",
            {"action": "resolved"},
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)


class CoverageClosureTest(ForumTestBase):
    """Statement/branch closures for the single-branch 100% coverage gate
    (2026-10-27): model __str__, permission matrix, problem_id thread filter,
    moderator visibility branches, 404 arms, and VoteView scaffolding."""

    def test_model_str_methods(self):
        vote = PostVote.objects.create(user=self.basic, post=self.first_post, value=1)
        report = Report.objects.create(
            reporter=self.basic, post=self.first_post, reason="spam"
        )
        self.assertEqual(
            str(self.thread), f"Thread({self.thread.id}: {self.thread.title})"
        )
        self.assertEqual(
            str(self.first_post),
            f"Post({self.first_post.id} in thread {self.thread.id})",
        )
        self.assertEqual(
            str(vote), f"Vote({self.basic.id} on post {self.first_post.id}: 1)"
        )
        self.assertEqual(
            str(report), f"Report({report.id}: spam on post {self.first_post.id})"
        )

    def test_author_or_moderator_permission_matrix(self):
        from forum.permissions import IsAuthorOrModerator
        from rest_framework.test import APIRequestFactory

        factory = APIRequestFactory()
        perm = IsAuthorOrModerator()
        base = self.first_post

        moderator_req = factory.get("/")
        moderator_req.user = self.verifier
        self.assertTrue(perm.has_object_permission(moderator_req, None, base))

        anon_req = factory.get("/")
        from django.contrib.auth.models import AnonymousUser

        anon_req.user = AnonymousUser()
        self.assertFalse(perm.has_object_permission(anon_req, None, base))

        author_req = factory.get("/")
        author_req.user = self.author
        self.assertTrue(perm.has_object_permission(author_req, None, base))

    def test_thread_list_filters_by_problem_id(self):
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        Thread.objects.create(
            title="linked", author=self.author, problem=problem, post_count=1
        )
        resp = self.client.get("/api/v1/forum/threads/", {"problem_id": problem.id})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        results = resp.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "linked")

    def test_moderator_sees_hidden_posts_inside_thread(self):
        self.first_post.is_hidden = True
        self.first_post.save(update_fields=["is_hidden"])
        anon = self.client.get(f"/api/v1/forum/threads/{self.thread.id}/posts/")
        self.assertNotIn("hello", str(anon.json()))
        self.client.force_authenticate(self.verifier)
        mod = self.client.get(f"/api/v1/forum/threads/{self.thread.id}/posts/")
        self.assertIn("hello", str(mod.json()))

    def test_post_to_missing_thread_returns_404(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post("/api/v1/forum/threads/999999/posts/", {"content": "x"})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn("Not found", str(resp.json()))

    def test_moderator_get_post_detail_uses_post_serializer(self):
        self.client.force_authenticate(self.verifier)
        resp = self.client.get(f"/api/v1/forum/posts/{self.first_post.id}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        # GET path -> PostSerializer (not PostUpdateSerializer)
        self.assertIn("content", resp.json())

    def test_vote_on_missing_post_returns_404(self):
        self.client.force_authenticate(self.basic)
        resp = self.client.post("/api/v1/forum/posts/999999/vote/", {"value": 1})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_vote_view_get_queryset_scaffolding(self):
        from forum.views import VoteView

        qs = VoteView().get_queryset()
        self.assertEqual(qs.count(), 1)
