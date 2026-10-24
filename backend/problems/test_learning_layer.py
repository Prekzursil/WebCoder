"""Learning-layer tests (competitive roadmap Wave A): progressive hints
(EDT-2), editorial model with publish-policy gating (EDT-1/X2), per-problem
statistics (UXP-7/X9 core) and the satisfaction vote.
"""

import pytest
from django.urls import reverse
from rest_framework.test import APIClient

from problems.models import Problem, ProblemEditorial, ProblemRating
from submissions.models import Submission
from users.models import User

pytestmark = pytest.mark.django_db


def make_problem(**overrides):
    author = overrides.pop("author", None)
    if author is None:
        author = User.objects.create_user(
            username=f"author-{Problem.objects.count()}-{len(overrides)}",
            password="pw-12345678",
            role=User.Roles.PROBLEM_CREATOR,
        )
    defaults = dict(
        title_i18n={"en": "T", "ro": "T"},
        statement_i18n={"en": "S", "ro": "S"},
        difficulty=Problem.DifficultyLevel.EASY,
        status=Problem.ProblemStatus.APPROVED,
        author=author,
        hints_ro=["Indiciu 1", "Indiciu 2"],
        hints_en=["Hint 1", "Hint 2"],
    )
    defaults.update(overrides)
    return Problem.objects.create(**defaults)


def make_user(name, role=User.Roles.BASIC_USER):
    return User.objects.create_user(username=name, password="pw-12345678", role=role)


def make_submission(user, problem, verdict):
    return Submission.objects.create(
        user=user,
        problem=problem,
        language="python3",
        code="print(1)",
        verdict=verdict,
    )


class TestHintsField:
    def test_hints_roundtrip_on_detail(self):
        problem = make_problem()
        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/{problem.id}/")
        assert response.status_code == 200
        assert response.data["hints_en"] == ["Hint 1", "Hint 2"]
        assert response.data["hints_ro"] == ["Indiciu 1", "Indiciu 2"]

    def test_hints_writable_by_author(self):
        # Approved problems are edit-locked for authors (existing policy);
        # hints are edited on the author's own DRAFT like every other field.
        author = make_user("hint-author", User.Roles.PROBLEM_CREATOR)
        problem = make_problem(
            author=author,
            hints_ro=[],
            hints_en=[],
            status=Problem.ProblemStatus.DRAFT,
        )
        client = APIClient()
        client.force_authenticate(user=author)
        response = client.patch(
            f"/api/v1/problems/problems/{problem.id}/",
            {"hints_en": ["Step one"]},
            format="json",
        )
        assert response.status_code == 200
        problem.refresh_from_db()
        assert problem.hints_en == ["Step one"]


