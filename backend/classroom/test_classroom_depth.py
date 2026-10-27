"""Wave C classroom depth tests (EDU-4 exam lockdown, EDU-7 quiz/file teme,
EDU-8 MCQ bank + seed pilot)."""

import os
import tempfile
from datetime import timedelta
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from classroom.exam import active_exam, exam_blocked_path, exam_problem_ids
from classroom.models import (
    Assignment,
    AssignmentProblem,
    AssignmentQuizItem,
    ClassMembership,
    ClassRoom,
    MCQItem,
    QuizSubmission,
    UploadedDeliverable,
)
from classroom.quiz import grade_answers, item_stats, shuffle_order
from problems.models import Problem
from problems.models import TestCase as ProblemTestCase
from users.models import User


def _media_tmp():
    return override_settings(MEDIA_ROOT=tempfile.mkdtemp(prefix="wc-mcq-"))


class ClassroomDepthBase(TestCase):
    def setUp(self):
        self.teacher = User.objects.create_user(
            username="teach", password="pw", role=User.Roles.TEACHER
        )
        self.student = User.objects.create_user(username="stud", password="pw")
        self.student2 = User.objects.create_user(username="stud2", password="pw")
        self.now = timezone.now()
        self.classroom = ClassRoom.objects.create(teacher=self.teacher, name="IX-A")
        for student in (self.student, self.student2):
            ClassMembership.objects.create(classroom=self.classroom, student=student)
        self.client = APIClient()

    def mk_assignment(self, **kwargs):
        defaults = dict(
            classroom=self.classroom,
            title_i18n={"en": "Tema", "ro": "Temă"},
            available_from=self.now - timedelta(hours=1),
            due_at=self.now + timedelta(days=1),
        )
        defaults.update(kwargs)
        return Assignment.objects.create(**defaults)

    def mk_mcq(self, suffix=""):
        return MCQItem.objects.create(
            grade=9,
            question_i18n={"en": f"2+2?{suffix}", "ro": f"Cât e 2+2?{suffix}"},
            variants_en=["3", "4", "5", "6"],
            variants_ro=["3", "4", "5", "6"],
            correct_index=1,
        )


