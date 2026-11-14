"""Wave D atestats (certifications/attestations) — the honest variant.

Unit + API + integration coverage: issuance idempotency, the frozen
achievement snapshot, public verification (H-120), revocation integrity
(rollback hooks), the backfill command, and the event hooks in the
ratings commit / leaderboard recompute.
"""

from datetime import timedelta
from io import StringIO
from unittest import mock

from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from certificates.models import Certificate
from certificates.services import (
    _issue,
    audit_rating_milestones,
    backfill,
    issue_contest_certificates,
    issue_rating_milestones,
    recompute_solve_milestones,
    revoke_contest_certificates,
)
from contests.models import Contest, ContestParticipation, ContestProblem, ContestScore
from leaderboard.aggregation import recompute_all_leaderboards, update_user_entry
from notifications.models import Notification
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from ratings.models import UserRating
from ratings.services import (
    compute_contest_ratings as compute_service,
    rollback_contest_ratings,
)
from users.models import User

NOW = timezone.now()


def _mk_problem(title: str) -> Problem:
    return Problem.objects.create(
        title_i18n={"en": title},
        statement_i18n={"en": "s"},
        status=Problem.ProblemStatus.APPROVED,
    )


class IssueServiceTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")

    def test_issue_creates_with_serial_and_notifies(self):
        cert = _issue(
            self.alice.pk,
            Certificate.Kind.SOLVE_MILESTONE,
            threshold=50,
            details={"solved": 55},
        )
        assert cert is not None  # narrow the Optional for the type gate
        self.assertTrue(cert.serial.startswith(f"WC-{NOW.year}-"))
        self.assertIn(f"{cert.pk:06d}", cert.serial)
        self.assertTrue(
            Notification.objects.filter(data__kind="certificate_issued").exists()
        )

    def test_issue_existing_returns_none(self):
        first = _issue(self.alice.pk, Certificate.Kind.SOLVE_MILESTONE, threshold=50)
        again = _issue(
            self.alice.pk,
            Certificate.Kind.SOLVE_MILESTONE,
            threshold=50,
            details={"x": 1},
        )
        self.assertIsNotNone(first)
        self.assertIsNone(again)
        self.assertEqual(Certificate.objects.count(), 1)
        # The original snapshot is never edited by a re-issue attempt.
        self.assertNotIn("x", Certificate.objects.get().details)

    def test_issue_integrity_race_returns_none(self):
        with mock.patch.object(
            Certificate.objects,
            "get_or_create",
            side_effect=IntegrityError("duplicate key"),
        ):
            self.assertIsNone(
                _issue(self.alice.pk, Certificate.Kind.SOLVE_MILESTONE, threshold=10)
            )

    def test_issue_notify_off_creates_no_notification(self):
        _issue(
            self.alice.pk,
            Certificate.Kind.SOLVE_MILESTONE,
            threshold=10,
            notify_user=False,
        )
        self.assertFalse(Notification.objects.exists())

    def test_model_str_status_and_revoked_flag(self):
        cert = _issue(self.alice.pk, Certificate.Kind.SOLVE_MILESTONE, threshold=10)
        assert cert is not None  # narrow the Optional for the type gate
        self.assertEqual(cert.status, "VALID")
        self.assertFalse(cert.is_revoked)
        self.assertIn(cert.serial, str(cert))
        self.assertIn("milestone", str(cert).lower())


class ContestCertificateTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.contest = Contest.objects.create(
            title_i18n={"en": "Winter Cup", "ro": "Cupa de Iarnă"},
            created_by=self.organizer,
            start_at=NOW - timedelta(hours=3),
            end_at=NOW - timedelta(minutes=5),
            format=Contest.Format.IOI,
            is_rated=True,
        )

    def test_participation_snapshot_is_bilingual_and_frozen(self):
        issued = issue_contest_certificates(
            self.contest,
            {self.alice.pk: 1, self.bob.pk: 2},
            {self.alice.pk: 1655, self.bob.pk: 1320},
        )
        self.assertEqual(len(issued), 2)
        cert = Certificate.objects.get(user=self.alice, contest=self.contest)
        self.assertEqual(cert.kind, Certificate.Kind.CONTEST_PARTICIPATION)
        self.assertEqual(cert.details["rank"], 1)
        self.assertEqual(cert.details["rating_after"], 1655)
        self.assertEqual(cert.details["contest_title_en"], "Winter Cup")
        self.assertEqual(cert.details["contest_title_ro"], "Cupa de Iarnă")
        self.assertEqual(
            cert.details["contest_end"], self.contest.end_at.date().isoformat()
        )
        # Idempotent: a replay issues nothing new.
        again = issue_contest_certificates(
            self.contest, {self.alice.pk: 1}, {self.alice.pk: 1655}
        )
        self.assertEqual(again, [])
        self.assertEqual(Certificate.objects.filter(contest=self.contest).count(), 2)

    def test_revoke_contest_certificates_flips_only_active(self):
        issue_contest_certificates(
            self.contest,
            {self.alice.pk: 1, self.bob.pk: 2},
            {self.alice.pk: 1500, self.bob.pk: 1500},
        )
        alice_cert = Certificate.objects.get(user=self.alice, contest=self.contest)
        alice_cert.revoked_at = NOW
        alice_cert.revoked_reason = "post-contest DQ"
        alice_cert.save()

        flipped = revoke_contest_certificates(self.contest, "ratings discarded")
        self.assertEqual(flipped, 1)
        alice_cert.refresh_from_db()
        self.assertEqual(alice_cert.revoked_reason, "post-contest DQ")
        bob_cert = Certificate.objects.get(user=self.bob, contest=self.contest)
        self.assertEqual(bob_cert.status, "REVOKED")
        self.assertEqual(bob_cert.revoked_reason, "ratings discarded")


class MilestoneTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")

    def test_rating_milestones_issue_at_or_below(self):
        issued = issue_rating_milestones(self.alice.pk, 1500)
        self.assertEqual(sorted(c.threshold for c in issued), [1200, 1400])
        # Peak semantics: a later organic drop re-issues nothing and revokes nothing.
        issue_rating_milestones(self.alice.pk, 1350)
        self.assertEqual(
            Certificate.objects.filter(kind=Certificate.Kind.RATING_MILESTONE).count(),
            2,
        )

    def test_rating_milestones_none_below_floor(self):
        self.assertEqual(issue_rating_milestones(self.alice.pk, 900), [])

    def test_rating_milestones_all_thresholds(self):
        issued = issue_rating_milestones(self.alice.pk, 2100)
        self.assertEqual(len(issued), 5)
        self.assertEqual(issued[-1].threshold, 2000)

    def test_audit_revokes_unsupported_milestones(self):
        issue_rating_milestones(self.alice.pk, 1800)  # 1200/1400/1600/1800
        user2 = User.objects.create_user(username="bob", password="pw")
        issue_rating_milestones(user2.pk, 1300)  # 1200 only
        UserRating.objects.create(user=self.alice, rating=1450)
        # bob gets NO UserRating — his history vanished in the rollback.

        revoked = audit_rating_milestones()
        self.assertEqual(revoked, 3)  # alice 1600+1800, bob 1200
        self.assertEqual(
            Certificate.objects.filter(
                kind=Certificate.Kind.RATING_MILESTONE, revoked_at__isnull=True
            ).count(),
            2,  # alice 1200 + 1400 (1450 still supports both)
        )
        # A second audit is a no-op.
        self.assertEqual(audit_rating_milestones(), 0)

    def test_solve_milestones_from_leaderboard_row(self):
        from leaderboard.models import LeaderboardEntry

        LeaderboardEntry.objects.create(
            user=self.alice, solved_count=55, total_points=550
        )
        issued = recompute_solve_milestones(self.alice.pk)
        self.assertEqual(sorted(c.threshold for c in issued), [10, 50])

    def test_solve_milestones_without_row(self):
        self.assertEqual(recompute_solve_milestones(self.alice.pk), [])

    def test_solve_milestones_all_thresholds_and_rerun(self):
        from leaderboard.models import LeaderboardEntry
        from submissions.models import Submission

        problems = [
            Problem(
                title_i18n={"en": f"B{i}"},
                statement_i18n={"en": "s"},
                status=Problem.ProblemStatus.APPROVED,
            )
            for i in range(500)
        ]
        Problem.objects.bulk_create(problems)
        Submission.objects.bulk_create(
            [
                Submission(
                    user=self.alice,
                    problem=problem,
                    language="python3",
                    code="pass",
                    verdict=Submission.VerdictStatus.ACCEPTED,
                )
                for problem in problems
            ]
        )
        LeaderboardEntry.objects.create(user=self.alice, solved_count=500)

        issued = recompute_solve_milestones(self.alice.pk)
        self.assertEqual([c.threshold for c in issued], [10, 50, 100, 250, 500])
        # Re-run: existing rows return None inside the loop (idempotent).
        self.assertEqual(recompute_solve_milestones(self.alice.pk), [])


