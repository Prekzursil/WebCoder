"""Problem-page experience wave — economics core tests (items D/E/F/G).

Covers, at the 100% line bar:
- ``problems.economics`` — band resolution, clamping, validation errors;
- model layer — ``Problem.clean()`` point bounds, VERY_HARD difficulty,
  ``ProblemForfeit`` / ``HintReveal`` / ``AuthoringDraft`` semantics;
- serializer layer — target_points enforcement on API writes, tiered-hint
  shape validation, detail hint_state/forfeited/reference visibility;
- approval workflow — editorial-mandatory gate + point-band re-check;
- ``unlock-source`` and ``hints/reveal`` endpoints;
- ``problems.score_service`` — partial credit, forfeiture exclusion;
- leaderboard aggregation — best-partial crediting + forfeit exclusion;
- authoring-draft CRUD;
- author analytics hint usage.
"""

from django.core.exceptions import ValidationError
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from leaderboard.aggregation import recompute_all_leaderboards, update_user_entry
from leaderboard.models import LeaderboardEntry
from problems.content_ops import author_analytics
from problems.economics import (
    difficulty_point_ranges,
    point_bounds,
    target_points_for_difficulty,
    validate_target_points,
)
from problems.models import (
    AuthoringDraft,
    HintReveal,
    Problem,
    ProblemEditorial,
    ProblemForfeit,
)
from problems.models import TestCase as ProblemTestCase
from problems.score_service import (
    attempted_problem_ids,
    earned_points,
    has_solved,
    problem_point_value,
    solved_problem_ids,
    user_total_score,
)
from submissions.models import Submission
from users.models import User


def _problem(**kwargs):
    defaults = {
        "title_i18n": {"en": "P"},
        "statement_i18n": {"en": "S"},
        "difficulty": "MEDIUM",
        "target_points": 100,
    }
    defaults.update(kwargs)
    return Problem.objects.create(**defaults)


class EconomicsModuleTest(TestCase):
    def test_default_ranges_cover_every_difficulty(self):
        ranges = difficulty_point_ranges()
        for difficulty in ("VERY_EASY", "EASY", "MEDIUM", "HARD", "VERY_HARD"):
            self.assertIn(difficulty, ranges)
        self.assertEqual(ranges["EASY"], (10, 50))
        self.assertEqual(ranges["VERY_HARD"], (500, 1000))

    def test_point_bounds_unknown_difficulty_is_none(self):
        self.assertIsNone(point_bounds("NOPE"))

    @override_settings(PROBLEM_DIFFICULTY_POINT_RANGES={"EASY": (0, 99999)})
    def test_ranges_clamped_to_floor_and_ceiling(self):
        self.assertEqual(point_bounds("EASY"), (1, 1000))
        self.assertEqual(difficulty_point_ranges(), {"EASY": (1, 1000)})

    @override_settings(PROBLEM_POINT_FLOOR=50, PROBLEM_POINT_CEILING=10)
    def test_degenerate_bounds_raise(self):
        with self.assertRaises(ValueError):
            difficulty_point_ranges()

    def test_validate_accepts_in_band(self):
        validate_target_points("MEDIUM", 100)

    def test_validate_rejects_out_of_band(self):
        with self.assertRaises(ValidationError) as ctx:
            validate_target_points("EASY", 100)
        self.assertIn("target_points", ctx.exception.message_dict)

    def test_validate_rejects_outside_absolute_bounds(self):
        with self.assertRaises(ValidationError):
            validate_target_points("VERY_HARD", 5000)
        with self.assertRaises(ValidationError):
            validate_target_points("VERY_EASY", 0)

    def test_validate_rejects_none(self):
        with self.assertRaises(ValidationError):
            validate_target_points("MEDIUM", None)

    def test_midpoint_default(self):
        self.assertEqual(target_points_for_difficulty("EASY"), 30)
        self.assertEqual(target_points_for_difficulty("UNKNOWN"), 100)


