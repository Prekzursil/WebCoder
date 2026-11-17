"""Wave E items 36/37/38/40 — the drill deck.

- read-the-code + complexity drills: option answers with explanation
  reveal; fill-the-line micro drills: normalized text answers;
- the daily warmup: deterministic per day, one drill per kind;
- the endpoints: deck list (no answers leak), answer check (auth),
  daily set (public).
"""

import io
from datetime import date, timedelta
from unittest import mock

from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient
from users.models import User

from .drills import SEED_DRILLS, check_answer, daily_drills, normalize_answer
from .models import Drill


def _seed():
    call_command("seed_problems", stdout=io.StringIO())


class DrillCheckingTest(TestCase):
    """The answer rules for all three kinds."""

    @classmethod
    def setUpTestData(cls):
        _seed()

    def test_seed_creates_the_deck(self):
        self.assertEqual(Drill.objects.count(), len(SEED_DRILLS))
        kinds = set(Drill.objects.values_list("kind", flat=True))
        self.assertEqual(kinds, {"READ_CODE", "COMPLEXITY", "MICRO"})
        # No payload carries an answer into a list endpoint (checked via
        # the payload keys the view exposes — see DrillsViewTest).
        for spec in SEED_DRILLS:
            self.assertIn("question_ro", spec["payload"])
            self.assertIn("question_en", spec["payload"])

    def test_choice_answers(self):
        drill = Drill.objects.filter(kind="READ_CODE").first()
        answer = drill.payload["answer"]
        ok, err = check_answer(drill, answer)
        self.assertTrue(ok)
        self.assertIsNone(err)
        wrong = (answer + 1) % len(drill.payload["options_en"])
        ok, _ = check_answer(drill, wrong)
        self.assertFalse(ok)
        ok, err = check_answer(drill, "not-a-number")
        self.assertFalse(ok)
        self.assertEqual(err, "bad_index")

    def test_micro_answers_normalize(self):
        self.assertEqual(normalize_answer("  total += x ; "), "total += x")
        drill = Drill.objects.filter(kind="MICRO").first()
        accepted = drill.payload["accepted"][0]
        padded = f"  {accepted}  "
        ok, err = check_answer(drill, padded)
        self.assertTrue(ok)
        self.assertIsNone(err)
        ok, err = check_answer(drill, "  ")
        self.assertFalse(ok)
        self.assertEqual(err, "empty")

    def test_defensive_arms(self):
        # An unknown kind checks as bad_kind; an empty pool day simply
        # skips that kind; the model __str__ renders.
        unknown = mock.Mock(kind="WEIRD", payload={})
        ok, err = check_answer(unknown, 0)
        self.assertFalse(ok)
        self.assertEqual(err, "bad_kind")
        drill = Drill.objects.first()
        self.assertIn(drill.kind, str(drill))
        with mock.patch.object(Drill.objects, "filter", return_value=[]):
            self.assertEqual(daily_drills(date(2026, 11, 17)), [])

    def test_daily_deterministic_and_rotating(self):
        today = daily_drills(date(2026, 11, 17))
        again = daily_drills(date(2026, 11, 17))
        self.assertEqual([d.id for d in today], [d.id for d in again])
        self.assertEqual(len({d.kind for d in today}), len(today))
        # Over a week every kind still appears once per day.
        for offset in range(7):
            day = date(2026, 11, 17) + timedelta(days=offset)
            picks = daily_drills(day)
            self.assertEqual(len(picks), 3)


class DrillsEndpointTest(TestCase):
    """The three endpoints' contracts."""

    @classmethod
    def setUpTestData(cls):
        _seed()
        cls.user = User.objects.create_user(username="u", password="p")

    def test_deck_lists_without_answers(self):
        client = APIClient()
        response = client.get("/api/v1/learning/drills/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], len(SEED_DRILLS))
        row = response.data["results"][0]
        self.assertNotIn("answer", row)
        self.assertNotIn("accepted", row)
        filtered = client.get("/api/v1/learning/drills/?kind=MICRO")
        self.assertEqual(filtered.data["count"], 3)
        self.assertTrue(all(r["kind"] == "MICRO" for r in filtered.data["results"]))

    def test_answer_endpoint_reveals_on_correct(self):
        client = APIClient()
        client.force_authenticate(user=self.user)
        drill = Drill.objects.filter(kind="READ_CODE").first()
        response = client.post(
            f"/api/v1/learning/drills/{drill.id}/answer/",
            {"answer": drill.payload["answer"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["correct"])
        self.assertTrue(response.data["explanation_en"])
        # Wrong: no explanation leak.
        response = client.post(
            f"/api/v1/learning/drills/{drill.id}/answer/",
            {"answer": -1},
            format="json",
        )
        self.assertFalse(response.data["correct"])
        self.assertEqual(response.data["error"], "bad_index")
        self.assertEqual(response.data["explanation_en"], "")

    def test_answer_requires_auth_and_unknown_404(self):
        client = APIClient()
        drill = Drill.objects.first()
        self.assertEqual(
            client.post(
                f"/api/v1/learning/drills/{drill.id}/answer/",
                {"answer": 0},
                format="json",
            ).status_code,
            401,
        )
        client.force_authenticate(user=self.user)
        self.assertEqual(
            client.post(
                "/api/v1/learning/drills/999999/answer/", {"answer": 0}, format="json"
            ).status_code,
            404,
        )

    def test_daily_endpoint_shape(self):
        client = APIClient()
        with mock.patch("learning.drills.date") as date_mock:
            date_mock.today.return_value = date(2026, 11, 17)
            response = client.get("/api/v1/learning/drills/daily/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 3)
        kinds = {row["kind"] for row in response.data["results"]}
        self.assertEqual(kinds, {"READ_CODE", "COMPLEXITY", "MICRO"})