class RatingsHookTests(TestCase):
    """compute_contest_ratings issues atestats; rollback revokes them."""

    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.problem = _mk_problem("P")
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="2",
            points=100,
            order=0,
        )
        self.client = APIClient()

    def mk_rated_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Rated"},
            created_by=self.organizer,
            start_at=NOW - timedelta(hours=3),
            end_at=NOW - timedelta(minutes=5),
            format=Contest.Format.IOI,
            is_rated=True,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def seed_scores(self, contest, scores):
        for user, points in scores.items():
            part = ContestParticipation.objects.create(contest=contest, user=user)
            cp = ContestProblem.objects.get(contest=contest)
            ContestScore.objects.create(
                participation=part,
                contest_problem=cp,
                best_score=points,
                best_score_frozen=points,
            )

    def test_compute_issues_participation_and_milestones(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_service(contest)
        # Participation for both finishers.
        self.assertEqual(
            Certificate.objects.filter(
                kind=Certificate.Kind.CONTEST_PARTICIPATION, contest=contest
            ).count(),
            2,
        )
        # Both start at 1500 → both cross 1200 and 1400.
        self.assertEqual(
            Certificate.objects.filter(kind=Certificate.Kind.RATING_MILESTONE).count(),
            4,
        )
        # The certificate_issued notification rides the notify_users flag.
        self.assertTrue(
            Notification.objects.filter(data__kind="certificate_issued").exists()
        )
        # Recompute is a guarded no-op — no duplicate atestats.
        compute_service(contest)
        self.assertEqual(Certificate.objects.filter(contest=contest).count(), 2)

    def test_rollback_revokes_contest_and_unsupported_milestones(self):
        contest = self.mk_rated_contest()
        self.seed_scores(contest, {self.alice: 100, self.bob: 40})
        compute_service(contest)
        self.assertEqual(Certificate.objects.filter(revoked_at__isnull=True).count(), 6)

        rollback_contest_ratings(contest)
        # The discarded contest's participation atestats flipped to REVOKED.
        self.assertEqual(
            Certificate.objects.filter(
                contest=contest, revoked_at__isnull=False
            ).count(),
            2,
        )
        # No rated history remains → every rating milestone is revoked too.
        self.assertEqual(
            Certificate.objects.filter(
                kind=Certificate.Kind.RATING_MILESTONE, revoked_at__isnull=True
            ).count(),
            0,
        )

    def test_rollback_of_never_rated_contest_is_clean(self):
        contest = self.mk_rated_contest()
        result = rollback_contest_ratings(contest)
        self.assertIn("never rated", result)


class LeaderboardHookTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")

    def _seed_solves(self, count: int):
        from submissions.models import Submission

        for i in range(count):
            problem = _mk_problem(f"P{i}")
            Submission.objects.create(
                user=self.alice,
                problem=problem,
                language="python3",
                code="pass",
                verdict=Submission.VerdictStatus.ACCEPTED,
            )

    def test_update_user_entry_issues_at_threshold(self):
        self._seed_solves(10)
        update_user_entry(self.alice.pk)
        self.assertTrue(
            Certificate.objects.filter(
                user=self.alice,
                kind=Certificate.Kind.SOLVE_MILESTONE,
                threshold=10,
            ).exists()
        )

    def test_update_user_entry_below_threshold_issues_nothing(self):
        self._seed_solves(9)
        update_user_entry(self.alice.pk)
        self.assertFalse(Certificate.objects.exists())

    def test_full_recompute_issues_milestones(self):
        self._seed_solves(10)
        recompute_all_leaderboards()
        self.assertEqual(
            Certificate.objects.filter(
                user=self.alice, kind=Certificate.Kind.SOLVE_MILESTONE
            ).count(),
            1,
        )


class CertificateAPITests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.contest = Contest.objects.create(
            title_i18n={"en": "C"},
            created_by=self.alice,
            start_at=NOW - timedelta(hours=2),
            end_at=NOW - timedelta(minutes=5),
            format=Contest.Format.IOI,
            is_rated=True,
        )
        self.cert = issue_contest_certificates(
            self.contest, {self.alice.pk: 1}, {self.alice.pk: 1500}
        )[0]
        self.client = APIClient()

    def test_verify_public_by_uuid(self):
        response = self.client.get(f"/api/v1/certificates/verify/{self.cert.uuid}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["serial"], self.cert.serial)
        self.assertEqual(response.data["status"], "VALID")
        self.assertEqual(response.data["holder"], "alice")
        self.assertEqual(response.data["details"]["rank"], 1)
        self.assertEqual(response.data["kind"], "CONTEST_PARTICIPATION")

    def test_verify_unknown_uuid_404(self):
        import uuid as uuid_mod

        response = self.client.get(f"/api/v1/certificates/verify/{uuid_mod.uuid4()}/")
        self.assertEqual(response.status_code, 404)

    def test_mine_requires_auth(self):
        response = self.client.get("/api/v1/certificates/mine/")
        self.assertEqual(response.status_code, 401)

    def test_mine_lists_only_own(self):
        bob = User.objects.create_user(username="bob", password="pw")
        issue_contest_certificates(self.contest, {bob.pk: 2}, {bob.pk: 1400})
        self.client.force_authenticate(user=self.alice)
        response = self.client.get("/api/v1/certificates/mine/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["holder"], "alice")

    def test_public_list_filters_username_and_hides_minors(self):
        minor = User.objects.create_user(username="kid", password="pw", is_minor=True)
        issue_contest_certificates(self.contest, {minor.pk: 3}, {minor.pk: 1300})
        response = self.client.get("/api/v1/certificates/?username=kid")
        self.assertEqual(response.data["count"], 0)
        response = self.client.get("/api/v1/certificates/?username=alice")
        self.assertEqual(response.data["count"], 1)
        # No username filter: every non-minor active holder.
        response = self.client.get("/api/v1/certificates/")
        self.assertEqual(response.data["count"], 1)

    def test_public_list_hides_inactive_holders(self):
        self.alice.is_active = False
        self.alice.save()
        response = self.client.get("/api/v1/certificates/?username=alice")
        self.assertEqual(response.data["count"], 0)

    def test_revoke_admin_only_and_reason_required(self):
        url = f"/api/v1/certificates/{self.cert.pk}/revoke/"
        self.client.force_authenticate(user=self.alice)
        self.assertEqual(self.client.post(url, {"reason": "x"}).status_code, 403)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.post(url, {}).status_code, 400)
        response = self.client.post(url, {"reason": "integrity review"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "REVOKED")
        # Idempotent re-revoke keeps the first reason.
        response = self.client.post(url, {"reason": "second reason"})
        self.assertEqual(response.data["revoked_reason"], "integrity review")
        # And verification answers REVOKED honestly.
        refreshed = self.client.get(f"/api/v1/certificates/verify/{self.cert.uuid}/")
        self.assertEqual(refreshed.data["status"], "REVOKED")


class AdminActionTests(TestCase):
    def test_revoke_action(self):
        from certificates.admin import CertificateAdmin
        from django.contrib.admin.sites import AdminSite

        alice = User.objects.create_user(username="alice", password="pw")
        cert = _issue(alice.pk, Certificate.Kind.SOLVE_MILESTONE, threshold=10)
        assert cert is not None  # narrow the Optional for the type gate
        model_admin = CertificateAdmin(Certificate, AdminSite())
        request = mock.Mock()
        request.POST = {"apply": "1"}
        model_admin.revoke_action(request, Certificate.objects.filter(pk=cert.pk))
        cert.refresh_from_db()
        self.assertEqual(cert.status, "REVOKED")


class BackfillCommandTests(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.problem = _mk_problem("P")
        self.contest = Contest.objects.create(
            title_i18n={"en": "C"},
            created_by=self.organizer,
            start_at=NOW - timedelta(hours=3),
            end_at=NOW - timedelta(minutes=5),
            format=Contest.Format.IOI,
            is_rated=True,
        )
        ContestProblem.objects.create(
            contest=self.contest, problem=self.problem, order=0, points=100
        )
        for user, score in ((self.alice, 100), (self.bob, 40)):
            part = ContestParticipation.objects.create(contest=self.contest, user=user)
            ContestScore.objects.create(
                participation=part,
                contest_problem=ContestProblem.objects.get(contest=self.contest),
                best_score=score,
                best_score_frozen=score,
            )
        from leaderboard.models import LeaderboardEntry

        LeaderboardEntry.objects.create(user=self.alice, solved_count=12)

    def test_backfill_from_history_is_idempotent(self):
        compute_service(self.contest, notify_users=False)
        Certificate.objects.all().delete()

        counts = backfill()
        self.assertEqual(counts["participation"], 2)
        self.assertEqual(counts["rating_milestones"], 4)
        self.assertEqual(counts["solve_milestones"], 1)

        again = backfill()
        self.assertEqual(sum(again.values()), 0)
        self.assertEqual(Certificate.objects.count(), 7)

    def test_command_output_and_notify_flag(self):
        compute_service(self.contest, notify_users=False)
        Certificate.objects.all().delete()
        Notification.objects.all().delete()

        out = StringIO()
        call_command("issue_certificates", stdout=out)
        text = out.getvalue()
        self.assertIn("participation: 2", text)
        self.assertIn("rating_milestones: 4", text)
        # Default: replaying history never notifies.
        self.assertFalse(
            Notification.objects.filter(data__kind="certificate_issued").exists()
        )

        Certificate.objects.all().delete()
        call_command("issue_certificates", "--notify", stdout=StringIO())
        self.assertTrue(
            Notification.objects.filter(data__kind="certificate_issued").exists()
        )
