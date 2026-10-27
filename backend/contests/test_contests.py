"""Contest engine tests (Wave B: CON-1/2/3/6 + round-2 PRF-1/OPR-4).

Covers: model state helpers, CRUD permissions + visibility scoping,
registration (incl. PRIVATE access codes), windowed personal timers,
submission gating + cooldown + queue lane, format ranking (IOI/ICPC/AtCoder),
freeze/unfreeze, materialized scoring, DQ, problem-edit pinning, and the
verdict-commit materialization hook.
"""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.formats import rank_atcoder, rank_contest, rank_icpc, rank_ioi
from contests.models import Contest, ContestParticipation, ContestProblem, ContestScore
from contests.scoring import record_verdict, record_verdict_task
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User

# The in-contest cooldown default (30s) would reject most of these tests'
# follow-up submissions — collapse it everywhere except the dedicated
# cooldown test.
@override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=0)
class ContestBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.organizer = User.objects.create_user(
            username="organizer", password="pw", role=User.Roles.BASIC_USER
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
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
            start_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=50),
            format=Contest.Format.IOI,
        )
        defaults.update(kwargs)
        contest = Contest.objects.create(**defaults)
        ContestProblem.objects.create(
            contest=contest, problem=self.problem, order=0, points=100
        )
        return contest

    def register(self, contest, user):
        return ContestParticipation.objects.create(contest=contest, user=user)

    def mk_contest_submission(self, contest, user, problem, score, verdict="AC", at=None):
        sub = Submission.objects.create(
            user=user,
            problem=problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict=verdict,
            score=score,
        )
        if at is not None:
            Submission.objects.filter(pk=sub.pk).update(submission_time=at)
            sub.refresh_from_db()
        return sub


