"""Wave A user-feature tests: B5 statistics + RAT-4/5/6 gamification,
F5 solved-ids, LEG-1 account export/soft-delete/purge, ANA-1 analytics.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APIClient

import pytest

from forum.models import Post, Thread
from problems.models import Problem
from scratch.models import ScratchRun
from submissions.models import Submission
from users.account import (
    PURGE_DELAY_DAYS,
    build_account_export,
    purge_deleted_users,
    soft_delete_account,
)
from users.analytics import activation_snapshot
from users.models import User
from users.statistics import (
    _streaks,
    ladder_state,
    level_for_points,
    points_for_level,
    user_statistics,
)

pytestmark = pytest.mark.django_db


def make_problem(difficulty=Problem.DifficultyLevel.EASY, title="P"):
    author = User.objects.create_user(
        username=f"author-{Problem.objects.count()}-{title}",
        password="pw-12345678",
        role=User.Roles.PROBLEM_CREATOR,
    )
    return Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "s", "ro": "s"},
        author=author,
        status=Problem.ProblemStatus.APPROVED,
        difficulty=difficulty,
    )


def make_sub(user, problem, verdict, language="python3", when=None):
    sub = Submission.objects.create(
        user=user,
        problem=problem,
        language=language,
        code="print(1)",
        verdict=verdict,
    )
    if when is not None:
        Submission.objects.filter(id=sub.id).update(submission_time=when)
    return sub


class TestLadderMath:
    def test_thresholds(self):
        assert [points_for_level(n) for n in (1, 2, 3, 4, 5)] == [0, 10, 30, 70, 150]

    def test_level_for_points(self):
        assert level_for_points(0) == 1
        assert level_for_points(10) == 2
        assert level_for_points(29) == 2
        assert level_for_points(30) == 3
        assert level_for_points(1000) == 7

    def test_ladder_state_progress(self):
        # L2 spans [10, 30): 20 points sits halfway through level 2.
        state = ladder_state(20)
        assert state["level"] == 2
        assert state["next_level_points"] == 30
        assert 0 < state["progress"] < 1
        assert state["progress"] == 0.5


class TestStreaks:
    def test_empty(self):
        assert _streaks([]) == (0, 0, 0)

    def test_today_counts(self):
        today = timezone.now().date()
        assert _streaks([today]) == (1, 1, 1)

    def test_gap_resets_current(self):
        today = timezone.now().date()
        dates = [
            today - timedelta(days=5),
            today - timedelta(days=4),
            today - timedelta(days=3),
        ]
        assert _streaks(dates) == (0, 3, 3)

    def test_yesterday_keeps_streak_alive(self):
        yesterday = timezone.now().date() - timedelta(days=1)
        dates = [yesterday - timedelta(days=1), yesterday]
        current, max_streak, total = _streaks(dates)
        assert current == 2
        assert max_streak == 2
        assert total == 2


class TestUserStatistics:
    def test_statistics_payload(self):
        user = User.objects.create_user(username="stat-u", password="pw-12345678")
        easy = make_problem(Problem.DifficultyLevel.EASY, "E1")
        medium = make_problem(Problem.DifficultyLevel.MEDIUM, "M1")
        make_sub(user, easy, Submission.VerdictStatus.ACCEPTED)
        make_sub(user, easy, Submission.VerdictStatus.WRONG_ANSWER)
        make_sub(user, medium, Submission.VerdictStatus.WRONG_ANSWER)
        payload = user_statistics(user)
        assert payload["solved"] == 1
        assert payload["attempted"] == 2
        assert payload["total_submissions"] == 3
        assert payload["acceptance_rate"] == 0.5
        assert payload["per_difficulty"]["EASY"]["solved"] == 1
        assert payload["per_difficulty"]["MEDIUM"]["attempted"] == 1
        assert payload["per_language"]["python3"] == 3
        assert payload["current_streak"] >= 1
        assert payload["ladder"]["points"] == 1  # one EASY solve
        assert payload["badges"] == ["first_ac"]

    def test_badges_and_ladder_weights(self):
        user = User.objects.create_user(username="stat-v", password="pw-12345678")
        for i in range(10):
            make_sub(
                user,
                make_problem(Problem.DifficultyLevel.MEDIUM, f"M{i}"),
                Submission.VerdictStatus.ACCEPTED,
            )
        payload = user_statistics(user)
        assert payload["ladder"]["points"] == 30  # 10 × medium(3)
        assert set(payload["badges"]) == {"first_ac", "solved_10"}

    def test_polyglot_badge(self):
        user = User.objects.create_user(username="stat-w", password="pw-12345678")
        problem = make_problem(title="poly")
        for language in ("python3", "cpp17", "c11"):
            make_sub(
                user, problem, Submission.VerdictStatus.ACCEPTED, language=language
            )
        assert "polyglot_3" in user_statistics(user)["badges"]


class TestStatisticsEndpoints:
    def test_statistics_requires_auth(self):
        assert APIClient().get("/api/v1/users/me/statistics/").status_code == 401

    def test_statistics_endpoint(self):
        user = User.objects.create_user(username="ep-u", password="pw-12345678")
        make_sub(user, make_problem(title="ep1"), Submission.VerdictStatus.ACCEPTED)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get("/api/v1/users/me/statistics/")
        assert response.status_code == 200
        assert response.data["solved"] == 1
        assert response.data["badges"] == ["first_ac"]

    def test_solved_ids_endpoint(self):
        user = User.objects.create_user(username="ep-v", password="pw-12345678")
        solved_p, wa_p = make_problem(title="sid1"), make_problem(title="sid2")
        make_sub(user, solved_p, Submission.VerdictStatus.ACCEPTED)
        make_sub(user, wa_p, Submission.VerdictStatus.WRONG_ANSWER)
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.get("/api/v1/users/me/solved-ids/")
        assert response.status_code == 200
        assert response.data["solved"] == [solved_p.id]
        assert response.data["attempted"] == [wa_p.id]


class TestAccountControl:
    def _user_with_content(self):
        user = User.objects.create_user(
            username="gdpr-u", password="pw-12345678", email="gdpr@example.com"
        )
        problem = make_problem(title="gdpr-p")
        make_sub(user, problem, Submission.VerdictStatus.ACCEPTED)
        ScratchRun.objects.create(user=user, language="python3", source_code="print(1)")
        thread = Thread.objects.create(title="T", author=user)
        Post.objects.create(thread=thread, author=user, content="hello")
        return user, problem

    def test_export_contains_everything(self):
        user, problem = self._user_with_content()
        payload = build_account_export(user)
        assert payload["profile"]["email"] == "gdpr@example.com"
        assert len(payload["submissions"]) == 1
        assert payload["submissions"][0]["problem_id"] == problem.id
        assert payload["submissions"][0]["code"] == "print(1)"
        assert len(payload["forum_posts"]) == 1
        assert len(payload["scratch_runs"]) == 1

    def test_export_endpoint_returns_attachment(self):
        user, _ = self._user_with_content()
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post("/api/v1/users/me/export/")
        assert response.status_code == 200
        assert "attachment" in response.headers["Content-Disposition"]

    def test_delete_requires_confirmation(self):
        user, _ = self._user_with_content()
        client = APIClient()
        client.force_authenticate(user=user)
        assert client.post("/api/v1/users/me/delete/", {}).status_code == 400

    def test_soft_delete_anonymizes_and_schedules_purge(self):
        user, _ = self._user_with_content()
        soft_delete_account(user)
        user.refresh_from_db()
        assert user.is_active is False
        assert user.email == ""
        assert user.username == f"deleted_user_{user.id}"
        assert user.scheduled_purge_at is not None
        assert user.scheduled_purge_at > timezone.now() + timedelta(
            days=PURGE_DELAY_DAYS - 1
        )

    def test_purge_removes_side_content_keeps_submissions(self):
        user, problem = self._user_with_content()
        soft_delete_account(user)
        # not due yet
        assert purge_deleted_users() == 0
        assert ScratchRun.objects.filter(user=user).exists()
        # force due
        User.objects.filter(id=user.id).update(
            scheduled_purge_at=timezone.now() - timedelta(days=1)
        )
        assert purge_deleted_users() == 1
        assert not ScratchRun.objects.filter(user_id=user.id).exists()
        assert Submission.objects.filter(user_id=user.id).count() == 1
        assert Post.objects.filter(author_id=user.id, is_hidden=True).exists()


class TestActivationMetrics:
    def test_activation_snapshot(self):
        activated = User.objects.create_user(username="act-1", password="pw-12345678")
        activated.date_joined = timezone.now() - timedelta(days=2)
        activated.save()
        make_sub(
            activated,
            make_problem(title="actp"),
            Submission.VerdictStatus.ACCEPTED,
            when=timezone.now() - timedelta(days=1),
        )
        User.objects.create_user(username="act-2", password="pw-12345678")  # dormant
        snapshot = activation_snapshot()
        assert snapshot["total_users"] >= 2
        assert snapshot["users_with_submission"] >= 1
        assert snapshot["users_with_ac"] >= 1
        assert snapshot["d7_active"] >= 1
        assert snapshot["submissions_per_day_30d"]

    def test_endpoint_admin_only(self):
        admin = User.objects.create_user(
            username="admin-m", password="pw-12345678", is_staff=True
        )
        basic = User.objects.create_user(username="basic-m", password="pw-12345678")
        admin_client = APIClient()
        admin_client.force_authenticate(user=admin)
        basic_client = APIClient()
        basic_client.force_authenticate(user=basic)
        assert admin_client.get("/api/v1/users/admin/activation/").status_code == 200
        assert basic_client.get("/api/v1/users/admin/activation/").status_code == 403


class TestCoverageCompletions:
    """Targeted completions for 100% line coverage of the new modules."""

    def test_streak_gap_resets_running_streak(self):
        # [statistics.py line 78] the else branch: a gap mid-window resets
        # the running streak to 1 while max_streak keeps the best run.
        today = timezone.now().date()
        dates = [
            today - timedelta(days=9),
            today - timedelta(days=8),
            today - timedelta(days=7),
            today - timedelta(days=6),  # run of 4
            today - timedelta(days=3),  # gap → streak restarts at 1
        ]
        current, max_streak, total = _streaks(dates)
        assert max_streak == 4
        assert current == 0  # last day is 3 days ago
        assert total == 5

    def test_solved_50_and_streak_7_badges(self):
        user = User.objects.create_user(username="cover-u", password="pw-12345678")
        # 50 solves spread over the last 7 distinct days → max_streak 7.
        for i in range(50):
            day_offset = 6 - (i % 7)
            make_sub(
                user,
                make_problem(Problem.DifficultyLevel.EASY, f"C{i}"),
                Submission.VerdictStatus.ACCEPTED,
                when=timezone.now() - timedelta(days=day_offset),
            )
        payload = user_statistics(user)
        assert "solved_50" in payload["badges"]
        assert "streak_7" in payload["badges"]

    def test_purge_task_runs(self):
        from users.tasks import purge_deleted_users_task

        user, _ = TestAccountControl()._user_with_content()
        soft_delete_account(user)
        User.objects.filter(id=user.id).update(
            scheduled_purge_at=timezone.now() - timedelta(days=1)
        )
        result = purge_deleted_users_task.run()
        assert "purged 1" in result


class TestMultiLanguageDedup:
    """Live-validation regression: AC-ing one problem in three languages is
    ONE solve, one ladder weight, one per-difficulty count — not three."""

    def test_same_problem_multiple_languages_counts_once(self):
        user = User.objects.create_user(username="dedup-u", password="pw-12345678")
        problem = make_problem(Problem.DifficultyLevel.EASY, "Dedup")
        for language in ("python3", "cpp17", "c11"):
            make_sub(
                user, problem, Submission.VerdictStatus.ACCEPTED, language=language
            )
        payload = user_statistics(user)
        assert payload["solved"] == 1
        assert payload["per_difficulty"]["EASY"]["solved"] == 1
        assert payload["ladder"]["points"] == 1
        # Polyglot still sees all three languages.
        assert "polyglot_3" in payload["badges"]
        assert payload["per_language"] == {"python3": 1, "cpp17": 1, "c11": 1}


class TestCoverageClosure:
    """Single-branch 100% gate (2026-10-27): zero-solved badges, account
    delete success path, and multi-user activation funnel arms."""

    def test_statistics_badges_empty_without_solved(self):
        user = User.objects.create_user(username="cc-zero", password="pw-12345678")
        make_sub(user, make_problem(title="ccw"), Submission.VerdictStatus.WRONG_ANSWER)
        stats = user_statistics(user)
        assert stats["solved"] == 0
        assert stats["badges"] == []

    def test_account_delete_success_path(self):
        user = User.objects.create_user(username="cc-del", password="pw-12345678")
        client = APIClient()
        client.force_authenticate(user=user)
        response = client.post("/api/v1/users/me/delete/", {"confirm": "DELETE"})
        assert response.status_code == 200
        user.refresh_from_db()
        assert not user.is_active

    def test_activation_snapshot_d1_d7_arms(self):
        now = timezone.now()
        day = timedelta(days=1)

        def joined_and_first(delta_join, delta_first, name):
            u = User.objects.create_user(username=name, password="pw-12345678")
            User.objects.filter(id=u.id).update(date_joined=now - delta_join)
            make_sub(
                u,
                make_problem(title=f"ccan-{name}"),
                Submission.VerdictStatus.ACCEPTED,
                when=now - delta_first,
            )
            return u

        joined_and_first(day, day, "cc-d1")  # day-0/1 bucket
        joined_and_first(timedelta(days=10), timedelta(days=3), "cc-d7")  # 1<d<=7
        joined_and_first(timedelta(days=30), timedelta(days=20), "cc-old")  # >7

        snapshot = activation_snapshot()
        assert snapshot["d1_active"] == 1
        assert snapshot["d7_active"] == 2
