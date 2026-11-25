"""Bio field tests (matrix row 59's public-profile remainder).

The self-service PATCH on /users/me/, the UserSerializer read side, and
the public rating-profile payload all carry the self-authored bio.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from users.models import User


class BioFieldTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="bio-user", password="pw", bio="Solving graphs since 2019."
        )
        self.client = APIClient()

    def test_users_me_patch_round_trips_the_bio(self):
        self.client.force_authenticate(self.user)
        response = self.client.patch(
            "/api/v1/users/me/",
            {"bio": "Revised: graphs, then segment trees."},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, "Revised: graphs, then segment trees.")

    def test_user_serializer_exposes_the_bio(self):
        self.client.force_authenticate(self.user)
        response = self.client.get("/api/v1/users/me/")
        self.assertEqual(response.data["bio"], "Solving graphs since 2019.")

    def test_public_rating_profile_carries_the_bio(self):
        other = User.objects.create_user(username="viewer", password="pw")
        self.client.force_authenticate(other)
        response = self.client.get("/api/v1/ratings/users/bio-user/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["bio"], "Solving graphs since 2019.")