class TestEditorialGating:
    def _editorial(self, problem, policy, author=None):
        return ProblemEditorial.objects.create(
            problem=problem,
            content_en="## Approach\nGreedy.",
            content_ro="## Abordare\nGreedy.",
            publish_policy=policy,
            author=author or problem.author,
        )

    def test_no_editorial_returns_404(self):
        problem = make_problem()
        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 404

    def test_public_policy_visible_to_anonymous(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.PUBLIC)
        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 200
        assert response.data["content_en"].startswith("## Approach")

    def test_after_ac_locked_without_ac(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.AFTER_AC)
        solver = make_user("no-ac-yet")
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 403
        assert response.data["locked"] is True
        assert response.data["publish_policy"] == "AFTER_AC"

    def test_after_ac_unlocked_after_own_ac(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.AFTER_AC)
        solver = make_user("has-ac")
        make_submission(solver, problem, Submission.VerdictStatus.ACCEPTED)
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 200

    def test_after_ac_stays_locked_with_only_wa(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.AFTER_AC)
        solver = make_user("only-wa")
        make_submission(solver, problem, Submission.VerdictStatus.WRONG_ANSWER)
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 403

    def test_author_bypasses_after_ac(self):
        author = make_user("ed-author", User.Roles.PROBLEM_CREATOR)
        problem = make_problem(author=author)
        self._editorial(problem, ProblemEditorial.PublishPolicy.AFTER_AC, author)
        client = APIClient()
        client.force_authenticate(user=author)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 200

    def test_verifier_bypasses_manual(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.MANUAL)
        verifier = make_user("ed-verifier", User.Roles.PROBLEM_VERIFIER)
        client = APIClient()
        client.force_authenticate(user=verifier)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 200

    def test_manual_locked_for_regular_user_even_with_ac(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.MANUAL)
        solver = make_user("manual-solver")
        make_submission(solver, problem, Submission.VerdictStatus.ACCEPTED)
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 403

    def test_author_can_create_and_update_editorial(self):
        author = make_user("ed-writer", User.Roles.PROBLEM_CREATOR)
        problem = make_problem(author=author)
        client = APIClient()
        client.force_authenticate(user=author)
        response = client.put(
            f"/api/v1/problems/problems/{problem.id}/editorial/",
            {
                "content_en": "First version",
                "content_ro": "Prima versiune",
                "publish_policy": "AFTER_AC",
            },
            format="json",
        )
        assert response.status_code == 200
        editorial_id = response.data["problem"]

        response = client.patch(
            f"/api/v1/problems/problems/{problem.id}/editorial/",
            {"content_en": "Second version"},
            format="json",
        )
        assert response.status_code == 200
        assert ProblemEditorial.objects.filter(id__isnull=False).count() == 1
        editorial = ProblemEditorial.objects.get(problem=problem)
        assert editorial.content_en == "Second version"
        assert editorial_id == problem.id

    def test_non_author_cannot_write_editorial(self):
        problem = make_problem()
        intruder = make_user("ed-intruder", User.Roles.PROBLEM_CREATOR)
        client = APIClient()
        client.force_authenticate(user=intruder)
        response = client.put(
            f"/api/v1/problems/problems/{problem.id}/editorial/",
            {"content_en": "hijack"},
            format="json",
        )
        assert response.status_code == 403

    def test_anonymous_cannot_write_editorial(self):
        problem = make_problem()
        client = APIClient()
        response = client.put(
            f"/api/v1/problems/problems/{problem.id}/editorial/",
            {"content_en": "anon"},
            format="json",
        )
        assert response.status_code in (401, 403)

    def test_detail_serializer_flags_editorial_state(self):
        problem = make_problem()
        self._editorial(problem, ProblemEditorial.PublishPolicy.AFTER_AC)
        client = APIClient()
        # Anonymous: exists + locked.
        response = client.get(f"/api/v1/problems/problems/{problem.id}/")
        assert response.data["has_editorial"] is True
        assert response.data["editorial_locked"] is True
        # Solver with AC: exists + unlocked.
        solver = make_user("flag-solver")
        make_submission(solver, problem, Submission.VerdictStatus.ACCEPTED)
        client.force_authenticate(user=solver)
        response = client.get(f"/api/v1/problems/problems/{problem.id}/")
        assert response.data["has_editorial"] is True
        assert response.data["editorial_locked"] is False
        # Problem without editorial: no flag confusion.
        other = make_problem()
        response = client.get(f"/api/v1/problems/problems/{other.id}/")
        assert response.data["has_editorial"] is False
        assert response.data["editorial_locked"] is False


class TestProblemStatistics:
    def test_statistics_shape_and_math(self):
        problem = make_problem()
        alice = make_user("stat-alice")
        bob = make_user("stat-bob")
        make_submission(alice, problem, Submission.VerdictStatus.ACCEPTED)
        make_submission(alice, problem, Submission.VerdictStatus.WRONG_ANSWER)
        make_submission(bob, problem, Submission.VerdictStatus.WRONG_ANSWER)

        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/{problem.id}/statistics/")
        assert response.status_code == 200
        data = response.data
        assert data["tried"] == 3
        assert data["solved"] == 1  # distinct AC users
        assert data["acceptance_rate"] == round(1 / 3, 4)
        assert data["verdict_distribution"]["AC"] == 1
        assert data["verdict_distribution"]["WA"] == 2
        assert data["language_counts"]["python3"] == 3
        assert data["rating_avg"] is None
        assert data["rating_count"] == 0

    def test_statistics_empty_problem(self):
        problem = make_problem()
        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/{problem.id}/statistics/")
        assert response.status_code == 200
        assert response.data["acceptance_rate"] is None
        assert response.data["tried"] == 0


