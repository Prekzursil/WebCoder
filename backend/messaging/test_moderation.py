"""COM-5 moderation + admin audit tests: per-message reporting into the
moderator queue, resolve/dismiss contract, content-filter flag queue,
metadata-only audit view with transcripts sealed behind a report.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from classroom.models import ClassMembership, ClassRoom
from messaging.models import Conversation, Message, MessageReport
from users.models import User

THREADS = "/api/v1/messages/threads/"
REPORT = "/api/v1/messages/moderation/reports/"
RESOLVE = REPORT + "{pk}/resolve/"
FLAGGED = "/api/v1/messages/moderation/flagged/"
ADMIN_THREADS = "/api/v1/messages/admin/threads/"
TRANSCRIPT = "/api/v1/messages/admin/threads/{pk}/transcript/"


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password="p", **kwargs)


class ModerationBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = _user("md-alice")
        self.bob = _user("md-bob")
        self.verifier = _user(
            "md-verifier", role=User.Roles.PROBLEM_VERIFIER
        )
        self.admin = _user("md-admin", role=User.Roles.ADMIN)
        self.client.force_authenticate(self.alice)
        self.thread = self.client.post(
            THREADS, {"user_id": self.bob.pk}
        ).json()
        self.message = self.client.post(
            f"{THREADS}{self.thread['id']}/send/",
            {"body": "you are shit"},
        ).json()

    def _report(self, user, message_id, reason="ABUSE"):
        self.client.force_authenticate(user)
        return self.client.post(
            "/api/v1/messages/messages/%d/report/" % message_id,
            {"reason": reason, "details": "not nice"},
        )


class ReportQueueTest(ModerationBase):
    def test_participant_reports_message(self):
        resp = self._report(self.bob, self.message["id"])
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        body = resp.json()
        self.assertEqual(body["status"], "OPEN")
        self.assertEqual(body["reason"], "ABUSE")
        self.assertEqual(body["message"]["body"], "you are shit")
        self.assertEqual(body["reporter"]["username"], "md-bob")

    def test_duplicate_report_409(self):
        self._report(self.bob, self.message["id"])
        again = self._report(self.bob, self.message["id"])
        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)

    def test_invalid_reason_400(self):
        resp = self._report(self.bob, self.message["id"], reason="NOPE")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_participant_cannot_report(self):
        stranger = _user("md-stranger")
        resp = self._report(stranger, self.message["id"])
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_unknown_message_400_via_pk_validation(self):
        # A nonexistent message pk fails model-backed validation.
        self.client.force_authenticate(self.bob)
        resp = self.client.post(
            "/api/v1/messages/messages/99999/report/",
            {"reason": "ABUSE"},
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_anon_cannot_report(self):
        self.client.force_authenticate(None)
        resp = self.client.post(
            "/api/v1/messages/messages/%d/report/" % self.message["id"],
            {"reason": "ABUSE"},
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_queue_listing_permissions_and_filter(self):
        self._report(self.bob, self.message["id"])
        # Basic users: no queue.
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get(REPORT).status_code, status.HTTP_403_FORBIDDEN
        )
        # Verifier: sees the open report with full message context.
        self.client.force_authenticate(self.verifier)
        listing = self.client.get(REPORT).json()
        self.assertEqual(listing["count"], 1)
        self.assertEqual(
            listing["results"][0]["message"]["sender"]["username"],
            "md-alice",
        )
        closed = self.client.get(REPORT + "?status=RESOLVED").json()
        self.assertEqual(closed["count"], 0)

    def test_resolve_and_dismiss_contract(self):
        report = self._report(self.bob, self.message["id"]).json()
        self.client.force_authenticate(self.verifier)
        bad = self.client.post(
            RESOLVE.format(pk=report["id"]), {"action": "nonsense"}
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        resolved = self.client.post(
            RESOLVE.format(pk=report["id"]),
            {"action": "resolved", "note": "warned sender"},
        )
        self.assertEqual(resolved.status_code, status.HTTP_200_OK)
        self.assertEqual(resolved.json()["status"], "RESOLVED")
        self.assertEqual(resolved.json()["resolution_note"], "warned sender")
        self.assertEqual(
            resolved.json()["resolved_by"]["username"], "md-verifier"
        )
        # Dismiss path on a fresh report.
        other = self._report(
            self.alice, self.message["id"], reason="OTHER"
        ).json()
        self.client.force_authenticate(self.verifier)
        dismissed = self.client.post(
            RESOLVE.format(pk=other["id"]), {"action": "dismissed"}
        )
        self.assertEqual(dismissed.json()["status"], "DISMISSED")
        missing = self.client.post(
            RESOLVE.format(pk=99999), {"action": "resolved"}
        )
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_reporter_string(self):
        report = self._report(self.bob, self.message["id"])
        self.assertIn(
            "MessageReport(", str(MessageReport.objects.get(pk=report.json()["id"]))
        )


class FlaggedQueueTest(ModerationBase):
    def test_flagged_messages_queue_moderator_only(self):
        flagged = self.client.post(
            f"{THREADS}{self.thread['id']}/send/",
            {"body": "how old are you?"},
        ).json()
        message = Message.objects.get(pk=flagged["id"])
        self.assertTrue(message.is_flagged)
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(FLAGGED).status_code, status.HTTP_403_FORBIDDEN
        )
        self.client.force_authenticate(self.admin)
        listing = self.client.get(FLAGGED).json()
        # Both the profanity setUp message and the grooming probe queue.
        self.assertEqual(listing["count"], 2)
        categories = {
            tuple(row["flag_categories"]) for row in listing["results"]
        }
        self.assertIn(("grooming",), categories)
        self.assertIn(("profanity_en",), categories)


class AdminAuditTest(ModerationBase):
    def test_basic_user_has_no_audit_surface(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.get(ADMIN_THREADS).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        # Transcript for a BASIC user is a 404 — same answer as a
        # nonexistent thread, leaking nothing about audit existence.
        self.assertEqual(
            self.client.get(
                TRANSCRIPT.format(pk=self.thread["id"])
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_admin_sees_metadata_but_not_bodies(self):
        self.client.force_authenticate(self.admin)
        listing = self.client.get(ADMIN_THREADS).json()
        self.assertEqual(listing["count"], 1)
        row = listing["results"][0]
        usernames = {p["username"] for p in row["participants"]}
        self.assertEqual(usernames, {"md-alice", "md-bob"})
        self.assertEqual(row["message_count"], 1)
        self.assertFalse(row["has_report"])
        # No body field anywhere in the metadata row.
        self.assertNotIn("last_message", row)
        self.assertNotIn("body", row)

    def test_transcript_requires_explicit_report(self):
        self.client.force_authenticate(self.admin)
        sealed = self.client.get(
            TRANSCRIPT.format(pk=self.thread["id"])
        )
        self.assertEqual(sealed.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            sealed.json()["detail"], "transcript_requires_report"
        )
        self._report(self.bob, self.message["id"])
        self.client.force_authenticate(self.admin)
        opened = self.client.get(TRANSCRIPT.format(pk=self.thread["id"]))
        self.assertEqual(opened.status_code, status.HTTP_200_OK)
        body = opened.json()
        self.assertEqual(len(body["messages"]), 1)
        self.assertEqual(body["messages"][0]["body"], "you are shit")
        self.assertIn("has_report", body["conversation"])
        self.assertTrue(body["conversation"]["has_report"])
        # Metadata row flips once reported.
        listing = self.client.get(ADMIN_THREADS).json()
        self.assertTrue(listing["results"][0]["has_report"])

    def test_transcript_unknown_thread_404(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(
            self.client.get(TRANSCRIPT.format(pk=99999)).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_teacher_scoped_to_own_students(self):
        teacher = _user("md-teacher", role=User.Roles.TEACHER)
        classroom = ClassRoom.objects.create(teacher=teacher, name="IX-B")
        ClassMembership.objects.create(classroom=classroom, student=self.bob)
        # An unrelated thread: alice<->carol.
        carol = _user("md-carol")
        self.client.force_authenticate(self.alice)
        self.client.post(THREADS, {"user_id": carol.pk})
        self.client.post(f"{THREADS}{self.thread['id']}/send/", {"body": "x"})
        # Teacher sees only threads involving their student (bob).
        self.client.force_authenticate(teacher)
        listing = self.client.get(ADMIN_THREADS).json()
        self.assertEqual(listing["count"], 1)
        usernames = {
            p["username"]
            for p in listing["results"][0]["participants"]
        }
        self.assertEqual(usernames, {"md-alice", "md-bob"})
        # ...and can open that thread's transcript once reported.
        self._report(self.bob, self.message["id"])
        self.client.force_authenticate(teacher)
        transcript = self.client.get(
            TRANSCRIPT.format(pk=self.thread["id"])
        )
        self.assertEqual(transcript.status_code, status.HTTP_200_OK)
        # A thread outside the class stays invisible (404, not 403).
        other = Conversation.objects.exclude(pk=self.thread["id"]).first()
        self.assertEqual(
            self.client.get(TRANSCRIPT.format(pk=other.pk)).status_code,
            status.HTTP_404_NOT_FOUND,
        )