class ContestModelTests(ContestBase):
    def test_state_transitions(self):
        contest = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.assertEqual(contest.state(), Contest.State.UPCOMING)
        self.assertTrue(contest.is_ongoing())
        contest.start_at = self.now - timedelta(minutes=5)
        contest.save()
        self.assertEqual(contest.state(), Contest.State.RUNNING)
        contest.end_at = self.now - timedelta(minutes=1)
        contest.save()
        self.assertEqual(contest.state(), Contest.State.FINISHED)
        self.assertFalse(contest.is_ongoing())

    def test_duration_and_upsolving_free_at(self):
        contest = self.mk_contest(
            start_at=self.now,
            end_at=self.now + timedelta(minutes=120),
            editorial_delay_minutes=30,
        )
        self.assertEqual(contest.duration, 120)
        self.assertEqual(contest.upsolving_free_at(), contest.end_at + timedelta(minutes=30))

    def test_str_and_title_fallback(self):
        contest = self.mk_contest()
        self.assertEqual(str(contest), "Contest")
        contest.title_i18n = {"ro": "Concurs"}
        contest.save()
        self.assertEqual(str(contest), "Concurs")

    def test_participation_windows(self):
        contest = self.mk_contest(
            is_window=True,
            per_user_duration_minutes=60,
            start_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(days=2),
        )
        part = self.register(contest, self.alice)
        # Not started yet: effective window = whole outer window.
        self.assertEqual(part.effective_start(), contest.start_at)
        self.assertEqual(part.effective_end(), contest.end_at)
        start = self.now + timedelta(hours=24)
        part.virtual_start = start
        part.save()
        self.assertEqual(part.effective_start(), start)
        # Personal deadline clipped by neither the window end (48h) nor the
        # 60-minute personal duration.
        self.assertEqual(part.effective_end(), start + timedelta(minutes=60))
        self.assertTrue(part.window_open(self.now + timedelta(hours=24, minutes=59)))
        self.assertFalse(part.window_open(start + timedelta(minutes=61)))

    def test_contest_problem_label_auto_assignment(self):
        contest = self.mk_contest()
        cp = ContestProblem.objects.get(contest=contest)
        self.assertEqual(cp.label, "A")
        cp2 = ContestProblem.objects.create(
            contest=contest, problem=self.mk_problem("Two"), order=1, points=100
        )
        self.assertEqual(cp2.label, "B")
        self.assertIn(f":{cp.label}", str(cp))

    def test_score_str(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        row = ContestScore.objects.create(participation=part, contest_problem=cp)
        self.assertIn("score", str(row))


class ContestAPITests(ContestBase):
    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_create_requires_admin(self):
        payload = {
            "title_i18n": {"en": "X"},
            "start_at": self.now.isoformat(),
            "end_at": (self.now + timedelta(hours=2)).isoformat(),
        }
        self.auth(self.alice)
        response = self.client.post("/api/v1/contests/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.auth(self.admin)
        response = self.client.post("/api/v1/contests/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Contest.objects.count(), 1)
        self.assertEqual(response.data["created_by"], self.admin.id)

    def test_create_validates_window(self):
        self.auth(self.admin)
        base = {
            "title_i18n": {"en": "X"},
            "start_at": self.now.isoformat(),
            "end_at": (self.now + timedelta(hours=2)).isoformat(),
        }
        bad = dict(base, end_at=(self.now - timedelta(hours=1)).isoformat())
        self.assertEqual(
            self.client.post("/api/v1/contests/", bad, format="json").status_code, 400
        )
        bad_freeze = dict(base, freeze_at=(self.now + timedelta(hours=3)).isoformat())
        response = self.client.post(
            "/api/v1/contests/", bad_freeze, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("freeze_at", response.data)
        early_freeze = dict(base, freeze_at=(self.now - timedelta(minutes=1)).isoformat())
        self.assertEqual(
            self.client.post("/api/v1/contests/", early_freeze, format="json").status_code,
            400,
        )
        bad_window = dict(base, is_window=True, per_user_duration_minutes=999)
        response = self.client.post("/api/v1/contests/", bad_window, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("per_user_duration_minutes", response.data)
        private_no_code = dict(base, visibility="PRIVATE")
        response = self.client.post("/api/v1/contests/", private_no_code, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("access_code", response.data)

    def test_list_visibility_and_state_filter(self):
        public = self.mk_contest()
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="s3cret"
        )
        # Anonymous sees only the public one.
        response = self.client.get("/api/v1/contests/")
        self.assertEqual(
            sorted(row["id"] for row in response.data["results"]), [public.id]
        )
        # Participant sees the private one too.
        self.register(private, self.alice)
        self.auth(self.alice)
        response = self.client.get("/api/v1/contests/")
        self.assertEqual(
            sorted(row["id"] for row in response.data["results"]),
            [public.id, private.id],
        )
        # Organizer sees it as well; state filter narrows to RUNNING.
        self.auth(self.organizer)
        finished = self.mk_contest(end_at=self.now - timedelta(minutes=1))
        response = self.client.get("/api/v1/contests/?state=RUNNING")
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(public.id, ids)
        self.assertIn(private.id, ids)
        self.assertNotIn(finished.id, ids)
        response = self.client.get("/api/v1/contests/?state=FINISHED")
        self.assertEqual([row["id"] for row in response.data["results"]], [finished.id])

    def test_retrieve_private_hidden_from_strangers(self):
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="s3cret"
        )
        response = self.client.get(f"/api/v1/contests/{private.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.auth(self.bob)
        self.assertEqual(
            self.client.get(f"/api/v1/contests/{private.id}/").status_code, 404
        )
        self.register(private, self.alice)
        self.auth(self.alice)
        response = self.client.get(f"/api/v1/contests/{private.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["my_participation"])
        self.assertFalse(response.data["can_manage"])
        self.auth(self.organizer)
        response = self.client.get(f"/api/v1/contests/{private.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["can_manage"])

    def test_register_flow(self):
        upcoming = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.auth(self.alice)
        response = self.client.post(f"/api/v1/contests/{upcoming.id}/register/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Duplicate registration → 409.
        response = self.client.post(f"/api/v1/contests/{upcoming.id}/register/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Registration closes for fixed-time contests once running.
        running = self.mk_contest()
        self.auth(self.bob)
        response = self.client.post(f"/api/v1/contests/{running.id}/register/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Registering a bogus id → 404.
        response = self.client.post("/api/v1/contests/424242/register/", {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_register_upcoming_and_finished(self):
        upcoming = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.auth(self.alice)
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/{upcoming.id}/register/", {}, format="json"
            ).status_code,
            201,
        )
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3), end_at=self.now - timedelta(hours=1)
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/{finished.id}/register/", {}, format="json"
            ).status_code,
            400,
        )

    def test_register_private_needs_code(self):
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE,
            access_code="s3cret",
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{private.id}/register/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.post(
            f"/api/v1/contests/{private.id}/register/",
            {"access_code": "wrong"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.post(
            f"/api/v1/contests/{private.id}/register/",
            {"access_code": "s3cret"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_windowed_register_while_running(self):
        contest = self.mk_contest(is_window=True, per_user_duration_minutes=60)
        self.auth(self.bob)
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/{contest.id}/register/", {}, format="json"
            ).status_code,
            201,
        )

    def test_start_action(self):
        contest = self.mk_contest(
            is_window=True,
            per_user_duration_minutes=60,
            start_at=self.now - timedelta(minutes=5),
            end_at=self.now + timedelta(days=1),
        )
        self.auth(self.alice)
        # Not registered.
        response = self.client.post(f"/api/v1/contests/{contest.id}/start/")
        self.assertEqual(response.status_code, 400)
        self.register(contest, self.alice)
        response = self.client.post(f"/api/v1/contests/{contest.id}/start/")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        part = ContestParticipation.objects.get(contest=contest, user=self.alice)
        self.assertIsNotNone(part.virtual_start)
        # Idempotent second start → 200 + existing clock.
        response = self.client.post(f"/api/v1/contests/{contest.id}/start/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("virtual_start", response.data)
        # Non-windowed contest → 400.
        fixed = self.mk_contest()
        self.register(fixed, self.bob)
        self.auth(self.bob)
        response = self.client.post(f"/api/v1/contests/{fixed.id}/start/")
        self.assertEqual(response.status_code, 400)
        # Outside the outer window → 400.
        closed = self.mk_contest(
            is_window=True,
            start_at=self.now - timedelta(hours=10),
            end_at=self.now - timedelta(hours=1),
        )
        self.register(closed, self.alice)
        self.auth(self.alice)
        response = self.client.post(f"/api/v1/contests/{closed.id}/start/")
        self.assertEqual(response.status_code, 400)

    def test_problems_sealed_until_start(self):
        contest = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.register(contest, self.alice)
        self.auth(self.alice)
        response = self.client.get(f"/api/v1/contests/{contest.id}/problems/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Organizer sees the board pre-start.
        self.auth(self.organizer)
        response = self.client.get(f"/api/v1/contests/{contest.id}/problems/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data[0]["label"], "A")
        self.assertEqual(response.data[0]["problem"], self.problem.id)
        # Running + anonymous public contest: visible.
        contest.start_at = self.now - timedelta(minutes=1)
        contest.save()
        self.client.force_authenticate(user=None)
        response = self.client.get(f"/api/v1/contests/{contest.id}/problems/")
        self.assertEqual(response.status_code, 200)
        # Private board stays participant-only.
        contest.visibility = Contest.Visibility.PRIVATE
        contest.access_code = "x"
        contest.save()
        response = self.client.get(f"/api/v1/contests/{contest.id}/problems/")
        self.assertEqual(response.status_code, 404)

    def test_unfreeze_requires_organizer(self):
        contest = self.mk_contest(
            freeze_at=self.now + timedelta(minutes=10)
        )
        self.auth(self.alice)
        self.assertEqual(
            self.client.post(f"/api/v1/contests/{contest.id}/unfreeze/").status_code, 403
        )
        self.auth(self.organizer)
        response = self.client.post(f"/api/v1/contests/{contest.id}/unfreeze/")
        self.assertEqual(response.status_code, 200)
        contest.refresh_from_db()
        self.assertIsNone(contest.freeze_at)

    def test_disqualify(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        self.auth(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/disqualify/",
            {"user": self.alice.id},
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.auth(self.organizer)
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/{contest.id}/disqualify/", {}, format="json"
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/contests/{contest.id}/disqualify/",
                {"user": 424242},
                format="json",
            ).status_code,
            404,
        )
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/disqualify/",
            {"user": self.alice.id, "reason": "plagiarism suspected"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        part.refresh_from_db()
        self.assertTrue(part.is_disqualified)
        self.assertEqual(part.disqualification_reason, "plagiarism suspected")


class SubmissionGateTests(ContestBase):
    def submit(self, contest=None, problem=None, user=None, expect=None):
        self.client.force_authenticate(user=user or self.alice)
        payload = {
            "problem": (problem or self.problem).id,
            "language": "python3",
            "code": "print(2)",
        }
        if contest is not None:
            payload["contest"] = contest.id
        with mock.patch("submissions.views.judge_task") as judge_mock:
            response = self.client.post(
                "/api/v1/submissions/submit/", payload, format="json"
            )
        if expect is not None:
            self.assertEqual(response.status_code, expect, response.data)
        return response, judge_mock

    def test_contest_submission_requires_registration(self):
        contest = self.mk_contest()
        self.submit(contest=contest, expect=400)

    def test_contest_submission_rejects_foreign_problem(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        other = self.mk_problem("Other")
        self.submit(contest=contest, problem=other, expect=400)

    def test_contest_submission_before_start(self):
        contest = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.register(contest, self.alice)
        self.submit(contest=contest, expect=400)

    def test_contest_submission_after_end(self):
        contest = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(minutes=1),
        )
        self.register(contest, self.alice)
        self.submit(contest=contest, expect=400)

    def test_windowed_requires_personal_start(self):
        contest = self.mk_contest(
            is_window=True, per_user_duration_minutes=60
        )
        self.register(contest, self.alice)
        self.submit(contest=contest, expect=400)
        part = ContestParticipation.objects.get(contest=contest, user=self.alice)
        part.virtual_start = self.now - timedelta(minutes=5)
        part.save()
        self.submit(contest=contest, expect=201)

    def test_windowed_rejects_expired_personal_clock(self):
        contest = self.mk_contest(is_window=True, per_user_duration_minutes=30)
        part = self.register(contest, self.alice)
        part.virtual_start = self.now - timedelta(minutes=31)
        part.save()
        self.submit(contest=contest, expect=400)

    def test_disqualified_participation_rejected(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        part.is_disqualified = True
        part.save()
        self.submit(contest=contest, expect=400)

    def test_valid_submission_dispatches_contest_lane(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        _, judge_mock = self.submit(contest=contest, expect=201)
        self.assertTrue(
            judge_mock.apply_async.called
            and judge_mock.apply_async.call_args.kwargs.get("queue") == "judge-contest"
        )
        submission = Submission.objects.get(contest=contest)
        self.assertEqual(submission.user, self.alice)

    def test_practice_submission_uses_default_lane(self):
        _, judge_mock = self.submit(contest=None, expect=201)
        self.assertTrue(judge_mock.delay.called)
        self.assertFalse(judge_mock.apply_async.called)

    @override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=60)
    def test_in_contest_cooldown(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        self.submit(contest=contest, expect=201)
        # Second submission within 60s → rejected by the cooldown.
        self.submit(contest=contest, expect=400)

    def test_submissions_list_contest_filter_and_organizer_read(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        self.mk_contest_submission(contest, self.alice, self.problem, 100)
        self.client.force_authenticate(user=self.organizer)
        response = self.client.get(
            f"/api/v1/submissions/submissions/?contestId={contest.id}"
        )
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data["results"]), 1)
        submission = Submission.objects.get(contest=contest)
        response = self.client.get(f"/api/v1/submissions/submissions/{submission.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["contest"], contest.id)
        # A stranger cannot read it.
        self.client.force_authenticate(user=self.bob)
        self.assertEqual(
            self.client.get(
                f"/api/v1/submissions/submissions/{submission.id}/"
            ).status_code,
            404,
        )
        # The owner can.
        self.client.force_authenticate(user=self.alice)
        self.assertEqual(
            self.client.get(
                f"/api/v1/submissions/submissions/{submission.id}/"
            ).status_code,
            200,
        )


class ScoringMaterializationTests(ContestBase):
    def test_record_verdict_folds_best_score_and_attempts(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        t0 = self.now - timedelta(minutes=5)
        self.mk_contest_submission(contest, self.alice, self.problem, 30, "WA", at=t0)
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row = ContestScore.objects.get(participation=part, contest_problem=cp)
        self.assertEqual(row.best_score, 30)
        self.assertEqual(row.attempts, 1)
        self.assertEqual(row.wrong_before_ac, 1)
        self.assertIsNone(row.first_ac_at)
        self.mk_contest_submission(
            contest, self.alice, self.problem, 100, "AC", at=t0 + timedelta(minutes=1)
        )
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row.refresh_from_db()
        self.assertEqual(row.best_score, 100)
        self.assertEqual(row.attempts, 2)
        self.assertEqual(row.wrong_before_ac, 1)  # frozen at first full solve
        self.assertEqual(row.first_ac_at, t0 + timedelta(minutes=1))
        # A later lower score never lowers the best.
        self.mk_contest_submission(
            contest, self.alice, self.problem, 10, "WA", at=t0 + timedelta(minutes=2)
        )
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row.refresh_from_db()
        self.assertEqual(row.best_score, 100)
        self.assertEqual(row.attempts, 3)
        self.assertEqual(row.wrong_before_ac, 1)

    def test_record_verdict_noops(self):
        # Practice submission (no contest).
        sub = Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict="AC",
            score=10,
        )
        self.assertIsNone(record_verdict(sub))
        # Contest submission on a non-member problem.
        contest = self.mk_contest()
        foreign = self.mk_problem("Foreign")
        self.register(contest, self.alice)
        sub = Submission.objects.create(
            user=self.alice,
            problem=foreign,
            contest=contest,
            language="python3",
            code="pass",
            verdict="AC",
            score=10,
        )
        self.assertIsNone(record_verdict(sub))
        # Non-participant.
        sub2 = Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict="AC",
            score=10,
        )
        self.assertIsNone(record_verdict(sub2))
        # Submission before the participation's effective start.
        part = ContestParticipation.objects.get(contest=contest, user=self.alice)
        part.virtual_start = self.now + timedelta(hours=1)
        part.save()
        sub3 = Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict="AC",
            score=10,
        )
        Submission.objects.filter(pk=sub3.pk).update(
            submission_time=self.now - timedelta(minutes=5)
        )
        sub3.refresh_from_db()
        self.assertIsNone(record_verdict(sub3))
        # Task wrapper for a missing submission.
        result = record_verdict_task(999999)
        self.assertIn("not contest-bound", result)

    def test_record_verdict_task_runs_and_skips(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        sub = self.mk_contest_submission(contest, self.alice, self.problem, 100)
        result = record_verdict_task(sub.id)
        self.assertIn("updated", result)
        practice = Submission.objects.create(
            user=self.alice, problem=self.problem, language="python3", code="pass"
        )
        result = record_verdict_task(practice.id)
        self.assertIn("not contest-bound", result)

    def test_ce_does_not_count_as_penalty_wrong(self):
        contest = self.mk_contest(format=Contest.Format.ICPC)
        part = self.register(contest, self.alice)
        t0 = self.now - timedelta(minutes=5)
        self.mk_contest_submission(contest, self.alice, self.problem, 0, "CE", at=t0)
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row = ContestScore.objects.get(participation=part)
        self.assertEqual(row.attempts, 1)
        self.assertEqual(row.wrong_before_ac, 0)

    def test_judge_task_hook_fires_on_contest_verdict(self):
        """The terminal-verdict save schedules the materialization task."""
        from submissions.tasks import judge_submission_task

        contest = self.mk_contest()
        self.register(contest, self.alice)
        submission = Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            contest=contest,
            language="python3",
            code="print(2)",
        )
        with mock.patch(
            "submissions.tasks.record_verdict_task"
        ) as score_mock, mock.patch(
            "submissions.tasks.update_user_entry_task"
        ), mock.patch(
            "submissions.tasks.compile_code_in_sandbox"
        ) as compile_mock, mock.patch(
            "submissions.tasks.run_code_in_sandbox"
        ) as run_mock, mock.patch(
            "submissions.tasks.compare_outputs_detailed"
        ) as cmp_mock:
            compile_mock.return_value = (True, "", "/tmp/x")
            run_mock.return_value = ("AC", 10, 1000, "2", "")
            cmp_mock.return_value = (True, "")
            with self.captureOnCommitCallbacks(execute=True):
                judge_submission_task(submission.id)
        score_mock.delay.assert_called_once_with(submission.id)


class FormatRankingTests(ContestBase):
    def _row(self, points_max=100, best=100, attempts=1, wrong=0, first_ac=None, last=None, label="A"):
        return {
            "label": label,
            "points_max": points_max,
            "best": best,
            "attempts": attempts,
            "wrong": wrong,
            "first_ac_at": first_ac,
            "last_improvement": last,
        }

    def test_ioi_ranking(self):
        contest = self.mk_contest(format=Contest.Format.IOI)
        t0 = self.now - timedelta(minutes=60)
        alice_rows = [
            self._row(best=100, first_ac=t0 + timedelta(minutes=10), last=t0 + timedelta(minutes=10)),
            self._row(best=50, label="B", last=t0 + timedelta(minutes=30)),
        ]
        bob_rows = [
            self._row(best=100, first_ac=t0 + timedelta(minutes=5), last=t0 + timedelta(minutes=5)),
            self._row(best=60, label="B", last=t0 + timedelta(minutes=20)),
        ]
        parts = [
            {"user_id": self.alice.id, "start": t0, "rows": alice_rows},
            {"user_id": self.bob.id, "start": t0, "rows": bob_rows},
        ]
        standings = rank_ioi(contest, parts)
        # Bob: 160 > Alice: 150.
        self.assertEqual([s.user_id for s in standings], [self.bob.id, self.alice.id])
        self.assertEqual(standings[0].total_score, 160)
        # Tie on total → earlier last improvement wins.
        tie = [
            {"user_id": self.alice.id, "start": t0, "rows": [self._row(best=100, last=t0 + timedelta(minutes=2))]},
            {"user_id": self.bob.id, "start": t0, "rows": [self._row(best=100, last=t0 + timedelta(minutes=1))]},
        ]
        self.assertEqual([s.user_id for s in rank_ioi(contest, tie)], [self.bob.id, self.alice.id])
        # rank_contest dispatches by contest.format.
        standings = rank_contest(contest, parts)
        self.assertEqual(standings[0].user_id, self.bob.id)

    def test_icpc_ranking(self):
        contest = self.mk_contest(format=Contest.Format.ICPC, penalty_time_minutes=20)
        t0 = self.now - timedelta(minutes=120)
        alice_rows = [self._row(best=100, wrong=1, first_ac=t0 + timedelta(minutes=30))]
        bob_rows = [self._row(best=100, wrong=3, first_ac=t0 + timedelta(minutes=50))]
        parts = [
            {"user_id": self.alice.id, "start": t0, "rows": alice_rows},
            {"user_id": self.bob.id, "start": t0, "rows": bob_rows},
        ]
        standings = rank_icpc(contest, parts)
        # Same solved count; Alice 30+20=50 penalty vs Bob 50+60=110.
        self.assertEqual([s.user_id for s in standings], [self.alice.id, self.bob.id])
        self.assertAlmostEqual(standings[0].penalty_minutes, 50)
        self.assertAlmostEqual(standings[1].penalty_minutes, 110)
        # Two problems solved beats one.
        carol = User.objects.create_user(username="carol", password="pw")
        parts.append(
            {
                "user_id": carol.id,
                "start": t0,
                "rows": [
                    self._row(best=100, wrong=9, first_ac=t0 + timedelta(minutes=100)),
                    self._row(best=100, label="B", wrong=9, first_ac=t0 + timedelta(minutes=110)),
                ],
            }
        )
        standings = rank_icpc(contest, parts)
        self.assertEqual(standings[0].user_id, carol.id)
        self.assertEqual(standings[0].solved, 2)
        # Partial (not full) scores do not count as solved.
        partial = [
            {"user_id": self.alice.id, "start": t0, "rows": [self._row(best=99)]},
        ]
        standings = rank_icpc(contest, partial)
        self.assertEqual(standings[0].solved, 0)

    def test_atcoder_ranking(self):
        contest = self.mk_contest(
            format=Contest.Format.ATCODER, penalty_factor_minutes=5
        )
        t0 = self.now - timedelta(minutes=100)
        alice_rows = [self._row(best=100, wrong=0, first_ac=t0 + timedelta(minutes=10))]
        bob_rows = [self._row(best=100, wrong=2, first_ac=t0 + timedelta(minutes=10))]
        parts = [
            {"user_id": self.alice.id, "start": t0, "rows": alice_rows},
            {"user_id": self.bob.id, "start": t0, "rows": bob_rows},
        ]
        standings = rank_atcoder(contest, parts)
        # Same score; Bob's 2 wrongs add 10 penalty minutes.
        self.assertEqual([s.user_id for s in standings], [self.alice.id, self.bob.id])
        self.assertAlmostEqual(standings[1].penalty_minutes - standings[0].penalty_minutes, 10)
        # Higher score wins regardless of penalty.
        alice_rows[0]["best"] = 200
        standings = rank_atcoder(contest, parts)
        self.assertEqual(standings[0].user_id, self.alice.id)
        # No solves → penalty None-able inf (JSON renders null).
        empty = [{"user_id": self.alice.id, "start": t0, "rows": [self._row(best=0)]}]
        standings = rank_atcoder(contest, empty)
        self.assertEqual(standings[0].penalty_minutes, float("inf"))

    def test_unknown_format_falls_back_to_ioi(self):
        contest = self.mk_contest(format=Contest.Format.IOI)
        contest.format = "BOGUS"
        t0 = self.now
        parts = [{"user_id": self.alice.id, "start": t0, "rows": [self._row(best=5)]}]
        standings = rank_contest(contest, parts)
        self.assertEqual(standings[0].total_score, 5)


class StandingsEndpointTests(ContestBase):
    def seed_scores(self, contest):
        t0 = self.now - timedelta(minutes=30)
        for user, score in ((self.alice, 100), (self.bob, 40)):
            part = self.register(contest, user)
            part.virtual_start = t0
            part.save()
            cp = ContestProblem.objects.get(contest=contest)
            ContestScore.objects.create(
                participation=part,
                contest_problem=cp,
                best_score=score,
                best_score_frozen=score,
                attempts=1,
                attempts_frozen=1,
                first_ac_at=t0 + timedelta(minutes=5) if score == 100 else None,
                first_ac_at_frozen=t0 + timedelta(minutes=5) if score == 100 else None,
                last_improvement=t0 + timedelta(minutes=5),
                last_improvement_frozen=t0 + timedelta(minutes=5),
            )

    def test_standings_ranked_and_paginated(self):
        contest = self.mk_contest(format=Contest.Format.IOI)
        self.seed_scores(contest)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["format"], "IOI")
        self.assertFalse(response.data["frozen"])
        rows = response.data["results"]
        self.assertEqual(rows[0]["user"]["username"], "alice")
        self.assertEqual(rows[0]["score"], 100)
        self.assertEqual(rows[0]["rank"], 1)
        # Every board problem renders a column.
        self.assertEqual(len(rows[0]["problems"]), 1)
        self.assertEqual(rows[0]["problems"][0]["label"], "A")

    def test_freeze_filters_public_view_only(self):
        contest = self.mk_contest(freeze_at=self.now - timedelta(minutes=1))
        self.seed_scores(contest)
        # Post-freeze improvement for alice (100 → live only).
        part = ContestParticipation.objects.get(contest=contest, user=self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        ContestScore.objects.filter(participation=part).update(best_score=100)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["frozen"])
        # Anonymous: frozen columns (both 100+40 frozen as seeded).
        scores = {row["user"]["username"]: row["score"] for row in response.data["results"]}
        self.assertEqual(scores, {"alice": 100, "bob": 40})
        # Organizer: live board (alice still 100 here — live best matches).
        self.client.force_authenticate(user=self.organizer)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertFalse(response.data["frozen"])
        # Now make the live view actually differ: bob improves post-freeze.
        bob_part = ContestParticipation.objects.get(contest=contest, user=self.bob)
        ContestScore.objects.filter(participation=bob_part).update(best_score=90)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        bob_live = next(
            row for row in response.data["results"] if row["user"]["username"] == "bob"
        )
        self.assertEqual(bob_live["score"], 90)
        self.client.force_authenticate(user=None)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        bob_frozen = next(
            row for row in response.data["results"] if row["user"]["username"] == "bob"
        )
        self.assertEqual(bob_frozen["score"], 40)
        # Unfreeze → public sees live.
        self.client.force_authenticate(user=self.organizer)
        self.client.post(f"/api/v1/contests/{contest.id}/unfreeze/")
        self.client.force_authenticate(user=None)
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        bob_after = next(
            row for row in response.data["results"] if row["user"]["username"] == "bob"
        )
        self.assertEqual(bob_after["score"], 90)

    def test_disqualified_excluded_from_standings(self):
        contest = self.mk_contest()
        self.seed_scores(contest)
        part = ContestParticipation.objects.get(contest=contest, user=self.bob)
        part.is_disqualified = True
        part.save()
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        usernames = [row["user"]["username"] for row in response.data["results"]]
        self.assertNotIn("bob", usernames)
        self.assertIn("alice", usernames)

    def test_private_standings_hidden(self):
        contest = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="x"
        )
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 404)

    def test_icpc_standings_penalty_columns(self):
        contest = self.mk_contest(
            format=Contest.Format.ICPC, penalty_time_minutes=20
        )
        t0 = self.now - timedelta(minutes=60)
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        ContestScore.objects.create(
            participation=part,
            contest_problem=cp,
            best_score=100,
            best_score_frozen=100,
            attempts=3,
            attempts_frozen=3,
            wrong_before_ac=2,
            wrong_before_ac_frozen=2,
            first_ac_at=t0 + timedelta(minutes=30),
            first_ac_at_frozen=t0 + timedelta(minutes=30),
        )
        part.virtual_start = t0
        part.save()
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 200)
        row = response.data["results"][0]
        self.assertEqual(row["solved"], 1)
        # 30 minutes to solve + 2 wrongs * 20 = 70.
        self.assertAlmostEqual(row["penalty_minutes"], 70)


class ProblemPinTests(ContestBase):
    def test_problem_edit_pinned_during_contest(self):
        contest = self.mk_contest()
        self.problem.author = self.alice
        self.problem.status = Problem.ProblemStatus.DRAFT
        self.problem.save()
        self.client.force_authenticate(user=self.alice)
        response = self.client.patch(
            f"/api/v1/problems/problems/{self.problem.id}/",
            {"title_i18n": {"en": "New"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("contest", str(response.data).lower())
        # Admin bypasses the pin.
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/problems/problems/{self.problem.id}/",
            {"title_i18n": {"en": "New"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        # After the contest ends the author can edit again.
        contest.end_at = self.now - timedelta(minutes=1)
        contest.save()
        self.client.force_authenticate(user=self.alice)
        response = self.client.patch(
            f"/api/v1/problems/problems/{self.problem.id}/",
            {"title_i18n": {"en": "Newer"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_testcase_create_pinned(self):
        contest = self.mk_contest()
        self.problem.author = self.alice
        self.problem.status = Problem.ProblemStatus.DRAFT
        self.problem.save()
        # Verifiers pass ProblemObjectPermissions but are still contest-pinned.
        verifier = User.objects.create_user(
            username="verifier", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.client.force_authenticate(user=verifier)
        response = self.client.post(
            "/api/v1/problems/testcases/",
            {
                "problem": self.problem.id,
                "input_data": "i",
                "expected_output_data": "o",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class CoverageEdgeTests(ContestBase):
    """Targeted branches: fallbacks, staff listing, UPCOMING filter, frozen
    mirror, anonymous detail, standings padding, __str__ helpers."""

    def test_title_str_non_dict_fallback(self):
        contest = self.mk_contest()
        contest.title_i18n = "plain title"
        contest.save()
        self.assertEqual(str(contest), "Contest 1")

    def test_participation_str(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        self.assertEqual(str(part), f"{part.user_id}@{part.contest_id}")

    def test_admin_lists_private_contests(self):
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="x"
        )
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/contests/")
        self.assertIn(private.id, [row["id"] for row in response.data["results"]])
        # Superuser too.
        superuser = User.objects.create_user(
            username="root", password="pw", is_superuser=True
        )
        self.client.force_authenticate(user=superuser)
        response = self.client.get("/api/v1/contests/")
        self.assertIn(private.id, [row["id"] for row in response.data["results"]])

    def test_state_filter_upcoming(self):
        self.mk_contest()  # running
        upcoming = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=2),
        )
        response = self.client.get("/api/v1/contests/?state=UPCOMING")
        self.assertEqual(
            [row["id"] for row in response.data["results"]], [upcoming.id]
        )
        response = self.client.get("/api/v1/contests/?state=ignored")
        self.assertEqual(len(response.data["results"]), 2)

    def test_anonymous_detail_and_my_participation_none(self):
        contest = self.mk_contest()
        response = self.client.get(f"/api/v1/contests/{contest.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["my_participation"])
        self.assertFalse(response.data["can_manage"])
        # Private + anonymous → 404 (serializer never runs).
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="x"
        )
        self.assertEqual(
            self.client.get(f"/api/v1/contests/{private.id}/").status_code, 404
        )
        # Bogus id → 404.
        self.assertEqual(
            self.client.get("/api/v1/contests/424242/").status_code, 404
        )

    def test_frozen_mirror_updates_freeze_columns(self):
        contest = self.mk_contest(
            freeze_at=self.now + timedelta(minutes=25)
        )
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        t0 = self.now - timedelta(minutes=5)  # before the freeze boundary
        self.mk_contest_submission(contest, self.alice, self.problem, 60, "WA", at=t0)
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row = ContestScore.objects.get(participation=part, contest_problem=cp)
        self.assertEqual(row.best_score, 60)
        self.assertEqual(row.best_score_frozen, 60)
        self.assertEqual(row.attempts_frozen, 1)
        self.assertEqual(row.wrong_before_ac_frozen, 1)
        # Full solve before the freeze mirrors onto first_ac_at_frozen.
        self.mk_contest_submission(
            contest, self.alice, self.problem, 100, "AC", at=t0 + timedelta(minutes=1)
        )
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row.refresh_from_db()
        self.assertEqual(row.first_ac_at_frozen, t0 + timedelta(minutes=1))
        self.assertEqual(row.best_score_frozen, 100)
        # Post-freeze submission updates only the live aggregates.
        late = self.now + timedelta(minutes=30)
        ContestProblem.objects.filter(pk=cp.pk).update(points=100)
        sub = self.mk_contest_submission(
            contest, self.alice, self.problem, 0, "WA", at=late
        )
        record_verdict(sub)
        row.refresh_from_db()
        self.assertEqual(row.attempts, 3)
        self.assertEqual(row.attempts_frozen, 2)
        self.assertEqual(row.wrong_before_ac, 1)
        self.assertEqual(row.wrong_before_ac_frozen, 1)

    def test_standings_pads_missing_problem_columns(self):
        contest = self.mk_contest()
        ContestProblem.objects.create(
            contest=contest, problem=self.mk_problem("Second"), order=1, points=100
        )
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest, order=0)
        ContestScore.objects.create(
            participation=part, contest_problem=cp, best_score=100
        )
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 200)
        labels = [p["label"] for p in response.data["results"][0]["problems"]]
        self.assertEqual(labels, ["A", "B"])

    def test_serializer_detail_fields_via_organizer(self):
        contest = self.mk_contest(
            description_i18n={"en": "d", "ro": "d"}, pretest_mode=True
        )
        self.register(contest, self.alice)
        self.client.force_authenticate(user=self.organizer)
        response = self.client.get(f"/api/v1/contests/{contest.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["created_by_username"], "organizer")
        self.assertTrue(response.data["pretest_mode"])
        self.assertTrue(response.data["my_participation"] is None)


class BranchCoverageTests(ContestBase):
    def test_fixed_contest_effective_end_is_end_at(self):
        contest = self.mk_contest()  # not windowed
        part = self.register(contest, self.alice)
        self.assertEqual(part.effective_end(), contest.end_at)
        self.assertEqual(part.effective_start(), contest.start_at)

    def test_frozen_lower_score_no_regression(self):
        contest = self.mk_contest(freeze_at=self.now + timedelta(minutes=25))
        part = self.register(contest, self.alice)
        cp = ContestProblem.objects.get(contest=contest)
        t0 = self.now - timedelta(minutes=5)
        self.mk_contest_submission(contest, self.alice, self.problem, 80, "WA", at=t0)
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        self.mk_contest_submission(
            contest, self.alice, self.problem, 10, "WA", at=t0 + timedelta(seconds=30)
        )
        record_verdict(Submission.objects.filter(contest=contest).latest("id"))
        row = ContestScore.objects.get(participation=part, contest_problem=cp)
        self.assertEqual(row.best_score_frozen, 80)
        self.assertEqual(row.attempts_frozen, 2)

    def test_admin_patch_contest(self):
        contest = self.mk_contest()
        self.client.force_authenticate(user=self.admin)
        response = self.client.patch(
            f"/api/v1/contests/{contest.id}/",
            {"title_i18n": {"en": "Renamed"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        contest.refresh_from_db()
        self.assertEqual(contest.title_i18n, {"en": "Renamed"})
        # Full validation path via PUT with freeze inside the window.
        payload = {
            "title_i18n": {"en": "Renamed"},
            "start_at": (self.now - timedelta(minutes=10)).isoformat(),
            "end_at": (self.now + timedelta(minutes=50)).isoformat(),
            "freeze_at": (self.now + timedelta(minutes=10)).isoformat(),
        }
        response = self.client.put(
            f"/api/v1/contests/{contest.id}/", payload, format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)

    def test_start_race_already_set_inside_lock(self):
        contest = self.mk_contest(is_window=True, per_user_duration_minutes=60)
        part = self.register(contest, self.alice)
        part.virtual_start = self.now - timedelta(minutes=1)
        part.save()
        self.client.force_authenticate(user=self.alice)
        response = self.client.post(f"/api/v1/contests/{contest.id}/start/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["virtual_start"], part.virtual_start)

    def test_standings_second_score_row_same_participation(self):
        contest = self.mk_contest()
        ContestProblem.objects.create(
            contest=contest, problem=self.mk_problem("Second"), order=1, points=100
        )
        part = self.register(contest, self.alice)
        for cp in contest.contest_problems.all():
            ContestScore.objects.create(
                participation=part, contest_problem=cp, best_score=50
            )
        response = self.client.get(f"/api/v1/contests/{contest.id}/standings/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["results"][0]["problems"]), 2)
