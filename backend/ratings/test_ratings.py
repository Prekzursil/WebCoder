"""Ratings tests (Wave B: RAT-1 Glicko + RAT-2 suppression + RAT-3 bands +
round-2 SAF-2 rollback). Engine math, service flow, endpoints, finalize hook.
"""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from contests.models import Contest, ContestParticipation, ContestProblem, ContestScore
from contests.tasks import finalize_contest
from notifications.models import Notification
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from ratings.glicko import (
    RATING_BANDS,
    PlayerInput,
    compute_contest_ratings,
    decay_rd,
    expectation,
    g,
    rating_band,
)
from ratings.models import RatingHistory, UserRating
from ratings.services import (
    compute_contest_ratings as compute_service,
    rollback_contest_ratings,
)
from users.models import User

NOW = timezone.now()


class GlickoEngineTests(TestCase):
    def test_g_and_expectation_bounds(self):
        # g(RD) shrinks toward 0 as RD grows; g(0) == 1.
        self.assertAlmostEqual(g(0.0), 1.0, places=6)
        self.assertLess(g(350.0), g(50.0))
        self.assertGreater(g(350.0), 0.65)
        # Even opponents → 0.5; higher-rated opponent → player expects < 0.5.
        self.assertAlmostEqual(expectation(1500, 1500, 100.0), 0.5, places=6)
        self.assertLess(expectation(1400, 1600, 100.0), 0.5)

    def test_decay_rd_drifts_with_inactivity_and_caps(self):
        rd = decay_rd(50.0, None, NOW)
        self.assertLessEqual(rd, 350.0)
        long_ago = NOW - timedelta(days=365 * 3)
        self.assertAlmostEqual(decay_rd(50.0, long_ago, NOW), 350.0, places=1)
        recent = NOW - timedelta(days=1)
        self.assertLess(decay_rd(50.0, recent, NOW), 60.0)

    def test_winner_gains_loser_drops(self):
        players = [
            PlayerInput(user_id=1, rating=1500, rd=50),
            PlayerInput(user_id=2, rating=1500, rd=50),
        ]
        ranks = {1: 1, 2: 2}
        results = compute_contest_ratings(players, ranks, NOW)
        by_id = {r.user_id: r for r in results}
        self.assertGreater(by_id[1].delta, 0)
        self.assertLess(by_id[2].delta, 0)
        # Symmetric magnitudes at identical starting states.
        self.assertAlmostEqual(by_id[1].delta, -by_id[2].delta, delta=1)

    def test_tie_is_half_each(self):
        players = [
            PlayerInput(user_id=1, rating=1500, rd=50),
            PlayerInput(user_id=2, rating=1500, rd=50),
        ]
        results = compute_contest_ratings(players, {1: 1, 2: 1}, NOW)
        self.assertEqual(results[0].delta, 0)
        self.assertEqual(results[1].delta, 0)

    def test_fewer_than_two_players_is_noop(self):
        self.assertEqual(
            compute_contest_ratings([PlayerInput(user_id=1)], {1: 1}, NOW), []
        )

    def test_stronger_player_smaller_gain_when_beating_weaker(self):
        players = [
            PlayerInput(user_id=1, rating=1900, rd=50),
            PlayerInput(user_id=2, rating=1100, rd=50),
        ]
        results = compute_contest_ratings(players, {1: 1, 2: 2}, NOW)
        by_id = {r.user_id: r for r in results}
        # Expected win: tiny gain; expected loss from the weaker side: small drop.
        self.assertLess(by_id[1].delta, 8)
        self.assertGreater(by_id[2].delta, -8)

    def test_rating_floor(self):
        players = [
            PlayerInput(user_id=1, rating=100, rd=350),
            PlayerInput(user_id=2, rating=2400, rd=30),
        ]
        results = compute_contest_ratings(players, {1: 2, 2: 1}, NOW)
        self.assertTrue(all(r.rating >= 100 for r in results))

    def test_bands_and_suppression(self):
        self.assertEqual(rating_band(2500)["name_en"], "Legendary Grandmaster")
        self.assertEqual(rating_band(2300)["color"], "#8b0000")
        self.assertEqual(rating_band(1950)["name_en"], "Master")
        self.assertEqual(rating_band(1500)["name_en"], "Specialist")
        self.assertEqual(rating_band(1250)["name_en"], "Pupil")
        self.assertEqual(rating_band(0)["name_en"], "Newbie")
        self.assertEqual(len(RATING_BANDS), 7)
        # RAT-2 suppression curve (AtCoder bands).
        self.assertEqual(UserRating.suppression(0), 400)
        self.assertEqual(UserRating.suppression(4), 400)
        self.assertEqual(UserRating.suppression(5), 200)
        self.assertEqual(UserRating.suppression(8), 200)
        self.assertEqual(UserRating.suppression(9), 100)
        self.assertEqual(UserRating.suppression(13), 100)
        self.assertEqual(UserRating.suppression(14), 0)
        state = UserRating(user_id=None, rating=1700, contests_count=2)
        self.assertEqual(state.display_rating, 1300)
        state.contests_count = 20
        self.assertEqual(state.display_rating, 1700)


