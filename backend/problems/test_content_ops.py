"""Wave F — content-ops tests (items 125/129/131/132/133).

Full versioning/changelog + restore, saved catalog searches, scheduled
content drops, author analytics and the testcase-bounty economy.
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from problems.content_ops import (
    author_analytics,
    problem_changelog,
    restore_revision,
    upcoming_drops,
)
from problems.models import Problem, SavedSearch, StatementRevision, ProblemBounty
from submissions.models import Submission
from users.models import User


class OpsBase(TestCase):
    def setUp(self):
        self.author = User.objects.create_user(
            username="author", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.verifier = User.objects.create_user(
            username="verifier", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.basic = User.objects.create_user(username="basic", password="pw")
        self.helper = User.objects.create_user(username="helper", password="pw")
        self.client = APIClient()
        self.now = timezone.now()
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "v1", "ro": "v1"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
        )
        StatementRevision.objects.create(
            problem=self.problem,
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "v1", "ro": "v1"},
            edited_by=self.author,
            note="initial",
        )


class ChangelogTests(OpsBase):
    def test_changelog_feed_and_restore(self):
        # A statement edit appends a revision...
        self.problem.statement_i18n = {"en": "v2", "ro": "v2"}
        self.problem.save()
        from problems.revisions import record_revision

        record_revision(self.problem, edited_by=self.author, note="clarify")
        self.assertEqual(len(problem_changelog(self.problem)), 2)
        # ...and restore rolls the public statement back to v1.
        first = (
            StatementRevision.objects.filter(problem=self.problem)
            .order_by("created_at")
            .first()
        )
        ok, message = restore_revision(self.problem, first.id, self.verifier)
        self.assertTrue(ok, message)
        self.problem.refresh_from_db()
        self.assertEqual(self.problem.statement_i18n["en"], "v1")
        # The restore itself is a new ledger row (append-only).
        self.assertEqual(len(problem_changelog(self.problem)), 3)
        self.assertIn("restored", problem_changelog(self.problem)[0]["note"])

    def test_restore_view_gates(self):
        first = StatementRevision.objects.filter(problem=self.problem).first()
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/revisions/{first.id}/restore/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_bounty_list_unknown_problem(self):
        self.client.force_authenticate(self.basic)
        response = self.client.get("/api/v1/problems/problems/999/bounties/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_restore_unknown_revision(self):
        ok, message = restore_revision(self.problem, 9999, self.author)
        self.assertFalse(ok)

    def test_endpoint_gate_and_flow(self):
        self.client.force_authenticate(self.basic)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/changelog/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.verifier)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/changelog/"
        )
        self.assertEqual(response.status_code, 200)
        self.client.force_authenticate(self.author)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/changelog/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        first = StatementRevision.objects.filter(problem=self.problem).first()
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/revisions/{first.id}/restore/"
        )
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/revisions/999/restore/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.get("/api/v1/problems/problems/999/changelog/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post(
            "/api/v1/problems/problems/999/revisions/1/restore/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DropTests(OpsBase):
    def test_catalog_hides_future_drops(self):
        future = Problem.objects.create(
            title_i18n={"en": "Drop"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
            publish_at=self.now + timedelta(days=2),
        )
        response = self.client.get("/api/v1/problems/problems/")
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(self.problem.id, ids)
        self.assertNotIn(future.id, ids)
        # The author still sees their own scheduled problem.
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/problems/problems/")
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(future.id, ids)
        # So does the verifier (the calendar view needs it).
        self.client.force_authenticate(self.verifier)
        response = self.client.get("/api/v1/problems/problems/")
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(future.id, ids)
        # Past-dated drops are visible.
        Problem.objects.filter(pk=future.id).update(
            publish_at=self.now - timedelta(hours=1)
        )
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/problems/problems/")
        ids = [row["id"] for row in response.data["results"]]
        self.assertIn(future.id, ids)

    def test_calendar_endpoint(self):
        Problem.objects.create(
            title_i18n={"en": "Drop"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            publish_at=self.now + timedelta(days=2),
        )
        self.assertEqual(len(upcoming_drops()), 1)
        self.assertEqual(upcoming_drops()[0]["title"], "Drop")
        self.client.force_authenticate(self.basic)
        response = self.client.get("/api/v1/problems/drops/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/problems/drops/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)


class SavedSearchTests(OpsBase):
    def test_crud_roundtrip(self):
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            "/api/v1/problems/searches/",
            {"name": "Easy graphs", "params": {"difficulty": "EASY", "tag": "graphs"}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        # Same name again -> update (200), not a duplicate.
        response = self.client.post(
            "/api/v1/problems/searches/",
            {"name": "Easy graphs", "params": {"difficulty": "EASY"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        listing = self.client.get("/api/v1/problems/searches/")
        self.assertEqual(listing.data["count"], 1)
        row_id = listing.data["results"][0]["id"]
        response = self.client.delete(f"/api/v1/problems/searches/?id={row_id}")
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(SavedSearch.objects.count(), 0)

    def test_delete_scoped_and_404(self):
        SavedSearch.objects.create(
            user=self.basic, name="mine", params={"difficulty": "EASY"}
        )
        other = SavedSearch.objects.create(
            user=self.author, name="theirs", params={"difficulty": "HARD"}
        )
        self.client.force_authenticate(self.basic)
        response = self.client.delete(f"/api/v1/problems/searches/?id={other.id}")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.delete("/api/v1/problems/searches/?id=999")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.delete("/api/v1/problems/searches/?id=abc")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(SavedSearch.objects.filter(pk=other.pk).exists())
        # Anonymous listing refuses.
        self.client.force_authenticate(None)
        response = self.client.get("/api/v1/problems/searches/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AuthorAnalyticsTests(OpsBase):
    def test_derivation(self):
        # The loop's skip branch: an approved problem with an unmapped
        # difficulty label must not KeyError the derivation.
        Problem.objects.create(
            title_i18n={"en": "Weird"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.author,
            difficulty="EXTREME",
        )
        self.problem.difficulty = "EASY"
        self.problem.save()
        other = Problem.objects.create(
            title_i18n={"en": "Other"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.DRAFT,
            author=self.author,
            difficulty="HARD",
        )
        for user, verdict in (
            (self.basic, "AC"),
            (self.helper, "WA"),
            (self.helper, "AC"),
        ):
            Submission.objects.create(
                user=user,
                problem=self.problem if verdict != "SKIP" else other,
                language="python3",
                code="1",
                verdict=verdict,
                score=100 if verdict == "AC" else 0,
            )
        ProblemBounty.objects.create(
            problem=self.problem,
            requester=self.basic,
            points=50,
            description="stress tests please",
        )
        profile = author_analytics(self.author)
        self.assertEqual(profile["problems_total"], 3)
        self.assertEqual(profile["problems_approved"], 2)
        self.assertEqual(profile["by_difficulty"]["EASY"], 1)
        self.assertNotIn("EXTREME", profile["by_difficulty"])
        self.assertEqual(profile["submissions_total"], 3)
        self.assertEqual(profile["acceptance_rate"], 66.7)
        self.assertEqual(profile["unique_solvers"], 2)
        self.assertEqual(profile["open_test_bounties"], 1)

    def test_endpoint(self):
        self.client.force_authenticate(self.author)
        response = self.client.get("/api/v1/problems/author-analytics/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertIn("acceptance_rate", response.data)
        # Another user's analytics requires the authoring gate.
        response = self.client.get("/api/v1/problems/author-analytics/?username=basic")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.admin)
        response = self.client.get("/api/v1/problems/author-analytics/?username=basic")
        self.assertEqual(response.status_code, 200)
        response = self.client.get("/api/v1/problems/author-analytics/?username=ghost")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class BountyTests(OpsBase):
    def _post_bounty(self, points=50, description="stress tests please"):
        self.client.force_authenticate(self.basic)
        return self.client.post(
            f"/api/v1/problems/problems/{self.problem.id}/bounties/",
            {"points": points, "description": description},
            format="json",
        )

    def test_full_bounty_lifecycle(self):
        response = self._post_bounty()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        bounty_id = response.data["id"]
        # Basic users see only OPEN rows.
        listing = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/bounties/"
        )
        self.assertEqual(listing.data["count"], 1)
        # The requester cannot claim their own bounty.
        response = self.client.post(f"/api/v1/problems/bounties/{bounty_id}/claim/")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # A helper claims; only the verifier fulfills.
        self.client.force_authenticate(self.helper)
        response = self.client.post(f"/api/v1/problems/bounties/{bounty_id}/claim/")
        self.assertEqual(response.status_code, 200, response.data)
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "FULFILL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "FULFILL", "note": "tests verified"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["credited_to"], "helper")
        # Double-resolve conflicts.
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "FULFILL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Fulfilled bounties vanish from basic lists.
        self.client.force_authenticate(self.basic)
        listing = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/bounties/"
        )
        self.assertEqual(listing.data["count"], 0)
        # Verifiers see the full history.
        self.client.force_authenticate(self.verifier)
        listing = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/bounties/"
        )
        self.assertEqual(listing.data["count"], 1)

    def test_cancel_flow(self):
        response = self._post_bounty()
        bounty_id = response.data["id"]
        # A stranger cannot cancel.
        self.client.force_authenticate(self.helper)
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "CANCEL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # The requester can.
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "CANCEL", "note": "tests arrived"},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        # Cancelling twice conflicts.
        response = self.client.post(
            f"/api/v1/problems/bounties/{bounty_id}/resolve/",
            {"action": "CANCEL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_guards(self):
        # Oversize pledge + hoarding cap.
        response = self._post_bounty(points=501)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        for _ in range(4):
            self._post_bounty(points=500)
        response = self._post_bounty(points=1)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Unknown problem / bounty / action.
        self.client.force_authenticate(self.basic)
        response = self.client.post(
            "/api/v1/problems/problems/999/bounties/",
            {"points": 10, "description": "x"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/problems/bounties/999/claim/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        response = self.client.post("/api/v1/problems/bounties/999/resolve/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        row = ProblemBounty.objects.first()
        response = self.client.post(
            f"/api/v1/problems/bounties/{row.id}/resolve/",
            {"action": "WEIRD"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            f"/api/v1/problems/bounties/{row.id}/resolve/", {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Fulfill without claim conflicts.
        self.client.force_authenticate(self.verifier)
        response = self.client.post(
            f"/api/v1/problems/bounties/{row.id}/resolve/",
            {"action": "FULFILL"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Claiming a cancelled bounty conflicts.
        cancelled = ProblemBounty.objects.create(
            problem=self.problem,
            requester=self.basic,
            points=5,
            description="d",
            status=ProblemBounty.Status.CANCELLED,
        )
        self.client.force_authenticate(self.helper)
        response = self.client.post(f"/api/v1/problems/bounties/{cancelled.id}/claim/")
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        # Anonymous cannot list or post.
        self.client.force_authenticate(None)
        response = self.client.get(
            f"/api/v1/problems/problems/{self.problem.id}/bounties/"
        )
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_str_methods(self):
        search = SavedSearch.objects.create(
            user=self.basic, name="n", params={"difficulty": "EASY"}
        )
        bounty = ProblemBounty.objects.create(
            problem=self.problem, requester=self.basic, points=5, description="d"
        )
        self.assertIn("search", str(search))
        self.assertIn("bounty", str(bounty))


class VisibilityHelperTests(OpsBase):
    def test_problem_is_visible_matrix(self):
        from problems.content_ops import problem_is_visible

        self.assertTrue(problem_is_visible(self.problem))
        draft = Problem.objects.create(
            title_i18n={"en": "D"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.DRAFT,
        )
        self.assertFalse(problem_is_visible(draft))
        future = Problem.objects.create(
            title_i18n={"en": "F"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            publish_at=self.now + timedelta(days=1),
        )
        self.assertFalse(problem_is_visible(future))
        self.assertTrue(problem_is_visible(future, now=self.now + timedelta(days=2)))

    def test_visible_queryset(self):
        from problems.content_ops import visible_problem_queryset

        Problem.objects.create(
            title_i18n={"en": "F"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            publish_at=self.now + timedelta(days=1),
        )
        visible = visible_problem_queryset()
        self.assertIn(self.problem, visible)
        self.assertEqual(visible.count(), 1)
