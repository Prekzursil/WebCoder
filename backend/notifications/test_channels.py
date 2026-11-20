"""Wave G PR4 backend tests — items 95 (push registration + delivery),
100 (email/SMS fallbacks). The mobile-side code lives in mobile/."""

from unittest import mock

from django.core import mail
from django.test import TestCase, override_settings
from notifications.channels import deliver_multichannel, send_expo_push, send_sms
from notifications.models import Notification, PushToken
from rest_framework.test import APIClient
from users.models import User


class PushTokenEndpointTest(TestCase):
    """Item 95 — device registration."""

    def setUp(self):
        self.user = User.objects.create_user(username="mob", password="pw")
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.url = "/api/v1/users/me/push-token/"

    def test_requires_auth(self):
        self.assertEqual(APIClient().post(self.url, {}).status_code, 401)

    def test_registers_and_re_registers(self):
        first = self.client.post(
            self.url,
            {"token": "ExpoPushToken[abc]", "platform": "android"},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        # Re-registration updates, not duplicates.
        second = self.client.post(
            self.url,
            {"token": "ExpoPushToken[abc]", "platform": "android"},
            format="json",
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(PushToken.objects.count(), 1)

    def test_validation(self):
        for payload in (
            {"token": "", "platform": "android"},
            {"token": "x" * 201, "platform": "android"},
            {"token": "tok", "platform": "web"},
            {"token": "tok", "platform": ""},
        ):
            response = self.client.post(self.url, payload, format="json")
            self.assertEqual(response.status_code, 400, payload)

    def test_delete_own_token(self):
        PushToken.objects.create(
            user=self.user, token="ExpoPushToken[xyz]", platform="ios"
        )
        response = self.client.delete(
            self.url, {"token": "ExpoPushToken[xyz]"}, format="json"
        )
        self.assertEqual(response.data["deleted"], 1)
        self.assertEqual(PushToken.objects.count(), 0)

    def test_str(self):
        row = PushToken.objects.create(user=self.user, token="t", platform="ios")
        self.assertIn("ios", str(row))


class PushDeliveryTest(TestCase):
    """Item 95 — the Expo fan-out on notify()."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="pushy", password="pw", email="pushy@example.com"
        )
        PushToken.objects.create(
            user=self.user, token="ExpoPushToken[1]", platform="android"
        )

    def _notify(self):
        from notifications.services import notify

        return notify(self.user, "SYSTEM", data={"excerpt": "hello"})

    def test_push_ok_skips_email(self):
        with mock.patch(
            "notifications.channels.send_expo_push",
            return_value=(1, 1),
        ) as push:
            note = self._notify()
            summary = deliver_multichannel(note)
        self.assertEqual(summary["push"], 1)
        self.assertFalse(summary["email"])
        push.assert_called_once()

    def test_failed_push_falls_back_to_email_when_opted_in(self):
        self.user.notification_email = True
        self.user.save()
        with override_settings(EMAIL_HOST="smtp.example.com"):
            with mock.patch(
                "notifications.channels.send_expo_push", return_value=(1, 0)
            ):
                note = self._notify()
                summary = deliver_multichannel(note)
        self.assertEqual(summary["push"], 0)
        self.assertTrue(summary["email"])
        self.assertEqual(len(mail.outbox), 1)

    def test_no_email_without_optin_or_host(self):
        with override_settings(EMAIL_HOST=""):
            note = self._notify()
            summary = deliver_multichannel(note)
        self.assertFalse(summary["email"])

    def test_sms_console_backend(self):
        self.user.notification_sms_phone = "+40700111222"
        self.user.save()
        with mock.patch("notifications.channels.send_expo_push", return_value=(1, 0)):
            with self.settings(SMS_BACKEND="console", EMAIL_HOST=""):
                note = self._notify()
                summary = deliver_multichannel(note)
        self.assertTrue(summary["sms"])

    def test_sms_gateway_backend(self):
        self.user.notification_sms_phone = "+40700111222"
        self.user.save()
        with mock.patch("notifications.channels.send_expo_push", return_value=(1, 0)):
            with self.settings(
                SMS_BACKEND="gateway",
                SMS_GATEWAY_URL="https://sms.example.com/send",
                SMS_GATEWAY_TOKEN="tok",
                EMAIL_HOST="",
            ):
                with mock.patch(
                    "requests.post",
                    return_value=mock.Mock(status_code=200),
                ) as post:
                    note = self._notify()
                    summary = deliver_multichannel(note)
        self.assertTrue(summary["sms"])
        post.assert_called_once()

    def test_sms_gateway_failure_is_false(self):
        self.user.notification_sms_phone = "+40700111222"
        self.user.save()
        with mock.patch("notifications.channels.send_expo_push", return_value=(1, 0)):
            with self.settings(
                SMS_BACKEND="gateway",
                SMS_GATEWAY_URL="https://sms.example.com/send",
                EMAIL_HOST="",
            ):
                with mock.patch(
                    "requests.post",
                    side_effect=OSError("down"),
                ):
                    note = self._notify()
                    summary = deliver_multichannel(note)
        self.assertFalse(summary["sms"])

    def test_sms_without_phone_is_false(self):
        self.assertFalse(send_sms("", "x"))

    def test_unknown_sms_backend(self):
        with self.settings(SMS_BACKEND="carrier-pigeon"):
            self.assertFalse(send_sms("+40700", "x"))

    def test_send_expo_push_handles_transport_error(self):
        with mock.patch("requests.post", side_effect=OSError("net")):
            attempted, delivered = send_expo_push(["tok"], "t", "b")
        self.assertEqual((attempted, delivered), (1, 0))

    def test_send_expo_push_handles_non_200(self):
        with mock.patch(
            "requests.post",
            return_value=mock.Mock(status_code=500, text="boom"),
        ):
            attempted, delivered = send_expo_push(["tok"], "t", "b")
        self.assertEqual((attempted, delivered), (1, 0))

    def test_send_expo_push_empty_tokens(self):
        self.assertEqual(send_expo_push([], "t", "b"), (0, 0))

    def test_no_tokens_email_only_path(self):
        PushToken.objects.all().delete()
        self.user.notification_email = True
        self.user.save()
        with override_settings(EMAIL_HOST="smtp.example.com"):
            note = Notification.objects.create(
                recipient=self.user, verb="SYSTEM", data={"excerpt": "x"}
            )
            summary = deliver_multichannel(note)
        self.assertEqual(summary["push"], 0)
        self.assertTrue(summary["email"])


class HasPasswordFlagTest(TestCase):
    """Item 99 — the QR card's has_password flag (teacher list only)."""

    def test_flag_reflects_the_hash(self):
        from classroom.models import ClassRoom
        from classroom.serializers import ClassRoomSerializer

        teacher = User.objects.create_user(username="t1", password="pw")
        plain = ClassRoom.objects.create(name="A", teacher=teacher, join_code="AAA111")
        guarded = ClassRoom.objects.create(
            name="B", teacher=teacher, join_code="BBB222"
        )
        guarded.set_join_password("secret")
        guarded.save()
        self.assertFalse(ClassRoomSerializer(plain).data["has_password"])
        self.assertTrue(ClassRoomSerializer(guarded).data["has_password"])


class ChannelEdgeTest(TestCase):
    """Items 95/100 — the gateway-without-URL branch and the email
    transport exception branch."""

    def setUp(self):
        self.user = User.objects.create_user(
            username="edge", password="pw", email="edge@example.com"
        )

    def test_gateway_without_url_is_false(self):
        with self.settings(SMS_BACKEND="gateway", SMS_GATEWAY_URL=""):
            self.assertFalse(send_sms("+40700", "x"))

    def test_email_transport_exception_degrades(self):
        from unittest import mock as _mock

        self.user.notification_email = True
        self.user.save()
        PushToken.objects.all().delete()
        note = Notification.objects.create(recipient=self.user, verb="SYSTEM")
        with override_settings(EMAIL_HOST="smtp.example.com"):
            with _mock.patch(
                "notifications.channels.send_mail", side_effect=OSError("smtp down")
            ):
                summary = deliver_multichannel(note)
        self.assertFalse(summary["email"])
