"""Wave F — ratings depth (items 51/52/53).

Rating-graph annotations (career peaks, medals, division crossings),
percentiles (overall / school / county) and divisions with promotion
cutoffs derived from rating history.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.models import Contest, ContestAward, ContestProblem
from problems.models import Problem
from ratings.divisions import (
    division_changes,
    division_for,
    division_thresholds,
    graph_annotations,
    percentiles,
    user_division,
)
from ratings.models import RatingHistory, UserRating
from users.models import User


class RatingsDepthBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(
            username="alice", password="pw", school="CNERV", county="Cluj"
        )
        self.bob = User.objects.create_user(
            username="bob", password="pw", school="cnerv", county="Cluj"
        )
        self.carol = User.objects.create_user(
            username="carol", password="pw", school="Alta Scoala", county="Brasov"
        )
        self.now = timezone.now()
        self.client = APIClient()
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )

    def mk_contest(self, days_ago, title="C"):
        contest = Contest.objects.create(
            title_i18n={"en": title, "ro": title},
            created_by=self.alice,
            start_at=self.now - timedelta(days=days_ago, hours=2),
            end_at=self.now - timedelta(days=days_ago),
        )
        ContestProblem.objects.create(contest=contest, problem=self.problem, order=0)
        return contest

    def rate(self, user, contest, rating, rank=1, delta=None):
        # contests_count >= 14 keeps display_rating == rating (the RAT-2
        # newcomer suppression curve is empty for established raters).
        return RatingHistory.objects.create(
            user=user,
            contest=contest,
            rank=rank,
            rating=rating,
            rd=150.0,
            delta=delta if delta is not None else rating - 1500,
            contests_count=20,
        )

    def state(self, user, rating, contests=20):
        return UserRating.objects.create(
            user=user, rating=rating, rd=150.0, contests_count=contests
        )


class DivisionTests(RatingsDepthBase):
    def test_division_for_boundaries(self):
        self.assertEqual(division_for(0), "Div 4")
        self.assertEqual(division_for(1199), "Div 4")
        self.assertEqual(division_for(1200), "Div 3")
        self.assertEqual(division_for(1599), "Div 3")
        self.assertEqual(division_for(1600), "Div 2")
        self.assertEqual(division_for(1899), "Div 2")
        self.assertEqual(division_for(1900), "Div 1")
        self.assertEqual(division_for(2600), "Div 1")

    def test_promotion_and_demotion_events(self):
        c1 = self.mk_contest(30)
        c2 = self.mk_contest(20)
        c3 = self.mk_contest(10)
        # 1100 -> 1300 (promote to Div 3) -> 1250 (no event) -> 1700 (Div 2)
        self.rate(self.alice, c1, 1100)
        self.rate(self.alice, c2, 1300)
        c4 = self.mk_contest(5)
        self.rate(self.alice, c4, 1700)
        # demotion case for bob: 2000 -> 1150
        self.rate(self.bob, c1, 2000)
        self.rate(self.bob, c3, 1150)
        alice_events = division_changes(self.alice)
        self.assertEqual(
            [(e["kind"], e["to"]) for e in alice_events],
            [("promoted", "Div 3"), ("promoted", "Div 2")],
        )
        bob_events = division_changes(self.bob)
        self.assertEqual(bob_events[0]["kind"], "demoted")
        self.assertEqual(bob_events[0]["to"], "Div 4")

    def test_user_division_unrated(self):
        dave = User.objects.create_user(username="dave", password="pw")
        self.assertEqual(
            user_division(dave), {"division": None, "rated": False, "changes": []}
        )

    def test_thresholds_table_counts_population(self):
        self.state(self.alice, 1300)
        self.state(self.bob, 2000)
        table = division_thresholds()
        by_name = {row["name"]: row for row in table}
        self.assertEqual(by_name["Div 3"]["players"], 1)
        self.assertEqual(by_name["Div 1"]["players"], 1)
        self.assertEqual(by_name["Div 4"]["players"], 0)

    def test_divisions_endpoint(self):
        self.state(self.alice, 1300)
        response = self.client.get("/api/v1/ratings/divisions/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["divisions"]), 4)
        self.assertIn("min_rating", response.data["divisions"][0])

    def test_user_divisions_endpoint(self):
        c1 = self.mk_contest(30)
        c2 = self.mk_contest(20)
        self.rate(self.alice, c1, 1100)
        self.rate(self.alice, c2, 1300)
        self.state(self.alice, 1300)
        response = self.client.get("/api/v1/ratings/users/alice/divisions/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["rated"])
        self.assertEqual(len(response.data["changes"]), 1)
        response = self.client.get("/api/v1/ratings/users/ghost/divisions/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class PercentileTests(RatingsDepthBase):
    def test_overall_and_cohorts(self):
        self.state(self.alice, 1500)  # the subject
        self.state(self.bob, 1400)  # same school (case-insensitive), below
        self.state(self.carol, 1800)  # other school/county, above
        profile = percentiles(self.alice)
        self.assertTrue(profile["rated"])
        self.assertEqual(profile["overall"]["total"], 3)
        self.assertEqual(profile["overall"]["percentile"], 33.3)
        # School cohort: only bob counts (subject excluded).
        self.assertEqual(profile["school"]["name"], "CNERV")
        self.assertEqual(profile["school"]["total"], 1)
        self.assertEqual(profile["school"]["percentile"], 100.0)
        self.assertEqual(profile["county"]["total"], 1)

    def test_unrated_user(self):
        dave = User.objects.create_user(username="dave", password="pw")
        self.assertEqual(percentiles(dave), {"rated": False})

    def test_blank_cohorts_stay_null(self):
        dave = User.objects.create_user(username="dave", password="pw")
        self.state(dave, 1500)
        profile = percentiles(dave)
        self.assertIsNone(profile["school"])
        self.assertIsNone(profile["county"])

    def test_percentiles_endpoint(self):
        self.state(self.alice, 1500)
        response = self.client.get("/api/v1/ratings/users/alice/percentiles/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["rated"])
        response = self.client.get("/api/v1/ratings/users/ghost/percentiles/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class GraphAnnotationTests(RatingsDepthBase):
    def test_peaks_medals_and_crossings(self):
        c1 = self.mk_contest(30, "First")
        c2 = self.mk_contest(20, "Second")
        c3 = self.mk_contest(10, "Third")
        self.rate(self.alice, c1, 1300)  # Div 3 entry + first peak
        self.rate(self.alice, c2, 1250)  # dip: nothing
        self.rate(self.alice, c3, 1700)  # new peak + medal + Div 2
        ContestAward.objects.create(
            contest=c3, user=self.alice, medal=ContestAward.Medal.GOLD, rank=1
        )
        annotations = graph_annotations(self.alice)
        self.assertIn("peak", annotations[0])
        self.assertNotIn("medal", annotations[0])
        self.assertNotIn(1, annotations)
        self.assertEqual(annotations[2]["medal"], "GOLD")
        self.assertEqual(annotations[2]["division_change"], "promoted")
        self.assertEqual(annotations[2]["division"], "Div 2")

    def test_history_endpoint_carries_annotations(self):
        c1 = self.mk_contest(30, "First")
        self.rate(self.alice, c1, 1300)
        self.state(self.alice, 1300)
        response = self.client.get("/api/v1/ratings/users/alice/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("annotations", response.data)
        self.assertIn("division", response.data)
        self.assertEqual(response.data["division"], "Div 3")
        self.assertIn(0, response.data["annotations"])
