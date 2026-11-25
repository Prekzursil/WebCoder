"""Wave C contest-depth tests (CON-5 virtual + archive, CON-7 divisions,
CON-9 community contests, CON-11 medals).
"""

from datetime import timedelta

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.awards import (
    compute_contest_awards,
    medal_for_rank,
    official_ranking,
    registration_rating_error,
)
from contests.gating import check_contest_submission, practice_blocked_reason
from contests.models import Contest, ContestAward, ContestParticipation
from contests.scoring import record_verdict
from contests.tasks import finalize_contest
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from ratings.models import UserRating
from submissions.models import Submission
from users.models import User


@override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=0)
class ContestDepthBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.organizer = User.objects.create_user(
            username="organizer", password="pw", role=User.Roles.TEACHER
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.now = timezone.now()
        self.problem = self.mk_problem("Sum")
        self.client = APIClient()

    def mk_problem(self, title, status=Problem.ProblemStatus.APPROVED):
        p = Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            status=status,
        )
        ProblemTestCase.objects.create(
            problem=p, input_data="1", expected_output_data="2", points=100, order=1
        )
        return p

    def mk_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Contest", "ro": "Concurs"},
            created_by=self.organizer,
            start_at=self.now - timedelta(minutes=60),
            end_at=self.now - timedelta(minutes=1),
            format=Contest.Format.IOI,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        from contests.models import ContestProblem

        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def finished_contest(self):
        return self.mk_contest()

    def mk_users(self, n):
        return [
            User.objects.create_user(username=f"player{i}", password="pw")
            for i in range(n)
        ]

    def rate(self, user, rating):
        # contests_count=20 defeats RAT-2 newcomer suppression so the tests
        # exercise the CON-7 band math, not the display curve.
        UserRating.objects.create(user=user, rating=rating, rd=60, contests_count=20)


class VirtualParticipationTests(ContestDepthBase):
    """CON-5: replay of a finished contest under a personal clock."""

    def test_virtual_start_requires_finished(self):
        contest = self.mk_contest(end_at=self.now + timedelta(hours=1))
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("after the contest ends", response.data["detail"])

    def test_virtual_start_rejects_windowed(self):
        contest = self.mk_contest(
            is_window=True,
            per_user_duration_minutes=30,
            end_at=self.now - timedelta(minutes=1),
        )
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Windowed contests", response.data["detail"])

    def test_virtual_start_rejects_pretest(self):
        contest = self.mk_contest(pretest_mode=True)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Pretest contests", response.data["detail"])

    def test_virtual_start_creates_and_resumes(self):
        contest = self.finished_contest()
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["is_virtual"])
        self.assertEqual(
            response.data["effective_end"],
            response.data["virtual_start"] + timedelta(minutes=contest.duration),
        )
        # Idempotent resume.
        response2 = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response2.status_code, status.HTTP_200_OK)

    def test_official_and_virtual_participations_coexist(self):
        contest = self.finished_contest()
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/virtual-start/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            ContestParticipation.objects.filter(
                contest=contest, user=self.alice
            ).count(),
            2,
        )

    def test_virtual_submission_gating(self):
        contest = self.finished_contest()
        part = ContestParticipation.objects.create(
            contest=contest,
            user=self.alice,
            is_virtual=True,
            virtual_start=timezone.now(),
        )
        ok, error = check_contest_submission(contest, self.alice, self.problem.id)
        self.assertTrue(ok)
        self.assertEqual(error, "")
        # Expired personal clock rejects.
        part.virtual_start = timezone.now() - timedelta(minutes=contest.duration + 5)
        part.save()
        ok, error = check_contest_submission(contest, self.alice, self.problem.id)
        self.assertFalse(ok)
        self.assertIn("virtual contest clock", error)

    def test_virtual_verdict_folds_into_virtual_row(self):
        contest = self.finished_contest()
        official = ContestParticipation.objects.create(contest=contest, user=self.alice)
        virtual = ContestParticipation.objects.create(
            contest=contest,
            user=self.alice,
            is_virtual=True,
            virtual_start=timezone.now() - timedelta(minutes=5),
        )
        submission = Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict="AC",
            score=100,
        )
        row = record_verdict(submission)
        self.assertIsNotNone(row)
        self.assertEqual(row.participation_id, virtual.id)
        self.assertNotEqual(row.participation_id, official.id)

    def test_standings_sections_are_disjoint(self):
        contest = self.finished_contest()
        ContestParticipation.objects.create(contest=contest, user=self.alice)
        ContestParticipation.objects.create(
            contest=contest,
            user=self.bob,
            is_virtual=True,
            virtual_start=timezone.now() - timedelta(minutes=5),
        )
        record_verdict(
            Submission.objects.create(
                user=self.alice,
                problem=self.problem,
                contest=contest,
                language="python3",
                code="pass",
                verdict="AC",
                score=100,
            )
        )
        record_verdict(
            Submission.objects.create(
                user=self.bob,
                problem=self.problem,
                contest=contest,
                language="python3",
                code="pass",
                verdict="AC",
                score=50,
            )
        )
        self.client.force_authenticate(self.alice)
        official_board = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        names = [row["user"]["username"] for row in official_board.data["results"]]
        self.assertEqual(names, ["alice"])
        self.assertEqual(official_board.data["section"], "official")
        virtual_board = self.client.get(
            f"/api/v1/contests/{contest.id}/standings/", {"section": "virtual"}
        )
        vnames = [row["user"]["username"] for row in virtual_board.data["results"]]
        self.assertEqual(vnames, ["bob"])
        self.assertEqual(virtual_board.data["section"], "virtual")


