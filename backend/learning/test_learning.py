"""Wave E items 29/30/33/34/35 — the learning engine.

- spaced-repeat queue: expanding intervals since the last miss, solve
  retires the card, due-first ordering;
- practice plan: review → weakest tag → fresh problems, rest day 7;
- mistake profile: the classic signatures over the verdict history;
- skill graph: prerequisite edges + locked/unlocked per the caller's
  solves; theory deck: bilingual, tag-filterable.
"""

import io
from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone
from problems.models import Problem, Tag
from rest_framework.test import APIClient
from submissions.models import Submission, SubmissionTestResult
from users.models import User

from .engine import mistake_profile, practice_plan, review_queue
from .models import SkillEdge, TheoryCard

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER
RE = Submission.VerdictStatus.RUNTIME_ERROR
TLE = Submission.VerdictStatus.TIME_LIMIT_EXCEEDED


def _seed():
    call_command("seed_problems", stdout=io.StringIO())


class ReviewQueueTest(TestCase):
    """Item 29: the spaced-repeat queue from submission history."""

    def setUp(self):
        _seed()
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.filter(
            title_i18n__en="Sum of Two Numbers"
        ).first()

    def _miss(self, days_ago: float, verdict=WA):
        sub = Submission.objects.create(
            user=self.user, problem=self.problem, language="python3", code="x"
        )
        Submission.objects.filter(pk=sub.pk).update(
            submission_time=timezone.now() - timedelta(days=days_ago),
            verdict=verdict,
        )
        return sub

    def test_card_appears_and_expands(self):
        self._miss(days_ago=5)  # interval stage 1 = 1 day -> due
        cards = review_queue(self.user)
        self.assertEqual(len(cards), 1)
        card = cards[0]
        self.assertEqual(card["problem_id"], self.problem.id)
        self.assertTrue(card["due"])
        self.assertEqual(card["interval_days"], 1)
        self.assertEqual(card["stage"], 1)

        self._miss(days_ago=1)  # second miss -> stage 2 (3 days), not due
        cards = review_queue(self.user)
        self.assertEqual(cards[0]["stage"], 2)
        self.assertEqual(cards[0]["interval_days"], 3)
        self.assertFalse(cards[0]["due"])

    def test_solve_retires_the_card(self):
        self._miss(days_ago=5)
        Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="ok",
            verdict=AC,
        )
        self.assertEqual(review_queue(self.user), [])

    def test_ce_only_history_is_not_a_card(self):
        Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.COMPILE_ERROR,
        )
        self.assertEqual(review_queue(self.user), [])

    def test_endpoint_scoped_and_shaped(self):
        self._miss(days_ago=3)
        client = APIClient()
        self.assertEqual(client.get("/api/v1/learning/review-queue/").status_code, 401)
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/learning/review-queue/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertGreaterEqual(response.data["due"], 1)
        self.assertIn("title_i18n", response.data["results"][0])


class PracticePlanTest(TestCase):
    """Item 34: review-first, weakest-tag, then fresh; rest day."""

    def setUp(self):
        _seed()
        self.user = User.objects.create_user(username="u", password="p")

    def test_empty_plan_is_all_fresh_until_day_seven(self):
        plan = practice_plan(self.user, days=7)
        self.assertEqual(plan["due_reviews"], 0)
        kinds = [day["kind"] for day in plan["days"]]
        self.assertIn("new", kinds)
        self.assertIsNone(plan["days"][6]["kind"])  # rest day
        for day in plan["days"][:6]:
            self.assertIsNotNone(day["problem_id"])

    def test_due_review_takes_priority(self):
        problem = Problem.objects.filter(title_i18n__en="Sum of Two Numbers").first()
        sub = Submission.objects.create(
            user=self.user, problem=problem, language="python3", code="x"
        )
        Submission.objects.filter(pk=sub.pk).update(
            submission_time=timezone.now() - timedelta(days=4), verdict=WA
        )
        plan = practice_plan(self.user, days=7)
        self.assertEqual(plan["days"][0]["kind"], "review")
        self.assertEqual(plan["days"][0]["problem_id"], problem.id)
        self.assertEqual(plan["due_reviews"], 1)


