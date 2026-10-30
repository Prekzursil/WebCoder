"""COM-5 core messaging tests: threads, send/receive, read/unread,
cursor-paginated history, MESSAGE_RECEIVED notification, plain-text
validation (XSS-safe by construction).

Safety paths (filter/blocks/minor policy/rate limits/moderation) live in
test_safety.py and test_moderation.py.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from messaging.models import Conversation, Message
from notifications.models import Notification
from users.models import User

THREADS = "/api/v1/messages/threads/"


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password="p", **kwargs)


class MessagingTestBase(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = _user("alice")
        self.bob = _user("bob")

    def _start(self, user, target):
        self.client.force_authenticate(user)
        return self.client.post(THREADS, {"user_id": target.pk})

    def _send(self, user, thread_pk, body, expect=status.HTTP_201_CREATED):
        self.client.force_authenticate(user)
        resp = self.client.post(
            f"{THREADS}{thread_pk}/send/", {"body": body}
        )
        assert expect == resp.status_code, (expect, resp.status_code, resp.content)
        return resp


class ThreadLifecycleTest(MessagingTestBase):
    def test_start_thread_and_roundtrip(self):
        resp = self._start(self.alice, self.bob)
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        body = resp.json()
        self.assertEqual(body["other_user"]["username"], "bob")
        self.assertEqual(body["unread_count"], 0)
        self.assertIsNone(body["last_message"])
        # Starting again returns the SAME thread with 200, not a dupe.
        again = self._start(self.alice, self.bob)
        self.assertEqual(again.status_code, status.HTTP_200_OK)
        self.assertEqual(again.json()["id"], body["id"])
        self.assertEqual(Conversation.objects.count(), 1)

    def test_start_by_username(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(THREADS, {"username": "bob"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.json()["other_user"]["username"], "bob")

    def test_start_requires_user_id_or_username(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(THREADS, {})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_start_unknown_user_404(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(THREADS, {"user_id": 99999})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_self_thread_403(self):
        resp = self._start(self.alice, self.alice)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "self")

    def test_list_only_mine(self):
        carol = _user("carol")
        self._start(self.alice, self.bob)
        self._start(self.alice, carol)
        self._start(self.bob, carol)
        self.client.force_authenticate(self.alice)
        resp = self.client.get(THREADS)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        listing = resp.json()
        self.assertEqual(listing["count"], 2)  # bob+carol, NOT bob<->carol
        others = {row["other_user"]["username"] for row in listing["results"]}
        self.assertEqual(others, {"bob", "carol"})

    def test_detail_scoped_to_participants(self):
        thread = self._start(self.alice, self.bob).json()
        stranger = _user("stranger")
        self.client.force_authenticate(stranger)
        resp = self.client.get(f"{THREADS}{thread['id']}/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        self.client.force_authenticate(self.bob)
        self.assertEqual(
            self.client.get(f"{THREADS}{thread['id']}/").status_code,
            status.HTTP_200_OK,
        )

    def test_anon_denied(self):
        self.assertEqual(
            self.client.get(THREADS).status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class SendReceiveTest(MessagingTestBase):
    def test_send_receive_and_notification(self):
        thread = self._start(self.alice, self.bob).json()
        with self.captureOnCommitCallbacks(execute=True):
            resp = self._send(self.alice, thread["id"], "salut bob!")
        message = resp.json()
        self.assertEqual(message["sender"]["username"], "alice")
        self.assertIn("salut bob!", message["body"])
        self.assertIn("created_at", message)
        # MESSAGE_RECEIVED notification for bob (COM-5 contract).
        self.assertEqual(
            Notification.objects.filter(
                recipient=self.bob, verb=Notification.Verb.MESSAGE_RECEIVED
            ).count(),
            1,
        )
        notification = Notification.objects.get(recipient=self.bob)
        self.assertEqual(
            notification.data["conversation_id"], thread["id"]
        )
        self.assertEqual(notification.data["excerpt"], "salut bob!")

    def test_send_into_foreign_thread_404(self):
        carol = _user("carol")
        thread = self._start(self.bob, carol).json()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            f"{THREADS}{thread['id']}/send/", {"body": "snoop"}
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_send_empty_body_400(self):
        thread = self._start(self.alice, self.bob).json()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(f"{THREADS}{thread['id']}/send/", {"body": "   "})
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_over_length_body_400(self):
        thread = self._start(self.alice, self.bob).json()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            f"{THREADS}{thread['id']}/send/", {"body": "x" * 4001}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_send_control_characters_400(self):
        thread = self._start(self.alice, self.bob).json()
        self.client.force_authenticate(self.alice)
        resp = self.client.post(
            f"{THREADS}{thread['id']}/send/", {"body": "a\x00b"}
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)
        # Tabs and newlines are legitimate prose and pass.
        ok = self.client.post(
            f"{THREADS}{thread['id']}/send/", {"body": "line1\nline2\tend"}
        )
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED)

    def test_send_unknown_thread_404(self):
        self.client.force_authenticate(self.alice)
        resp = self.client.post(f"{THREADS}9999/send/", {"body": "x"})
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_thread_list_carries_excerpt_and_unread(self):
        thread = self._start(self.alice, self.bob).json()
        self._send(self.alice, thread["id"], "first message")
        self._send(self.alice, thread["id"], "second message")
        self.client.force_authenticate(self.bob)
        listing = self.client.get(THREADS).json()
        row = listing["results"][0]
        self.assertEqual(row["unread_count"], 2)
        # Excerpt is from the LATEST message.
        self.assertEqual(row["last_message"]["excerpt"], "second message")
        self.assertEqual(row["last_message"]["sender_id"], self.alice.pk)


class ReadUnreadTest(MessagingTestBase):
    def test_mark_read_is_scoped_and_idempotent(self):
        thread = self._start(self.alice, self.bob).json()
        self._send(self.alice, thread["id"], "one")
        self._send(self.alice, thread["id"], "two")
        self._send(self.bob, thread["id"], "reply")  # bob's own, not unread
        self.client.force_authenticate(self.bob)
        resp = self.client.post(f"{THREADS}{thread['id']}/read/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["marked_read"], 2)
        # Idempotent: nothing left unread.
        self.assertEqual(
            self.client.post(f"{THREADS}{thread['id']}/read/").json()[
                "marked_read"
            ],
            0,
        )
        unread = self.client.get(THREADS).json()["results"][0][
            "unread_count"
        ]
        self.assertEqual(unread, 0)
        # Message read_at set.
        message = Message.objects.filter(sender=self.alice).first()
        self.assertIsNotNone(message.read_at)

    def test_mark_read_unknown_thread_404(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.post(f"{THREADS}9999/read/").status_code,
            status.HTTP_404_NOT_FOUND,
        )


class HistoryPaginationTest(MessagingTestBase):
    def test_cursor_paginated_newest_first(self):
        thread = self._start(self.alice, self.bob).json()
        for index in range(35):
            self._send(self.alice, thread["id"], f"m{index}")
        self.client.force_authenticate(self.bob)
        first = self.client.get(f"{THREADS}{thread['id']}/messages/")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        body = first.json()
        self.assertNotIn("count", body)  # cursor envelope
        self.assertEqual(len(body["results"]), 30)  # page_size
        self.assertEqual(body["results"][0]["body"], "m34")
        self.assertTrue(body["next"])
        second = self.client.get(body["next"])
        self.assertEqual(len(second.json()["results"]), 5)

    def test_history_scoped_to_participants(self):
        thread = self._start(self.alice, self.bob).json()
        self._send(self.alice, thread["id"], "secret")
        stranger = _user("stranger2")
        self.client.force_authenticate(stranger)
        resp = self.client.get(f"{THREADS}{thread['id']}/messages/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.json()["results"], [])

    def test_anon_history_401(self):
        self.assertEqual(
            self.client.get(f"{THREADS}1/messages/").status_code,
            status.HTTP_401_UNAUTHORIZED,
        )


class ModelUnitTest(MessagingTestBase):
    """Direct model/service unit coverage (non-REST paths)."""

    def test_str_representations(self):
        thread = self._start(self.alice, self.bob).json()
        self._send(self.alice, thread["id"], "hello")
        conversation = Conversation.objects.get(pk=thread["id"])
        self.assertTrue(
            str(conversation).startswith("Conversation(")
        )
        message = Message.objects.first()
        self.assertIn("Message(", str(message))

    def test_for_pair_both_orders(self):
        thread = self._start(self.alice, self.bob).json()
        found = Conversation.for_pair(self.alice, self.bob)
        self.assertEqual(found.pk, thread["id"])
        found_swapped = Conversation.for_pair(self.bob, self.alice)
        self.assertEqual(found_swapped.pk, thread["id"])
        carol = _user("carol2")
        self.assertIsNone(Conversation.for_pair(self.alice, carol))

    def test_other_user(self):
        thread = self._start(self.alice, self.bob).json()
        conversation = Conversation.objects.get(pk=thread["id"])
        self.assertEqual(conversation.other_user(self.alice), self.bob)
        self.assertEqual(conversation.other_user(self.bob), self.alice)
        stranger = _user("stranger3")
        self.assertIsNone(conversation.other_user(stranger))

    def test_send_message_not_participant_raises(self):
        from messaging.services import PolicyError, send_message

        thread = self._start(self.alice, self.bob).json()
        conversation = Conversation.objects.get(pk=thread["id"])
        stranger = _user("stranger4")
        with self.assertRaises(PolicyError) as ctx:
            send_message(stranger, conversation, "hi")
        self.assertEqual(ctx.exception.code, "not_participant")

    def test_ordered_pair_constraint(self):
        # The pair is stored lo/hi regardless of who starts it.
        alice = self.alice  # pk smaller
        later = User.objects.create_user(username="zzz_later", password="p")
        self.assertLess(alice.pk, later.pk)
        from messaging.services import get_or_start_conversation

        conversation, _ = get_or_start_conversation(later, alice)
        self.assertEqual(conversation.user1, alice)
        self.assertEqual(conversation.user2, later)


class SanitizerUnitTest(TestCase):
    """Direct unit tests for the plain-text body contract (the REST layer
    adds DRF field validation on top; these pin the service contract)."""

    def setUp(self):
        self.alice = _user("su-alice")
        self.bob = _user("su-bob")

    def test_empty_and_whitespace_rejected(self):
        from messaging.serializers import _sanitize_body
        from rest_framework import serializers as drf_serializers

        for candidate in ("", "   ", "\n\t"):
            with self.assertRaises(drf_serializers.ValidationError):
                _sanitize_body(candidate)

    def test_over_length_rejected(self):
        from messaging.serializers import _sanitize_body
        from rest_framework import serializers as drf_serializers

        with self.assertRaises(drf_serializers.ValidationError):
            _sanitize_body("x" * 4001)

    def test_control_characters_rejected(self):
        from messaging.serializers import _sanitize_body
        from rest_framework import serializers as drf_serializers

        for candidate in ("a\x00b", "x\x1by"):
            with self.assertRaises(drf_serializers.ValidationError):
                _sanitize_body(candidate)

    def test_normal_text_and_newlines_pass(self):
        from messaging.serializers import _sanitize_body

        self.assertEqual(_sanitize_body("hello"), "hello")
        self.assertEqual(_sanitize_body("a\nb\tc\rd"), "a\nb\tc\rd")

    def test_block_str(self):
        from messaging.models import Block

        block = Block.objects.create(blocker=self.alice, blocked=self.bob)
        self.assertEqual(
            str(block), f"Block({self.alice.pk} -> {self.bob.pk})"
        )