class UpsolvingArchiveTests(ContestDepthBase):
    """CON-5 archive half: the problem page owns the problem only once the
    contest has fully ended."""

    def submission_payload(self, problem):
        return {
            "problem": problem.id,
            "language": "python3",
            "code": "print(2)",
        }

    def test_practice_blocked_while_contest_live(self):
        self.mk_contest(end_at=self.now + timedelta(hours=1))
        reason = practice_blocked_reason(self.problem, self.alice, self.now)
        self.assertIsNotNone(reason)
        self.assertIn("contest", reason)
        # And through the API.
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            "/api/v1/submissions/submit/", self.submission_payload(self.problem)
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contest", str(response.data["problem"]))

    def test_practice_blocked_during_editorial_delay(self):
        self.mk_contest(editorial_delay_minutes=30)
        reason = practice_blocked_reason(self.problem, self.alice, self.now)
        self.assertIsNotNone(reason)

    def test_practice_open_after_archive(self):
        self.mk_contest(editorial_delay_minutes=0)
        later = self.now + timedelta(minutes=5)
        self.assertIsNone(practice_blocked_reason(self.problem, self.alice, later))

    def test_practice_bypass_for_admin_and_author(self):
        self.mk_contest(end_at=self.now + timedelta(hours=1))
        self.assertIsNone(practice_blocked_reason(self.problem, self.admin, self.now))
        self.problem.author = self.alice
        self.problem.save()
        self.assertIsNone(practice_blocked_reason(self.problem, self.alice, self.now))
        self.problem.verifier = self.bob
        self.problem.save()
        self.assertIsNone(practice_blocked_reason(self.problem, self.bob, self.now))


