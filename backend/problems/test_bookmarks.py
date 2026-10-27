"""Problem bookmarks (competitive roadmap UXP-6): toggle + id set."""

import pytest
from rest_framework.test import APIClient

from problems.bookmarks import ProblemStar
from problems.models import Problem
from users.models import User

pytestmark = pytest.mark.django_db


def make_problem(owner, status=Problem.ProblemStatus.APPROVED):
    return Problem.objects.create(
        title_i18n={"en": "P", "ro": "P"},
        statement_i18n={"en": "s", "ro": "s"},
        author=owner,
        status=status,
    )


@pytest.fixture
def creator():
    return User.objects.create_user(
        username="bm-author", password="pw-12345678", role=User.Roles.PROBLEM_CREATOR
    )


@pytest.fixture
def solver():
    return User.objects.create_user(username="bm-solver", password="pw-12345678")


class TestBookmarkToggle:
    def test_post_stars_idempotently(self, creator, solver):
        problem = make_problem(creator)
        client = APIClient()
        client.force_authenticate(user=solver)
        first = client.post(f"/api/v1/problems/problems/{problem.id}/bookmark/")
        second = client.post(f"/api/v1/problems/problems/{problem.id}/bookmark/")
        assert first.status_code == 200 and second.status_code == 200
        assert first.data["starred"] is True
        assert first.data["star_count"] == 1
        assert ProblemStar.objects.filter(user=solver, problem=problem).count() == 1

    def test_delete_unstars_idempotently(self, creator, solver):
        problem = make_problem(creator)
        ProblemStar.objects.create(user=solver, problem=problem)
        client = APIClient()
        client.force_authenticate(user=solver)
        first = client.delete(f"/api/v1/problems/problems/{problem.id}/bookmark/")
        second = client.delete(f"/api/v1/problems/problems/{problem.id}/bookmark/")
        assert first.status_code == 200 and second.status_code == 200
        assert first.data["starred"] is False
        assert first.data["star_count"] == 0

    def test_anonymous_cannot_star(self, creator):
        problem = make_problem(creator)
        response = APIClient().post(f"/api/v1/problems/problems/{problem.id}/bookmark/")
        assert response.status_code == 401

    def test_cannot_star_invisible_draft(self, creator, solver):
        draft = make_problem(creator, status=Problem.ProblemStatus.DRAFT)
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.post(f"/api/v1/problems/problems/{draft.id}/bookmark/")
        assert response.status_code == 404


class TestBookmarkedIds:
    def test_returns_requester_stars_only(self, creator, solver):
        one, two = make_problem(creator), make_problem(creator)
        other = User.objects.create_user(username="bm-other", password="pw-12345678")
        ProblemStar.objects.create(user=solver, problem=one)
        ProblemStar.objects.create(user=other, problem=two)
        client = APIClient()
        client.force_authenticate(user=solver)
        response = client.get("/api/v1/problems/problems/bookmarked/")
        assert response.status_code == 200
        assert response.data["starred_ids"] == [one.id]

    def test_anonymous_gets_empty_set(self):
        response = APIClient().get("/api/v1/problems/problems/bookmarked/")
        assert response.status_code == 200
        assert response.data["starred_ids"] == []


class TestProblemStarStr:
    def test_str_representation(self, creator, solver):
        problem = make_problem(creator)
        star = ProblemStar.objects.create(user=solver, problem=problem)
        assert "starred" in str(star)
