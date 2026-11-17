"""Wave E items 22/41/42/43/44 — classroom analytics + documents.

- effort board: attempts/active-days ranking across the class's teme;
- failure heatmap: students × problems intensity + class failure rates;
- exam PDF: statements as a printable sheet (a valid PDF byte stream);
- parent report card: per-student per-tema totals as PDF;
- batch imports: members by username (missing reported), problems by id
  list into a tema (labels continue A, B, C…).
"""

from datetime import timedelta

from django.test import TestCase
from django.utils import timezone
from problems.models import Problem
from rest_framework.test import APIClient
from submissions.models import Submission
from users.models import User

from .models import Assignment, AssignmentProblem, ClassMembership, ClassRoom
from .reports import effort_board, exam_pdf, failure_heatmap, report_card_pdf

AC = Submission.VerdictStatus.ACCEPTED
WA = Submission.VerdictStatus.WRONG_ANSWER


class ReportsBase(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="t", password="p", role=User.Roles.TEACHER
        )
        self.classroom = ClassRoom.objects.create(
            name="IX-B", teacher=self.teacher, join_code="ZZZ999"
        )
        self.student = User.objects.create_user(username="st", password="p")
        self.lazy = User.objects.create_user(username="lz", password="p")
        ClassMembership.objects.create(classroom=self.classroom, student=self.student)
        ClassMembership.objects.create(classroom=self.classroom, student=self.lazy)
        self.problem = Problem.objects.create(
            title_i18n={"en": "Sum", "ro": "Suma"},
            statement_i18n={"en": "Print the sum.", "ro": "Afișează suma."},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title_i18n={"en": "HW1", "ro": "T1"},
            available_from=timezone.now() - timedelta(days=2),
            due_at=timezone.now() + timedelta(days=2),
        )
        self.ap = AssignmentProblem.objects.create(
            assignment=self.assignment,
            problem=self.problem,
            order=0,
            label="A",
            points=100,
        )

    def _submit(self, user, verdict, score, minutes_ago=10):
        sub = Submission.objects.create(
            user=user,
            problem=self.problem,
            language="python3",
            code="x",
            verdict=verdict,
            score=score,
        )
        Submission.objects.filter(pk=sub.pk).update(
            submission_time=timezone.now() - timedelta(minutes=minutes_ago)
        )
        return sub


class EffortAndHeatmapTest(ReportsBase):
    """Items 43/44: the analytics derivations."""

    def test_effort_board_ranks_grinders(self):
        # st attempts 3 times (2 active days); lz a single AC.
        self._submit(self.student, WA, 10, minutes_ago=2000)
        self._submit(self.student, WA, 20, minutes_ago=1500)
        self._submit(self.student, WA, 30, minutes_ago=100)
        self._submit(self.lazy, AC, 100)
        board = effort_board(self.classroom)
        rows = {r["username"]: r for r in board["results"]}
        self.assertEqual(rows["st"]["attempts"], 3)
        self.assertEqual(rows["st"]["active_days"], 2)
        self.assertEqual(rows["st"]["problems_solved"], 0)
        self.assertEqual(rows["lz"]["problems_solved"], 1)
        # Effort order: attempts dominate, so st ranks first.
        self.assertEqual(board["results"][0]["username"], "st")

    def test_effort_ignores_out_of_window(self):
        old = self._submit(self.student, WA, 10, minutes_ago=10)
        Submission.objects.filter(pk=old.pk).update(
            submission_time=timezone.now() - timedelta(days=30)
        )
        board = effort_board(self.classroom)
        rows = {r["username"]: r for r in board["results"]}
        self.assertEqual(rows["st"]["attempts"], 0)

    def test_heatmap_intensity_and_rates(self):
        self._submit(self.student, WA, 50)  # half credit -> 0.5 intensity
        self._submit(self.lazy, AC, 100)  # solved -> 0.0
        heat = failure_heatmap(self.classroom)
        self.assertEqual(heat["count"], 1)
        block = heat["assignments"][0]
        cells = {
            row["username"]: row["cells"][0]["intensity"] for row in block["students"]
        }
        self.assertEqual(cells["st"], 0.5)
        self.assertEqual(cells["lz"], 0.0)
        rate = block["failure_rates"][0]
        self.assertEqual(rate["label"], "A")
        self.assertAlmostEqual(rate["failure_rate"], 0.25)

    def test_heatmap_never_attempted_is_none(self):
        heat = failure_heatmap(self.classroom)
        block = heat["assignments"][0]
        cells = {row["username"]: row["cells"][0] for row in block["students"]}
        self.assertIsNone(cells["st"]["intensity"])
        self.assertEqual(cells["st"]["attempts"], 0)
        # Untried counts as failing for the class rate.
        self.assertAlmostEqual(block["failure_rates"][0]["failure_rate"], 1.0)


