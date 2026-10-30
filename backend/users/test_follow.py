"""COM-4 (competitive roadmap): the friends/follow graph — toggle
endpoint, following list, and the ?friends=1 filtered boards."""

from django.test import TestCase
from rest_framework.test import APIClient

from problems.models import Problem, Tag
from submissions.models import Submission
from users.models import Follow, User


def _make_problem(title, status=Problem.ProblemStatus.APPROVED, tags=()):
    problem = Problem.objects.create(
        title_i18n={"en": title},
        statement_i18n={"en": "S"},
        status=status,
    )
    for tag_name in tags:
        tag, _ = Tag.objects.get_or_create(name=tag_name)
        problem.tags.add(tag)
    return problem


def _ac(user, problem):
    return Submission.objects.create(
        user=user,
        problem=problem,
        language="python3",
        code="print(1)",
        verdict=Submission.VerdictStatus.ACCEPTED,
        score=10,
    )


class FollowApiTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def test_toggle_follow_and_unfollow(self):
        resp = self.client.post(f"/api/v1/users/{self.bob.id}/follow/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.json()["following"])
        self.assertEqual(resp.json()["followers"], 1)
        self.assertTrue(
            Follow.objects.filter(follower=self.alice, target=self.bob).exists()
        )
        resp = self.client.post(f"/api/v1/users/{self.bob.id}/follow/")
        self.assertFalse(resp.json()["following"])
        self.assertFalse(
            Follow.objects.filter(follower=self.alice, target=self.bob).exists()
        )

    def test_self_follow_rejected(self):
        resp = self.client.post(f"/api/v1/users/{self.alice.id}/follow/")
        self.assertEqual(resp.status_code, 400)
        self.assertFalse(Follow.objects.exists())

    def test_follow_requires_authentication(self):
        anon = APIClient()
        resp = anon.post(f"/api/v1/users/{self.bob.id}/follow/")
        self.assertEqual(resp.status_code, 401)

    def test_following_list_shape(self):
        Follow.objects.create(follower=self.alice, target=self.bob)
        carol = User.objects.create_user(username="carol", password="p")
        Follow.objects.create(follower=self.alice, target=carol)
        resp = self.client.get("/api/v1/users/me/following/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["count"], 2)
        self.assertEqual(
            {row["username"] for row in data["results"]}, {"bob", "carol"}
        )


class FriendsFilteredBoardsTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")
        self.carol = User.objects.create_user(username="carol", password="p")
        Follow.objects.create(follower=self.alice, target=self.bob)
        self.p1 = _make_problem("P1")
        self.p2 = _make_problem("P2")
        _ac(self.alice, self.p1)
        _ac(self.bob, self.p1)
        _ac(self.bob, self.p2)
        _ac(self.carol, self.p1)
        # Refresh the denormalized leaderboard rows.
        from leaderboard.aggregation import update_user_entry

        for user in (self.alice, self.bob, self.carol):
            update_user_entry(user.id)
        self.client = APIClient()
        self.client.force_authenticate(self.alice)

    def test_leaderboard_friends_filter(self):
        resp = self.client.get("/api/v1/leaderboard/?friends=1")
        self.assertEqual(resp.status_code, 200, resp.content)
        usernames = {row["username"] for row in resp.json()["results"]}
        # alice + followed bob; unfollowed carol is filtered out.
        self.assertEqual(usernames, {"alice", "bob"})

    def test_leaderboard_friends_flag_ignored_for_anonymous(self):
        anon = APIClient()
        resp = anon.get("/api/v1/leaderboard/?friends=1")
        self.assertEqual(resp.status_code, 200)
        usernames = {row["username"] for row in resp.json()["results"]}
        self.assertEqual(usernames, {"alice", "bob", "carol"})

    def test_leaderboard_without_flag_is_full(self):
        resp = self.client.get("/api/v1/leaderboard/")
        usernames = {row["username"] for row in resp.json()["results"]}
        self.assertEqual(usernames, {"alice", "bob", "carol"})

    def test_standings_friends_filter(self):
        from django.utils import timezone

        from contests.models import Contest, ContestProblem

        start = timezone.now() - timezone.timedelta(hours=2)
        end = timezone.now() - timezone.timedelta(hours=1)
        organizer = User.objects.create_user(
            username="organizer", password="p", role=User.Roles.ADMIN
        )
        contest = Contest.objects.create(
            created_by=organizer,
            title_i18n={"en": "C"},
            description_i18n={"en": "D"},
            start_at=start,
            end_at=end,
            visibility=Contest.Visibility.PUBLIC,
            format=Contest.Format.IOI,
        )
        ContestProblem.objects.create(contest=contest, problem=self.p1, order=1)
        from contests.models import ContestParticipation
        from contests.scoring import record_verdict

        for user in (self.alice, self.bob, self.carol):
            ContestParticipation.objects.create(contest=contest, user=user)
            sub = Submission.objects.create(
                user=user,
                problem=self.p1,
                language="python3",
                code="print(1)",
                verdict=Submission.VerdictStatus.ACCEPTED,
                score=10,
                contest=contest,
                submission_time=start + timezone.timedelta(minutes=10),
            )
            record_verdict(sub)
        resp = self.client.get(
            f"/api/v1/contests/{contest.id}/standings/?friends=1"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        rows = resp.json()["results"]
        usernames = {row["user"]["username"] for row in rows}
        self.assertEqual(usernames, {"alice", "bob"})
        # Ranks renumber within the filtered board.
        self.assertEqual([row["rank"] for row in rows], [1, 2])

    def test_no_self_follow_constraint(self):
        from django.db import IntegrityError, transaction

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Follow.objects.create(follower=self.alice, target=self.alice)


    def test_follow_str_representation(self):
        # setUp already created the alice->bob edge.
        edge = Follow.objects.get(follower=self.alice, target=self.bob)
        self.assertEqual(str(edge), f"{self.alice.id} -> {self.bob.id}")
