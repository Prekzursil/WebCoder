"""Study-track tests (SPEC-GAPS X12 · competitive matrix row 8).

Covers the hub visibility matrix, curator authoring permissions, the
APPROVED-only pool rule, ordered add/remove/move semantics and the
per-viewer progress derivations — every line of problems/tracks.py.
"""

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from problems.models import Problem, ProblemList, ProblemListItem
from problems.tracks import _unique_slug
from submissions.models import Submission
from users.models import User


class TrackBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.creator = User.objects.create_user(
            username="creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.student = User.objects.create_user(username="stud", password="pw")
        self.p1 = self.mk_problem("A Plus B", "VERY_EASY")
        self.p2 = self.mk_problem("Two Sum", "EASY")
        self.p3 = self.mk_problem("Binary Search", "MEDIUM")
        self.track = ProblemList.objects.create(
            title_i18n={"en": "Beginner ladder", "ro": "Scara începătorului"},
            description_i18n={"en": "Start here.", "ro": "Începe aici."},
            slug="beginner-ladder",
            owner=self.creator,
        )
        for problem in (self.p1, self.p2, self.p3):
            ProblemListItem.objects.create(
                list=self.track,
                problem=problem,
                position=self.track.items.count() + 1,
            )
        self.client = APIClient()
        self.url = "/api/v1/problems/tracks/"

    def mk_problem(self, title, difficulty, *, status=None):
        return Problem.objects.create(
            title_i18n={"en": title, "ro": title},
            statement_i18n={"en": "s", "ro": "s"},
            difficulty=difficulty,
            status=status or Problem.ProblemStatus.APPROVED,
        )

    def mk_submission(self, user, problem, verdict="AC"):
        return Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code="x",
            verdict=verdict,
            score=100 if verdict == "AC" else 0,
        )


