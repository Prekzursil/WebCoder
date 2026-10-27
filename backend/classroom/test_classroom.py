"""Classroom tests (Wave B: EDU-1/2/3/5/6).

Covers: models (join codes, hashed join passwords, window semantics, the
EDU-3 association rule), serializer validation (window invariants,
classroom ownership), API permissions (teacher/student/admin matrix),
self-join, rosters, the EDU-5 progress grid, the EDU-6 CSV export, the
student my-assignments progress view, and assignment-published
notifications.
"""

import csv
import io
from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from classroom.export import grid_csv
from classroom.serializers import AssignmentSerializer
from classroom.grid import assignment_grid
from classroom.models import Assignment, AssignmentProblem, ClassMembership, ClassRoom
from notifications.models import Notification
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from submissions.models import Submission
from users.models import User


def _localized(text):
    return {"en": text, "ro": text}


class ClassroomBase(TestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.teacher = User.objects.create_user(
            username="teacher", password="pw", role=User.Roles.TEACHER
        )
        self.other_teacher = User.objects.create_user(
            username="teacher2", password="pw", role=User.Roles.TEACHER
        )
        self.alice = User.objects.create_user(username="alice", password="pw")
        self.bob = User.objects.create_user(username="bob", password="pw")
        self.now = timezone.now()
        self.client = APIClient()

    def mk_problem(self, title):
        p = Problem.objects.create(
            title_i18n=_localized(title),
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=p, input_data="1", expected_output_data="2", points=100, order=1
        )
        return p

    def mk_classroom(self, teacher=None, **kwargs):
        defaults = dict(teacher=teacher or self.teacher, name="IX-A")
        defaults.update(kwargs)
        return ClassRoom.objects.create(**defaults)

    def mk_assignment(self, classroom=None, problem=None, **kwargs):
        defaults = dict(
            classroom=classroom or self.classroom,
            title_i18n=_localized("Tema 1"),
            available_from=self.now - timedelta(hours=1),
            due_at=self.now + timedelta(days=2),
        )
        defaults.update(kwargs)
        assignment = Assignment.objects.create(**defaults)
        if problem is not False:  # False = build a bare assignment, no rows
            AssignmentProblem.objects.create(
                assignment=assignment,
                problem=problem or self.mk_problem("Tema problem"),
                order=0,
                points=100,
            )
        return assignment

    def mk_submission(self, user, problem, *, score, verdict="AC", at=None, code="x"):
        # submission_time is auto_now_add, so pin custom instants via an
        # UPDATE after create (same trick the contest suite uses).
        sub = Submission.objects.create(
            user=user,
            problem=problem,
            language="python3",
            code=code,
            verdict=verdict,
            score=score,
        )
        Submission.objects.filter(pk=sub.pk).update(submission_time=at or self.now)
        sub.refresh_from_db()
        return sub


class ModelTests(ClassroomBase):
    def test_join_code_generated_and_unique(self):
        first = self.mk_classroom()
        self.assertEqual(len(first.join_code), 8)
        with mock.patch(
            "classroom.models._generate_join_code",
            side_effect=[first.join_code, "ZZZZZZZ9"],
        ) as gen:
            second = self.mk_classroom(name="IX-B")
            # First draw collides with `first`, second is fresh.
            self.assertEqual(second.join_code, "ZZZZZZZ9")
            self.assertEqual(gen.call_count, 2)

    def test_join_password_hash_roundtrip(self):
        classroom = ClassRoom(name="X", teacher=self.teacher)
        self.assertTrue(classroom.check_join_password("anything"))
        classroom.set_join_password("secret")
        self.assertFalse(classroom.check_join_password("wrong"))
        self.assertTrue(classroom.check_join_password("secret"))
        classroom.set_join_password("")
        self.assertTrue(classroom.check_join_password(""))

    def test_membership_str(self):
        classroom = self.mk_classroom()
        membership = ClassMembership.objects.create(
            classroom=classroom, student=self.alice
        )
        self.assertEqual(
            str(membership), f"{self.alice.id}@{classroom.id}"
        )
        self.assertEqual(str(classroom), f"IX-A ({self.teacher.id})")

    def test_assignment_state_and_association(self):
        problem = self.mk_problem("P")
        assignment = Assignment(
            classroom=ClassRoom(name="X", teacher=self.teacher),
            title_i18n=_localized("T"),
            available_from=self.now - timedelta(hours=2),
            due_at=self.now,
        )
        # Not saved: state/association are pure computations.
        self.assertEqual(
            assignment.state(self.now + timedelta(seconds=1)),
            Assignment.State.CLOSED,
        )
        self.assertEqual(assignment.state(self.now), Assignment.State.OPEN)
        self.assertEqual(
            assignment.state(self.now - timedelta(minutes=30)),
            Assignment.State.OPEN,
        )
        self.assertEqual(
            assignment.state(self.now - timedelta(hours=3)),
            Assignment.State.SCHEDULED,
        )
        # Before / exactly-on / exactly-after the window boundaries.
        self.assertIsNone(
            assignment.association(self.now - timedelta(hours=2, seconds=1))
        )
        self.assertEqual(
            assignment.association(self.now - timedelta(hours=2)), "ONTIME"
        )
        self.assertIsNone(assignment.association(self.now + timedelta(seconds=1)))
        # Late window extends the counted interval and flags late work.
        assignment.late_until = self.now + timedelta(days=1)
        self.assertEqual(
            assignment.association(self.now + timedelta(seconds=1)), "LATE"
        )
        self.assertIsNone(
            assignment.association(self.now + timedelta(days=1, seconds=1))
        )
        self.assertEqual(assignment.effective_due_at, assignment.late_until)

    def test_assignment_str_shapes(self):
        classroom = self.mk_classroom()
        saved = self.mk_assignment(classroom=classroom)
        self.assertEqual(str(saved), "Tema 1")
        unsaved = Assignment(title_i18n="not-a-dict")
        self.assertEqual(str(unsaved), f"Assignment {unsaved.id}")

    def test_assignment_problem_label_autogenerated(self):
        classroom = self.mk_classroom()
        assignment = self.mk_assignment(classroom=classroom)
        ap = assignment.assignment_problems.first()
        self.assertEqual(ap.label, "A")
        self.assertIn("problem", str(ap))


class GridAndExportTests(ClassroomBase):
    def setUp(self):
        super().setUp()
        self.problem_a = self.mk_problem("A-problem")
        self.problem_b = self.mk_problem("B-problem")
        self.classroom = self.mk_classroom()
        ClassMembership.objects.create(classroom=self.classroom, student=self.alice)
        ClassMembership.objects.create(classroom=self.classroom, student=self.bob)
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title_i18n=_localized("Tema grid"),
            available_from=self.now - timedelta(hours=1),
            due_at=self.now + timedelta(hours=1),
            late_until=self.now + timedelta(hours=2),
        )
        self.ap_a = AssignmentProblem.objects.create(
            assignment=self.assignment, problem=self.problem_a, order=0, points=100
        )
        self.ap_b = AssignmentProblem.objects.create(
            assignment=self.assignment, problem=self.problem_b, order=1, points=50
        )

    def test_grid_counts_only_associated_submissions(self):
        # Alice: ontime 60 then ontime 90 on A; late 40 on B; junk outside.
        self.mk_submission(
            self.alice, self.problem_a, score=60, at=self.now - timedelta(minutes=30)
        )
        self.mk_submission(
            self.alice, self.problem_a, score=90, verdict="AC", at=self.now
        )
        self.mk_submission(
            self.alice,
            self.problem_b,
            score=40,
            at=self.now + timedelta(minutes=90),  # inside the late window
        )
        self.mk_submission(
            self.alice,
            self.problem_b,
            score=100,
            at=self.now + timedelta(hours=3),  # after late_until: ignored
        )
        self.mk_submission(
            self.alice,
            self.problem_a,
            score=100,
            at=self.now - timedelta(hours=2),  # before window: ignored
        )
        grid = assignment_grid(self.assignment)
        cell_a = grid["cells"][(self.alice.id, self.problem_a.id)]
        self.assertEqual(cell_a["best_score"], 90)
        self.assertEqual(cell_a["attempts"], 2)
        self.assertFalse(cell_a["late"])
        cell_b = grid["cells"][(self.alice.id, self.problem_b.id)]
        self.assertEqual(cell_b["best_score"], 40)
        self.assertTrue(cell_b["late"])
        # Bob: nothing counted.
        self.assertNotIn((self.bob.id, self.problem_a.id), grid["cells"])

    def test_grid_pending_scores_count_as_zero(self):
        self.mk_submission(
            self.alice, self.problem_a, score=None, verdict="PENDING"
        )
        grid = assignment_grid(self.assignment)
        cell = grid["cells"][(self.alice.id, self.problem_a.id)]
        self.assertEqual(cell["best_score"], 0)
        self.assertEqual(cell["verdict"], "PENDING")

    def test_grid_empty_class_or_no_problems(self):
        empty = Assignment.objects.create(
            classroom=self.classroom,
            title_i18n=_localized("no problems"),
            available_from=self.now - timedelta(minutes=5),
            due_at=self.now + timedelta(minutes=5),
        )
        grid = assignment_grid(empty)
        self.assertEqual(grid["cells"], {})

    def test_csv_export_shape(self):
        self.mk_submission(self.alice, self.problem_a, score=100, at=self.now)
        self.mk_submission(
            self.bob,
            self.problem_a,
            score=55,
            at=self.now + timedelta(minutes=90),  # late
        )
        content = grid_csv(self.assignment)
        rows = list(csv.reader(io.StringIO(content)))
        self.assertEqual(rows[0], ["username", "A (100p)", "B (50p)", "total"])
        alice_row = next(r for r in rows if r[0] == "alice")
        self.assertEqual(alice_row[1], "100")
        self.assertEqual(alice_row[3], "100")
        bob_row = next(r for r in rows if r[0] == "bob")
        self.assertEqual(bob_row[1], "55 (late)")


