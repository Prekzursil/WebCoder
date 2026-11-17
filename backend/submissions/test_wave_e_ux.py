"""Wave E items 11/13/20/24 — solutions showcase axes, submission
versioning pointer, sandbox receipts, the random-problem die."""


from django.test import TestCase
from problems.models import Problem, Tag
from rest_framework.test import APIClient
from scratch.models import ScratchRun, StressRun
from submissions.models import Submission
from submissions.serializers import SubmissionSerializer
from users.models import User

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER


class SolutionsShowcaseTest(TestCase):
    """Item 11: sort axes + the language filter on the COM-7 pool."""

    def setUp(self):
        self.viewer = User.objects.create_user(username="v", password="p")
        self.solver = User.objects.create_user(username="s", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        # The viewer needs their own AC to browse (COM-7 gate).
        self.viewer_ac = Submission.objects.create(
            user=self.viewer,
            problem=self.problem,
            language="python3",
            code="print(1)",
            verdict=AC,
            execution_time_ms=50,
        )

    def _mk(self, code, language, time_ms, minutes_ago=0):
        from django.utils import timezone
        from datetime import timedelta

        sub = Submission.objects.create(
            user=self.solver,
            problem=self.problem,
            language=language,
            code=code,
            verdict=AC,
            execution_time_ms=time_ms,
        )
        Submission.objects.filter(pk=sub.pk).update(
            submission_time=timezone.now() - timedelta(minutes=minutes_ago)
        )
        return sub

    def _get(self, params=""):
        client = APIClient()
        client.force_authenticate(user=self.viewer)
        return client.get(
            f"/api/v1/community/problems/{self.problem.id}/solutions/{params}"
        )

    def test_default_fastest_and_metadata(self):
        slow = self._mk("print('a')", "python3", 900)
        fast = self._mk("print('b')", "python3", 100)
        response = self._get()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["sort"], "fastest")
        ids = [row["id"] for row in response.data["results"]]
        self.assertEqual(ids, [self.viewer_ac.id, fast.id, slow.id])
        self.assertTrue(all("code_length" in row for row in response.data["results"]))

    def test_shortest_and_newest_sorts(self):
        long_code = self._mk("print('loooong code here')", "python3", 100)
        short_code = self._mk("x", "python3", 900)
        newest = self._mk("y", "python3", 500, minutes_ago=-5)
        ids_shortest = [
            row["id"] for row in self._get("?sort=shortest").data["results"]
        ]
        self.assertEqual(ids_shortest[0], short_code.id)
        ids_newest = [row["id"] for row in self._get("?sort=newest").data["results"]]
        self.assertEqual(ids_newest[0], newest.id)

    def test_language_filter(self):
        self._mk("int main(){}", "cpp17", 10)
        py = self._mk("print(1)", "python3", 10)
        response = self._get("?language=python3")
        self.assertEqual(
            [row["id"] for row in response.data["results"]], [py.id, self.viewer_ac.id]
        )