class HubVisibilityTests(TrackBase):
    def test_anonymous_sees_public_tracks_with_counts_no_progress(self):
        ProblemList.objects.create(
            title_i18n={"en": "Hidden"},
            slug="hidden",
            owner=self.creator,
            is_public=False,
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        slugs = [row["slug"] for row in response.data["results"]]
        self.assertEqual(slugs, ["beginner-ladder"])
        row = response.data["results"][0]
        self.assertEqual(row["item_count"], 3)
        self.assertIsNone(row["solved_count"])
        self.assertFalse(row["is_owner"])
        self.assertEqual(row["owner_username"], "creator")

    def test_owner_sees_own_unlisted_track_others_do_not(self):
        ProblemList.objects.create(
            title_i18n={"en": "Hidden"},
            slug="hidden",
            owner=self.creator,
            is_public=False,
        )
        self.client.force_authenticate(self.creator)
        as_owner = self.client.get(self.url).data["results"]
        self.assertEqual(
            sorted(row["slug"] for row in as_owner),
            ["beginner-ladder", "hidden"],
        )
        self.client.force_authenticate(self.student)
        as_student = self.client.get(self.url).data["results"]
        self.assertEqual([row["slug"] for row in as_student], ["beginner-ladder"])
        # Anonymous unlisted detail lookups 404 rather than leak the slug.
        self.assertEqual(
            self.client.get(f"{self.url}hidden/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.get(f"{self.url}hidden/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_admin_hub_sees_every_track(self):
        ProblemList.objects.create(
            title_i18n={"en": "Hidden"},
            slug="hidden",
            owner=self.creator,
            is_public=False,
        )
        self.client.force_authenticate(self.admin)
        rows = self.client.get(self.url).data["results"]
        self.assertEqual(len(rows), 2)


class TrackCreateTests(TrackBase):
    def test_student_cannot_create(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(self.url, {"title_en": "Nope"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_anonymous_cannot_create(self):
        response = self.client.post(self.url, {"title_en": "Nope"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_creator_creates_bilingual_track_with_generated_slug(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            self.url,
            {
                "title_en": "Graph starter",
                "title_ro": "Start grafuri",
                "description_en": "BFS and DFS.",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["slug"], "graph-starter")
        self.assertEqual(
            response.data["title_i18n"], {"en": "Graph starter", "ro": "Start grafuri"}
        )
        self.assertTrue(response.data["is_public"])
        self.assertTrue(response.data["is_owner"])
        self.assertEqual(response.data["item_count"], 0)

    def test_title_ro_defaults_to_english_and_slug_collisions_suffix(self):
        self.client.force_authenticate(self.creator)
        first = self.client.post(self.url, {"title_en": "Same"}, format="json")
        second = self.client.post(self.url, {"title_en": "Same"}, format="json")
        self.assertEqual(first.data["slug"], "same")
        self.assertEqual(second.data["slug"], "same-2")
        self.assertEqual(second.data["title_i18n"]["ro"], "Same")

    def test_unique_slug_falls_back_when_title_unsluggable(self):
        self.assertEqual(_unique_slug("!!!"), "track")
        ProblemList.objects.create(
            title_i18n={"en": "x"}, slug="track", owner=self.creator
        )
        self.assertEqual(_unique_slug("!!!"), "track-2")

    def test_missing_title_rejected(self):
        self.client.force_authenticate(self.creator)
        response = self.client.post(self.url, {"title_ro": "doar ro"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class TrackDetailTests(TrackBase):
    def test_items_ordered_with_solved_flags_and_progress(self):
        self.mk_submission(self.student, self.p2)
        self.mk_submission(self.student, self.p3, verdict="WA")
        self.client.force_authenticate(self.student)
        response = self.client.get(f"{self.url}beginner-ladder/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        items = response.data["items"]
        self.assertEqual(
            [item["problem_id"] for item in items], [self.p1.id, self.p2.id, self.p3.id]
        )
        self.assertEqual([item["position"] for item in items], [1, 2, 3])
        self.assertEqual([item["is_solved"] for item in items], [False, True, False])
        self.assertEqual(response.data["solved_count"], 1)
        self.assertEqual(response.data["item_count"], 3)

    def test_non_approved_items_hidden_from_readers_visible_to_curators(self):
        draft = self.mk_problem("Draft one", "EASY", status=Problem.ProblemStatus.DRAFT)
        ProblemListItem.objects.create(list=self.track, problem=draft, position=4)
        self.client.force_authenticate(self.student)
        reader_items = self.client.get(f"{self.url}beginner-ladder/").data["items"]
        self.assertEqual(len(reader_items), 3)
        self.client.force_authenticate(self.admin)
        curator_items = self.client.get(f"{self.url}beginner-ladder/").data["items"]
        self.assertEqual(len(curator_items), 4)

    def test_unknown_slug_404(self):
        self.assertEqual(
            self.client.get(f"{self.url}nope/").status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_model_str_methods(self):
        self.assertEqual(str(self.track), "Beginner ladder")
        self.assertIn("track", str(self.track.items.first()))
        untitled = ProblemList(title_i18n="not-a-dict")
        self.assertEqual(str(untitled), "Track None")


class TrackEditTests(TrackBase):
    def test_stranger_cannot_patch_delete_or_add(self):
        self.client.force_authenticate(self.student)
        self.assertEqual(
            self.client.patch(
                f"{self.url}beginner-ladder/", {"title_en": "Hijack"}, format="json"
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.delete(f"{self.url}beginner-ladder/").status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/add-problem/",
                {"problem_id": self.p1.id},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/remove-problem/",
                {"problem_id": self.p1.id},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/move-problem/",
                {"problem_id": self.p1.id, "direction": "up"},
                format="json",
            ).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_can_manage_helper_anonymous_is_false(self):
        # Defensive branch: endpoint auth always blocks anonymous callers,
        # the helper itself must still answer safely.
        from django.contrib.auth.models import AnonymousUser

        from problems.tracks import _can_manage

        self.assertFalse(_can_manage(self.track, AnonymousUser()))
        self.assertTrue(_can_manage(self.track, self.creator))

    def test_owner_patches_bilingual_fields_and_visibility(self):
        self.client.force_authenticate(self.creator)
        response = self.client.patch(
            f"{self.url}beginner-ladder/",
            {
                "title_ro": "Scara",
                "description_en": "Updated.",
                "description_ro": "Actualizată.",
                "is_public": False,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.track.refresh_from_db()
        self.assertEqual(self.track.title_i18n["ro"], "Scara")
        self.assertEqual(self.track.description_i18n["en"], "Updated.")
        self.assertEqual(self.track.description_i18n["ro"], "Actualizată.")
        self.assertFalse(self.track.is_public)
        # PUT rides the same partial-update path.
        put = self.client.put(
            f"{self.url}beginner-ladder/", {"title_en": "Ladder"}, format="json"
        )
        self.assertEqual(put.status_code, status.HTTP_200_OK)
        self.assertEqual(put.data["title_i18n"]["en"], "Ladder")

    def test_verifier_can_patch_any_track_owner_deletes(self):
        verifier = User.objects.create_user(
            username="verif", password="pw", role=User.Roles.PROBLEM_VERIFIER
        )
        self.client.force_authenticate(verifier)
        patched = self.client.patch(
            f"{self.url}beginner-ladder/", {"title_en": "Renamed"}, format="json"
        )
        self.assertEqual(patched.status_code, status.HTTP_200_OK)
        self.client.force_authenticate(self.creator)
        self.assertEqual(
            self.client.delete(f"{self.url}beginner-ladder/").status_code,
            status.HTTP_204_NO_CONTENT,
        )
        self.assertFalse(ProblemList.objects.filter(slug="beginner-ladder").exists())


class TrackItemMutationTests(TrackBase):
    def add(self, problem, user=None):
        self.client.force_authenticate(user or self.creator)
        return self.client.post(
            f"{self.url}beginner-ladder/add-problem/",
            {"problem_id": problem.id},
            format="json",
        )

    def test_add_appends_at_the_end(self):
        extra = self.mk_problem("Third Wheel", "EASY")
        response = self.add(extra)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(
            [item["problem_id"] for item in response.data["items"]],
            [self.p1.id, self.p2.id, self.p3.id, extra.id],
        )
        self.assertEqual(response.data["items"][-1]["position"], 4)

    def test_add_rejects_unknown_draft_and_duplicate(self):
        # Unknown id → 404.
        self.client.force_authenticate(self.creator)
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/add-problem/",
                {"problem_id": 999999},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        # Non-APPROVED → 400 (the pool rule).
        draft = self.mk_problem("D", "EASY", status=Problem.ProblemStatus.DRAFT)
        self.assertEqual(self.add(draft).status_code, status.HTTP_400_BAD_REQUEST)
        # Duplicate → 400.
        self.assertEqual(self.add(self.p1).status_code, status.HTTP_400_BAD_REQUEST)
        # Malformed body → 400.
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/add-problem/", {}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_remove_renumbers_remaining_positions(self):
        self.client.force_authenticate(self.creator)
        removed = self.client.post(
            f"{self.url}beginner-ladder/remove-problem/",
            {"problem_id": self.p1.id},
            format="json",
        )
        self.assertEqual(removed.status_code, status.HTTP_200_OK, removed.data)
        self.assertEqual(
            [(item["problem_id"], item["position"]) for item in removed.data["items"]],
            [(self.p2.id, 1), (self.p3.id, 2)],
        )
        self.assertEqual(
            self.client.post(
                f"{self.url}beginner-ladder/remove-problem/",
                {"problem_id": self.p1.id},
                format="json",
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )

    def test_move_swaps_neighbours_and_rejects_edges(self):
        self.client.force_authenticate(self.creator)
        base = f"{self.url}beginner-ladder/move-problem/"
        moved = self.client.post(
            base, {"problem_id": self.p1.id, "direction": "down"}, format="json"
        )
        self.assertEqual(moved.status_code, status.HTTP_200_OK, moved.data)
        self.assertEqual(
            [item["problem_id"] for item in moved.data["items"]],
            [self.p2.id, self.p1.id, self.p3.id],
        )
        up = self.client.post(
            base, {"problem_id": self.p2.id, "direction": "down"}, format="json"
        )
        self.assertEqual(
            [item["problem_id"] for item in up.data["items"]],
            [self.p1.id, self.p2.id, self.p3.id],
        )
        self.assertEqual(
            self.client.post(
                base, {"problem_id": self.p1.id, "direction": "up"}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                base, {"problem_id": self.p3.id, "direction": "down"}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        self.assertEqual(
            self.client.post(
                base, {"problem_id": 999999, "direction": "up"}, format="json"
            ).status_code,
            status.HTTP_404_NOT_FOUND,
        )
        self.assertEqual(
            self.client.post(
                base, {"problem_id": self.p1.id}, format="json"
            ).status_code,
            status.HTTP_400_BAD_REQUEST,
        )
        # Equal stored positions stay deterministic (order by position, id):
        # with every row tied at 1, p1 moving "down" lands below the whole
        # tie-group, not merely below its id-adjacent neighbour.
        ProblemListItem.objects.update(position=1)
        equalized = self.client.post(
            base, {"problem_id": self.p1.id, "direction": "down"}, format="json"
        )
        self.assertEqual(equalized.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [item["problem_id"] for item in equalized.data["items"]],
            [self.p2.id, self.p3.id, self.p1.id],
        )