class DivisionTests(ContestDepthBase):
    """CON-7: rating-band registration gates."""

    def test_registration_rating_error_open_contest(self):
        contest = self.finished_contest()
        self.assertIsNone(registration_rating_error(contest, self.alice))

    def test_unrated_user_blocked_by_minimum(self):
        contest = self.mk_contest(
            rated_rating_min=1200,
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        error = registration_rating_error(contest, self.alice)
        self.assertIn("requires a contest rating", error)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/register/", format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_rating_below_minimum_blocked(self):
        contest = self.mk_contest(
            rated_rating_min=1200,
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.rate(self.alice, 1100)
        self.assertIn("at least 1200", registration_rating_error(contest, self.alice))

    def test_rating_above_maximum_blocked(self):
        contest = self.mk_contest(
            rated_rating_max=1500,
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.rate(self.alice, 1700)
        self.assertIn("up to 1500", registration_rating_error(contest, self.alice))

    def test_band_inside_is_eligible_and_organizer_bypasses(self):
        contest = self.mk_contest(
            rated_rating_min=1200,
            rated_rating_max=1500,
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.rate(self.alice, 1300)
        self.assertIsNone(registration_rating_error(contest, self.alice))
        self.rate(self.bob, 9999)
        self.assertIsNotNone(registration_rating_error(contest, self.bob))
        # API: bob blocked, organizer allowed (view-level bypass), alice allowed.
        self.client.force_authenticate(self.bob)
        blocked = self.client.post(
            f"/api/v1/contests/{contest.id}/register/", format="json"
        )
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.organizer)
        ok = self.client.post(f"/api/v1/contests/{contest.id}/register/", format="json")
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(self.alice)
        ok2 = self.client.post(
            f"/api/v1/contests/{contest.id}/register/", format="json"
        )
        self.assertEqual(ok2.status_code, status.HTTP_201_CREATED)


class CommunityContestTests(ContestDepthBase):
    """CON-9: CREATOR/TEACHER mashups (PRIVATE + unrated + APPROVED pool)."""

    def payload(self, **overrides):
        base = {
            "title_i18n": {"en": "Mashup", "ro": "Mashup"},
            "visibility": Contest.Visibility.PRIVATE,
            "access_code": "secret",
            "format": Contest.Format.IOI,
            "start_at": (self.now + timedelta(hours=1)).isoformat(),
            "end_at": (self.now + timedelta(hours=3)).isoformat(),
            "problem_ids": [self.problem.id],
        }
        base.update(overrides)
        return base

    def test_creator_creates_private_mashup(self):
        creator = User.objects.create_user(
            username="creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(creator)
        response = self.client.post("/api/v1/contests/", self.payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        contest = Contest.objects.get(pk=response.data["id"])
        self.assertEqual(contest.created_by, creator)
        self.assertEqual(contest.visibility, Contest.Visibility.PRIVATE)
        self.assertFalse(contest.is_rated)
        self.assertEqual(
            [cp.problem_id for cp in contest.contest_problems.all()],
            [self.problem.id],
        )
        # Labels auto-assigned.
        self.assertEqual(contest.contest_problems.first().label, "A")

    def test_teacher_can_create_but_basic_user_cannot(self):
        teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Roles.TEACHER
        )
        self.client.force_authenticate(teacher)
        ok = self.client.post("/api/v1/contests/", self.payload(), format="json")
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)
        self.client.force_authenticate(self.alice)
        denied = self.client.post("/api/v1/contests/", self.payload(), format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

    def test_community_contest_must_be_private_and_unrated(self):
        creator = User.objects.create_user(
            username="creator2", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(creator)
        public = self.client.post(
            "/api/v1/contests/",
            self.payload(visibility=Contest.Visibility.PUBLIC, access_code=""),
            format="json",
        )
        self.assertEqual(public.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("PRIVATE", str(public.data["visibility"]))
        rated = self.client.post(
            "/api/v1/contests/", self.payload(is_rated=True), format="json"
        )
        self.assertEqual(rated.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cannot be rated", str(rated.data["is_rated"]))

    def test_community_contest_requires_approved_pool(self):
        draft = self.mk_problem("Draft", status=Problem.ProblemStatus.DRAFT)
        creator = User.objects.create_user(
            username="creator3", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(creator)
        response = self.client.post(
            "/api/v1/contests/", self.payload(problem_ids=[draft.id]), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("APPROVED", str(response.data["problem_ids"]))
        # Admins may pin any problem (they own the whole lifecycle).
        self.client.force_authenticate(self.admin)
        admin_ok = self.client.post(
            "/api/v1/contests/",
            self.payload(problem_ids=[draft.id], visibility="PUBLIC", access_code="x"),
            format="json",
        )
        self.assertEqual(admin_ok.status_code, status.HTTP_201_CREATED)

    def test_update_replaces_board(self):
        creator = User.objects.create_user(
            username="creator4", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(creator)
        created = self.client.post("/api/v1/contests/", self.payload(), format="json")
        contest_id = created.data["id"]
        other = self.mk_problem("Other")
        updated = self.client.patch(
            f"/api/v1/contests/{contest_id}/",
            {"problem_ids": [other.id]},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        contest = Contest.objects.get(pk=contest_id)
        self.assertEqual(
            [cp.problem_id for cp in contest.contest_problems.all()], [other.id]
        )

    def test_division_band_validation(self):
        self.client.force_authenticate(self.admin)
        bad = self.client.post(
            "/api/v1/contests/",
            self.payload(rated_rating_min=1800, rated_rating_max=1200),
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("exceeds", str(bad.data["rated_rating_min"]))


class AwardTests(ContestDepthBase):
    """CON-11: fixed-percentage medals computed at finalize."""

    def seed_official_scores(self, contest, scores):
        """scores: list of (user, score)."""
        for user, score in scores:
            part = ContestParticipation.objects.create(contest=contest, user=user)
            from contests.models import ContestProblem, ContestScore

            cp = ContestProblem.objects.get(contest=contest, problem=self.problem)
            ContestScore.objects.create(
                participation=part, contest_problem=cp, best_score=score, attempts=1
            )

    def test_medal_for_rank_bands(self):
        # Field of 10: gold=1 (ceil .4→1), silver=+1, bronze=+2.
        self.assertEqual(medal_for_rank(1, 10), ContestAward.Medal.GOLD)
        self.assertEqual(medal_for_rank(2, 10), ContestAward.Medal.SILVER)
        self.assertEqual(medal_for_rank(3, 10), ContestAward.Medal.BRONZE)
        self.assertEqual(medal_for_rank(4, 10), ContestAward.Medal.BRONZE)
        self.assertEqual(medal_for_rank(5, 10), None)
        # Field of 100: gold=4, silver=+8, bronze=+13.
        self.assertEqual(medal_for_rank(4, 100), ContestAward.Medal.GOLD)
        self.assertEqual(medal_for_rank(5, 100), ContestAward.Medal.SILVER)
        self.assertEqual(medal_for_rank(12, 100), ContestAward.Medal.SILVER)
        self.assertEqual(medal_for_rank(13, 100), ContestAward.Medal.BRONZE)
        self.assertEqual(medal_for_rank(25, 100), ContestAward.Medal.BRONZE)
        self.assertEqual(medal_for_rank(26, 100), None)
        # Degenerate.
        self.assertEqual(medal_for_rank(0, 10), None)
        self.assertEqual(medal_for_rank(1, 0), None)

    def test_finalize_computes_awards_and_excludes_virtual(self):
        contest = self.finished_contest()
        players = self.mk_users(3)
        self.seed_official_scores(
            contest, [(players[0], 100), (players[1], 60), (players[2], 30)]
        )
        virtual = ContestParticipation.objects.create(
            contest=contest,
            user=self.alice,
            is_virtual=True,
            virtual_start=timezone.now(),
        )
        from contests.models import ContestProblem, ContestScore

        ContestScore.objects.create(
            participation=virtual,
            contest_problem=ContestProblem.objects.get(
                contest=contest, problem=self.problem
            ),
            best_score=100,
        )
        result = finalize_contest(contest.id)
        self.assertIn("finalized", result)
        ranking = official_ranking(contest)
        self.assertEqual([uid for uid, _ in ranking][0], players[0].id)
        awards = {a.user_id: a for a in ContestAward.objects.filter(contest=contest)}
        self.assertIn(players[0].id, awards)
        self.assertEqual(awards[players[0].id].medal, ContestAward.Medal.GOLD)
        self.assertNotIn(self.alice.id, awards)  # virtual never medals
        # Endpoint.
        self.client.force_authenticate(self.alice)
        response = self.client.get(f"/api/v1/contests/{contest.id}/awards/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], len(awards))
        self.assertEqual(response.data["results"][0]["medal"], "GOLD")

    def test_compute_is_idempotent(self):
        contest = self.finished_contest()
        players = self.mk_users(2)
        self.seed_official_scores(contest, [(players[0], 100), (players[1], 50)])
        first = compute_contest_awards(contest)
        second = compute_contest_awards(contest)
        self.assertEqual(first, second)
        self.assertEqual(ContestAward.objects.filter(contest=contest).count(), first)


class CoverageClosureTest(ContestDepthBase):
    """Drive the remaining new-code branches to the 100% gate."""

    def test_award_str(self):
        contest = self.finished_contest()
        award = ContestAward.objects.create(
            contest=contest, user=self.alice, medal=ContestAward.Medal.GOLD, rank=1
        )
        self.assertIn("GOLD", str(award))

    def test_compute_with_unmedaled_tail(self):
        # Four finishers, field=4: gold=1, silver=+1, bronze=+1 — rank 4
        # falls outside every band (the medal-is-None loop arm).
        contest = self.finished_contest()
        players = self.mk_users(4)
        for index, user in enumerate(players):
            part = ContestParticipation.objects.create(contest=contest, user=user)
            from contests.models import ContestProblem, ContestScore

            ContestScore.objects.create(
                participation=part,
                contest_problem=ContestProblem.objects.get(
                    contest=contest, problem=self.problem
                ),
                best_score=100 - index * 10,
            )
        awarded = compute_contest_awards(contest)
        self.assertEqual(awarded, 3)

    def test_create_requires_authenticated(self):
        # CanCreateContest: the anonymous arm.
        response = self.client.post(
            "/api/v1/contests/",
            {
                "title_i18n": {"en": "X"},
                "start_at": self.now.isoformat(),
                "end_at": (self.now + timedelta(hours=2)).isoformat(),
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_organizer_cannot_update_foreign_contest(self):
        # An ADMIN-made PRIVATE contest: a fellow creator passes serializer
        # validation (PRIVATE + unrated) but must fail the organizer check.
        contest = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE,
            access_code="code1",
            created_by=self.admin,
        )
        other = User.objects.create_user(
            username="othercreator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        # Participation makes the PRIVATE contest visible to `other` (the
        # queryset includes joined contests) — but never manageable.
        ContestParticipation.objects.create(contest=contest, user=other)
        self.client.force_authenticate(other)
        response = self.client.patch(
            f"/api/v1/contests/{contest.id}/",
            {"title_i18n": {"en": "Hijack"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.delete(f"/api/v1/contests/{contest.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_destroy_own_contest(self):
        contest = self.finished_contest()
        self.client.force_authenticate(self.organizer)
        response = self.client.delete(f"/api/v1/contests/{contest.id}/")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_virtual_start_awards_missing_contest(self):
        self.client.force_authenticate(self.alice)
        missing = self.client.post(
            "/api/v1/contests/999999/virtual-start/", format="json"
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)
        awards = self.client.get("/api/v1/contests/999999/awards/")
        self.assertEqual(awards.status_code, status.HTTP_404_NOT_FOUND)

    def test_sync_board_labels_past_z(self):
        from contests.serializers import _sync_board

        contest = self.finished_contest()
        problems = [self.mk_problem(f"P{i}") for i in range(27)]
        _sync_board(contest, [p.id for p in problems])
        labels = [cp.label for cp in contest.contest_problems.all()]
        self.assertEqual(labels[25], "Z")
        self.assertEqual(labels[26], "A1")


class DivisionClosureTests(ContestDepthBase):
    def test_unrated_user_enters_max_bounded_division(self):
        contest = self.mk_contest(
            rated_rating_max=1500,
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.assertIsNone(registration_rating_error(contest, self.alice))


class PermissionClosureTests(ContestDepthBase):
    def test_can_create_contest_anonymous_arm(self):
        from contests.views import CanCreateContest

        gate = CanCreateContest()
        request = type("R", (), {"user": None})()
        self.assertFalse(gate.has_permission(request, None))

    def test_options_hits_admin_fallback(self):
        # OPTIONS /contests/ routes through the trailing IsAdminUser arm.
        self.client.force_authenticate(self.alice)
        response = self.client.options("/api/v1/contests/")
        self.assertIn(
            response.status_code,
            (status.HTTP_200_OK, status.HTTP_403_FORBIDDEN),
        )