class MistakeProfileTest(TestCase):
    """Item 35: the pattern signatures."""

    def setUp(self):
        _seed()
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.filter(
            title_i18n__en="Sum of Two Numbers"
        ).first()

    def _sub(self, verdict, samples_green=False):
        sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=verdict,
        )
        for i, tc in enumerate(self.problem.test_cases.all()):
            SubmissionTestResult.objects.create(
                submission=sub,
                test_case=tc,
                verdict=AC if (tc.is_sample and samples_green) else verdict,
            )
        return sub

    def test_edge_case_signature(self):
        for _ in range(4):
            self._sub(WA, samples_green=True)
        profile = mistake_profile(self.user)
        patterns = {p["pattern"] for p in profile["patterns"]}
        self.assertIn("EDGE_CASES", patterns)
        self.assertEqual(profile["total_submissions"], 4)
        self.assertIn("0% AC rate", profile["summary"])

    def test_runtime_error_signature(self):
        for verdict in (RE, RE, AC):
            self._sub(verdict)
        patterns = {p["pattern"] for p in mistake_profile(self.user)["patterns"]}
        self.assertIn("RUNTIME_ERRORS", patterns)

    def test_empty_profile(self):
        profile = mistake_profile(self.user)
        self.assertEqual(profile["total_submissions"], 0)
        self.assertEqual(profile["patterns"], [])

    def test_no_dominant_pattern(self):
        # A single WA without the edge-case signature (samples fail too)
        # next to an AC: no dominant pattern fires.
        self._sub(AC)
        wa = self._sub(WA, samples_green=False)
        # First test passes, a later one fails: not an IO-contract case.
        first = (
            SubmissionTestResult.objects.filter(submission=wa)
            .order_by("test_case__order")
            .first()
        )
        first.verdict = AC
        first.save()
        patterns = {p["pattern"] for p in mistake_profile(self.user)["patterns"]}
        self.assertIn("NO_DOMINANT_PATTERN", patterns)

    def test_tle_and_io_contract_signatures(self):
        for verdict in (TLE, TLE, AC, AC, AC):
            self._sub(verdict)
        # 2/5 = 40% TLE -> TIME_LIMIT fires.
        patterns = {p["pattern"] for p in mistake_profile(self.user)["patterns"]}
        self.assertIn("TIME_LIMIT", patterns)

    def test_io_contract_signature(self):
        for _ in range(3):
            self._sub(WA, samples_green=False)
            # every WA fails from the first test -> IO_CONTRACT
        profile = mistake_profile(self.user)
        patterns = {p["pattern"] for p in profile["patterns"]}
        self.assertIn("IO_CONTRACT", patterns)

    def test_weak_tag_ac_accounting_in_plan(self):
        # A solved loops problem feeds the weak-tag AC counters (engine
        # line 98) and keeps the plan populated.
        loops = Tag.objects.get(slug="loops")
        problem = Problem.objects.filter(tags=loops).first()
        Submission.objects.create(
            user=self.user, problem=problem, language="python3", code="x", verdict=AC
        )
        plan = practice_plan(self.user, days=7)
        self.assertTrue(all(day["kind"] is not None for day in plan["days"][:6]))

    def test_str_methods(self):
        edge = SkillEdge.objects.first()
        card = TheoryCard.objects.first()
        self.assertIn("->", str(edge))
        self.assertTrue(str(card))

    def test_weak_tag_without_unsolved_candidate(self):
        # A weak tag whose problems are ALL solved leaves a focus-tag day
        # without a problem link (the None-candidate branch).
        loops = Tag.objects.get(slug="loops")
        for problem in Problem.objects.filter(tags=loops):
            Submission.objects.create(
                user=self.user,
                problem=problem,
                language="python3",
                code="x",
                verdict=AC,
            )
        plan = practice_plan(self.user, days=7)
        focus_days = [d for d in plan["days"] if d["kind"] == "weak_tag"]
        self.assertTrue(any(d["problem_id"] is None for d in focus_days))

    def test_empty_days_when_no_reviews_no_tags_no_fresh(self):
        # The catalog is empty (stubbed): every arm exhausted -> rest-like
        # empty days even before day 7 (the elif's fall-through arm).
        from unittest import mock

        class _EmptyQuerySet:
            def order_by(self, *a):
                return self

            def first(self):
                return None

            def __iter__(self):
                return iter([])

            def __len__(self):
                return 0

            def __getitem__(self, item):
                return []

            def exclude(self, *a, **k):
                return self

            def filter(self, *a, **k):
                return self

        class _ProblemStub:
            objects = mock.Mock()
            DifficultyLevel = Problem.DifficultyLevel
            ProblemStatus = Problem.ProblemStatus

        _ProblemStub.objects.filter.return_value = _EmptyQuerySet()
        with mock.patch("learning.engine.Problem", _ProblemStub):
            plan = practice_plan(self.user, days=3)
        self.assertEqual([d["kind"] for d in plan["days"]], [None, None, None])
        self.assertTrue(all(d["problem_id"] is None for d in plan["days"]))

    def test_practice_plan_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/learning/practice-plan/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["days"]), 7)

    def test_endpoint(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/learning/mistake-profile/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_submissions"], 0)


class SkillGraphAndTheoryTest(TestCase):
    """Items 30/33: the graph + the deck, both seeded."""

    def setUp(self):
        _seed()
        self.user = User.objects.create_user(username="u", password="p")

    def test_edges_and_cards_seeded(self):
        self.assertGreaterEqual(SkillEdge.objects.count(), 8)
        self.assertGreaterEqual(TheoryCard.objects.count(), 6)
        card = TheoryCard.objects.first()
        self.assertTrue(card.front_ro and card.back_ro)

    def test_graph_locks_until_prerequisite_solved(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/learning/skills/")
        self.assertEqual(response.status_code, 200)
        nodes = {n["slug"]: n for n in response.data["nodes"]}
        self.assertFalse(nodes["arrays"]["unlocked"])
        self.assertIn("loops", nodes["arrays"]["prerequisites"])
        # Solve any loops-tagged problem -> arrays unlocks.
        loops = Tag.objects.get(slug="loops")
        problem = Problem.objects.filter(tags=loops).first()
        Submission.objects.create(
            user=self.user, problem=problem, language="python3", code="x", verdict=AC
        )
        response = client.get("/api/v1/learning/skills/")
        nodes = {n["slug"]: n for n in response.data["nodes"]}
        self.assertTrue(nodes["arrays"]["unlocked"])
        self.assertGreater(nodes["loops"]["solved"], 0)
        pairs = {(e["from"], e["to"]) for e in response.data["edges"]}
        self.assertIn(("loops", "arrays"), pairs)

    def test_theory_deck_public_and_filterable(self):
        client = APIClient()  # anonymous: the deck is public
        response = client.get("/api/v1/learning/theory/")
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["count"], 6)
        response = client.get("/api/v1/learning/theory/?tag=binary-search")
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["tag"], "binary-search")

    def test_seed_idempotent_for_learning(self):
        _seed()
        _seed()
        from problems.seed_data import THEORY_CARDS

        self.assertEqual(TheoryCard.objects.count(), len(THEORY_CARDS))