class ProblemCleanTest(TestCase):
    def test_clean_accepts_in_band(self):
        p = _problem(difficulty="VERY_HARD", target_points=750)
        p.clean()

    def test_clean_rejects_out_of_band(self):
        p = _problem(difficulty="EASY", target_points=100)
        with self.assertRaises(ValidationError):
            p.clean()

    def test_very_hard_is_a_choice(self):
        self.assertIn("VERY_HARD", dict(Problem.DifficultyLevel.choices))


class ForfeitModelTest(TestCase):
    def test_str(self):
        user = User.objects.create_user(username="f", password="p")
        p = _problem()
        row = ProblemForfeit.objects.create(user=user, problem=p)
        self.assertIn("forfeited", str(row))

    def test_unique_per_user_problem(self):
        from django.db import IntegrityError

        user = User.objects.create_user(username="f2", password="p")
        p = _problem()
        ProblemForfeit.objects.create(user=user, problem=p)
        with self.assertRaises(IntegrityError):
            ProblemForfeit.objects.create(user=user, problem=p)


class HintRevealModelTest(TestCase):
    def test_str_and_unique(self):
        from django.db import IntegrityError

        user = User.objects.create_user(username="h", password="p")
        p = _problem()
        row = HintReveal.objects.create(user=user, problem=p, tier=2)
        self.assertIn("tier 2", str(row))
        with self.assertRaises(IntegrityError):
            HintReveal.objects.create(user=user, problem=p, tier=2)

    def test_tier_bounds_validators(self):
        user = User.objects.create_user(username="h2", password="p")
        p = _problem()
        row = HintReveal(user=user, problem=p, tier=9)
        with self.assertRaises(ValidationError):
            row.full_clean()


class AuthoringDraftModelTest(TestCase):
    def test_str(self):
        user = User.objects.create_user(username="d", password="p")
        row = AuthoringDraft.objects.create(user=user, payload={"a": 1})
        self.assertIn("new-problem", str(row))
        p = _problem()
        row2 = AuthoringDraft.objects.create(user=user, problem=p, payload={})
        self.assertIn(f"problem={p.id}", str(row2))


class EconomicsSerializerTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.creator = User.objects.create_user(
            username="creator", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        self.client.force_authenticate(self.creator)

    def _payload(self, **over):
        base = {
            "title_i18n": {"en": "T"},
            "statement_i18n": {"en": "S"},
            "difficulty": "MEDIUM",
            "target_points": 100,
        }
        base.update(over)
        return base

    def test_create_with_in_band_points(self):
        resp = self.client.post(
            "/api/v1/problems/problems/", self._payload(), format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.json())
        self.assertEqual(resp.json()["target_points"], 100)
        self.assertEqual(resp.json()["point_bounds"], [50, 200])

    def test_create_rejects_out_of_band_points(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(difficulty="EASY", target_points=100),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("target_points", str(resp.json()))

    def test_patch_can_move_difficulty_and_points_together(self):
        p = _problem(author=self.creator)
        resp = self.client.patch(
            f"/api/v1/problems/problems/{p.id}/",
            {"difficulty": "HARD", "target_points": 300},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())

    def test_patch_out_of_band_rejected(self):
        p = _problem(author=self.creator)
        resp = self.client.patch(
            f"/api/v1/problems/problems/{p.id}/", {"target_points": 5}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_shape_string_list_accepted(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en=["nudge", "stronger"]),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.json())

    def test_hint_shape_object_with_image_accepted(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(
                hints_en=[{"content": "look at the parity", "image": "/media/a.png"}]
            ),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED, resp.json())

    def test_hint_shape_too_many_tiers_rejected(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en=["a", "b", "c", "d"]),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_shape_bad_object_rejected(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en=[{"image": "x.png"}]),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_shape_non_list_rejected(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en="just a string"),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_shape_bad_image_type_rejected(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en=[{"content": "x", "image": 3}]),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_shape_empty_string_entry_rejected(self):
        resp = self.client.post(
            "/api/v1/problems/problems/",
            self._payload(hints_en=["   "]),
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_detail_hint_state_and_forfeited(self):
        p = _problem(
            status=Problem.ProblemStatus.APPROVED,
            author=self.creator,
            hints_en=["nudge", {"content": "dp", "image": "/m.png"}],
        )
        solver = User.objects.create_user(username="s", password="p")
        client = APIClient()
        client.force_authenticate(solver)
        resp = client.get(f"/api/v1/problems/problems/{p.id}/")
        data = resp.json()
        self.assertEqual(data["hint_state"]["total"], 2)
        self.assertEqual(data["hint_state"]["revealed_count"], 0)
        self.assertIsNone(data["hint_state"]["tiers"][0]["content"])
        self.assertFalse(data["forfeited"])
        self.assertNotIn("reference_solution_code", data)

    def test_detail_forfeited_viewer_sees_reference(self):
        p = _problem(
            status=Problem.ProblemStatus.APPROVED,
            author=self.creator,
            reference_solution_code="print(1)",
            reference_language="python3",
        )
        solver = User.objects.create_user(username="s2", password="p")
        ProblemForfeit.objects.create(user=solver, problem=p)
        client = APIClient()
        client.force_authenticate(solver)
        resp = client.get(f"/api/v1/problems/problems/{p.id}/")
        data = resp.json()
        self.assertTrue(data["forfeited"])
        self.assertEqual(data["reference_solution_code"], "print(1)")

    def test_editorial_reference_code_roundtrip(self):
        p = _problem(author=self.creator)
        resp = self.client.put(
            f"/api/v1/problems/problems/{p.id}/editorial/",
            {
                "content_en": "Use DP.",
                "solution_python": "print(sum(range(10)))",
                "solution_cpp": "#include <bits/stdc++.h>",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())
        self.assertIn("solution_python", resp.json())
        editorial = ProblemEditorial.objects.get(problem=p)
        self.assertEqual(editorial.solution_cpp, "#include <bits/stdc++.h>")


class ApproveGateTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.verifier = User.objects.create_user(
            username="v", password="p", role=User.Roles.PROBLEM_VERIFIER
        )
        self.client.force_authenticate(self.verifier)
        self.author = User.objects.create_user(username="a", password="p")

    def _pending(self, **kwargs):
        return _problem(
            status=Problem.ProblemStatus.PENDING_APPROVAL, author=self.author, **kwargs
        )

    def test_approve_without_editorial_rejected(self):
        p = self._pending()
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/approve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        p.refresh_from_db()
        self.assertEqual(p.status, Problem.ProblemStatus.PENDING_APPROVAL)

    def test_approve_with_empty_editorial_rejected(self):
        p = self._pending()
        ProblemEditorial.objects.create(problem=p, content_en="   ")
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/approve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_approve_with_editorial_succeeds(self):
        p = self._pending()
        ProblemEditorial.objects.create(problem=p, content_en="Walkthrough.")
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/approve/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())
        p.refresh_from_db()
        self.assertEqual(p.status, Problem.ProblemStatus.APPROVED)

    def test_approve_with_out_of_band_points_rejected(self):
        p = self._pending(difficulty="EASY", target_points=100)
        ProblemEditorial.objects.create(problem=p, content_en="Walkthrough.")
        resp = self.client.post(f"/api/v1/problems/problems/{p.id}/approve/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class UnlockSourceTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.solver = User.objects.create_user(username="s", password="p")
        self.author = User.objects.create_user(username="au", password="p")
        self.problem = _problem(
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
            reference_solution_code="print(42)",
            reference_language="python3",
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            points=10,
            order=1,
        )

    def test_anonymous_unauthorized(self):
        resp = APIClient().post(
            f"/api/v1/problems/problems/{self.problem.id}/unlock-source/"
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unlock_creates_permanent_forfeit(self):
        self.client.force_authenticate(self.solver)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/unlock-source/"
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())
        data = resp.json()
        self.assertEqual(data["reference_solution_code"], "print(42)")
        self.assertTrue(data["forfeited"])
        self.assertTrue(data["editorial_unlocked"])
        self.assertTrue(
            ProblemForfeit.objects.filter(
                user=self.solver, problem=self.problem
            ).exists()
        )

    def test_unlock_after_solve_is_free(self):
        Submission.objects.create(
            user=self.solver,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        self.client.force_authenticate(self.solver)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/unlock-source/"
        )
        data = resp.json()
        self.assertFalse(data["forfeited"])
        self.assertFalse(
            ProblemForfeit.objects.filter(
                user=self.solver, problem=self.problem
            ).exists()
        )

    def test_unlock_idempotent(self):
        self.client.force_authenticate(self.solver)
        first = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/unlock-source/"
        )
        second = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/unlock-source/"
        )
        self.assertEqual(first.json()["forfeited"], True)
        self.assertEqual(second.json()["forfeited"], True)
        self.assertEqual(
            ProblemForfeit.objects.filter(
                user=self.solver, problem=self.problem
            ).count(),
            1,
        )


class RevealHintTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.solver = User.objects.create_user(username="s", password="p")
        self.author = User.objects.create_user(username="au", password="p")
        self.problem = _problem(
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
            hints_en=["nudge", "stronger", {"content": "outline", "image": "/m.png"}],
        )

    def test_anonymous_unauthorized(self):
        resp = APIClient().post(
            f"/api/v1/problems/problems/{self.problem.id}/hints/reveal/"
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_bad_tier_rejected(self):
        self.client.force_authenticate(self.solver)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/hints/reveal/", {"tier": 4}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reveal_returns_content_and_records(self):
        self.client.force_authenticate(self.solver)
        resp = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/hints/reveal/", {"tier": 3}
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())
        data = resp.json()
        self.assertEqual(data["revealed_count"], 1)
        tier3 = data["tiers"][2]
        self.assertEqual(tier3["content"], "outline")
        self.assertEqual(tier3["image"], "/m.png")
        self.assertIsNone(data["tiers"][0]["content"])
        self.assertTrue(
            HintReveal.objects.filter(
                user=self.solver, problem=self.problem, tier=3
            ).exists()
        )

    def test_reveal_idempotent(self):
        self.client.force_authenticate(self.solver)
        self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/hints/reveal/", {"tier": "1"}
        )
        self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/hints/reveal/", {"tier": "1"}
        )
        self.assertEqual(
            HintReveal.objects.filter(
                user=self.solver, problem=self.problem, tier=1
            ).count(),
            1,
        )

    def test_author_sees_all_tiers_without_revealing(self):
        client = APIClient()
        client.force_authenticate(self.author)
        resp = client.get(f"/api/v1/problems/problems/{self.problem.id}/")
        tiers = resp.json()["hint_state"]["tiers"]
        self.assertEqual(tiers[0]["content"], "nudge")
        self.assertEqual(tiers[0]["revealed"], False)

    def test_locale_fallback_to_ro(self):
        p = _problem(
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
            hints_ro=["romanian nudge"],
        )
        client = APIClient()
        client.force_authenticate(self.author)
        resp = client.get(f"/api/v1/problems/problems/{p.id}/")
        tiers = resp.json()["hint_state"]["tiers"]
        self.assertEqual(tiers[0]["content"], "romanian nudge")