class RatingsServiceBase(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.carol = User.objects.create_user(username="carol", password="pw")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="2",
            points=100,
            order=0,
        )
        self.client = APIClient()

    def mk_rated_contest(self, end_offset_minutes=-5, **kwargs):
        defaults = dict(
            title_i18n={"en": "Rated"},
            created_by=self.organizer,
            start_at=NOW - timedelta(hours=3),
            end_at=NOW + timedelta(minutes=end_offset_minutes),
            format=Contest.Format.IOI,
            is_rated=True,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def seed_scores(self, contest, scores: dict):
        """scores: {user: points} — creates participation + materialized row."""
        for user, points in scores.items():
            part = ContestParticipation.objects.create(contest=contest, user=user)
            cp = ContestProblem.objects.get(contest=contest)
            ContestScore.objects.create(
                participation=part,
                contest_problem=cp,
                best_score=points,
                best_score_frozen=points,
            )


class RatingsServiceTests(RatingsServiceBase):
    def test_compute_flow_with_notifications(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40, self.carol: 0})
        result = compute_service(contest)
        self.assertIn("3 ratings updated", result)
        self.assertEqual(RatingHistory.objects.filter(contest=contest).count(), 3)
        alice_state = UserRating.objects.get(user=self.alice)
        self.assertEqual(alice_state.contests_count, 1)
        self.assertEqual(
            Notification.objects.filter(
                verb="SYSTEM", data__kind="rating_update"
            ).count(),
            3,
        )
        # Rank recorded: alice finished first.
        self.assertEqual(
            RatingHistory.objects.get(user=self.alice, contest=contest).rank, 1
        )
        # DQ'd participations never enter the map (prepare a second contest).
        contest2 = self.mk_rated_contest()
        self.seed_scores(contest2, {self.alice: 0, self.bob: 100})
        ContestParticipation.objects.filter(
            contest=contest2, user=self.bob
        ).update(is_disqualified=True)
        result = compute_service(contest2)
        # Only alice left → <2 finishers.
        self.assertIn("<2 finishers", result)
        self.assertEqual(
            RatingHistory.objects.filter(user=self.alice).count(), 1
        )

    def test_compute_guards(self):
        # Not rated.
        unrated = self.mk_rated_contest(is_rated=False)
        self.assertIn("not rated", compute_service(unrated))
        # Not finished.
        running = self.mk_rated_contest(end_offset_minutes=50)
        self.assertIn("not finished", compute_service(running))
        # Discarded.
        discarded = self.mk_rated_contest()
        discarded.ratings_discarded = True
        discarded.save()
        self.assertIn("discarded", compute_service(discarded))
        # Idempotent.
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 50})
        compute_service(contest)
        self.assertIn("already rated", compute_service(contest))
        # <2 finishers even with participations (no scores → still eligible;
        # two participations with no score rows DO rate: ranks from empty rows).
        solo = self.mk_rated_contest()
        self.seed_scores(solo, {self.alice: 0})
        self.assertIn("<2 finishers", compute_service(solo))

    def test_task_wrappers(self):
        from ratings.services import (
            compute_contest_ratings_task,
            rollback_contest_ratings_task,
        )

        self.assertEqual(compute_contest_ratings_task(424242), "contest 424242 not found")
        self.assertEqual(
            rollback_contest_ratings_task(424242), "contest 424242 not found"
        )
        # Real bodies: compute rates the contest; rollback discards it.
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_contest_ratings_task(contest.id)
        self.assertEqual(RatingHistory.objects.filter(contest=contest).count(), 2)
        message = rollback_contest_ratings_task(contest.id)
        self.assertIn("discarded", message)
        self.assertEqual(RatingHistory.objects.count(), 0)
        # finalize task wrapper body (ratings dispatch mocked away).
        from contests.tasks import finalize_contest_task

        other = self.mk_rated_contest()
        with mock.patch("ratings.services.compute_contest_ratings_task"):
            result = finalize_contest_task(other.id)
        self.assertIn("finalized", result)

    def test_rollback_discards_and_replays(self):
        first = self.mk_rated_contest()
        self.seed_scores(first, {self.alice: 100, self.bob: 50})
        compute_service(first)
        second = self.mk_rated_contest()
        self.seed_scores(second, {self.alice: 0, self.bob: 100})
        compute_service(second)
        alice_after_two = UserRating.objects.get(user=self.alice).rating
        history_count = RatingHistory.objects.count()
        self.assertEqual(history_count, 4)

        message = rollback_contest_ratings(second)
        self.assertIn("discarded (was rated)", message)
        self.assertIn("1 contests replayed", message)
        second.refresh_from_db()
        self.assertTrue(second.ratings_discarded)
        # Only the first contest's rows remain (2), alice back to first-only state.
        self.assertEqual(RatingHistory.objects.count(), 2)
        self.assertFalse(RatingHistory.objects.filter(contest=second).exists())
        alice_state = UserRating.objects.get(user=self.alice)
        first_history = RatingHistory.objects.get(user=self.alice, contest=first)
        self.assertEqual(alice_state.rating, first_history.rating)
        self.assertNotEqual(alice_state.rating, alice_after_two)
        # Rollback of a contest that was never rated: no replay needed.
        never = self.mk_rated_contest()
        message = rollback_contest_ratings(never)
        self.assertIn("was never rated", message)