class SerializerTests(ClassroomBase):
    def setUp(self):
        super().setUp()
        self.problem = self.mk_problem("P")
        self.classroom = self.mk_classroom()

    def _serializer(self, data, **form_kwargs):
        from classroom.serializers import AssignmentSerializer

        return AssignmentSerializer(data=data, **form_kwargs)

    def test_window_validation(self):
        request = mock.Mock(user=self.teacher)
        base = dict(
            classroom=self.classroom.id,
            title_i18n=_localized("T"),
            available_from=self.now,
            due_at=self.now + timedelta(days=1),
            problems=[{"problem": self.problem.id}],
        )
        s = self._serializer(
            {**base, "due_at": self.now - timedelta(minutes=1)},
            context={"request": request},
        )
        self.assertFalse(s.is_valid())
        self.assertIn("due_at", s.errors)

        s = self._serializer(
            {**base, "late_until": self.now},
            context={"request": request},
        )
        self.assertFalse(s.is_valid())
        self.assertIn("late_until", s.errors)

    def test_classroom_ownership_enforced(self):
        stranger = mock.Mock(user=self.other_teacher)
        s = self._serializer(
            dict(
                classroom=self.classroom.id,
                title_i18n=_localized("T"),
                available_from=self.now,
                due_at=self.now + timedelta(days=1),
            ),
            context={"request": stranger},
        )
        self.assertFalse(s.is_valid())
        self.assertIn("classroom", s.errors)

    def test_create_and_replace_problems(self):
        problem_b = self.mk_problem("Q")
        request = mock.Mock(user=self.teacher)
        data = dict(
            classroom=self.classroom.id,
            title_i18n=_localized("T"),
            available_from=self.now,
            due_at=self.now + timedelta(days=1),
            problems=[
                {"problem": self.problem.id},
                {"problem": problem_b.id, "points": 55},
            ],
        )
        s = self._serializer(data=data, context={"request": request})
        self.assertTrue(s.is_valid(), s.errors)
        assignment = s.save()
        self.assertEqual(assignment.assignment_problems.count(), 2)
        labels = list(
            assignment.assignment_problems.values_list("label", flat=True)
        )
        self.assertEqual(labels, ["A", "B"])
        self.assertEqual(
            assignment.assignment_problems.get(problem=problem_b).points, 55
        )
        # Replace on update.
        s = AssignmentSerializer(
            assignment,
            data={"problems": [{"problem": problem_b.id}]},
            partial=True,
            context={"request": request},
        )
        self.assertTrue(s.is_valid(), s.errors)
        s.save()
        self.assertEqual(assignment.assignment_problems.count(), 1)
        self.assertEqual(
            assignment.assignment_problems.first().problem_id, problem_b.id
        )


