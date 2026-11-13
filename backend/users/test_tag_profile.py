"""RAT-7 (competitive roadmap): per-tag skill profile + practice-next,
with the CNT-3 tag-coverage floor."""

from django.test import TestCase

from problems.models import Problem, Tag
from submissions.models import Submission
from users.models import User
from users.statistics import TAG_COVERAGE_FLOOR, tag_skill_profile


def _problem(title, difficulty, tags, status=Problem.ProblemStatus.APPROVED):
    problem = Problem.objects.create(
        title_i18n={"en": title},
        statement_i18n={"en": "S"},
        difficulty=difficulty,
        status=status,
    )
    for name in tags:
        tag, _ = Tag.objects.get_or_create(
            slug=name, defaults={"name_i18n": {"en": name}}
        )
        problem.tags.add(tag)
    return problem


def _sub(user, problem, verdict, language="python3"):
    return Submission.objects.create(
        user=user,
        problem=problem,
        language=language,
        code="x",
        verdict=verdict,
        score=10 if verdict == Submission.VerdictStatus.ACCEPTED else 0,
    )


class TagSkillProfileTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        # Covered tag: 3 APPROVED problems (>= TAG_COVERAGE_FLOOR).
        self.a1 = _problem("a1", Problem.DifficultyLevel.EASY, ["arrays"])
        self.a2 = _problem("a2", Problem.DifficultyLevel.MEDIUM, ["arrays"])
        self.a3 = _problem("a3", Problem.DifficultyLevel.HARD, ["arrays"])
        # Uncovered tag: 1 problem only — reported, never a suggestion.
        self.x1 = _problem("x1", Problem.DifficultyLevel.EASY, ["strings"])
        # Untagged problem — belongs to no tag row.
        _problem("no-tag", Problem.DifficultyLevel.EASY, [])

    def _stats(self):
        return tag_skill_profile(self.user)

    def test_new_user_gets_easiest_suggestions(self):
        # No submissions yet: the strip still works — the covered tag's
        # unsolved problems, easiest first.
        data = self._stats()
        rows = {row["tag"]: row for row in data["tags"]}
        self.assertTrue(rows["arrays"]["covered"])
        self.assertFalse(rows["strings"]["covered"])
        self.assertEqual(rows["arrays"]["solved"], 0)
        ids = [row["id"] for row in data["practice_next"]]
        self.assertEqual(ids, [self.a1.id, self.a2.id, self.a3.id])

    def test_solved_counts_and_points_per_tag(self):
        _sub(self.user, self.a1, Submission.VerdictStatus.ACCEPTED)
        _sub(self.user, self.a1, Submission.VerdictStatus.WRONG_ANSWER)  # dup
        _sub(self.user, self.x1, Submission.VerdictStatus.ACCEPTED)
        data = self._stats()
        rows = {row["tag"]: row for row in data["tags"]}
        self.assertEqual(rows["arrays"]["solved"], 1)
        self.assertEqual(rows["arrays"]["attempted"], 1)
        self.assertEqual(rows["arrays"]["points"], 1)  # EASY weight
        self.assertEqual(rows["strings"]["solved"], 1)
        self.assertEqual(rows["strings"]["points"], 1)

    def test_medium_solves_score_three_points(self):
        _sub(self.user, self.a2, Submission.VerdictStatus.ACCEPTED)
        rows = {row["tag"]: row for row in self._stats()["tags"]}
        self.assertEqual(rows["arrays"]["points"], 3)

    def test_practice_next_excludes_solved_and_uncovered(self):
        _sub(self.user, self.a1, Submission.VerdictStatus.ACCEPTED)
        _sub(self.user, self.x1, Submission.VerdictStatus.WRONG_ANSWER)
        data = self._stats()
        ids = [row["id"] for row in data["practice_next"]]
        self.assertIn(self.a2.id, ids)
        self.assertIn(self.a3.id, ids)
        self.assertNotIn(self.a1.id, ids)  # solved
        self.assertNotIn(self.x1.id, ids)  # uncovered tag only

    def test_practice_next_orders_easiest_first_within_weakest_tag(self):
        data = self._stats()
        ids = [row["id"] for row in data["practice_next"]]
        self.assertEqual(ids, [self.a1.id, self.a2.id, self.a3.id])

    def test_draft_problems_never_enter_the_pool(self):
        _problem(
            "draft",
            Problem.DifficultyLevel.EASY,
            ["arrays"],
            status=Problem.ProblemStatus.DRAFT,
        )
        data = self._stats()
        rows = {row["tag"]: row for row in data["tags"]}
        # arrays still covered (3 APPROVED); the DRAFT problem is absent.
        self.assertTrue(rows["arrays"]["covered"])
        self.assertNotIn(
            "draft", [r["title_i18n"]["en"] for r in data["practice_next"]]
        )

    def test_payload_rides_users_me_statistics(self):
        _sub(self.user, self.a1, Submission.VerdictStatus.ACCEPTED)
        from rest_framework.test import APIClient

        client = APIClient()
        client.force_authenticate(self.user)
        resp = client.get("/api/v1/users/me/statistics/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("tag_profile", resp.json())

    def test_coverage_floor_constant_is_three(self):
        # CNT-3's documented floor — pinned so a silent change is visible.
        self.assertEqual(TAG_COVERAGE_FLOOR, 3)
