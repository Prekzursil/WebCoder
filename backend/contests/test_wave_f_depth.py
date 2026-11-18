"""Wave F — contest depth tests (backlog items 48/54/56/57/58).

Open hacks (lock-to-hack, sandboxed judging, feed visibility), long-contest
catalog axis, organizer commentary, per-user replay, and the frozen-board
drama view.
"""

from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.hacks import (
    hack_tallies,
    hack_window_open,
    hackable_targets,
    judge_hack,
    lock_problem,
)
from contests.models import (
    Contest,
    ContestCommentary,
    ContestParticipation,
    ContestProblem,
    ContestScore,
    Hack,
)
from contests.gating import check_contest_submission
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from ratings.models import RatingHistory
from submissions.models import Submission
from users.models import User


@override_settings(CONTEST_SUBMIT_COOLDOWN_SECONDS=0)
class WaveFContestBase(TestCase):
    def setUp(self):
        self.organizer = User.objects.create_user(username="organizer", password="pw")
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.now = timezone.now()
        self.problem = self.mk_problem("Sum", reference="print(int(input())+1)")
        self.client = APIClient()

    def mk_problem(self, title, reference=""):
        p = Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
            reference_solution_code=reference,
            reference_language="python3" if reference else "",
        )
        ProblemTestCase.objects.create(
            problem=p, input_data="1", expected_output_data="2", points=100, order=1
        )
        return p

    def mk_contest(self, **kwargs):
        defaults = dict(
            title_i18n={"en": "Contest", "ro": "Concurs"},
            created_by=self.organizer,
            start_at=self.now - timedelta(minutes=30),
            end_at=self.now + timedelta(minutes=90),
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

    def mk_ac(self, contest, user, at=None, code="print(int(input())+1)"):
        sub = Submission.objects.create(
            user=user,
            problem=self.problem,
            contest=contest,
            language="python3",
            code=code,
            verdict="AC",
            score=100,
        )
        if at is not None:
            Submission.objects.filter(pk=sub.pk).update(submission_time=at)
            sub.refresh_from_db()
        cp = contest.contest_problems.get(problem=self.problem)
        part = ContestParticipation.objects.get(contest=contest, user=user)
        ContestScore.objects.create(
            participation=part,
            contest_problem=cp,
            best_score=100,
            best_score_frozen=100,
            first_ac_at=sub.submission_time,
            first_ac_at_frozen=sub.submission_time,
        )
        return sub

    def mk_sub(self, contest, user, verdict, score, at, problem=None):
        """A contest submission at an explicit instant (auto_now_add is
        bypassed via update, same as the Wave B helper)."""
        sub = Submission.objects.create(
            user=user,
            problem=problem or self.problem,
            contest=contest,
            language="python3",
            code="pass",
            verdict=verdict,
            score=score,
        )
        Submission.objects.filter(pk=sub.pk).update(submission_time=at)
        sub.refresh_from_db()
        return sub


class HackWindowTests(WaveFContestBase):
    def test_window_requires_running(self):
        upcoming = self.mk_contest(
            start_at=self.now + timedelta(hours=1),
            end_at=self.now + timedelta(hours=3),
        )
        self.assertFalse(hack_window_open(upcoming))
        finished = self.mk_contest(
            start_at=self.now - timedelta(hours=3),
            end_at=self.now - timedelta(hours=1),
        )
        self.assertFalse(hack_window_open(finished))

    def test_window_opens_at_freeze_or_start(self):
        no_freeze = self.mk_contest()
        self.assertTrue(hack_window_open(no_freeze))
        frozen = self.mk_contest(freeze_at=self.now + timedelta(minutes=30))
        self.assertFalse(hack_window_open(frozen))
        frozen.freeze_at = self.now - timedelta(minutes=5)
        frozen.save()
        self.assertTrue(hack_window_open(frozen))


class LockTests(WaveFContestBase):
    def test_lock_requires_solve(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        cp = contest.contest_problems.get()
        ok, err = lock_problem(contest, part, cp)
        self.assertFalse(ok)
        self.assertIn("solving", err)

    def test_lock_rejects_foreign_board_problem(self):
        contest = self.mk_contest()
        other = self.mk_contest()
        part = self.register(contest, self.alice)
        cp_other = other.contest_problems.get()
        ok, err = lock_problem(contest, part, cp_other)
        self.assertFalse(ok)
        self.assertIn("board", err)

    def test_lock_and_gating(self):
        contest = self.mk_contest()
        part = self.register(contest, self.alice)
        self.mk_ac(contest, self.alice)
        cp = contest.contest_problems.get()
        ok, err = lock_problem(contest, part, cp)
        self.assertTrue(ok, err)
        # Idempotency guard: locking again fails cleanly.
        ok, err = lock_problem(contest, part, cp)
        self.assertFalse(ok)
        self.assertIn("already locked", err)
        # A locked problem refuses resubmission (the whole contract).
        ok, err = check_contest_submission(contest, self.alice, self.problem.id)
        self.assertFalse(ok)
        self.assertIn("locked", err)
        # Someone else's submission gate is unaffected.
        self.register(contest, self.bob)
        ok, err = check_contest_submission(contest, self.bob, self.problem.id)
        self.assertTrue(ok, err)

    def test_hackable_targets_scoped_to_locked(self):
        contest = self.mk_contest()
        alice_part = self.register(contest, self.alice)
        self.register(contest, self.bob)
        self.mk_ac(contest, self.bob)
        # Alice locked nothing yet -> no targets even though Bob solved.
        self.assertEqual(hackable_targets(contest, alice_part).count(), 0)
        self.mk_ac(contest, self.alice)
        alice_part.locked_problems.add(contest.contest_problems.get())
        targets = hackable_targets(contest, alice_part)
        self.assertEqual(targets.count(), 1)
        self.assertEqual(targets.first().user_id, self.bob.id)


def _fake_compile_ok(code, language, workspace, *a, **k):
    return True, "", f"/tmp/fake-{hash(code) % 10**8}"


class JudgeHackTests(WaveFContestBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest()
        self.alice_part = self.register(contest=self.contest, user=self.alice)
        self.register(contest=self.contest, user=self.bob)
        self.bob_sub = self.mk_ac(self.contest, self.bob, code="print(42)")
        self.mk_ac(self.contest, self.alice)
        self.alice_part.locked_problems.add(self.contest.contest_problems.get())
        self.hack = Hack.objects.create(
            contest=self.contest,
            contest_problem=self.contest.contest_problems.get(),
            hacker=self.alice,
            target=self.bob_sub,
            input_data="2",
        )

    def test_missing_reference_marks_invalid(self):
        self.problem.reference_solution_code = ""
        self.problem.reference_language = ""
        self.problem.save()
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.INVALID)
        self.assertIn("no reference solution", result.feedback)
        self.assertIsNotNone(result.judged_at)

    @mock.patch("contests.hacks.run_code_in_sandbox")
    @mock.patch("contests.hacks.compile_code_in_sandbox", side_effect=_fake_compile_ok)
    def test_reference_fails_marks_invalid(self, compile_mock, run_mock):
        run_mock.return_value = ("TLE", -1, -1, "", "")
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.INVALID)
        self.assertIn("not a valid test", result.feedback)

    @mock.patch("contests.hacks.run_code_in_sandbox")
    @mock.patch("contests.hacks.compile_code_in_sandbox", side_effect=_fake_compile_ok)
    def test_target_crash_is_successful(self, compile_mock, run_mock):
        run_mock.side_effect = [
            ("AC", 10, 1000, "3", ""),  # reference
            ("RUNTIME_ERROR", -1, -1, "", "boom"),  # target
        ]
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.SUCCESSFUL)
        self.assertIn("RUNTIME_ERROR", result.feedback)

    @mock.patch("contests.hacks.run_code_in_sandbox")
    @mock.patch("contests.hacks.compile_code_in_sandbox", side_effect=_fake_compile_ok)
    def test_output_mismatch_is_successful(self, compile_mock, run_mock):
        run_mock.side_effect = [
            ("AC", 10, 1000, "3", ""),
            ("AC", 10, 1000, "999", ""),
        ]
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.SUCCESSFUL)
        self.assertIn("Wrong answer", result.feedback)

    @mock.patch("contests.hacks.run_code_in_sandbox")
    @mock.patch("contests.hacks.compile_code_in_sandbox", side_effect=_fake_compile_ok)
    def test_surviving_target_is_unsuccessful(self, compile_mock, run_mock):
        run_mock.side_effect = [
            ("AC", 10, 1000, "3", ""),
            ("AC", 10, 1000, "3", ""),
        ]
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.UNSUCCESSFUL)

    @mock.patch("contests.hacks.compile_code_in_sandbox")
    def test_reference_compile_failure(self, compile_mock):
        compile_mock.return_value = (False, "SyntaxError", None)
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.INVALID)
        self.assertIn("Reference solution failed to compile", result.feedback)

    @mock.patch("contests.hacks.compile_code_in_sandbox")
    def test_target_compile_failure(self, compile_mock):
        compile_mock.side_effect = [
            (True, "", "/tmp/ref"),  # reference compiles
            (False, "NameError", None),  # target does not
        ]
        result = judge_hack(self.hack)
        self.assertEqual(result.verdict, Hack.Verdict.INVALID)
        self.assertIn("Target solution failed to compile", result.feedback)

    def test_already_judged_hack_is_untouched(self):
        self.hack.verdict = Hack.Verdict.SUCCESSFUL
        self.hack.save()
        with mock.patch("contests.hacks._run_pair") as run_pair:
            result = judge_hack(self.hack)
        run_pair.assert_not_called()
        self.assertEqual(result.verdict, Hack.Verdict.SUCCESSFUL)


