"""ANA-1 completion (Wave D): weekly owner snapshots, the history
endpoint, and the beat task — on top of Wave A's live activation view."""

from datetime import datetime, timedelta, timezone as dt_timezone

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from problems.models import Problem
from submissions.models import Submission
from users.analytics import (
    activation_snapshot,
    capture_weekly_snapshot,
    iso_week_key,
    weekly_history,
)
from users.models import OwnerWeeklySnapshot, User
from users.tasks import snapshot_owner_metrics_task


def _iso_key(dt) -> str:
    year, week, _day = dt.isocalendar()
    return f"{year}-W{week:02d}"


class IsoWeekKeyTest(TestCase):
    def test_matches_isocalendar_format(self):
        at = datetime(2026, 10, 26, 12, tzinfo=dt_timezone.utc)  # a Monday
        self.assertEqual(iso_week_key(at), _iso_key(at))
        self.assertRegex(iso_week_key(at), r"^\d{4}-W\d{2}$")

    def test_default_uses_now(self):
        now_key = iso_week_key()
        self.assertEqual(now_key, iso_week_key())


class CaptureWeeklySnapshotTest(TestCase):
    def test_capture_creates_row_with_live_payload(self):
        user = User.objects.create_user(username="u1", password="pw-123456")
        problem = Problem.objects.create(
            title_i18n={"en": "P"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
        )
        Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code="print(1)",
            verdict=Submission.VerdictStatus.ACCEPTED,
        )
        snapshot = capture_weekly_snapshot()
        self.assertEqual(snapshot.week, iso_week_key())
        self.assertEqual(str(snapshot), f"owner metrics {snapshot.week}")
        self.assertEqual(snapshot.payload["total_users"], activation_snapshot()["total_users"])
        self.assertEqual(snapshot.payload["users_with_ac"], 1)

    def test_recapture_same_week_overwrites(self):
        first = capture_weekly_snapshot()
        second = capture_weekly_snapshot()
        self.assertEqual(first.week, second.week)
        self.assertEqual(OwnerWeeklySnapshot.objects.count(), 1)

    def test_history_orders_oldest_first_and_caps(self):
        now = datetime.now(dt_timezone.utc)
        for i in range(4):
            at = now - timedelta(weeks=i)
            OwnerWeeklySnapshot.objects.create(
                week=_iso_key(at), payload={"total_users": i}
            )
        history = weekly_history(3)
        self.assertEqual(len(history), 3)
        weeks = [row["week"] for row in history]
        self.assertEqual(weeks, sorted(weeks))
        # Payload keys merge into the row (the dashboard reads them flat).
        self.assertIn("total_users", history[0])


class SnapshotTaskTest(TestCase):
    def test_task_captures_and_reports_week(self):
        result = snapshot_owner_metrics_task()
        self.assertIn("owner metrics captured for", result)
        self.assertEqual(OwnerWeeklySnapshot.objects.count(), 1)

    def test_schedule_wires_the_task(self):
        from django.conf import settings

        entry = settings.CELERY_BEAT_SCHEDULE.get("owner-weekly-metrics")
        self.assertIsNotNone(entry)
        self.assertEqual(entry["task"], "users.tasks.snapshot_owner_metrics_task")
        self.assertEqual(entry["schedule"].day_of_week, {1})  # Mondays


class ActivationHistoryAPITest(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw-123456", role=User.Roles.ADMIN
        )
        self.admin.is_staff = True
        self.admin.save()
        self.client = APIClient()

    def test_admin_reads_history(self):
        capture_weekly_snapshot()
        self.client.force_authenticate(user=self.admin)
        response = self.client.get("/api/v1/users/admin/activation/history/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["weeks"], 12)
        self.assertEqual(len(response.data["history"]), 1)
        self.assertEqual(response.data["history"][0]["week"], iso_week_key())

    def test_weeks_param_clamped(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(
            "/api/v1/users/admin/activation/history/?weeks=999"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["weeks"], 52)
        response = self.client.get("/api/v1/users/admin/activation/history/?weeks=0")
        self.assertEqual(response.data["weeks"], 1)
        response = self.client.get("/api/v1/users/admin/activation/history/?weeks=abc")
        self.assertEqual(response.data["weeks"], 12)

    def test_non_admin_forbidden(self):
        basic = User.objects.create_user(username="basic", password="pw-123456")
        self.client.force_authenticate(user=basic)
        response = self.client.get("/api/v1/users/admin/activation/history/")
        self.assertEqual(response.status_code, 403)

    def test_anonymous_unauthorized(self):
        response = self.client.get("/api/v1/users/admin/activation/history/")
        self.assertEqual(response.status_code, 401)