class RatingsEndpointTests(RatingsServiceBase):
    def test_ladder_me_colors_history(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_service(contest)
        response = self.client.get("/api/v1/ratings/")
        self.assertEqual(response.status_code, 200)
        usernames = [row["user"]["username"] for row in response.data["results"]]
        self.assertEqual(usernames[0], "alice")  # higher internal rating
        self.assertEqual(response.data["results"][0]["rank"], 1)
        self.assertIn("band", response.data["results"][0])

        self.client.force_authenticate(user=self.alice)
        response = self.client.get("/api/v1/ratings/me/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["rated"])
        # Suppressed display (first contest): 400 below internal.
        self.assertEqual(
            response.data["rating"], response.data["internal_rating"] - 400
        )
        # Unrated user stub.
        self.client.force_authenticate(user=self.carol)
        response = self.client.get("/api/v1/ratings/me/")
        self.assertFalse(response.data["rated"])
        self.assertIsNone(response.data["rating"])

        response = self.client.get("/api/v1/ratings/colors/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["bands"]), 7)

        response = self.client.get("/api/v1/ratings/users/alice/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["history"]), 1)
        self.assertEqual(response.data["history"][0]["rank"], 1)
        self.assertEqual(response.data["rating"]["contests_count"], 1)
        response = self.client.get("/api/v1/ratings/users/ghost/")
        self.assertEqual(response.status_code, 404)

    def test_contest_rating_changes_and_rollback_permissions(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_service(contest)
        response = self.client.get(f"/api/v1/contests/{contest.id}/rating-changes/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["is_rated"])
        self.assertEqual(len(response.data["changes"]), 2)
        first = response.data["changes"][0]
        self.assertEqual(first["username"], "alice")
        self.assertEqual(first["rating_after"] - first["rating_before"], first["delta"])
        # Bogus contest.
        self.assertEqual(
            self.client.get("/api/v1/contests/424242/rating-changes/").status_code,
            404,
        )
        # Rollback: anonymous → 401; participant → 403; organizer → OK.
        response = self.client.post(f"/api/v1/contests/{contest.id}/rating-rollback/")
        self.assertEqual(response.status_code, 401)
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(f"/api/v1/contests/{contest.id}/rating-rollback/")
        self.assertEqual(response.status_code, 403)
        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(f"/api/v1/contests/{contest.id}/rating-rollback/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(RatingHistory.objects.count(), 0)
        self.assertEqual(
            self.client.post(
                "/api/v1/contests/424242/rating-rollback/"
            ).status_code,
            404,
        )


class FinalizeHookTests(RatingsServiceBase):
    def test_finalize_dispatches_rating_task_for_rated_contest(self):
        contest = self.mk_rated_contest()
        with mock.patch(
            "ratings.services.compute_contest_ratings_task"
        ) as rating_mock, mock.patch(
            "contests.tasks.rejudge_submissions_batch"
        ):
            finalize_contest(contest.id)
        rating_mock.delay.assert_called_once_with(contest.id)

    def test_finalize_skips_rating_task_for_unrated(self):
        contest = self.mk_rated_contest(is_rated=False)
        with mock.patch(
            "ratings.services.compute_contest_ratings_task"
        ) as rating_mock, mock.patch(
            "contests.tasks.rejudge_submissions_batch"
        ):
            finalize_contest(contest.id)
        rating_mock.delay.assert_not_called()


class CoverageEdgeTests(RatingsServiceBase):
    """__str__/summary helpers and the model-property edges."""

    def test_model_str_and_summary(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_service(contest)
        state = UserRating.objects.get(user=self.alice)
        self.assertIn(f"{state.rating}", str(state))
        history = RatingHistory.objects.get(user=self.alice)
        self.assertIn("+", str(history))  # signed delta
        self.assertEqual(history.rating_before, history.rating - history.delta)

        summary = __import__("ratings.services", fromlist=["user_public_summary"]).user_public_summary(self.alice)
        self.assertEqual(summary["contests_count"], 1)
        self.assertIn("name_en", summary["band"])
        self.assertIn("color", summary["band"])
        self.assertIsNone(
            __import__("ratings.services", fromlist=["user_public_summary"]).user_public_summary(self.carol)
        )


class ReplayNoUpdateArmTest(RatingsServiceBase):
    """Single-branch 100% gate: the replay loop must also tolerate contests
    whose recompute yields no update ("<2 finishers") — that arm must not
    increment the replayed counter."""

    def test_rollback_replays_contest_with_no_ratable_finishers(self):
        first = self.mk_rated_contest()
        self.seed_scores(first, {self.alice: 100, self.bob: 50})
        compute_service(first)
        second = self.mk_rated_contest()
        self.seed_scores(second, {self.alice: 0, self.bob: 100})
        compute_service(second)
        # Rated + finished + not discarded, but nobody scored → replay says
        # "<2 finishers", which must NOT count as an updated replay.
        silent = self.mk_rated_contest()

        message = rollback_contest_ratings(second)
        self.assertIn("1 contests replayed", message)
        silent.refresh_from_db()
        self.assertFalse(silent.ratings_discarded)