class ApiTests(ClassroomBase):
    def setUp(self):
        super().setUp()
        self.problem = self.mk_problem("P")
        self.classroom = self.mk_classroom()
        self.assignment = self.mk_assignment(
            classroom=self.classroom, problem=self.problem
        )
        ClassMembership.objects.create(
            classroom=self.classroom, student=self.alice
        )

    def auth(self, user):
        self.client.force_authenticate(user=user)

    # --- EDU-1: classes -------------------------------------------------
    def test_teacher_creates_and_lists_own_classes_only(self):
        self.auth(self.teacher)
        payload = {
            "name": "X-B",
            "school": "Liceul X",
            "join_password": "pw123",
        }
        response = self.client.post("/api/v1/classroom/classes/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        classroom_id = response.data["id"]
        self.assertEqual(response.data["member_count"], 0)

        # Another teacher's list does not include it.
        self.auth(self.other_teacher)
        response = self.client.get("/api/v1/classroom/classes/")
        self.assertNotIn(classroom_id, [row["id"] for row in response.data["results"]])

    def test_student_cannot_create_class(self):
        self.auth(self.alice)
        response = self.client.post(
            "/api/v1/classroom/classes/", {"name": "mine"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_join_code_hidden_from_non_owner(self):
        self.auth(self.teacher)
        response = self.client.get(f"/api/v1/classroom/classes/{self.classroom.id}/")
        self.assertIn("join_code", response.data)
        self.auth(self.alice)
        response = self.client.get(f"/api/v1/classroom/classes/{self.classroom.id}/")
        self.assertNotIn("join_code", response.data)

    def test_member_and_outsider_class_access(self):
        self.auth(self.alice)
        response = self.client.get(f"/api/v1/classroom/classes/{self.classroom.id}/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.auth(self.bob)
        response = self.client.get(f"/api/v1/classroom/classes/{self.classroom.id}/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # A member still cannot manage it.
        self.auth(self.alice)
        response = self.client.patch(
            f"/api/v1/classroom/classes/{self.classroom.id}/",
            {"name": "hacked"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.delete(f"/api/v1/classroom/classes/{self.classroom.id}/")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_teacher_manage_and_members_roster(self):
        self.auth(self.teacher)
        response = self.client.patch(
            f"/api/v1/classroom/classes/{self.classroom.id}/",
            {"join_password": "new"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        response = self.client.get(
            f"/api/v1/classroom/classes/{self.classroom.id}/members/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row["username"] for row in response.data], ["alice"])
        # Admin sees everything.
        self.auth(self.admin)
        response = self.client.get(
            f"/api/v1/classroom/classes/{self.classroom.id}/members/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Students may not read the roster.
        self.auth(self.alice)
        response = self.client.get(
            f"/api/v1/classroom/classes/{self.classroom.id}/members/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_class(self):
        self.auth(self.teacher)
        response = self.client.delete(
            f"/api/v1/classroom/classes/{self.classroom.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_join_flow(self):
        self.auth(self.bob)
        response = self.client.post(
            "/api/v1/classroom/classes/join/", {"code": "NOPE1234"}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            "/api/v1/classroom/classes/join/",
            {"code": self.classroom.join_code},
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Idempotent second join.
        response = self.client.post(
            "/api/v1/classroom/classes/join/",
            {"code": self.classroom.join_code},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_join_closed_or_passworded_class(self):
        protected = self.mk_classroom(name="Locked")
        protected.set_join_password("open-sesame")
        protected.save()
        self.auth(self.bob)
        response = self.client.post(
            "/api/v1/classroom/classes/join/",
            {"code": protected.join_code, "password": "nope"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.client.post(
            "/api/v1/classroom/classes/join/",
            {"code": protected.join_code, "password": "open-sesame"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        closed = self.mk_classroom(name="Closed", is_open=False)
        self.auth(self.alice)
        response = self.client.post(
            "/api/v1/classroom/classes/join/", {"code": closed.join_code}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_my_classes_counts_open_assignments(self):
        self.auth(self.alice)
        response = self.client.get("/api/v1/classroom/classes/my-classes/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["results"][0]
        self.assertEqual(row["classroom"]["id"], self.classroom.id)
        self.assertEqual(row["open_assignments"], 1)

    # --- EDU-2: assignments ---------------------------------------------
    def test_teacher_assignment_crud(self):
        self.auth(self.teacher)
        payload = {
            "classroom": self.classroom.id,
            "title_i18n": _localized("Tema noua"),
            "available_from": self.now.isoformat(),
            "due_at": (self.now + timedelta(days=1)).isoformat(),
            "problems": [{"problem": self.problem.id, "points": 70}],
        }
        response = self.client.post(
            "/api/v1/classroom/assignments/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        new_id = response.data["id"]
        # List scoped by classroom.
        response = self.client.get(
            "/api/v1/classroom/assignments/",
            {"classroomId": self.classroom.id},
        )
        self.assertEqual(
            sorted(row["id"] for row in response.data["results"]),
            sorted([new_id, self.assignment.id]),
        )
        # Update.
        response = self.client.patch(
            f"/api/v1/classroom/assignments/{new_id}/",
            {"title_i18n": _localized("redusa")},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Delete.
        response = self.client.delete(
            f"/api/v1/classroom/assignments/{new_id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_teacher_cannot_publish_into_foreign_classroom(self):
        self.auth(self.other_teacher)
        payload = {
            "classroom": self.classroom.id,
            "title_i18n": _localized("hijack"),
            "available_from": self.now.isoformat(),
            "due_at": (self.now + timedelta(days=1)).isoformat(),
        }
        response = self.client.post(
            "/api/v1/classroom/assignments/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # And cannot manage the existing one either.
        response = self.client.delete(
            f"/api/v1/classroom/assignments/{self.assignment.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_student_assignment_read_and_denials(self):
        self.auth(self.alice)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        response = self.client.patch(
            f"/api/v1/classroom/assignments/{self.assignment.id}/",
            {"title_i18n": _localized("x")},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/grid/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/export/"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        # Outsider gets 404, not 403 — existence is the teacher's secret.
        self.auth(self.bob)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_assignment_create_notifies_members(self):
        self.auth(self.teacher)
        payload = {
            "classroom": self.classroom.id,
            "title_i18n": _localized("Tema cu notificare"),
            "available_from": self.now.isoformat(),
            "due_at": (self.now + timedelta(days=1)).isoformat(),
            "problems": [{"problem": self.problem.id}],
        }
        with self.captureOnCommitCallbacks(execute=True) as captured:
            response = self.client.post(
            "/api/v1/classroom/assignments/", payload, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(captured)
        notification = Notification.objects.filter(
            recipient=self.alice, verb=Notification.Verb.ASSIGNMENT_PUBLISHED
        ).first()
        self.assertIsNotNone(notification)
        self.assertEqual(notification.data["classroom"], self.classroom.name)

    # --- EDU-5/EDU-6: grid + export over the API ------------------------
    def test_grid_and_export_endpoints(self):
        self.mk_submission(self.alice, self.problem, score=100, at=self.now)
        self.mk_submission(self.bob, self.problem, score=25, at=self.now)
        self.auth(self.teacher)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/grid/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        alice_cell = response.data["cells"][f"{self.alice.id}:{self.problem.id}"]
        self.assertEqual(alice_cell["best_score"], 100)
        self.assertEqual(response.data["problems"][0]["label"], "A")

        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/export/"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response["Content-Type"], "text/csv; charset=utf-8")
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(rows[0][0], "username")

    # --- student progress view -------------------------------------------
    def test_my_assignments_progress(self):
        self.mk_submission(self.alice, self.problem, score=100, at=self.now)
        self.auth(self.alice)
        response = self.client.get("/api/v1/classroom/assignments/my-assignments/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = response.data["results"][0]
        self.assertEqual(row["state"], Assignment.State.OPEN)
        self.assertEqual(row["problems"][0]["best_score"], 100)
        self.assertEqual(row["solved_count"], 1)
        # Later, weaker submissions never lower the best (ordered by id).
        self.mk_submission(
            self.alice,
            self.problem,
            score=40,
            verdict="WA",
            at=self.now + timedelta(seconds=1),
        )
        self.mk_submission(
            self.alice,
            self.problem,
            score=None,
            verdict="PENDING",
            at=self.now + timedelta(seconds=2),
        )
        response = self.client.get("/api/v1/classroom/assignments/my-assignments/")
        row = response.data["results"][0]
        self.assertEqual(row["problems"][0]["best_score"], 100)
        # Not-yet-published assignments still appear, as SCHEDULED.
        future = self.mk_assignment(
            classroom=self.classroom,
            title_i18n=_localized("viitoare"),
            available_from=self.now + timedelta(days=1),
            due_at=self.now + timedelta(days=2),
        )
        response = self.client.get("/api/v1/classroom/assignments/my-assignments/")
        states = {row["id"]: row["state"] for row in response.data["results"]}
        self.assertEqual(states[future.id], Assignment.State.SCHEDULED)
        # Students with no memberships see an empty list.
        self.auth(self.bob)
        response = self.client.get("/api/v1/classroom/assignments/my-assignments/")
        self.assertEqual(response.data["results"], [])

    def test_admin_sees_all_assignments(self):
        self.auth(self.admin)
        response = self.client.get("/api/v1/classroom/assignments/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["results"]), 1)


class CoverageClosureTests(ClassroomBase):
    """Targeted cases for lines the API matrix cannot reach."""

    def setUp(self):
        super().setUp()
        self.problem = self.mk_problem("P")
        self.classroom = self.mk_classroom()
        self.client = APIClient()

    def auth(self, user):
        self.client.force_authenticate(user=user)

    def test_serializer_without_request_context(self):
        from classroom.serializers import ClassRoomSerializer

        data = ClassRoomSerializer(self.classroom).data
        self.assertFalse(data["is_owner"])
        # Anonymous request renders the same shape.
        anon = mock.Mock()
        anon.user.is_authenticated = False
        data = ClassRoomSerializer(self.classroom, context={"request": anon}).data
        self.assertFalse(data["is_owner"])

    def test_assignment_serializer_requires_authenticated_user(self):
        anon = mock.Mock()
        anon.user = mock.Mock(is_authenticated=False)
        s = AssignmentSerializer(
            data=dict(
                classroom=self.classroom.id,
                title_i18n=_localized("T"),
                available_from=self.now.isoformat(),
                due_at=(self.now + timedelta(days=1)).isoformat(),
            ),
            context={"request": anon},
        )
        self.assertFalse(s.is_valid())
        self.assertIn("classroom", s.errors)

    def test_classroom_update_without_password_field(self):
        self.auth(self.teacher)
        response = self.client.patch(
            f"/api/v1/classroom/classes/{self.classroom.id}/",
            {"name": "IX-C"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.classroom.refresh_from_db()
        self.assertEqual(self.classroom.name, "IX-C")

    def test_assignment_problem_keeps_explicit_label(self):
        assignment = self.mk_assignment(classroom=self.classroom, problem=False)
        ap = AssignmentProblem.objects.create(
            assignment=assignment,
            problem=self.problem,
            order=3,
            label="Z",
        )
        self.assertEqual(ap.label, "Z")