class HackTallyTests(WaveFContestBase):
    def test_tallies_and_floor(self):
        contest = self.mk_contest()
        cp = contest.contest_problems.get()
        Hack.objects.create(
            contest=contest,
            contest_problem=cp,
            hacker=self.alice,
            target=self._mk_bare_submission(),
            input_data="a",
            verdict=Hack.Verdict.SUCCESSFUL,
        )
        Hack.objects.create(
            contest=contest,
            contest_problem=cp,
            hacker=self.alice,
            target=self._mk_bare_submission(),
            input_data="b",
            verdict=Hack.Verdict.UNSUCCESSFUL,
        )
        Hack.objects.create(
            contest=contest,
            contest_problem=cp,
            hacker=self.bob,
            target=self._mk_bare_submission(),
            input_data="c",
            verdict=Hack.Verdict.UNSUCCESSFUL,
        )
        tallies = hack_tallies(contest)
        self.assertEqual(tallies[self.alice.id]["points"], 50)
        # Bob's single miss floors at 0 (CF never shows negative points).
        self.assertEqual(tallies[self.bob.id]["points"], 0)

    def _mk_bare_submission(self):
        return Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict="AC",
        )


class HackViewTests(WaveFContestBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest()
        self.alice_part = self.register(contest=self.contest, user=self.alice)
        self.register(contest=self.contest, user=self.bob)
        self.bob_sub = self.mk_ac(self.contest, self.bob)
        self.alice_sub = self.mk_ac(self.contest, self.alice)
        self.alice_part.locked_problems.add(self.contest.contest_problems.get())
        self.url = f"/api/v1/contests/{self.contest.id}/hacks/"

    @mock.patch("contests.hacks.run_code_in_sandbox")
    @mock.patch("contests.hacks.compile_code_in_sandbox", side_effect=_fake_compile_ok)
    def test_hack_submit_and_feed(self, compile_mock, run_mock):
        run_mock.side_effect = [
            ("AC", 1, 1, "3", ""),
            ("AC", 1, 1, "4", ""),
        ]
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            self.url,
            {"target_submission_id": self.bob_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["verdict"], "SUCCESSFUL")

        # Duplicate identical hack -> 409.
        response = self.client.post(
            self.url,
            {"target_submission_id": self.bob_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_anonymous_submit_401(self):
        response = self.client.post(
            self.url,
            {"target_submission_id": self.bob_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_own_submission_rejected(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            self.url,
            {"target_submission_id": self.alice_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("own", str(response.data["detail"]))

    def test_not_locked_rejected(self):
        self.alice_part.locked_problems.clear()
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            self.url,
            {"target_submission_id": self.bob_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn("Lock", str(response.data["detail"]))

    def test_window_closed_rejected(self):
        self.contest.end_at = self.now - timedelta(minutes=1)
        self.contest.save()
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            self.url,
            {"target_submission_id": self.bob_sub.id, "input_data": "2"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_feed_visibility_and_mine_filter(self):
        Hack.objects.create(
            contest=self.contest,
            contest_problem=self.contest.contest_problems.get(),
            hacker=self.alice,
            target=self.bob_sub,
            input_data="x",
            verdict=Hack.Verdict.UNSUCCESSFUL,
        )
        Hack.objects.create(
            contest=self.contest,
            contest_problem=self.contest.contest_problems.get(),
            hacker=self.bob,
            target=self.bob_sub,
            input_data="y",
            verdict=Hack.Verdict.PENDING,
        )
        # Anonymous: only SUCCESSFUL hacks — none here.
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 0)
        self.assertIn("window_open", response.data)
        # Alice sees her own + successful.
        self.client.force_authenticate(self.alice)
        response = self.client.get(self.url)
        self.assertEqual(response.data["count"], 1)
        # Organizer sees everything.
        self.client.force_authenticate(self.organizer)
        response = self.client.get(self.url)
        self.assertEqual(response.data["count"], 2)
        # mine filter on bob: his pending hack.
        self.client.force_authenticate(self.bob)
        response = self.client.get(self.url + "?mine=1")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["verdict"], "PENDING")

    def test_feed_never_carries_target_code(self):
        Hack.objects.create(
            contest=self.contest,
            contest_problem=self.contest.contest_problems.get(),
            hacker=self.alice,
            target=self.bob_sub,
            input_data="x",
            verdict=Hack.Verdict.SUCCESSFUL,
        )
        response = self.client.get(self.url)
        self.assertNotIn("code", response.data["results"][0])

    def test_targets_listing(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/hacks/targets/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["code"], self.bob_sub.code)

    def test_targets_requires_registration(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/hacks/targets/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lock_view(self):
        cp = self.contest.contest_problems.get()
        self.client.force_authenticate(self.bob)
        response = self.client.post(f"/api/v1/contests/{self.contest.id}/lock/{cp.id}/")
        self.assertEqual(response.status_code, 200, response.data)
        # Locking again -> 400.
        response = self.client.post(f"/api/v1/contests/{self.contest.id}/lock/{cp.id}/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_lock_view_requires_registration(self):
        cp = self.contest.contest_problems.get()
        newcomer = User.objects.create_user(username="carol", password="pw")
        self.client.force_authenticate(newcomer)
        response = self.client.post(f"/api/v1/contests/{self.contest.id}/lock/{cp.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_lock_view_unknown_problem(self):
        response = self.client.post(f"/api/v1/contests/{self.contest.id}/lock/999999/")
        self.client.force_authenticate(self.alice)
        response = self.client.post(f"/api/v1/contests/{self.contest.id}/lock/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class CommentaryTests(WaveFContestBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest()
        self.url = f"/api/v1/contests/{self.contest.id}/commentary/"

    def test_post_organizer_and_list_public(self):
        self.client.force_authenticate(self.organizer)
        response = self.client.post(
            self.url,
            {"text": "Problem A hides a two-pointer trick.", "minute_offset": 5},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["author_username"], "organizer")
        # Public read works anonymously.
        self.client.force_authenticate(None)
        response = self.client.get(self.url)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["minute_offset"], 5)

    def test_post_non_organizer_403(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post(self.url, {"text": "hint plz"})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_ordering_by_minute(self):
        ContestCommentary.objects.create(
            contest=self.contest, author=self.organizer, text="later", minute_offset=30
        )
        ContestCommentary.objects.create(
            contest=self.contest, author=self.organizer, text="early", minute_offset=2
        )
        response = self.client.get(self.url)
        self.assertEqual(
            [row["text"] for row in response.data["results"]], ["early", "later"]
        )


class ReplayTests(WaveFContestBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest()
        self.register(self.contest, self.alice)
        self.register(self.contest, self.bob)

    def test_replay_events_and_rank(self):
        early = self.now - timedelta(minutes=20)
        late = self.now - timedelta(minutes=5)
        self.mk_sub(self.contest, self.alice, "WA", 10, early)
        self.mk_sub(self.contest, self.alice, "AC", 100, late)
        # Bob solves too — his rank 1, alice rank 2 (same score, later solve).
        self.mk_sub(self.contest, self.bob, "AC", 100, early)
        # Materialized standings rows (what record_verdict writes in the
        # real flow) — the replay reads the final rank from them.
        cp = self.contest.contest_problems.get()
        for user, solved_at in ((self.alice, late), (self.bob, early)):
            part = ContestParticipation.objects.get(contest=self.contest, user=user)
            ContestScore.objects.create(
                participation=part,
                contest_problem=cp,
                best_score=100,
                best_score_frozen=100,
                first_ac_at=solved_at,
                first_ac_at_frozen=solved_at,
                last_improvement=solved_at,
                last_improvement_frozen=solved_at,
            )
        RatingHistory.objects.create(
            user=self.alice,
            contest=self.contest,
            rank=2,
            rating=1520,
            rd=200.0,
            delta=20,
            contests_count=3,
        )
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/replay/alice/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(len(response.data["events"]), 2)
        first, second = response.data["events"]
        self.assertEqual(first["verdict"], "WA")
        self.assertEqual(second["total"], 100)
        self.assertAlmostEqual(first["minute_offset"], 10.0, places=0)
        self.assertEqual(response.data["final_rank"], 2)
        self.assertEqual(response.data["rating_change"]["delta"], 20)

    def test_replay_out_of_window_skipped(self):
        before = self.now - timedelta(hours=5)
        self.mk_sub(self.contest, self.alice, "AC", 100, before)
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/replay/alice/")
        self.assertEqual(response.data["events"], [])

    def test_replay_unknown_user_404(self):
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/replay/nobody/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_replay_non_participant_404(self):
        User.objects.create_user(username="carol", password="pw")
        response = self.client.get(f"/api/v1/contests/{self.contest.id}/replay/carol/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DramaTests(WaveFContestBase):
    def setUp(self):
        super().setUp()
        self.contest = self.mk_contest(
            freeze_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=60),
        )
        self.register(self.contest, self.alice)
        self.register(self.contest, self.bob)
        self.mk_ac(self.contest, self.alice, at=self.now - timedelta(minutes=20))
        self.mk_ac(self.contest, self.bob, at=self.now - timedelta(minutes=20))
        self.url = f"/api/v1/contests/{self.contest.id}/drama/"

    def test_frozen_board_with_hidden_counts(self):
        self.mk_sub(self.contest, self.bob, "WA", 0, self.now - timedelta(minutes=2))
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["is_frozen"])
        by_user = {row["user"]["username"]: row for row in response.data["results"]}
        self.assertEqual(by_user["bob"]["hidden_submissions"], 1)
        self.assertEqual(by_user["alice"]["hidden_submissions"], 0)
        self.assertGreater(response.data["seconds_until_reveal"], 0)

    def test_not_frozen_after_end(self):
        self.contest.end_at = self.now - timedelta(minutes=1)
        self.contest.save()
        response = self.client.get(self.url)
        self.assertFalse(response.data["is_frozen"])

    def test_no_freeze_is_never_dramatic(self):
        plain = self.mk_contest()
        response = self.client.get(f"/api/v1/contests/{plain.id}/drama/")
        self.assertFalse(response.data["is_frozen"])

    def test_private_contest_hidden_from_strangers(self):
        private = self.mk_contest(
            visibility=Contest.Visibility.PRIVATE, access_code="s3cret"
        )
        response = self.client.get(f"/api/v1/contests/{private.id}/drama/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class LongContestTests(WaveFContestBase):
    def test_catalog_kind_filter(self):
        long_one = self.mk_contest(
            is_long_contest=True,
            start_at=self.now,
            end_at=self.now + timedelta(days=10),
        )
        self.mk_contest()
        response = self.client.get("/api/v1/contests/?kind=long")
        self.assertEqual(response.status_code, 200)
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(long_one.id, ids)
        self.assertEqual(len(ids), 1)

    def test_serializer_exposes_flag(self):
        contest = self.mk_contest(
            is_long_contest=True,
            start_at=self.now,
            end_at=self.now + timedelta(days=10),
        )
        response = self.client.get(f"/api/v1/contests/{contest.id}/")
        self.assertTrue(response.data["is_long_contest"])


class ReferenceSolutionVisibilityTests(WaveFContestBase):
    def test_reference_hidden_from_public(self):
        response = self.client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        self.assertNotIn("reference_solution_code", response.data)

    def test_reference_visible_to_author(self):
        self.problem.author = self.alice
        self.problem.save()
        self.client.force_authenticate(self.alice)
        response = self.client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        self.assertEqual(
            response.data["reference_solution_code"], "print(int(input())+1)"
        )

    def test_mismatched_reference_pair_rejected(self):
        # A reference language with no reference code must not validate.
        bare = self.mk_problem("Bare", reference="")
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/v1/problems/problems/{bare.id}/",
            {"reference_language": "python3"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_reference_language_rejected(self):
        bare = self.mk_problem("Bare2", reference="")
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/v1/problems/problems/{bare.id}/",
            {"reference_solution_code": "x", "reference_language": "cobol"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reference_solution_can_be_cleared(self):
        # Blank reference_language short-circuits the registry check; the
        # pair rule accepts ("" + "") as "no reference solution".
        self.client.force_authenticate(self.admin)
        response = self.client.patch(
            f"/api/v1/problems/problems/{self.problem.id}/",
            {"reference_solution_code": "", "reference_language": ""},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.reference_solution_code, "")


class NotFoundGuardTests(WaveFContestBase):
    """Every new Wave F action 404s cleanly on unknown/foreign contests."""

    def test_commentary_unknown_contest(self):
        response = self.client.get("/api/v1/contests/999999/commentary/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_lock_unknown_contest(self):
        self.client.force_authenticate(self.alice)
        response = self.client.post("/api/v1/contests/999999/lock/1/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_targets_unknown_contest(self):
        self.client.force_authenticate(self.alice)
        response = self.client.get("/api/v1/contests/999999/hacks/targets/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hacks_unknown_contest(self):
        response = self.client.get("/api/v1/contests/999999/hacks/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_replay_unknown_contest(self):
        response = self.client.get("/api/v1/contests/999999/replay/alice/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_drama_unknown_contest(self):
        response = self.client.get("/api/v1/contests/999999/drama/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_hack_target_from_other_contest(self):
        contest = self.mk_contest()
        self.register(contest, self.alice)
        self.mk_ac(contest, self.alice)
        ContestParticipation.objects.get(
            contest=contest, user=self.alice
        ).locked_problems.add(contest.contest_problems.get())
        stranger_contest = self.mk_contest()
        self.register(stranger_contest, self.bob)
        stranger_sub = self.mk_ac(stranger_contest, self.bob)
        self.client.force_authenticate(self.alice)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/hacks/",
            {"target_submission_id": stranger_sub.id, "input_data": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hack_by_non_participant(self):
        contest = self.mk_contest()
        self.register(contest, self.bob)
        bob_sub = self.mk_ac(contest, self.bob)
        outsider = User.objects.create_user(username="carol", password="pw")
        self.client.force_authenticate(outsider)
        response = self.client.post(
            f"/api/v1/contests/{contest.id}/hacks/",
            {"target_submission_id": bob_sub.id, "input_data": "1"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class DunderTests(WaveFContestBase):
    def test_str_methods(self):
        contest = self.mk_contest()
        self.register(contest, self.bob)
        cp = contest.contest_problems.get()
        hack = Hack.objects.create(
            contest=contest,
            contest_problem=cp,
            hacker=self.alice,
            target=self.mk_ac(contest, self.bob),
            input_data="1",
        )
        self.assertIn("hack", str(hack))
        line = ContestCommentary.objects.create(
            contest=contest, author=self.organizer, text="hello", minute_offset=3
        )
        self.assertIn("commentary", str(line))
