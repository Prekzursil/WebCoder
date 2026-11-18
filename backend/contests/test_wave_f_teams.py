"""Wave F — teams, school cups, self-prediction (items 49/50/55).

Team contests: register-with-team-name flow (create/join/full/dupe), the
per-team aggregated standings section, team-contest validation rules.
School cups: the school eligibility gate. Calibration: predict → actual
rank pairing, MAE and bias statistics.
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.models import (
    Contest,
    ContestParticipation,
    ContestPrediction,
    ContestProblem,
    ContestScore,
    ContestTeam,
    ContestTeamMember,
)
from contests.teams import calibration, teams_ranking
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from ratings.models import RatingHistory
from submissions.models import Submission
from users.models import User


@override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=0)
class TeamsCupsBase(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.carol = User.objects.create_user(username="carol", password="pw")
        self.dave = User.objects.create_user(username="dave", password="pw")
        self.now = timezone.now()
        self.problem = self.mk_problem("Sum")
        self.client = APIClient()

    def mk_problem(self, title):
        p = Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=p, input_data="1", expected_output_data="2", points=100, order=1
        )
        return p

    def mk_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Contest", "ro": "Concurs"},
            created_by=self.organizer,
            start_at=self.now + timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=170),
            format=Contest.Format.IOI,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def register_team(self, contest, user, team_name):
        self.client.force_authenticate(user)
        return self.client.post(
            f"/api/v1/contests/{contest.id}/register/",
            {"team_name": team_name},
            format="json",
        )

    def mk_score(self, contest, user, best, at=None):
        part, _ = ContestParticipation.objects.get_or_create(contest=contest, user=user)
        row, _ = ContestScore.objects.get_or_create(
            participation=part,
            contest_problem=contest.contest_problems.get(),
            defaults={"best_score": best, "attempts": 1},
        )
        row.best_score = best
        row.attempts = 1
        if best >= 100:
            row.first_ac_at = at or timezone.now()
            row.last_improvement = row.first_ac_at
        row.save()
        return row


class TeamRegistrationTests(TeamsCupsBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest(is_team_contest=True)

    def test_team_name_required(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/register/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("team name", str(response.data["detail"]))

    def test_captain_creates_and_others_join(self):
        response = self.register_team(self.contest, self.alice, "Echipa Albastra")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["team"], "Echipa Albastra")
        self.assertEqual(ContestTeam.objects.count(), 1)
        self.assertTrue(
            ContestTeamMember.objects.filter(
                team__name="Echipa Albastra", user=self.alice
            ).exists()
        )
        response = self.register_team(self.contest, self.bob, "echipa albastra")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Case-insensitive join: no second team.
        self.assertEqual(ContestTeam.objects.count(), 1)
        response = self.register_team(self.contest, self.carol, "Echipa Albastra")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_team_full_rejected(self):
        for i, user in enumerate((self.alice, self.bob, self.carol)):
            response = self.register_team(self.contest, user, "Full")
            self.assertEqual(response.status_code, 201, response.data)
        response = self.register_team(self.contest, self.dave, "Full")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("full", str(response.data["detail"]))

    def test_duplicate_member_conflict(self):
        self.register_team(self.contest, self.alice, "One")
        # Re-registering the same user on their team: 409 via the member check.
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/register/",
            {"team_name": "One"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_team_contest_cannot_be_rated(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/contests/",
            {
                "title_i18n": {"en": "TC"},
                "start_at": "2026-12-01T10:00:00Z",
                "end_at": "2026-12-01T12:00:00Z",
                "is_rated": True,
                "is_team_contest": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be rated", str(response.data["is_rated"]))


class TeamBoardTests(TeamsCupsBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest(is_team_contest=True)
        for user, team_name in (
            (self.alice, "Alpha"),
            (self.bob, "Alpha"),
            (self.carol, "Beta"),
        ):
            self.register_team(self.contest, user, team_name)

    def test_teams_listing(self):
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/teams/")
        self.assertEqual(response.status_code, 200, response.data)
        by_name = {row["name"]: row for row in response.data["results"]}
        self.assertEqual(by_name["Alpha"]["members"], ["alice", "bob"])
        self.assertEqual(by_name["Alpha"]["captain"], "alice")
        self.assertEqual(by_name["Beta"]["member_count"], 1)

    def test_team_standings_aggregate(self):
        # Alpha: alice 100 (solved), bob 40 partial -> team best 100.
        self.mk_score(self.contest, self.alice, 100)
        self.mk_score(self.contest, self.bob, 40)
        # Beta: carol 70.
        self.mk_score(self.contest, self.carol, 70)
        response = self.client.get(
            f"/api/v1/contests/{self.contest.id}/standings/?section=teams"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["section"], "teams")
        results = response.data["results"]
        self.assertEqual(results[0]["team"], "Alpha")
        self.assertEqual(results[0]["score"], 100)
        self.assertEqual(results[0]["members"], ["alice", "bob"])
        self.assertEqual(results[1]["team"], "Beta")
        self.assertEqual(results[1]["score"], 70)

    def test_team_section_rejected_for_solo_contests(self):
        solo = self.mk_contest()
        response = self.client.get(
            f"/api/v1/contests/{solo.id}/standings/?section=teams"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teams_endpoint_rejected_for_solo_contests(self):
        solo = self.mk_contest()
        response = self.client.get(f"/api/v1/contests/{solo.id}/teams/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_teams_ranking_unknown_team_covered(self):
        # A team with no score rows still ranks (zero total).
        ranking = teams_ranking(self.contest)
        self.assertEqual(len(ranking), 2)
        self.assertEqual(ranking[0]["score"], 0)

    def test_teams_listing_unknown_contest(self):
        response = self.client.get("/api/v1/contests/999999/teams/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SchoolCupTests(TeamsCupsBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest(
            is_school_cup=True, school_name="Colegiul Național „Emil Racoviță”"
        )

    def test_school_gate_rejects_outsiders(self):
        self.alice.school = "Liceul Altfel"
        self.alice.save()
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/register/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("this cup is for students", str(response.data["detail"]).lower())

    def test_school_gate_rejects_blank_school(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/register/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_school_members_register_case_insensitively(self):
        self.alice.school = "colegiul național „emil racoviță”"
        self.alice.save()
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/register/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

    def test_school_cup_requires_name(self):
        self.client.force_authenticate(self.admin)
        response = self.client.post(
            "/api/v1/contests/",
            {
                "title_i18n": {"en": "Cup"},
                "start_at": "2026-12-01T10:00:00Z",
                "end_at": "2026-12-01T12:00:00Z",
                "is_school_cup": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class PredictionTests(TeamsCupsBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest(is_rated=True)

    def test_predict_and_read_back(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": 3},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/predict/")
        self.assertEqual(response.data["prediction"], 3)
        self.assertTrue(response.data["open"])

    def test_predict_update_overwrites(self):
        self.client.force_authenticate(self.alice)
        self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": 5},
            format="json",
        )
        self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": 2},
            format="json",
        )
        self.assertEqual(ContestPrediction.objects.count(), 1)
        self.assertEqual(ContestPrediction.objects.get().predicted_rank, 2)

    def test_predict_validation(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": "zero"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": 0},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_predict_locked_after_first_submission(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            contest=self.contest,
            language="python3",
            code="pass",
            verdict="WA",
            score=0,
        )
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{self.contest.id}/predict/",
            {"predicted_rank": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Too late", str(response.data["detail"]))

    def test_predict_rejected_after_finish(self):
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(hours=1),
        )
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{finished.id}/predict/",
            {"predicted_rank": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CalibrationTests(TeamsCupsBase):
    def test_calibration_over_rated_history(self):
        finished = self.mk_contest(
            is_rated=True,
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(hours=1),
        )
        ContestPrediction.objects.create(
            user=self.alice, contest=finished, predicted_rank=1
        )
        RatingHistory.objects.create(
            user=self.alice,
            contest=finished,
            rank=3,
            rating=1500,
            rd=200.0,
            delta=10,
            contests_count=2,
        )
        profile = calibration(self.alice)
        self.assertEqual(profile["count"], 1)
        row = profile["results"][0]
        self.assertEqual(row["predicted_rank"], 1)
        self.assertEqual(row["actual_rank"], 3)
        self.assertEqual(row["error"], -2)
        self.assertEqual(profile["mean_abs_error"], 2.0)
        self.assertEqual(profile["bias"], -2.0)

    def test_calibration_unrated_via_standings(self):
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(hours=1),
        )
        ContestPrediction.objects.create(
            user=self.alice, contest=finished, predicted_rank=2
        )
        part = ContestParticipation.objects.create(contest=finished, user=self.alice)
        ContestScore.objects.create(
            participation=part,
            contest_problem=finished.contest_problems.get(),
            best_score=100,
            best_score_frozen=100,
            first_ac_at=self.now - timedelta(hours=2),
            first_ac_at_frozen=self.now - timedelta(hours=2),
        )
        profile = calibration(self.alice)
        self.assertEqual(profile["results"][0]["actual_rank"], 1)
        self.assertEqual(profile["results"][0]["error"], 1)

    def test_calibration_pending_contest_excluded(self):
        ContestPrediction.objects.create(
            user=self.alice, contest=self.mk_contest(), predicted_rank=1
        )
        profile = calibration(self.alice)
        self.assertEqual(profile["count"], 0)
        self.assertIsNone(profile["mean_abs_error"])
        self.assertEqual(profile["results"][0]["actual_rank"], None)

    def test_predict_unknown_contest_404(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/contests/999999/predict/", {"predicted_rank": 1}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_predict_anonymous_401(self):
        contest = self.mk_contest()
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/predict/",
            {"predicted_rank": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_calibration_prediction_without_participation(self):
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(hours=1),
        )
        ContestPrediction.objects.create(
            user=self.alice, contest=finished, predicted_rank=1
        )
        profile = calibration(self.alice)
        # Predicted but never sat: no actual rank, no error, excluded from MAE.
        self.assertIsNone(profile["results"][0]["actual_rank"])
        self.assertIsNone(profile["results"][0]["error"])
        self.assertEqual(profile["count"], 0)

    def test_calibration_endpoint(self):
        response = self.client.get("/api/v1/ratings/users/alice/calibration/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        response = self.client.get("/api/v1/ratings/users/nobody/calibration/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DunderTests(TeamsCupsBase):
    def test_str_methods(self):
        contest = self.mk_contest(is_team_contest=True)
        self.register_team(contest, self.alice, "Alpha")
        team = ContestTeam.objects.get()
        self.assertIn("Alpha", str(team))
        member = ContestTeamMember.objects.get()
        self.assertIn("in team", str(member))
        prediction = ContestPrediction.objects.create(
            user=self.alice, contest=contest, predicted_rank=1
        )
        self.assertIn("predicts", str(prediction))