class DocumentsTest(ReportsBase):
    """Items 41/42: the PDFs."""

    def test_exam_pdf_is_a_pdf(self):
        raw = exam_pdf(self.assignment)
        self.assertTrue(raw.startswith(b"%PDF"))
        self.assertGreater(len(raw), 200)

    def test_report_card_pdf_is_a_pdf(self):
        self._submit(self.student, WA, 40)
        raw = report_card_pdf(self.classroom, self.student)
        self.assertTrue(raw.startswith(b"%PDF"))


class BatchImportTest(ReportsBase):
    """Item 22: both bulk surfaces + the endpoint gates."""

    def setUp(self):
        super().setUp()
        self.client = APIClient()
        self.client.force_authenticate(user=self.teacher)

    def test_members_bulk_reports_missing_and_idempotent(self):
        newcomer = User.objects.create_user(username="new", password="p")
        response = self.client.post(
            f"/api/v1/classroom/classes/{self.classroom.pk}/members/bulk/",
            {"usernames": ["new", "st", "ghost"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["added"], 1)
        self.assertEqual(response.data["already_members"], 1)
        self.assertEqual(response.data["missing"], ["ghost"])
        self.assertTrue(
            ClassMembership.objects.filter(
                classroom=self.classroom, student=newcomer
            ).exists()
        )

    def test_problems_bulk_extends_labels_and_skips(self):
        second = Problem.objects.create(
            title_i18n={"en": "B2"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        draft = Problem.objects.create(
            title_i18n={"en": "D"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.DRAFT,
        )
        response = self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.pk}/problems/bulk/",
            {"problem_ids": [second.id, self.problem.id, draft.id, "junk"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["added"], 1)
        self.assertEqual(response.data["skipped"], 3)
        labels = list(
            self.assignment.assignment_problems.order_by("order").values_list(
                "label", flat=True
            )
        )
        self.assertEqual(labels, ["A", "B"])

    def test_pdf_endpoints_gated_to_teacher(self):
        member_client = APIClient()
        member_client.force_authenticate(user=self.student)
        self.assertEqual(
            member_client.get(
                f"/api/v1/classroom/assignments/{self.assignment.pk}/exam-pdf/"
            ).status_code,
            403,
        )
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.pk}/exam-pdf/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        card = self.client.get(
            f"/api/v1/classroom/classes/{self.classroom.pk}/report-card/{self.student.pk}/"
        )
        self.assertEqual(card.status_code, 200)
        self.assertEqual(card["Content-Type"], "application/pdf")
        # Non-member student id -> 404.
        outsider = User.objects.create_user(username="out", password="p")
        self.assertEqual(
            self.client.get(
                f"/api/v1/classroom/classes/{self.classroom.pk}/report-card/{outsider.pk}/"
            ).status_code,
            404,
        )

    def test_effort_and_heatmap_endpoints_gated(self):
        member_client = APIClient()
        member_client.force_authenticate(user=self.student)
        self.assertEqual(
            member_client.get(
                f"/api/v1/classroom/classes/{self.classroom.pk}/effort/"
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/classroom/classes/{self.classroom.pk}/effort/"
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/classroom/classes/{self.classroom.pk}/heatmap/"
            ).status_code,
            200,
        )

    def test_every_new_endpoint_gates_non_teachers(self):
        member_client = APIClient()
        member_client.force_authenticate(user=self.student)
        teacher_only = [
            ("get", f"/api/v1/classroom/classes/{self.classroom.pk}/heatmap/"),
            (
                "post",
                f"/api/v1/classroom/classes/{self.classroom.pk}/members/bulk/",
            ),
            (
                "get",
                f"/api/v1/classroom/classes/{self.classroom.pk}/report-card/{self.student.pk}/",
            ),
            (
                "post",
                f"/api/v1/classroom/assignments/{self.assignment.pk}/problems/bulk/",
            ),
        ]
        for method, url in teacher_only:
            response = getattr(member_client, method)(url, {"x": 1}, format="json")
            self.assertEqual(response.status_code, 403, url)

    def test_bulk_validates_payload(self):
        response = self.client.post(
            f"/api/v1/classroom/classes/{self.classroom.pk}/members/bulk/",
            {"usernames": []},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        response = self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.pk}/problems/bulk/",
            {"problem_ids": "not-a-list"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
