"""Related-problems + has-editorial catalog filter tests.

Competitive matrix row 6 (similar problems — the LeetCode "Similar
Questions" / Codewars related-by-tag affordance) and the DMOJ
"has editorial" catalog facet.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem, ProblemEditorial, Tag
from submissions.models import Submission
from users.models import User


class RelatedBase(TestCase):
    def setUp(self):
        self.student = User.objects.create_user(username="stud", password="pw")
        self.client = APIClient()
        self.hashing = Tag.objects.create(name_i18n={"en": "Hashing"}, slug="hashing")
        self.arrays = Tag.objects.create(name_i18n={"en": "Arrays"}, slug="arrays")
        self.source = self.mk_problem(
            "Two Sum", "EASY", tags=[self.hashing, self.arrays]
        )

    def mk_problem(self, title, difficulty, *, tags=(), status=None):
        problem = Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            difficulty=difficulty,
            status=status or Problem.ProblemStatus.APPROVED,
        )
        for tag in tags:
            problem.tags.add(tag)
        return problem

    def ac(self, user, problem):
        Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code="x",
            verdict="AC",
            score=100,
        )


class RelatedProblemsTests(RelatedBase):
    def url(self, pk):
        return f"/api/v1/problems/problems/{pk}/related/"

    def test_ranks_by_shared_tags_then_difficulty_proximity(self):
        both = self.mk_problem("Pair sum", "MEDIUM", tags=[self.hashing, self.arrays])
        one_far = self.mk_problem("Set lookup", "HARD", tags=[self.hashing])
        one_near = self.mk_problem("Array walk", "EASY", tags=[self.arrays])
        draft = self.mk_problem(
            "Draft pair",
            "EASY",
            tags=[self.hashing],
            status=Problem.ProblemStatus.DRAFT,
        )

        response = self.client.get(self.url(self.source.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [both.id, one_near.id, one_far.id])
        self.assertNotIn(draft.id, ids)
        self.assertNotIn(self.source.id, ids)
        self.assertEqual(response.data["results"][0]["shared_tags"], 2)
        self.assertEqual(response.data["results"][1]["shared_tags"], 1)
        self.assertEqual(response.data["count"], 3)

    def test_solved_problems_drop_out_unless_included(self):
        near = self.mk_problem("Array walk", "EASY", tags=[self.arrays])
        far = self.mk_problem("Set lookup", "HARD", tags=[self.hashing])
        self.ac(self.student, near)

        self.client.force_authenticate(self.student)
        default = self.client.get(self.url(self.source.id))
        self.assertEqual([row["id"] for row in default.data["results"]], [far.id])
        included = self.client.get(self.url(self.source.id) + "?include_solved=1")
        self.assertEqual(
            [row["id"] for row in included.data["results"]], [near.id, far.id]
        )

    def test_anonymous_sees_everything_untouched(self):
        near = self.mk_problem("Array walk", "EASY", tags=[self.arrays])
        self.ac(self.student, near)

        response = self.client.get(self.url(self.source.id))
        self.assertEqual([row["id"] for row in response.data["results"]], [near.id])

    def test_tagless_source_falls_back_to_same_difficulty_by_solves(self):
        plain = Problem.objects.create(
            title_i18n={"en": "Plain", "ro": "Plain"},
            statement_i18n={"en": "s", "ro": "s"},
            difficulty="EASY",
            status=Problem.ProblemStatus.APPROVED,
        )
        popular = self.mk_problem("Popular easy", "EASY")
        unpopular = self.mk_problem("Unpopular easy", "EASY")
        hard_one = self.mk_problem("Hard one", "HARD")
        solver = User.objects.create_user(username="solver", password="pw")
        for _ in range(3):
            self.ac(solver, popular)
        self.ac(solver, unpopular)

        response = self.client.get(self.url(plain.id))
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(popular.id, ids)
        self.assertIn(unpopular.id, ids)
        self.assertNotIn(hard_one.id, ids)
        self.assertLess(ids.index(popular.id), ids.index(unpopular.id))
        self.assertEqual(response.data["results"][0]["shared_tags"], 0)

    def test_caps_at_eight_rows(self):
        for i in range(10):
            self.mk_problem(f"Extra {i}", "EASY", tags=[self.hashing])
        response = self.client.get(self.url(self.source.id))
        self.assertEqual(response.data["count"], 8)

    def test_unknown_problem_404(self):
        self.assertEqual(
            self.client.get(self.url(999999)).status_code,
            status.HTTP_404_NOT_FOUND,
        )


class HasEditorialFilterTests(RelatedBase):
    def list_ids(self, query=""):
        response = self.client.get(f"/api/v1/problems/problems/{query}")
        return {row["id"] for row in response.data["results"]}

    def test_filter_keeps_public_and_after_ac_only(self):
        public = self.mk_problem("With public editorial", "EASY")
        after_ac = self.mk_problem("With after-ac editorial", "EASY")
        manual = self.mk_problem("With manual editorial", "EASY")
        none = self.mk_problem("No editorial", "EASY")
        ProblemEditorial.objects.create(
            problem=public, publish_policy=ProblemEditorial.PublishPolicy.PUBLIC
        )
        ProblemEditorial.objects.create(
            problem=after_ac, publish_policy=ProblemEditorial.PublishPolicy.AFTER_AC
        )
        ProblemEditorial.objects.create(
            problem=manual, publish_policy=ProblemEditorial.PublishPolicy.MANUAL
        )

        unfiltered = self.list_ids()
        self.assertEqual(
            unfiltered, {self.source.id, public.id, after_ac.id, manual.id, none.id}
        )
        filtered = self.list_ids("?has_editorial=1")
        self.assertEqual(filtered, {public.id, after_ac.id})

    def test_list_rows_expose_the_has_editorial_annotation(self):
        public = self.mk_problem("With public editorial", "EASY")
        ProblemEditorial.objects.create(
            problem=public, publish_policy=ProblemEditorial.PublishPolicy.PUBLIC
        )
        response = self.client.get("/api/v1/problems/problems/")
        flags = {row["id"]: row["has_editorial"] for row in response.data["results"]}
        self.assertTrue(flags[public.id])
        self.assertFalse(flags[self.source.id])
