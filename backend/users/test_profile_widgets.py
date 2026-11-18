"""Wave F — profile widgets tests (items 70/71/72).

Setter CVs (derived portfolio + owner-editable profile), shareable solve
cards (payload + SVG) and the embeddable problem widget.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from contests.models import Contest, ContestProblem
from problems.models import (
    Article,
    CommunityEditorial,
    Problem,
)
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import SetterProfile, User


class WidgetsBase(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.now = timezone.now()
        self.client = APIClient()
        self.problem = self.mk_problem("Sum")

    def mk_problem(self, title, author=None, difficulty="MEDIUM"):
        return Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
            author=author,
            difficulty=difficulty,
        )


class SetterCVTests(WidgetsBase):
    def test_empty_cv(self):
        response = self.client.get("/api/v1/users/username/alice/setter-cv/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["problems_approved"], 0)
        self.assertEqual(response.data["blurb"], "")

    def test_derived_counts(self):
        p1 = self.mk_problem("P1", author=self.alice, difficulty="EASY")
        self.mk_problem("P2", author=self.alice, difficulty="HARD")
        self.mk_problem("Draft", author=self.alice).delete()  # keep counts clean
        CommunityEditorial.objects.create(
            problem=p1,
            author=self.alice,
            title="E",
            body="b",
            status=CommunityEditorial.Status.APPROVED,
        )
        Article.objects.create(
            title_i18n={"en": "A"},
            body_ro="ro",
            body_en="en",
            author=self.alice,
            status=Article.Status.APPROVED,
        )
        contest = Contest.objects.create(
            title_i18n={"en": "C"},
            created_by=self.bob,
            start_at=self.now + timedelta(days=1),
            end_at=self.now + timedelta(days=2),
        )
        ContestProblem.objects.create(contest=contest, problem=p1, order=0)
        response = self.client.get("/api/v1/users/username/alice/setter-cv/")
        self.assertEqual(response.data["problems_approved"], 2)
        self.assertEqual(response.data["problems_by_difficulty"]["EASY"], 1)
        self.assertEqual(response.data["problems_by_difficulty"]["HARD"], 1)
        self.assertEqual(response.data["community_editorials"], 1)
        self.assertEqual(response.data["articles"], 1)
        self.assertEqual(response.data["contests_contributed"], 1)

    def test_owner_edits_profile(self):
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/users/username/alice/setter-cv/",
            {
                "blurb": "Olympiad problem setter since 2019.",
                "links": ["https://x.dev"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["blurb"], "Olympiad problem setter since 2019.")
        profile = SetterProfile.objects.get(user=self.alice)
        self.assertEqual(profile.links, ["https://x.dev"])

    def test_partial_updates(self):
        SetterProfile.objects.create(user=self.alice, blurb="keep", links=["https://x.dev"])
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/users/username/alice/setter-cv/",
            {"links": ["https://y.dev"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        profile = SetterProfile.objects.get(user=self.alice)
        self.assertEqual(profile.blurb, "keep")
        self.assertEqual(profile.links, ["https://y.dev"])

    def test_unmapped_difficulty_skipped(self):
        # difficulty outside the mapped keys exercises the loop's skip branch
        self.mk_problem("Weird", author=self.alice, difficulty="EXTREME")
        self.mk_problem("Fine", author=self.alice, difficulty="EASY")
        response = self.client.get("/api/v1/users/username/alice/setter-cv/")
        self.assertEqual(response.data["problems_by_difficulty"]["EASY"], 1)
        self.assertNotIn("EXTREME", response.data["problems_by_difficulty"])

    def test_stranger_cannot_edit(self):
        self.client.force_authenticate(self.bob)
        response = self.client.put(
            "/api/v1/users/username/alice/setter-cv/",
            {"blurb": "hax"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_validation(self):
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/users/username/alice/setter-cv/",
            {"links": ["not-a-url"]},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.put(
            "/api/v1/users/username/alice/setter-cv/",
            {
                "links": [
                    "https://a.dev",
                    "https://b.dev",
                    "https://c.dev",
                    "https://d.dev",
                    "https://e.dev",
                    "https://f.dev",
                ]
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_user_404(self):
        response = self.client.get("/api/v1/users/username/ghost/setter-cv/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.alice)
        response = self.client.put(
            "/api/v1/users/username/ghost/setter-cv/", {"blurb": "x"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_str_method(self):
        profile = SetterProfile.objects.create(user=self.alice, blurb="b")
        self.assertIn("setter-cv", str(profile))


class SolveCardTests(WidgetsBase):
    def test_card_payload_and_ordinal(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="1",
            verdict="AC",
            score=100,
        )
        response = self.client.get(
            "/api/v1/users/cards/solve/alice/" + f"{self.problem.id}/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["ordinal"], 1)
        self.assertEqual(response.data["problem_title"], "Sum")

    def test_card_svg_render(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="1",
            verdict="AC",
            score=100,
        )
        response = self.client.get(
            f"/api/v1/users/cards/solve/alice/{self.problem.id}/svg/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "image/svg+xml")
        self.assertIn(b"<svg", response.content)
        self.assertIn(b"alice", response.content)
        self.assertIn(b"solver #1", response.content)

    def test_unsolved_user_still_gets_card(self):
        response = self.client.get(
            f"/api/v1/users/cards/solve/alice/{self.problem.id}/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["solved_at"] or None)
        # ordinal reflects OTHERS' solves
        Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            language="python3",
            code="1",
            verdict="AC",
            score=100,
        )
        response = self.client.get(
            f"/api/v1/users/cards/solve/alice/{self.problem.id}/"
        )
        self.assertEqual(response.data["ordinal"], 1)

    def test_card_404s(self):
        response = self.client.get(
            f"/api/v1/users/cards/solve/ghost/{self.problem.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/users/cards/solve/alice/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/users/cards/solve/ghost/999999/svg/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class EmbedWidgetTests(WidgetsBase):
    def setUp(self):
        super().setUp()
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="1",
            expected_output_data="2",
            is_sample=True,
            points=10,
            order=1,
        )

    def test_embed_payload(self):
        Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            language="python3",
            code="1",
            verdict="AC",
            score=100,
        )
        response = self.client.get(f"/api/v1/users/embed/problems/{self.problem.id}/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["title"], "Sum")
        self.assertEqual(len(response.data["samples"]), 1)
        self.assertEqual(response.data["solved_by"], 1)
        self.assertEqual(response.data["solve_url"], f"/problems/{self.problem.id}")

    def test_contest_fresh_problem_blocked(self):
        contest = Contest.objects.create(
            title_i18n={"en": "Live"},
            created_by=self.bob,
            start_at=self.now - timedelta(minutes=10),
            end_at=self.now + timedelta(minutes=50),
        )
        ContestProblem.objects.create(contest=contest, problem=self.problem, order=0)
        response = self.client.get(f"/api/v1/users/embed/problems/{self.problem.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_problem_404(self):
        response = self.client.get("/api/v1/users/embed/problems/999999/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
