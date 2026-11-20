"""Wave G PR8 backend tests — items 146 (supporter parity) and 147
(school partnerships). The certificates-dependent tests (items
148/149/150) live in backend/certifications/test_wave_g_sustain.py so
the certificates package resolves at collection time.
"""

from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from partnerships.models import SchoolPartnershipRequest
from users.models import User

APPLY = "/api/v1/partnerships/apply/"
REQUESTS = "/api/v1/partnerships/requests/"
REVIEW = "/api/v1/partnerships/requests/{id}/review/"


class SupporterParityTest(TestCase):
    """Item 146 — the supporter tier MUST NOT change gameplay: same
    throttles, same rate-limit scope, no rating/points privilege. This
    test is the contract."""

    def test_supporter_flag_is_cosmetic_only(self):
        # The non-supporter baseline is created but never read — the
        # assertion is on the SHARED serializer surface, not per-user.
        User.objects.create_user(username="sup_plain", password="pw")
        supporter = User.objects.create_user(username="sup_gold", password="pw")
        supporter.supporter_since = date(2026, 1, 1)
        supporter.save()
        # Same submission throttle scope regardless of supporter status:
        # the submit view's scope is a constant — supporters get no
        # separate lane and no raised ceiling (SP4's anti-flood chokepoint
        # applies to everyone).
        from submissions.views import SubmissionCreateView

        self.assertEqual(SubmissionCreateView.throttle_scope, "submit")
        self.assertNotIn("supporter", SubmissionCreateView.throttle_scope)
        # No gameplay fields differ on the serializer surface.
        from users.serializers import UserSerializer

        fields = set(UserSerializer().fields)
        self.assertIn("supporter_since", fields)
        self.assertNotIn("rating_bonus", fields)
        self.assertNotIn("extra_submissions", fields)

    def test_badge_serializes(self):
        supporter = User.objects.create_user(username="sup_show", password="pw")
        supporter.supporter_since = date(2026, 2, 3)
        supporter.save()
        from users.serializers import UserSerializer

        data = UserSerializer(supporter).data
        self.assertEqual(data["supporter_since"], "2026-02-03")
        plain = User.objects.create_user(username="sup_plain2", password="pw")
        self.assertIsNone(UserSerializer(plain).data["supporter_since"])


class PartnershipsTest(TestCase):
    """Item 147 — public apply + guarded admin review."""

    def setUp(self):
        self.admin = User.objects.create_user(
            username="padm", password="pw", role="ADMIN", is_staff=True
        )
        self.client = APIClient()

    def _apply(self, **overrides):
        payload = {
            "school_name": "Liceul Teoretic WebCoder",
            "city": "București",
            "contact_name": "Dir. Clara",
            "contact_email": "clara@liceul.example",
            "estimated_students": 120,
            "message": "We want rated contests for our club.",
        }
        payload.update(overrides)
        return self.client.post(APPLY, payload, format="json")

    def test_public_apply_validates_and_creates(self):
        response = self._apply()
        self.assertEqual(response.status_code, 201)
        row = SchoolPartnershipRequest.objects.get()
        self.assertEqual(row.status, "PENDING")
        self.assertEqual(row.country, "Romania")

        missing = self._apply(school_name="", contact_email="nope")
        self.assertEqual(missing.status_code, 400)

        bad_number = self._apply(estimated_students="many")
        self.assertEqual(bad_number.status_code, 400)

    def test_review_queue_and_transitions(self):
        created = self._apply().data
        basic = User.objects.create_user(username="pbas", password="pw")
        self.client.force_authenticate(basic)
        self.assertEqual(self.client.get(REQUESTS).status_code, 403)

        self.client.force_authenticate(self.admin)
        queue = self.client.get(REQUESTS).data
        self.assertEqual(queue["pending"], 1)
        self.assertEqual(
            queue["requests"][0]["school_name"], "Liceul Teoretic WebCoder"
        )

        review = self.client.patch(
            REVIEW.format(id=created["id"]),
            {"status": "ACTIVE", "review_note": "onboarded"},
            format="json",
        )
        # PENDING → ACTIVE skips CONTACTED: not allowed.
        self.assertEqual(review.status_code, 409)

        contacted = self.client.patch(
            REVIEW.format(id=created["id"]), {"status": "CONTACTED"}, format="json"
        )
        self.assertEqual(contacted.data["status"], "CONTACTED")
        active = self.client.patch(
            REVIEW.format(id=created["id"]),
            {"status": "ACTIVE", "review_note": "DPA signed"},
            format="json",
        )
        self.assertEqual(active.data["status"], "ACTIVE")
        self.assertEqual(active.data["review_note"], "DPA signed")

        unknown = self.client.patch(
            REVIEW.format(id=999), {"status": "CONTACTED"}, format="json"
        )
        self.assertEqual(unknown.status_code, 404)
        bad = self.client.patch(
            REVIEW.format(id=created["id"]), {"status": "SIDEWAYS"}, format="json"
        )
        self.assertEqual(bad.status_code, 400)

    def test_model_str(self):
        row = SchoolPartnershipRequest.objects.create(
            school_name="Școala Nr. 1",
            city="Cluj",
            contact_name="X",
            contact_email="x@example.com",
        )
        self.assertIn("Școala Nr. 1", str(row))