class TestProblemRating:
    def test_rate_requires_auth(self):
        problem = make_problem()
        client = APIClient()
        response = client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": 3}, format="json"
        )
        assert response.status_code in (401, 403)

    def test_rate_validates_range(self):
        problem = make_problem()
        user = make_user("rater-bad")
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": 4}, format="json"
        )
        assert response.status_code == 400

    def test_rate_string_value_accepted(self):
        problem = make_problem()
        user = make_user("rater-str")
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": "3"}, format="json"
        )
        assert response.status_code == 200
        assert response.data["your_rating"] == 3

    def test_revote_overwrites_and_aggregates(self):
        problem = make_problem()
        first = make_user("rater-1")
        second = make_user("rater-2")
        client = APIClient()

        client.force_authenticate(user=first)
        response = client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": 1}, format="json"
        )
        assert response.data == {"rating_avg": 1.0, "rating_count": 1, "your_rating": 1}

        client.force_authenticate(user=second)
        client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": 3}, format="json"
        )
        # first re-votes 2: one row per user, aggregate reflects the update
        client.force_authenticate(user=first)
        response = client.post(
            f"/api/v1/problems/problems/{problem.id}/rate/", {"rating": 2}, format="json"
        )
        assert response.data["rating_count"] == 2
        assert response.data["rating_avg"] == 2.5
        assert ProblemRating.objects.filter(problem=problem).count() == 2
        # statistics endpoint surfaces the aggregate too
        stats = APIClient().get(f"/api/v1/problems/problems/{problem.id}/statistics/")
        assert stats.data["rating_avg"] == 2.5


class TestHelperUnits:
    """Direct unit coverage for the gating helpers and model __str__s."""

    def test_editorial_str(self):
        problem = make_problem()
        editorial = ProblemEditorial.objects.create(
            problem=problem,
            content_en="x",
            publish_policy=ProblemEditorial.PublishPolicy.MANUAL,
        )
        assert str(editorial) == f"Editorial for {problem.id} (MANUAL)"

    def test_rating_str(self):
        problem = make_problem()
        user = make_user("str-rater")
        rating = ProblemRating.objects.create(user=user, problem=problem, rating=2)
        assert str(rating) == f"{user.id} rated problem {problem.id}: 2"

    def test_manage_editorial_rejects_none_and_anonymous(self):
        from problems.views import user_can_manage_editorial

        problem = make_problem()
        assert user_can_manage_editorial(None, problem) is False

        class _Anon:
            is_authenticated = False

        assert user_can_manage_editorial(_Anon(), problem) is False

    def test_authenticated_non_staff_public_editorial_visible(self):
        # The PUBLIC-with-authenticated-non-staff branch of the gate.
        problem = make_problem()
        ProblemEditorial.objects.create(
            problem=problem,
            content_en="open",
            publish_policy=ProblemEditorial.PublishPolicy.PUBLIC,
        )
        client = APIClient()
        client.force_authenticate(user=make_user("public-reader"))
        response = client.get(f"/api/v1/problems/problems/{problem.id}/editorial/")
        assert response.status_code == 200


class TestVerifierWritesEditorial:
    def test_verifier_can_write_editorial_on_any_problem(self):
        # The staff branch of user_can_manage_editorial (verifiers/admins may
        # author or fix editorials on problems they do not own).
        problem = make_problem()
        verifier = make_user("ed-staff", User.Roles.PROBLEM_VERIFIER)
        client = APIClient()
        client.force_authenticate(user=verifier)
        response = client.put(
            f"/api/v1/problems/problems/{problem.id}/editorial/",
            {"content_en": "staff version", "publish_policy": "PUBLIC"},
            format="json",
        )
        assert response.status_code == 200
        problem.editorial.refresh_from_db()
        assert problem.editorial.content_en == "staff version"
        assert problem.editorial.author == verifier