class EditorialForfeitVisibilityTest(TestCase):
    def test_forfeit_opens_after_ac_editorial(self):
        author = User.objects.create_user(username="a", password="p")
        solver = User.objects.create_user(username="s", password="p")
        p = _problem(status=Problem.ProblemStatus.APPROVED, author=author)
        editorial = ProblemEditorial.objects.create(
            problem=p, content_en="Walkthrough.", publish_policy="AFTER_AC"
        )
        from problems.editorial_visibility import editorial_visible_to

        self.assertFalse(editorial_visible_to(editorial, solver))
        ProblemForfeit.objects.create(user=solver, problem=p)
        self.assertTrue(editorial_visible_to(editorial, solver))


class ScoreServiceTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.bob = User.objects.create_user(username="bob", password="p")
        self.problem = _problem(status=Problem.ProblemStatus.APPROVED)
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            points=60,
            order=1,
        )
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="j",
            expected_output_data="p",
            points=40,
            order=2,
        )

    def test_problem_point_value(self):
        self.assertEqual(problem_point_value(self.problem), 100)

    def test_partial_submission_earns_passed_points(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=60,
        )
        self.assertEqual(earned_points(self.alice.id, self.problem), 60)
        self.assertEqual(user_total_score(self.alice.id), 60)

    def test_best_attempt_counts(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=60,
        )
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=100,
        )
        self.assertEqual(user_total_score(self.alice.id), 100)

    def test_forfeit_excludes_points_forever(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=100,
        )
        ProblemForfeit.objects.create(user=self.alice, problem=self.problem)
        self.assertEqual(earned_points(self.alice.id, self.problem), 0)
        self.assertEqual(user_total_score(self.alice.id), 0)
        # The AC still happened — solve state stays honest.
        self.assertTrue(has_solved(self.alice.id, self.problem.id))

    def test_solved_and_attempted_facets(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        Submission.objects.create(
            user=self.bob,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
        )
        self.assertEqual(solved_problem_ids(self.alice.id), {self.problem.id})
        self.assertEqual(attempted_problem_ids(self.alice.id), set())
        self.assertEqual(solved_problem_ids(self.bob.id), set())
        self.assertEqual(attempted_problem_ids(self.bob.id), {self.problem.id})


class LeaderboardPartialCreditTest(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="p")
        self.problem = _problem(status=Problem.ProblemStatus.APPROVED)
        ProblemTestCase.objects.create(
            problem=self.problem,
            input_data="i",
            expected_output_data="o",
            points=30,
            order=1,
        )

    def test_partial_score_credits_leaderboard(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.WRONG_ANSWER,
            score=30,
        )
        entry = update_user_entry(self.alice.id)
        self.assertEqual(entry.total_points, 30)
        self.assertEqual(entry.solved_count, 0)

    def test_scoreless_ac_falls_back_to_full_points(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        entry = update_user_entry(self.alice.id)
        self.assertEqual(entry.total_points, 30)

    def test_forfeit_zeroes_points_keeps_solves(self):
        Submission.objects.create(
            user=self.alice,
            problem=self.problem,
            language="python3",
            code="pass",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=30,
        )
        ProblemForfeit.objects.create(user=self.alice, problem=self.problem)
        recompute_all_leaderboards()
        entry = LeaderboardEntry.objects.get(user=self.alice)
        self.assertEqual(entry.total_points, 0)
        self.assertEqual(entry.solved_count, 1)


class AuthoringDraftAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(username="d", password="p")
        self.client.force_authenticate(self.user)

    def test_requires_auth(self):
        resp = APIClient().get("/api/v1/problems/authoring-drafts/new/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_draft_404(self):
        resp = self.client.get("/api/v1/problems/authoring-drafts/new/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_put_get_delete_roundtrip(self):
        resp = self.client.put(
            "/api/v1/problems/authoring-drafts/new/",
            {"payload": {"statement": "hello"}},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK, resp.json())
        resp = self.client.get("/api/v1/problems/authoring-drafts/new/")
        self.assertEqual(resp.json()["payload"], {"statement": "hello"})
        resp = self.client.delete("/api/v1/problems/authoring-drafts/new/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(AuthoringDraft.objects.count(), 0)

    def test_problem_scoped_draft(self):
        p = _problem()
        self.client.put(
            f"/api/v1/problems/authoring-drafts/{p.id}/",
            {"payload": {"k": 1}},
            format="json",
        )
        other = APIClient()
        other.force_authenticate(User.objects.create_user(username="x", password="p"))
        self.assertEqual(
            other.get(f"/api/v1/problems/authoring-drafts/{p.id}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_bad_problem_404(self):
        resp = self.client.put(
            "/api/v1/problems/authoring-drafts/9999/", {"payload": {}}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_non_object_payload_400(self):
        resp = self.client.put(
            "/api/v1/problems/authoring-drafts/new/", {"payload": [1, 2]}, format="json"
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class AuthorAnalyticsHintsTest(TestCase):
    def test_hint_usage_aggregates(self):
        author = User.objects.create_user(username="an", password="p")
        p = _problem(author=author)
        reader = User.objects.create_user(username="r", password="p")
        HintReveal.objects.create(user=reader, problem=p, tier=1)
        HintReveal.objects.create(user=reader, problem=p, tier=2)
        data = author_analytics(author)
        self.assertEqual(data["hint_usage"], {"1": 1, "2": 1, "3": 0})
        self.assertEqual(data["hint_readers"], 1)
        self.assertEqual(
            data["by_difficulty"],
            {"VERY_EASY": 0, "EASY": 0, "MEDIUM": 0, "HARD": 0, "VERY_HARD": 0},
        )


class CoverageClosureTest(TestCase):
    """Remaining arcs for the 100% bar: legacy non-list hints, draft-slot
    404s on GET/DELETE, null-hints writes, second-solve max-arc in the
    per-user leaderboard reduction."""

    def test_hint_state_tolerates_legacy_non_list(self):
        author = User.objects.create_user(username="lg", password="p")
        p = _problem(status=Problem.ProblemStatus.APPROVED, author=author)
        p.hints_en = "just a string"  # legacy row written before the shape rule
        p.save()
        client = APIClient()
        client.force_authenticate(author)
        resp = client.get(f"/api/v1/problems/problems/{p.id}/")
        self.assertEqual(resp.json()["hint_state"]["total"], 0)

    def test_draft_get_bad_problem_404(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username="g", password="p"))
        resp = client.get("/api/v1/problems/authoring-drafts/9999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_delete_bad_problem_404(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username="g2", password="p"))
        resp = client.delete("/api/v1/problems/authoring-drafts/9999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_draft_delete_empty_slot_204(self):
        client = APIClient()
        client.force_authenticate(User.objects.create_user(username="g3", password="p"))
        resp = client.delete("/api/v1/problems/authoring-drafts/new/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)

    def test_null_hints_write_rejected_by_field(self):
        # The JSON field is non-nullable: DRF refuses null before the
        # shape validator runs (the null arm is therefore unreachable).
        client = APIClient()
        creator = User.objects.create_user(
            username="n", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        client.force_authenticate(creator)
        resp = client.post(
            "/api/v1/problems/problems/",
            {
                "title_i18n": {"en": "T"},
                "statement_i18n": {"en": "S"},
                "difficulty": "MEDIUM",
                "target_points": 100,
                "hints_en": None,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_hint_bad_entry_type_rejected(self):
        client = APIClient()
        creator = User.objects.create_user(
            username="n2", password="p", role=User.Roles.PROBLEM_CREATOR
        )
        client.force_authenticate(creator)
        resp = client.post(
            "/api/v1/problems/problems/",
            {
                "title_i18n": {"en": "T"},
                "statement_i18n": {"en": "S"},
                "difficulty": "MEDIUM",
                "target_points": 100,
                "hints_ro": [7],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_forfeit_skipped_in_per_user_recompute(self):
        user = User.objects.create_user(username="fq", password="p")
        p = _problem(status=Problem.ProblemStatus.APPROVED)
        ProblemTestCase.objects.create(
            problem=p, input_data="i", expected_output_data="o", points=10, order=1
        )
        Submission.objects.create(
            user=user,
            problem=p,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=10,
        )
        ProblemForfeit.objects.create(user=user, problem=p)
        entry = update_user_entry(user.id)
        self.assertEqual(entry.total_points, 0)
        self.assertEqual(entry.solved_count, 1)

    def test_second_solve_takes_max_first_ac(self):
        user = User.objects.create_user(username="mx", password="p")
        p1 = _problem(status=Problem.ProblemStatus.APPROVED)
        p2 = _problem(status=Problem.ProblemStatus.APPROVED)
        ProblemTestCase.objects.create(
            problem=p1, input_data="i", expected_output_data="o", points=10, order=1
        )
        ProblemTestCase.objects.create(
            problem=p2, input_data="i", expected_output_data="o", points=10, order=1
        )
        Submission.objects.create(
            user=user,
            problem=p1,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        Submission.objects.create(
            user=user,
            problem=p2,
            language="python3",
            code="x",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        entry = update_user_entry(user.id)
        self.assertEqual(entry.solved_count, 2)
        self.assertIsNotNone(entry.last_solved_at)