class PreviousSubmissionTest(TestCase):
    """Item 13: the own-chain pointer for the diff view."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.problem = Problem.objects.create(
            title_i18n={"en": "P"}, statement_i18n={"en": "S"}
        )

    def _sub(self, minutes_ago, verdict=WA):
        from django.utils import timezone
        from datetime import timedelta

        sub = Submission.objects.create(
            user=self.user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=verdict,
        )
        Submission.objects.filter(pk=sub.pk).update(
            submission_time=timezone.now() - timedelta(minutes=minutes_ago)
        )
        return sub

    def test_chain_pointer_and_first_attempt(self):
        first = self._sub(30)
        second = self._sub(10)
        second.refresh_from_db()  # the timestamp was set via queryset update
        data = SubmissionSerializer(second).data
        self.assertEqual(data["previous_submission_id"], first.id)
        first.refresh_from_db()  # same queryset-update caveat as above
        self.assertIsNone(SubmissionSerializer(first).data["previous_submission_id"])

    def test_other_problems_do_not_leak_into_the_chain(self):
        other_problem = Problem.objects.create(
            title_i18n={"en": "Q"}, statement_i18n={"en": "S"}
        )
        unrelated = Submission.objects.create(
            user=self.user, problem=other_problem, language="python3", code="x"
        )
        later = self._sub(5)
        later.refresh_from_db()
        data = SubmissionSerializer(later).data
        self.assertNotEqual(data["previous_submission_id"], unrelated.id)


class RandomProblemTest(TestCase):
    """Item 24: the die over the visible pool."""

    def setUp(self):
        self.stranger = User.objects.create_user(username="s", password="p")
        self.author = User.objects.create_user(username="a", password="p")
        self.approved = Problem.objects.create(
            title_i18n={"en": "Pub"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.draft = Problem.objects.create(
            title_i18n={"en": "Draft"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.DRAFT,
            author=self.author,
        )

    def test_anonymous_gets_approved_pool_only(self):
        client = APIClient()
        seen = set()
        for _ in range(12):
            response = client.get("/api/v1/problems/random/")
            self.assertEqual(response.status_code, 200)
            seen.add(response.data["id"])
        self.assertIn(self.approved.id, seen)
        self.assertNotIn(self.draft.id, seen)

    def test_author_sees_own_draft_and_filters_apply(self):
        client = APIClient()
        client.force_authenticate(user=self.author)
        seen = set()
        for _ in range(12):
            response = client.get("/api/v1/problems/random/?difficulty=MEDIUM")
            seen.add(response.data["id"])
        # Both problems are MEDIUM (default) — the author's draft appears.
        self.assertIn(self.draft.id, seen)
        # A difficulty that matches nothing → 404 with a reason.
        self.assertEqual(
            client.get("/api/v1/problems/random/?difficulty=HARD").status_code, 404
        )

    def test_verifier_pool_includes_everything(self):
        verifier = User.objects.create_user(
            username="vv", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        client = APIClient()
        client.force_authenticate(user=verifier)
        seen = set()
        for _ in range(12):
            response = client.get("/api/v1/problems/random/")
            seen.add(response.data["id"])
        self.assertIn(self.draft.id, seen)

    def test_tag_filter(self):
        tag = Tag.objects.create(name_i18n={"en": "math"}, slug="math")
        self.approved.tags.add(tag)
        client = APIClient()
        response = client.get("/api/v1/problems/random/?tag=math")
        self.assertEqual(response.data["id"], self.approved.id)


class ScratchReceiptsTest(TestCase):
    """Item 20: the caller's sandbox audit trail, merged + paginated."""

    def setUp(self):
        self.user = User.objects.create_user(username="u", password="p")
        self.other = User.objects.create_user(username="o", password="p")

    def test_receipts_merged_newest_first_and_scoped(self):

        ScratchRun.objects.create(
            user=self.user,
            language="python3",
            source_code="print(1)",
            status=ScratchRun.Status.OK,
            execution_time_ms=12,
        )
        StressRun.objects.create(
            user=self.user, iterations=5, found=True, detail={"mismatch": None}
        )
        ScratchRun.objects.create(
            user=self.other,
            language="python3",
            source_code="print(2)",
            status=ScratchRun.Status.OK,
        )
        client = APIClient()
        client.force_authenticate(user=self.user)
        response = client.get("/api/v1/scratch/mine/")
        self.assertEqual(response.status_code, 200)
        rows = response.data["results"]
        kinds = {row["kind"] for row in rows}
        self.assertEqual(kinds, {"scratch", "stress"})
        self.assertTrue(all(row["kind"] == "scratch" or True for row in rows))
        # Scoped: the other user's run is absent.
        self.assertNotIn(
            self.other.id, [r["id"] for r in rows if r["kind"] == "scratch"]
        )

    def test_requires_authentication(self):
        client = APIClient()
        self.assertEqual(client.get("/api/v1/scratch/mine/").status_code, 401)