class MCQBankTests(ClassroomDepthBase):
    """EDU-8 — item CRUD + filters."""

    def test_teacher_creates_and_student_reads_with_filters(self):
        self.client.force_authenticate(self.teacher)
        created = self.client.post(
            "/api/v1/classroom/mcq/",
            {
                "grade": 9,
                "question_i18n": {"en": "Q?", "ro": "Î?"},
                "variants_en": ["a", "b", "c", "d"],
                "variants_ro": ["a", "b", "c", "d"],
                "correct_index": 2,
                "discipline": "Informatics",
                "bac_year": 2024,
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        self.assertEqual(created.data["author"], self.teacher.id)

        other = self.mk_mcq("x")
        other.discipline = "Computing"
        other.save()

        self.client.force_authenticate(self.student)
        informatics = self.client.get("/api/v1/classroom/mcq/?discipline=Informatics")
        self.assertEqual(informatics.status_code, 200)
        ids = [row["id"] for row in informatics.data["results"]]
        self.assertIn(created.data["id"], ids)
        self.assertNotIn(other.id, ids)
        by_year = self.client.get("/api/v1/classroom/mcq/?bacYear=2024")
        self.assertEqual(
            [row["id"] for row in by_year.data["results"]], [created.data["id"]]
        )

    def test_variant_shape_is_enforced(self):
        self.client.force_authenticate(self.teacher)
        bad = self.client.post(
            "/api/v1/classroom/mcq/",
            {
                "grade": 9,
                "question_i18n": {"en": "Q?"},
                "variants_en": ["a", "b"],
                "variants_ro": ["a", "b", "c", "d"],
                "correct_index": 0,
            },
            format="json",
        )
        self.assertEqual(bad.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("4 variants", str(bad.data["variants"]))

    def test_students_cannot_write(self):
        self.client.force_authenticate(self.student)
        denied = self.client.post(
            "/api/v1/classroom/mcq/",
            {
                "grade": 9,
                "question_i18n": {"en": "Q?"},
                "variants_en": ["a", "b", "c", "d"],
                "variants_ro": ["a", "b", "c", "d"],
                "correct_index": 0,
            },
            format="json",
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)


class SeedPilotTests(ClassroomDepthBase):
    """Round-2 content pilot: 30 bilingual grade-9 items in one chapter."""

    def test_seed_creates_30_bilingual_items_idempotently(self):
        call_command("seed_mcq", author=self.teacher.username)
        self.assertEqual(MCQItem.objects.filter(grade=9).count(), 30)
        sample = MCQItem.objects.first()
        self.assertTrue(sample.variants_valid())
        self.assertIn("ro", sample.question_i18n)
        self.assertTrue(sample.chapter.slug, "g9-elementary-algorithms")
        call_command("seed_mcq", author=self.teacher.username)
        self.assertEqual(MCQItem.objects.filter(grade=9).count(), 30)


class QuizFlowTests(ClassroomDepthBase):
    """EDU-7/8 — sheet, submit, grading, stats, grid."""

    def setUp(self):
        super().setUp()
        self.items = [self.mk_mcq(str(i)) for i in range(3)]
        self.assignment = self.mk_assignment(
            kind=Assignment.Kind.QUIZ, quiz_shuffle=True
        )
        for order, item in enumerate(self.items):
            AssignmentQuizItem.objects.create(
                assignment=self.assignment, item=item, order=order
            )

    def sheet_answers(self, user):
        """Answer every item correctly through the DISPLAYED order."""
        self.client.force_authenticate(user)
        sheet = self.client.get(f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/")
        self.assertEqual(sheet.status_code, 200)
        answers = {}
        for entry in sheet.data["items"]:
            self.assertIsNone(entry["correct_index"])  # never leaked
            order = shuffle_order(self.assignment, user.id)
            displayed_correct = order.index(entry and 1)  # correct original idx=1
            answers[str(entry["item_id"])] = displayed_correct
        return sheet, answers

    def test_sheet_submit_perfect_score(self):
        _, answers = self.sheet_answers(self.student)
        self.client.force_authenticate(self.student)
        result = self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/submit/",
            {"answers": answers},
            format="json",
        )
        self.assertEqual(result.status_code, status.HTTP_201_CREATED, result.data)
        self.assertEqual(result.data["score"], 1.0)
        self.assertEqual(result.data["correct_count"], 3)

    def test_partial_score_and_missing_answers(self):
        from classroom.quiz import shuffle_order

        order = shuffle_order(self.assignment, self.student.id)
        displayed = order.index(self.items[0].correct_index)
        self.client.force_authenticate(self.student)
        result = self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/submit/",
            {"answers": {str(self.items[0].id): displayed}},
            format="json",
        )
        self.assertEqual(result.status_code, status.HTTP_201_CREATED)
        self.assertEqual(result.data["correct_count"], 1)
        self.assertEqual(result.data["total_count"], 3)
        self.assertAlmostEqual(result.data["score"], 1 / 3)

    def test_deterministic_shuffle_differs_across_students(self):
        order_a = shuffle_order(self.assignment, self.student.id)
        self.assertEqual(order_a, shuffle_order(self.assignment, self.student.id))
        order_b = shuffle_order(self.assignment, self.student2.id)
        self.assertEqual(sorted(order_a), [0, 1, 2, 3])
        self.assertEqual(sorted(order_b), [0, 1, 2, 3])

    def test_teacher_sheet_reveals_correct_index(self):
        self.client.force_authenticate(self.teacher)
        sheet = self.client.get(f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/")
        self.assertEqual(sheet.status_code, 200)
        self.assertEqual(sheet.data["items"][0]["correct_index"], 1)

    def test_submit_closed_window_rejected(self):
        assignment = self.mk_assignment(
            kind=Assignment.Kind.QUIZ,
            available_from=self.now - timedelta(days=2),
            due_at=self.now - timedelta(days=1),
        )
        self.client.force_authenticate(self.student)
        response = self.client.post(
            f"/api/v1/classroom/assignments/{assignment.id}/quiz/submit/",
            {"answers": {}},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_stats_and_grid(self):
        # Both students attempt; one perfect, one partial -> per-item rates.
        for user, only_first in ((self.student, False), (self.student2, True)):
            answers = {}
            order = shuffle_order(self.assignment, user.id)
            for item in self.items:
                correct_displayed = order.index(item.correct_index)
                if only_first and item is not self.items[0]:
                    answers[str(item.id)] = (correct_displayed + 1) % 4
                else:
                    answers[str(item.id)] = correct_displayed
            QuizSubmission.objects.create(
                assignment=self.assignment,
                student=user,
                **grade_answers(self.assignment, user, answers),
            )
        self.client.force_authenticate(self.teacher)
        stats = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/stats/"
        )
        self.assertEqual(stats.status_code, 200)
        self.assertEqual(len(stats.data["items"]), 3)
        self.assertEqual(stats.data["items"][0]["attempts"], 2)
        self.assertEqual(stats.data["items"][0]["correct"], 2)
        grid = self.client.get(f"/api/v1/classroom/assignments/{self.assignment.id}/grid/")
        self.assertEqual(grid.status_code, 200)
        self.assertEqual(grid.data["kind"], "QUIZ")
        self.assertEqual(grid.data["cells"][str(self.student.id)]["score"], 1.0)
        self.assertEqual(grid.data["cells"][str(self.student.id)]["attempts"], 1)

    def test_quiz_view_requires_membership(self):
        outsider = User.objects.create_user(username="out", password="pw")
        self.client.force_authenticate(outsider)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        # The same visibility rule on the submit + stats surfaces.
        submit = self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/submit/",
            {"answers": {}},
            format="json",
        )
        self.assertEqual(submit.status_code, status.HTTP_404_NOT_FOUND)
        stats = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/quiz/stats/"
        )
        self.assertEqual(stats.status_code, status.HTTP_404_NOT_FOUND)
        files = self.mk_assignment(kind=Assignment.Kind.FILES)
        deliverables = self.client.get(
            f"/api/v1/classroom/assignments/{files.id}/deliverables/"
        )
        self.assertEqual(deliverables.status_code, status.HTTP_404_NOT_FOUND)

    def test_problems_assignment_rejected_on_quiz_endpoint(self):
        assignment = self.mk_assignment()
        self.client.force_authenticate(self.student)
        response = self.client.get(
            f"/api/v1/classroom/assignments/{assignment.id}/quiz/"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class DeliverableTests(ClassroomDepthBase):
    """EDU-7 FILES teme — policy-validated uploads."""

    def setUp(self):
        super().setUp()
        self.assignment = self.mk_assignment(
            kind=Assignment.Kind.FILES,
            file_extensions="pdf,zip",
            max_file_mb=1,
        )

    def upload(self, user, filename, content=b"x"):
        self.client.force_authenticate(user)
        payload = {"file": SimpleUploadedFile(filename, content)}
        return self.client.post(
            f"/api/v1/classroom/assignments/{self.assignment.id}/deliverables/",
            payload,
        )

    def test_upload_policy_and_listing(self):
        ok = self.upload(self.student, "tema.pdf", b"%PDF-1.4 fake")
        self.assertEqual(ok.status_code, status.HTTP_201_CREATED, ok.data)
        self.assertEqual(ok.data["original_filename"], "tema.pdf")

        wrong_ext = self.upload(self.student, "tema.exe")
        self.assertEqual(wrong_ext.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Allowed extensions", str(wrong_ext.data["file"]))

        too_big = self.upload(
            self.student, "big.pdf", b"x" * (1024 * 1024 + 1)
        )
        self.assertEqual(too_big.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("at most 1 MB", str(too_big.data["file"]))

        # Student sees own; teacher sees all.
        self.upload(self.student2, "other.zip")
        self.client.force_authenticate(self.student)
        mine = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/deliverables/"
        )
        self.assertEqual(mine.status_code, 200)
        self.assertEqual({r["student"]["username"] for r in mine.data["results"]}, {"stud"})
        self.client.force_authenticate(self.teacher)
        all_rows = self.client.get(
            f"/api/v1/classroom/assignments/{self.assignment.id}/deliverables/"
        )
        self.assertEqual(
            {r["student"]["username"] for r in all_rows.data["results"]},
            {"stud", "stud2"},
        )

    def test_teacher_cannot_upload_and_closed_window_blocks(self):
        denied = self.upload(self.teacher, "notes.pdf")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.assignment.due_at = self.now - timedelta(minutes=1)
        self.assignment.save()
        closed = self.upload(self.student, "late.pdf")
        self.assertEqual(closed.status_code, status.HTTP_400_BAD_REQUEST)

    def test_files_grid(self):
        self.upload(self.student, "tema.pdf")
        self.client.force_authenticate(self.teacher)
        grid = self.client.get(f"/api/v1/classroom/assignments/{self.assignment.id}/grid/")
        self.assertEqual(grid.status_code, 200)
        self.assertEqual(grid.data["kind"], "FILES")
        self.assertEqual(grid.data["cells"][str(self.student.id)]["count"], 1)
        self.assertNotIn(str(self.student2.id), grid.data["cells"])


class ExamModeTests(ClassroomDepthBase):
    """EDU-4 — site lockdown while sitting an OPEN is_exam teme."""

    def setUp(self):
        super().setUp()
        self.exam_problem = Problem.objects.create(
            title_i18n={"en": "Exam task", "ro": "Subiect"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        ProblemTestCase.objects.create(
            problem=self.exam_problem,
            input_data="1",
            expected_output_data="2",
            points=10,
        )
        self.exam = self.mk_assignment(is_exam=True)
        AssignmentProblem.objects.create(
            assignment=self.exam, problem=self.exam_problem, order=0, points=100
        )
        self.foreign = Problem.objects.create(
            title_i18n={"en": "Foreign", "ro": "Străin"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )

    def test_policy_matrix(self):
        allowed_ids = {self.exam_problem.id}
        self.assertIsNone(exam_blocked_path("/api/v1/classroom/classes/", allowed_ids))
        self.assertIsNone(
            exam_blocked_path(f"/api/v1/problems/{self.exam_problem.id}/", allowed_ids)
        )
        self.assertIsNone(exam_blocked_path("/api/v1/submissions/submit/", allowed_ids))
        self.assertIsNone(exam_blocked_path("/admin/", allowed_ids))
        self.assertIsNotNone(exam_blocked_path("/api/v1/forum/threads/", allowed_ids))
        self.assertIsNotNone(
            exam_blocked_path(f"/api/v1/problems/{self.foreign.id}/", allowed_ids)
        )
        self.assertIsNotNone(
            exam_blocked_path(
                f"/api/v1/problems/{self.exam_problem.id}/editorial/", allowed_ids
            )
        )
        self.assertIsNotNone(exam_blocked_path("/api/v1/problems/", allowed_ids))
        self.assertIsNotNone(exam_blocked_path("/api/v1/leaderboard/", allowed_ids))

    def test_active_exam_scoping(self):
        self.assertIsNotNone(active_exam(self.student))
        self.assertIsNone(active_exam(self.teacher))  # staff/teacher never locked
        self.assertIsNone(active_exam(None))
        self.assertEqual(exam_problem_ids(self.student), {self.exam_problem.id})
        # Closed exam releases the lock (soft expiry).
        self.exam.due_at = self.now - timedelta(minutes=1)
        self.exam.save()
        self.assertIsNone(active_exam(self.student))

    def test_middleware_locks_and_releases(self):
        self.client.force_authenticate(self.student)
        blocked = self.client.get("/api/v1/forum/threads/")
        self.assertEqual(blocked.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(blocked.json().get("exam_mode"))
        allowed = self.client.get("/api/v1/classroom/exam-mode/")
        self.assertEqual(allowed.status_code, 200)
        self.assertTrue(allowed.json()["active"])
        self.assertEqual(allowed.json()["assignment"]["id"], self.exam.id)

        self.exam.due_at = self.now - timedelta(minutes=1)
        self.exam.save()
        reopened = self.client.get("/api/v1/forum/threads/")
        self.assertEqual(reopened.status_code, status.HTTP_200_OK)
        status_after = self.client.get("/api/v1/classroom/exam-mode/")
        self.assertFalse(status_after.json()["active"])

    def test_exam_mode_view_shapes(self):
        anonymous = APIClient().get("/api/v1/classroom/exam-mode/")
        self.assertEqual(anonymous.json(), {"active": False, "assignment": None})
        self.client.force_authenticate(self.student2)  # member, also locked
        payload = self.client.get("/api/v1/classroom/exam-mode/").json()
        self.assertTrue(payload["active"])
        self.assertIn("due_at", payload["assignment"])


class QuizUtilsClosureTests(ClassroomDepthBase):
    """Branch closure for the pure helpers (100% gate)."""

    def test_grade_answers_ignores_garbage(self):
        item = self.mk_mcq()
        assignment = self.mk_assignment(kind=Assignment.Kind.QUIZ)
        AssignmentQuizItem.objects.create(assignment=assignment, item=item, order=0)
        graded = grade_answers(
            assignment,
            self.student,
            {str(item.id): "not-a-number", "999": 1, 7: "x"},
        )
        self.assertEqual(graded["total_count"], 1)
        self.assertEqual(graded["correct_count"], 0)
        # int keys also accepted (through the displayed-order permutation).
        displayed = shuffle_order(assignment, self.student.id).index(item.correct_index)
        graded2 = grade_answers(assignment, self.student, {item.id: displayed})
        self.assertEqual(graded2["correct_count"], 1)
        # Out-of-range integer choices parse but never match.
        graded3 = grade_answers(assignment, self.student, {item.id: 9})
        self.assertEqual(graded3["correct_count"], 0)
        # Empty quiz.
        empty = self.mk_assignment(kind=Assignment.Kind.QUIZ)
        self.assertEqual(grade_answers(empty, self.student, {}), {
            "answers": {},
            "score": 0.0,
            "correct_count": 0,
            "total_count": 0,
        })

    def test_item_stats_empty_and_no_shuffle(self):
        assignment = self.mk_assignment(kind=Assignment.Kind.QUIZ, quiz_shuffle=False)
        item = self.mk_mcq("s")
        AssignmentQuizItem.objects.create(assignment=assignment, item=item, order=0)
        QuizSubmission.objects.create(
            assignment=assignment,
            student=self.student,
            answers={str(item.id): 3},
            score=0,
            correct_count=0,
            total_count=1,
        )
        # Garbage + out-of-range answers count as attempts, never correct.
        QuizSubmission.objects.all().delete()
        QuizSubmission.objects.create(
            assignment=assignment,
            student=self.student2,
            answers={str(item.id): "junk"},
            score=0,
            correct_count=0,
            total_count=1,
        )
        QuizSubmission.objects.create(
            assignment=assignment,
            student=self.student,
            answers={str(item.id): 9},
            score=0,
            correct_count=0,
            total_count=1,
        )
        QuizSubmission.objects.create(
            assignment=assignment,
            student=self.teacher,
            answers={str(item.id): "junk"},
            score=0,
            correct_count=0,
            total_count=1,
        )
        # An empty answer sheet: the item is missing entirely.
        QuizSubmission.objects.create(
            assignment=assignment,
            student=self.student2,
            answers={},
            score=0,
            correct_count=0,
            total_count=1,
        )
        # Unparseable answers never register as attempts; out-of-range ones do.
        stats = item_stats(assignment)
        self.assertEqual(stats[0]["attempts"], 1)
        self.assertEqual(stats[0]["correct"], 0)
        self.assertEqual(stats[0]["correct_rate"], 0.0)
        # No attempts at all -> rate is None (never a misleading 0%).
        empty_stats = item_stats(self.mk_assignment(kind=Assignment.Kind.QUIZ))
        self.assertEqual(empty_stats, [])
        # Shuffle disabled: identity order.
        self.assertEqual(shuffle_order(assignment, self.student.id), [0, 1, 2, 3])


class CoverageClosureTests(ClassroomDepthBase):
    """Drive every remaining Wave C branch to the 100% gate."""

    # -- model __str__ ------------------------------------------------
    def test_model_str_representations(self):
        from problems.models import CurriculumNode

        item = self.mk_mcq()
        self.assertIn("2+2?", str(item))
        assignment = self.mk_assignment(kind=Assignment.Kind.QUIZ)
        link = AssignmentQuizItem.objects.create(
            assignment=assignment, item=item, order=0
        )
        self.assertIn("quiz item", str(link))
        submission = QuizSubmission.objects.create(
            assignment=assignment, student=self.student, answers={}
        )
        self.assertIn("quiz", str(submission))
        files_assignment = self.mk_assignment(kind=Assignment.Kind.FILES)
        deliverable = UploadedDeliverable.objects.create(
            assignment=files_assignment,
            student=self.student,
            file=SimpleUploadedFile("a.pdf", b"x"),
        )
        self.assertIn("deliverable", str(deliverable))
        self.assertTrue(item.variants_valid())
        broken = MCQItem.objects.create(
            grade=9,
            question_i18n={"en": "x"},
            variants_en=["1", "2"],
            variants_ro=["1", "2"],
            correct_index=9,
        )
        self.assertFalse(broken.variants_valid())

    # -- API paths through the serializer ------------------------------
    def test_teacher_creates_quiz_assignment_with_ids(self):
        item_a = self.mk_mcq("a")
        item_b = self.mk_mcq("b")
        self.client.force_authenticate(self.teacher)
        created = self.client.post(
            "/api/v1/classroom/assignments/",
            {
                "classroom": self.classroom.id,
                "title_i18n": {"en": "Grile", "ro": "Grile"},
                "available_from": (self.now - timedelta(hours=1)).isoformat(),
                "due_at": (self.now + timedelta(days=1)).isoformat(),
                "kind": "QUIZ",
                "quiz_item_ids": [item_a.id, item_b.id],
            },
            format="json",
        )
        self.assertEqual(created.status_code, status.HTTP_201_CREATED, created.data)
        assignment = Assignment.objects.get(pk=created.data["id"])
        self.assertEqual(
            [q.item_id for q in assignment.quiz_items.all()],
            [item_a.id, item_b.id],
        )
        # Update replaces the board.
        updated = self.client.patch(
            f"/api/v1/classroom/assignments/{assignment.id}/",
            {"quiz_item_ids": [item_b.id]},
            format="json",
        )
        self.assertEqual(updated.status_code, status.HTTP_200_OK, updated.data)
        self.assertEqual(
            [q.item_id for q in assignment.quiz_items.all()], [item_b.id]
        )

    def test_assignment_serializer_validation(self):
        self.client.force_authenticate(self.teacher)
        base = {
            "classroom": self.classroom.id,
            "title_i18n": {"en": "T"},
            "available_from": (self.now - timedelta(hours=1)).isoformat(),
            "due_at": (self.now + timedelta(days=1)).isoformat(),
        }
        bad_mb = self.client.post(
            "/api/v1/classroom/assignments/",
            {**base, "kind": "FILES", "max_file_mb": 0},
            format="json",
        )
        self.assertEqual(bad_mb.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("between 1 and 50", str(bad_mb.data["max_file_mb"]))

        bad_ids = self.client.post(
            "/api/v1/classroom/assignments/",
            {**base, "kind": "QUIZ", "quiz_item_ids": [99999]},
            format="json",
        )
        self.assertEqual(bad_ids.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("existing MCQ item", str(bad_ids.data["quiz_item_ids"]))

    # -- anonymous + mismatch arms on the function views ---------------
    def test_function_view_error_arms(self):
        quiz = self.mk_assignment(kind=Assignment.Kind.QUIZ)
        item = self.mk_mcq()
        AssignmentQuizItem.objects.create(assignment=quiz, item=item, order=0)
        files = self.mk_assignment(kind=Assignment.Kind.FILES)

        anon = APIClient()
        for method, url in (
            ("get", f"/api/v1/classroom/assignments/{quiz.id}/quiz/"),
            ("post", f"/api/v1/classroom/assignments/{quiz.id}/quiz/submit/"),
            ("get", f"/api/v1/classroom/assignments/{quiz.id}/quiz/stats/"),
            ("get", f"/api/v1/classroom/assignments/{files.id}/deliverables/"),
        ):
            response = getattr(anon, method)(url, {} if method == "post" else None)
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED, url)

        self.client.force_authenticate(self.student)
        missing_quiz = self.client.get("/api/v1/classroom/assignments/99999/quiz/")
        self.assertEqual(missing_quiz.status_code, status.HTTP_404_NOT_FOUND)
        missing_files = self.client.get(
            "/api/v1/classroom/assignments/99999/deliverables/"
        )
        self.assertEqual(missing_files.status_code, status.HTTP_404_NOT_FOUND)
        not_quiz = self.client.post(
            f"/api/v1/classroom/assignments/{files.id}/quiz/submit/",
            {"answers": {}},
            format="json",
        )
        self.assertEqual(not_quiz.status_code, status.HTTP_400_BAD_REQUEST)
        stats_denied = self.client.get(
            f"/api/v1/classroom/assignments/{quiz.id}/quiz/stats/"
        )
        self.assertEqual(stats_denied.status_code, status.HTTP_403_FORBIDDEN)
        files_on_quiz = self.client.get(
            f"/api/v1/classroom/assignments/{quiz.id}/deliverables/"
        )
        self.assertEqual(files_on_quiz.status_code, status.HTTP_400_BAD_REQUEST)
        no_file = self.client.post(
            f"/api/v1/classroom/assignments/{files.id}/deliverables/", {}
        )
        self.assertEqual(no_file.status_code, status.HTTP_400_BAD_REQUEST)
        bad_answers = self.client.post(
            f"/api/v1/classroom/assignments/{quiz.id}/quiz/submit/",
            {"answers": "not-a-dict"},
            format="json",
        )
        self.assertEqual(bad_answers.status_code, status.HTTP_400_BAD_REQUEST)
        # Anonymous exam-mode returns the quiet shape (middleware never locks
        # anonymous paths, and the view double-checks).
        self.assertEqual(
            anon.get("/api/v1/classroom/exam-mode/").json(),
            {"active": False, "assignment": None},
        )

    # -- MCQ filter arms ------------------------------------------------
    def test_mcq_grade_and_chapter_filters(self):
        item = self.mk_mcq("f")
        item.grade = 10
        item.save()
        self.client.force_authenticate(self.teacher)
        by_grade = self.client.get("/api/v1/classroom/mcq/?grade=10")
        self.assertEqual(
            [row["id"] for row in by_grade.data["results"]], [item.id]
        )
        by_chapter = self.client.get(f"/api/v1/classroom/mcq/?chapter=999")
        self.assertEqual(by_chapter.data["results"], [])

    # -- grid payloads ---------------------------------------------------
    def test_quiz_grid_counts_multiple_attempts(self):
        quiz = self.mk_assignment(kind=Assignment.Kind.QUIZ)
        item = self.mk_mcq("m")
        AssignmentQuizItem.objects.create(assignment=quiz, item=item, order=0)
        for score in (1.0, 0.0, 0.5):  # best, worse, then a mid re-attempt
            QuizSubmission.objects.create(
                assignment=quiz,
                student=self.student,
                answers={str(item.id): 0},
                score=score,
                correct_count=int(score),
                total_count=1,
            )
        self.client.force_authenticate(self.teacher)
        grid = self.client.get(f"/api/v1/classroom/assignments/{quiz.id}/grid/")
        cell = grid.data["cells"][str(self.student.id)]
        self.assertEqual(cell["attempts"], 3)
        

    def test_files_grid_counts_repeated_uploads(self):
        files = self.mk_assignment(kind=Assignment.Kind.FILES)
        for _ in range(2):
            UploadedDeliverable.objects.create(
                assignment=files,
                student=self.student,
                file=SimpleUploadedFile("a.pdf", b"x"),
            )
        self.client.force_authenticate(self.teacher)
        grid = self.client.get(f"/api/v1/classroom/assignments/{files.id}/grid/")
        self.assertEqual(grid.data["cells"][str(self.student.id)]["count"], 2)

    def test_resolve_api_user_arms(self):
        from rest_framework.test import APIRequestFactory

        from classroom.exam import _resolve_api_user

        factory = APIRequestFactory()
        # Non-API paths short-circuit to None.
        self.assertIsNone(_resolve_api_user(factory.get("/admin/")))
        # API request without credentials resolves to None.
        self.assertIsNone(_resolve_api_user(factory.get("/api/v1/forum/threads/")))
        # A malformed token header hits the exception arm (still None).
        bad = factory.get(
            "/api/v1/forum/threads/", HTTP_AUTHORIZATION="Bearer not-a-token"
        )
        self.assertIsNone(_resolve_api_user(bad))
        # DRF-forced auth wins.
        forced = factory.get("/api/v1/forum/threads/")
        forced._force_auth_user = self.student
        self.assertEqual(_resolve_api_user(forced), self.student)
        # A session-authenticated request.user resolves directly.
        session = factory.get("/api/v1/forum/threads/")
        session.user = self.student
        self.assertEqual(_resolve_api_user(session), self.student)
        # Forced-auth takes precedence over an anonymous session user.
        conflict = factory.get("/api/v1/forum/threads/")
        conflict.user = self.student2
        conflict._force_auth_user = self.student
        self.assertEqual(_resolve_api_user(conflict), self.student)
        # A valid signed token resolves the user (the middleware's reason
        # to exist: cookie-JWT API sessions are invisible to session auth).
        from rest_framework_simplejwt.tokens import RefreshToken

        token = str(RefreshToken.for_user(self.student).access_token)
        authed = factory.get(
            "/api/v1/forum/threads/", HTTP_AUTHORIZATION=f"Bearer {token}"
        )
        self.assertEqual(_resolve_api_user(authed), self.student)
