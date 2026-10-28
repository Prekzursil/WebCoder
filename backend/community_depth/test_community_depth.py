"""Community-depth tests (Wave C: COM-3/COM-7, RAT-8/9/10)."""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from community_depth import services
from forum.models import Post, Thread
from problems.models import Article, CommunityEditorial, Problem
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User


def _mk_problem(title, author=None, status=Problem.ProblemStatus.APPROVED, **kw):
    problem = Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "s", "ro": "s"},
        status=status,
        author=author,
        **kw,
    )
    ProblemTestCase.objects.create(
        problem=problem, input_data="1", expected_output_data="2", points=100, order=1
    )
    return problem


def _ac(user, problem, at=None, language="python3"):
    submission = Submission.objects.create(
        user=user,
        problem=problem,
        language=language,
        code="pass",
        verdict=Submission.VerdictStatus.ACCEPTED,
        score=100,
    )
    if at is not None:
        # auto_now_add ignores the constructor kwarg — backdate via UPDATE
        # (the contest tests' established pattern).
        Submission.objects.filter(pk=submission.pk).update(submission_time=at)
        submission.refresh_from_db()
    return submission


class CommunityDepthBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.kid = User.objects.create_user(username="kid", password="pw", is_minor=True)
        self.creator = User.objects.create_user(
            username="creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.problem = _mk_problem("Sum")
        self.client = APIClient()

    def mk_thread(self, author, title="T", post_kwargs=None):
        thread = Thread.objects.create(title=title, author=author, post_count=1)
        Post.objects.create(
            thread=thread, author=author, content="body", **(post_kwargs or {})
        )
        return thread


class FeedTests(CommunityDepthBase):
    """COM-3 — the public recent-verdicts feed."""

    def test_feed_lists_verdicts_without_code_and_hides_minors(self):
        _ac(self.alice, self.problem)
        _ac(self.kid, self.problem)
        response = self.client.get("/api/v1/community/feed/")
        self.assertEqual(response.status_code, 200)
        users = [row["user"] for row in response.data["results"]]
        self.assertIn("alice", users)
        self.assertNotIn("kid", users)
        for row in response.data["results"]:
            self.assertNotIn("code", row)
            self.assertIn("verdict", row)

    def test_feed_pagination_window(self):
        _ac(self.alice, self.problem)
        page2 = self.client.get("/api/v1/community/feed/?page=2")
        self.assertEqual(page2.status_code, 200)
        self.assertEqual(page2.data["results"], [])
        junk = self.client.get("/api/v1/community/feed/?page=abc")
        self.assertEqual(junk.data["page"], 1)


class SolutionsTests(CommunityDepthBase):
    """COM-7 — post-solve browsing of AC sources."""

    def test_requires_own_ac(self):
        _ac(self.bob, self.problem)
        self.client.force_authenticate(self.alice)
        denied = self.client.get(f"/api/v1/community/problems/{self.problem.id}/solutions/")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Solve the problem first", denied.data["detail"])

        _ac(self.alice, self.problem)
        allowed = self.client.get(f"/api/v1/community/problems/{self.problem.id}/solutions/")
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.data["count"], 2)
        self.assertIn("license", allowed.data)
        self.assertEqual(
            [row["user"] for row in allowed.data["results"]].count("kid"), 0
        )

    def test_author_verifier_admin_bypass(self):
        _ac(self.bob, self.problem)
        verifier = User.objects.create_user(
            username="verif", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.problem.verifier = verifier
        self.problem.save()
        self.client.force_authenticate(verifier)
        response = self.client.get(f"/api/v1/community/problems/{self.problem.id}/solutions/")
        self.assertEqual(response.status_code, 200)

    def test_contest_fresh_problem_locked(self):
        from contests.models import Contest, ContestProblem

        organizer = User.objects.create_user(username="org", password="pw")
        now = timezone.now()
        contest = Contest.objects.create(
            title_i18n={"en": "Live", "ro": "Live"},
            created_by=organizer,
            start_at=now - timedelta(minutes=10),
            end_at=now + timedelta(hours=1),
        )
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        _ac(self.alice, self.problem)
        self.client.force_authenticate(self.alice)
        locked = self.client.get(f"/api/v1/community/problems/{self.problem.id}/solutions/")
        self.assertEqual(locked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("contest", str(locked.data["detail"]))

    def test_missing_problem_404(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/community/problems/999999/solutions/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class HonorTests(CommunityDepthBase):
    """RAT-8 — contributor honor derivation."""

    def test_honor_weights_and_cap(self):
        _mk_problem("Authored", author=self.creator)
        CommunityEditorial.objects.create(
            problem=self.problem,
            author=self.creator,
            title="E",
            body="b",
            status=CommunityEditorial.Status.APPROVED,
        )
        Article.objects.create(
            title_i18n={"en": "A"},
            body_en="b",
            author=self.creator,
            status=Article.Status.APPROVED,
        )
        thread = self.mk_thread(self.creator)
        Post.objects.create(thread=thread, author=self.creator, content="x", upvotes=50)
        payload = services.user_honor(self.creator)
        self.assertEqual(payload["honor"], 10 + 5 + 5 + 10)  # capped at 10/post
        self.assertEqual(payload["breakdown"]["approved_problem"], 1)

    def test_honor_endpoints_and_anonymous_shape(self):
        empty = services.user_honor(None)
        self.assertEqual(empty["honor"], 0)
        public = self.client.get("/api/v1/community/honor/alice/")
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["honor"], 0)
        self.client.force_authenticate(self.alice)
        mine = self.client.get("/api/v1/community/honor/me/")
        self.assertEqual(mine.status_code, 200)
        missing = self.client.get("/api/v1/community/honor/ghost/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)


class WeeklyBoardTests(CommunityDepthBase):
    """RAT-9 — the rolling-week board."""

    def test_weekly_rows_window_and_ranking(self):
        now = timezone.now()
        _ac(self.alice, self.problem, at=now)
        old = _ac(self.bob, self.problem, at=now - timedelta(days=10))
        rows = services.weekly_rows()
        usernames = [row["username"] for row in rows]
        self.assertIn("alice", usernames)
        self.assertNotIn("bob", usernames)
        self.assertEqual(rows[0]["rank"], 1)
        self.assertEqual(rows[0]["points"], 100)
        del old

        response = self.client.get("/api/v1/community/leaderboard/weekly/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["window_days"], 7)
        self.assertEqual(response.data["results"][0]["username"], "alice")


class VoteRulesTests(CommunityDepthBase):
    """RAT-10 — trust floor, negative clamp, auto-hide."""

    def setUp(self):
        super().setUp()
        self.thread = self.mk_thread(self.creator)
        self.post = self.thread.posts.first()
        _ac(self.alice, self.problem)  # alice may vote; bob may not

    def vote(self, user, value):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/v1/forum/posts/{self.post.id}/vote/",
            {"value": value},
            format="json",
        )

    def test_voting_requires_an_ac(self):
        denied = self.vote(self.bob, 1)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Solve a problem", denied.data["detail"])
        ok = self.vote(self.alice, 1)
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data["upvotes"], 1)

    def test_small_negative_renders_zero(self):
        self.vote(self.alice, -1)
        # Raw -1 is clamped to 0 for display.
        self.assertEqual(Post.objects.get(pk=self.post.id).upvotes, 0)

    def test_auto_hide_at_threshold(self):
        # 26 solver accounts downvote -> net -26 <= AUTO_HIDE_THRESHOLD.
        for index in range(26):
            voter = User.objects.create_user(username=f"v{index}", password="pw")
            _ac(voter, self.problem)
            self.vote(voter, -1)
        self.post.refresh_from_db()
        self.assertTrue(self.post.is_hidden)
        self.assertEqual(self.post.hidden_reason, "auto-hidden by community feedback")
        # The clamped display score floors at 0.
        self.assertEqual(self.post.upvotes, 0)

    def test_effective_score_rules(self):
        self.assertEqual(services.effective_score(5), 5)
        self.assertEqual(services.effective_score(-5), 0)
        self.assertEqual(services.effective_score(-24), 0)
        # Hidden rows never display their raw negative either.
        self.assertEqual(services.effective_score(-30), 0)

    def test_user_has_ac_variants(self):
        self.assertTrue(services.user_has_ac(self.alice))
        self.assertFalse(services.user_has_ac(self.bob))
        self.assertFalse(services.user_has_ac(None))


class CoverageClosureTests(CommunityDepthBase):
    """Drive remaining branches to the 100% gate."""

    def test_apply_vote_rules_keeps_existing_reason(self):
        thread = self.mk_thread(self.creator, post_kwargs={"is_hidden": True, "hidden_reason": "mod action"})
        post = thread.posts.first()
        from community_depth.services import apply_vote_rules

        apply_vote_rules(post, raw_score=-30)
        # Already hidden with a reason: the mod's reason wins.
        self.assertEqual(post.hidden_reason, "mod action")

    def test_apply_vote_rules_visible_post_with_stale_reason(self):
        # Visible row carrying a stale reason string: hiding fires, the
        # stale reason is kept (never overwritten silently).
        thread = self.mk_thread(
            self.creator, post_kwargs={"hidden_reason": "stale note"}
        )
        post = thread.posts.first()
        from community_depth.services import apply_vote_rules

        self.assertFalse(post.is_hidden)
        apply_vote_rules(post, raw_score=-26)
        self.assertTrue(post.is_hidden)
        self.assertEqual(post.hidden_reason, "stale note")
        self.assertEqual(post.upvotes, 0)

    def test_solutions_anonymous_user_path(self):
        # Anonymous caller: not authenticated, no AC -> gated by the solve
        # rule after the contest check.
        ok, reason = services.can_browse_solutions(None, self.problem)
        self.assertFalse(ok)
        self.assertIn("Solve the problem first", reason)
