"""COM-5 safety-stack tests: content filter (flag-not-block), blocks
honored end-to-end, minor-safety defaults, strict rate limits.
"""

from unittest import mock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework.throttling import SimpleRateThrottle

from classroom.models import ClassMembership, ClassRoom
from django.core.cache import cache
from messaging.filters import normalize_text, scan_message
from messaging.models import Block, Message
from users.models import Follow, User

THREADS = "/api/v1/messages/threads/"
BLOCKS = "/api/v1/messages/blocks/"


def _user(name, **kwargs):
    return User.objects.create_user(username=name, password="p", **kwargs)


def _shrink_rates(**rates):
    """Patch the import-time-bound throttle rate table (pattern of
    users/test_throttling.py — override_settings cannot reach it)."""
    return mock.patch.object(
        SimpleRateThrottle,
        "THROTTLE_RATES",
        {"anon": "10000/min", "user": "10000/min", **rates},
    )


class FilterUnitTest(TestCase):
    def test_normalize_folds_diacritics_case_and_whitespace(self):
        self.assertEqual(normalize_text("Câți  ANI  ai?"), "cati ani ai?")
        self.assertEqual(normalize_text("  Şcoala  "), "scoala")

    def test_clean_message(self):
        self.assertEqual(scan_message("salut, cum merge tema?"), [])
        self.assertEqual(scan_message(""), [])

    def test_english_profanity_flagged_not_blocked(self):
        self.assertEqual(scan_message("this is shit"), ["profanity_en"])
        # Word boundaries: no Scunthorpe false positives.
        self.assertEqual(scan_message("we had a class about assessment"), [])

    def test_romanian_profanity_flagged_with_diacritics(self):
        self.assertEqual(scan_message("Du-te dracului, PULĂ!"), ["profanity_ro"])

    def test_grooming_age_probe(self):
        self.assertEqual(scan_message("hey, how old are you?"), ["grooming"])
        self.assertEqual(scan_message("Câți ani ai?"), ["grooming"])

    def test_grooming_secrecy(self):
        self.assertEqual(
            scan_message("don't tell your parents about this"), ["grooming"]
        )
        self.assertEqual(scan_message("nu spune nimic părinților"), ["grooming"])

    def test_grooming_nude_solicitation(self):
        self.assertEqual(scan_message("send me nudes"), ["grooming"])
        self.assertEqual(scan_message("trimite-mi un nud"), ["grooming"])

    def test_grooming_offline_meet(self):
        self.assertEqual(
            scan_message("hai să ne întâlnim față în față, doar noi"),
            ["grooming"],
        )
        self.assertEqual(scan_message("let's meet in person, just us"), ["grooming"])

    def test_multiple_categories_stack(self):
        self.assertEqual(
            scan_message("send me nudes, you shit"),
            ["profanity_en", "grooming"],
        )


class FilterIntegrationTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = _user("fs-alice")
        self.bob = _user("fs-bob")

    def test_flagged_message_delivered_and_flag_state_hidden_from_users(self):
        self.client.force_authenticate(self.alice)
        thread = self.client.post(THREADS, {"user_id": self.bob.pk}).json()
        resp = self.client.post(
            f"{THREADS}{thread['id']}/send/",
            {"body": "don't tell your parents, how old are you?"},
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get(pk=resp.json()["id"])
        self.assertTrue(message.is_flagged)
        self.assertEqual(message.flag_categories, ["grooming"])
        # The participant-facing serializer does NOT leak the verdict.
        self.assertNotIn("is_flagged", resp.json())
        self.assertNotIn("flag_categories", resp.json())


class BlockTest(TestCase):
    """Blocks honored end-to-end: no send, no thread-start, thread hidden."""

    def setUp(self):
        self.client = APIClient()
        self.alice = _user("bk-alice")
        self.bob = _user("bk-bob")
        self.client.force_authenticate(self.alice)
        self.thread = self.client.post(THREADS, {"user_id": self.bob.pk}).json()

    def test_block_crud(self):
        self.client.force_authenticate(self.alice)
        created = self.client.post(BLOCKS, {"user_id": self.bob.pk})
        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertEqual(created.json()["blocked"]["username"], "bk-bob")
        listing = self.client.get(BLOCKS).json()
        self.assertEqual(listing["count"], 1)
        # Idempotent create.
        again = self.client.post(BLOCKS, {"username": "bk-bob"})
        self.assertEqual(again.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Block.objects.count(), 1)
        removed = self.client.delete(f"{BLOCKS}{self.bob.pk}/")
        self.assertEqual(removed.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(
            self.client.delete(f"{BLOCKS}{self.bob.pk}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_block_validation(self):
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.post(BLOCKS, {}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(BLOCKS, {"user_id": 99999}).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(BLOCKS, {"user_id": self.alice.pk}).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_blocked_user_cannot_send_or_start(self):
        # Alice blocks Bob.
        self.client.force_authenticate(self.alice)
        self.client.post(BLOCKS, {"user_id": self.bob.pk})
        # Bob cannot send into the existing thread: it is HIDDEN from
        # his side, so the endpoint 404s (indistinguishable from a
        # thread that never existed).
        self.client.force_authenticate(self.bob)
        resp = self.client.post(
            f"{THREADS}{self.thread['id']}/send/", {"body": "let me in"}
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)
        # Bob cannot start a NEW thread either.
        resp = self.client.post(THREADS, {"user_id": self.alice.pk})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "blocked")
        # Alice still can (one-way mute, not mutual silence).
        self.client.force_authenticate(self.alice)
        self.assertEqual(
            self.client.post(
                f"{THREADS}{self.thread['id']}/send/", {"body": "bye"}
            ).status_code,
            status.HTTP_201_CREATED,
        )

    def test_blocked_side_thread_hidden_everywhere(self):
        self.client.force_authenticate(self.alice)
        self.client.post(f"{THREADS}{self.thread['id']}/send/", {"body": "hello"})
        self.client.post(BLOCKS, {"user_id": self.bob.pk})
        # List: hidden from Bob.
        self.client.force_authenticate(self.bob)
        listing = self.client.get(THREADS).json()
        self.assertEqual(listing["count"], 0)
        # Detail: 404 for Bob.
        self.assertEqual(
            self.client.get(f"{THREADS}{self.thread['id']}/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        # History: empty for Bob (thread invisible).
        history = self.client.get(f"{THREADS}{self.thread['id']}/messages/")
        self.assertEqual(history.json()["results"], [])
        # Alice still sees it.
        self.client.force_authenticate(self.alice)
        self.assertEqual(self.client.get(THREADS).json()["count"], 1)


class MinorPolicyTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.adult = _user("mp-adult")
        self.minor = _user("mp-minor", is_minor=True)

    def test_stranger_cannot_message_minor(self):
        self.client.force_authenticate(self.adult)
        resp = self.client.post(THREADS, {"user_id": self.minor.pk})
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "minor_policy")

    def test_followed_user_can_message_minor(self):
        Follow.objects.create(follower=self.minor, target=self.adult)
        self.client.force_authenticate(self.adult)
        resp = self.client.post(THREADS, {"user_id": self.minor.pk})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_shared_class_member_can_message_minor(self):
        teacher = _user("mp-teacher", role=User.Roles.TEACHER)
        classroom = ClassRoom.objects.create(teacher=teacher, name="V-A")
        ClassMembership.objects.create(classroom=classroom, student=self.minor)
        ClassMembership.objects.create(classroom=classroom, student=self.adult)
        self.client.force_authenticate(self.adult)
        resp = self.client.post(THREADS, {"user_id": self.minor.pk})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_admin_exempt_from_minor_policy(self):
        admin = _user("mp-admin", role=User.Roles.ADMIN)
        self.client.force_authenticate(admin)
        resp = self.client.post(THREADS, {"user_id": self.minor.pk})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    def test_minor_can_message_adult_freely(self):
        # The policy guards who can CONTACT a minor, not the minor's own
        # outgoing mail.
        self.client.force_authenticate(self.minor)
        resp = self.client.post(THREADS, {"user_id": self.adult.pk})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)


class MessagingThrottleTest(TestCase):
    """The two COM-5 budgets: 30 msgs/hour send, 10 new threads/hour
    (defaults; these tests shrink the rates and opt back in)."""

    def setUp(self):
        self.client = APIClient()
        self.alice = _user("th-alice")
        self.bob = _user("th-bob")
        self.carol = _user("th-carol")
        self.client.force_authenticate(self.alice)
        self.thread = self.client.post(THREADS, {"user_id": self.bob.pk}).json()

    def test_third_send_in_a_minute_is_429(self):
        with _shrink_rates(message_send="2/min"):
            cache.clear()  # fresh budget for this isolated window
            first = self.client.post(
                f"{THREADS}{self.thread['id']}/send/", {"body": "1"}
            )
            second = self.client.post(
                f"{THREADS}{self.thread['id']}/send/", {"body": "2"}
            )
            third = self.client.post(
                f"{THREADS}{self.thread['id']}/send/", {"body": "3"}
            )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertEqual(third.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_second_new_thread_in_a_minute_is_429(self):
        with _shrink_rates(message_thread="1/min"):
            cache.clear()  # setUp's thread-start must not eat the budget
            first = self.client.post(THREADS, {"user_id": self.bob.pk})
            second = self.client.post(THREADS, {"user_id": self.carol.pk})
        self.assertEqual(first.status_code, status.HTTP_200_OK)  # existed
        self.assertEqual(second.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_send_reads_are_not_throttled_by_send_scope(self):
        # The list/history reads carry no messaging scope: shrinking the
        # send budget to 1/min must not break reading the thread.
        with _shrink_rates(message_send="1/min"):
            cache.clear()
            self.client.post(f"{THREADS}{self.thread['id']}/send/", {"body": "1"})
            reading = self.client.get(f"{THREADS}{self.thread['id']}/messages/")
            listing = self.client.get(THREADS)
        self.assertEqual(reading.status_code, status.HTTP_200_OK)
        self.assertEqual(listing.status_code, status.HTTP_200_OK)


class EdgePolicyTest(TestCase):
    """Cover the two 403/404 corners the main suites don't reach."""

    def setUp(self):
        self.client = APIClient()
        self.alice = _user("ep-alice")
        self.bob = _user("ep-bob")

    def test_minor_unfollow_mid_thread_blocks_sender(self):
        minor = _user("ep-minor", is_minor=True)
        Follow.objects.create(follower=minor, target=self.alice)
        self.client.force_authenticate(self.alice)
        thread = self.client.post(THREADS, {"user_id": minor.pk}).json()
        # The minor unfollows; alice's next send hits the minor policy.
        Follow.objects.all().delete()
        resp = self.client.post(
            f"{THREADS}{thread['id']}/send/", {"body": "still there?"}
        )
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(resp.json()["detail"], "minor_policy")
