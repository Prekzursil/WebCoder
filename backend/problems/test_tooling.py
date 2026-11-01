"""Wave C authoring & integrity tests (JDG-11 stress, JDG-13 export,
UXP-3 samples, UXP-4 revisions, CNT-2 ledger)."""

from datetime import timedelta
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from classroom.models import Assignment, ClassMembership, ClassRoom
from problems.models import ImportSource, Problem, StatementRevision
from problems.models import TestCase as ProblemTestCase
from problems.revisions import changed_since, record_revision, statement_history
from submissions.models import Submission
from users.models import User


def _mk_problem(title, **kw):
    problem = Problem.objects.create(
        title_i18n={"en": title, "ro": title},
        statement_i18n={"en": "s", "ro": "s"},
        status=Problem.ProblemStatus.APPROVED,
        **kw,
    )
    ProblemTestCase.objects.create(
        problem=problem, input_data="1", expected_output_data="2", points=100
    )
    return problem


class ToolingBase(TestCase):
    def setUp(self):
        # The stress lane is throttled per-user, and SQLite test transactions
        # reuse user PKs across tests — clear the throttle cache so sibling
        # tests never inherit each other's buckets (users/test_throttling
        # discipline).
        from django.core.cache import cache

        cache.clear()

        self.admin = User.objects.create_user(
            username="admin", password="pw", role=User.Roles.ADMIN
        )
        self.creator = User.objects.create_user(
            username="creator", password="pw", role=User.Roles.PROBLEM_CREATOR
        )
        self.teacher = User.objects.create_user(
            username="teach", password="pw", role=User.Roles.TEACHER
        )
        self.student = User.objects.create_user(username="stud", password="pw")
        self.client = APIClient()


FAKE_OK = ("AC", 10, 1024, "out", "")


class StressTests(ToolingBase):
    """JDG-11 — the sandboxed stress loop."""

    def payload(self):
        return {
            "generator_language": "python3",
            "generator_code": "print(3)",
            "solution_language": "python3",
            "solution_code": "print(int(input())+1)",
            "reference_language": "python3",
            "reference_code": "print(int(input())+1)",
            "iterations": 3,
        }

    def test_role_gate(self):
        self.client.force_authenticate(self.student)
        response = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_language_rejected(self):
        self.client.force_authenticate(self.creator)
        bad = self.payload()
        bad["solution_language"] = "cobol"
        response = self.client.post(
            "/api/v1/problems/tools/stress/", bad, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("cobol", str(response.data["solution_language"]))

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_clean_run_reports_no_mismatch(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        gen_outputs = iter([("AC", 10, 1024, "3\n", "")] * 10)
        prog_outputs = iter([("AC", 10, 1024, "4\n", "")] * 10)
        run_mock.side_effect = lambda *a, **k: (
            next(gen_outputs)
            if a[0] == "/tmp/fake.exe" and not a[2]
            else next(prog_outputs)
        )
        # simpler deterministic mapping by call order: gen, sol, ref per iter
        calls = iter(
            [
                ("AC", 10, 1024, "3\n", ""),
                ("AC", 10, 1024, "4\n", ""),
                ("AC", 10, 1024, "4\n", ""),
            ]
            * 20
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["found"] is False)
        self.assertEqual(response.data["iterations"], 3)
        # The audit row rides along (ScratchRun pattern).
        from scratch.models import StressRun

        record = StressRun.objects.filter(user=self.creator).order_by("-id").first()
        self.assertIsNotNone(record)
        self.assertEqual(record.iterations, 3)
        self.assertFalse(record.found)

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_first_mismatch_surfaced(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        calls = iter(
            [
                ("AC", 10, 1024, "7\n", ""),  # gen
                ("AC", 10, 1024, "8\n", ""),  # sol
                ("AC", 10, 1024, "9\n", ""),  # ref -> mismatch
            ]
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.teacher)
        response = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertTrue(response.data["found"])
        self.assertEqual(response.data["mismatch"]["phase"], "mismatch")
        self.assertEqual(response.data["mismatch"]["solution_output"], "8\n")
        self.assertEqual(response.data["mismatch"]["reference_output"], "9\n")

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_generator_and_solution_crashes(self, compile_mock, run_mock):
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        # First iteration: generator itself crashes.
        calls = iter([("RE", 10, 1024, "", "boom")])
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response.data["mismatch"]["phase"], "generator")
        self.assertEqual(response.data["iterations"], 1)

        # Second scenario: solution crashes on the generated input.
        calls2 = iter(
            [
                ("AC", 10, 1024, "5\n", ""),
                ("RE", 10, 1024, "", "sol died"),
            ]
            * 50
        )
        run_mock.side_effect = lambda *a, **k: next(calls2)
        response2 = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response2.data["mismatch"]["phase"], "solution")
        self.assertEqual(response2.data["mismatch"]["input"], "5\n")

    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_compile_error_reported(self, compile_mock):
        compile_mock.return_value = (False, "SyntaxError: invalid syntax", "")
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/stress/", self.payload(), format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("SyntaxError", str(response.data["generator_code"]))
        from scratch.models import StressRun

        self.assertTrue(
            StressRun.objects.filter(user=self.creator, found=False).exists()
        )


class SolutionsExportTests(ToolingBase):
    """JDG-13 v1 — the per-temă solutions CSV."""

    def setUp(self):
        super().setUp()
        self.classroom = ClassRoom.objects.create(teacher=self.teacher, name="IX-B")
        ClassMembership.objects.create(classroom=self.classroom, student=self.student)
        self.problem = _mk_problem("Sum")
        self.assignment = Assignment.objects.create(
            classroom=self.classroom,
            title_i18n={"en": "Tema"},
            available_from=timezone.now() - timedelta(days=1),
            due_at=timezone.now() + timedelta(days=1),
        )
        from classroom.models import AssignmentProblem

        AssignmentProblem.objects.create(
            assignment=self.assignment, problem=self.problem, order=0
        )

    def mk_submission(self, user, verdict="AC", at=None, code="print(1)"):
        return Submission.objects.create(
            user=user,
            problem=self.problem,
            language="python3",
            code=code,
            verdict=verdict,
            score=100 if verdict == "AC" else 0,
            submission_time=at or timezone.now(),
        )

    def test_only_teacher_or_admin(self):
        self.mk_submission(self.student)
        self.client.force_authenticate(self.student)
        denied = self.client.get(
            f"/api/v1/problems/tools/assignment-solutions/{self.assignment.id}/"
        )
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.client.force_authenticate(self.teacher)
        ok = self.client.get(
            f"/api/v1/problems/tools/assignment-solutions/{self.assignment.id}/"
        )
        self.assertEqual(ok.status_code, 200, ok.data)
        self.assertEqual(ok.data["count"], 1)
        self.assertIn("print(1)", ok.data["csv"])
        self.assertIn("stud,", ok.data["csv"])
        self.assertIn("verdict", ok.data["csv"])

        missing = self.client.get("/api/v1/problems/tools/assignment-solutions/99999/")
        self.assertEqual(missing.status_code, status.HTTP_404_NOT_FOUND)

    def test_window_rule_respected(self):
        # Submissions outside the EDU-3 window never export; auto_now_add
        # ignores the constructor kwarg, so backdate via UPDATE.
        submission = self.mk_submission(self.student)
        Submission.objects.filter(pk=submission.pk).update(
            submission_time=timezone.now() - timedelta(days=5)
        )
        self.client.force_authenticate(self.teacher)
        response = self.client.get(
            f"/api/v1/problems/tools/assignment-solutions/{self.assignment.id}/"
        )
        self.assertEqual(response.data["count"], 0)


class SampleDownloadTests(ToolingBase):
    """UXP-3 — public sample bundle."""

    def test_samples_only_never_hidden(self):
        problem = _mk_problem("Samples")
        ProblemTestCase.objects.create(
            problem=problem,
            input_data="public-in",
            expected_output_data="public-out",
            points=10,
            is_sample=True,
        )
        ProblemTestCase.objects.create(
            problem=problem,
            input_data="secret-in",
            expected_output_data="secret-out",
            points=100,
            is_sample=False,
        )
        response = self.client.get(f"/api/v1/problems/{problem.id}/samples/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("--- sample 1 input ---", response.data["content"])
        self.assertNotIn("secret-in", response.data["content"])
        self.assertEqual(response.data["filename"], f"problem-{problem.id}-samples.txt")

    def test_missing_problem_and_no_samples(self):
        self.assertEqual(
            self.client.get("/api/v1/problems/999999/samples/").status_code,
            status.HTTP_404_NOT_FOUND,
        )
        bare = Problem.objects.create(
            title_i18n={"en": "Bare", "ro": "Bare"},
            statement_i18n={"en": "s", "ro": "s"},
            status=Problem.ProblemStatus.APPROVED,
        )
        self.assertEqual(
            self.client.get(f"/api/v1/problems/{bare.id}/samples/").status_code,
            status.HTTP_404_NOT_FOUND,
        )


class RevisionTests(ToolingBase):
    """UXP-4 — statement history + change banner inputs."""

    def test_record_revision_dedupes_and_feeds(self):
        problem = _mk_problem("Hist")
        record_revision(problem, edited_by=self.admin, note="first")
        self.assertEqual(StatementRevision.objects.filter(problem=problem).count(), 1)
        # Metadata-only save (same statement) writes nothing.
        record_revision(problem, edited_by=self.admin)
        self.assertEqual(StatementRevision.objects.filter(problem=problem).count(), 1)
        # Material change lands.
        problem.statement_i18n = {"en": "new", "ro": "nou"}
        problem.save()
        record_revision(problem, edited_by=self.admin, note="clarified constraints")
        self.assertEqual(StatementRevision.objects.filter(problem=problem).count(), 2)
        history = statement_history(problem)
        self.assertEqual(history[0].note, "clarified constraints")
        # Banner predicate.
        self.assertFalse(changed_since(problem, timezone.now()))
        self.assertTrue(changed_since(problem, timezone.now() - timedelta(days=1)))

    def test_endpoint_exposes_history(self):
        problem = _mk_problem("Feed")
        record_revision(problem, edited_by=self.admin, note="v1")
        self.client.force_authenticate(self.admin)
        response = self.client.get(
            f"/api/v1/problems/problems/{problem.id}/statement-revisions/"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["note"], "v1")
        self.assertEqual(response.data["results"][0]["edited_by"], "admin")


class ImportLedgerTests(ToolingBase):
    """CNT-2 — the rights-checked import pipeline groundwork."""

    def test_ledger_lifecycle(self):
        source = ImportSource.objects.create(
            name="OJI 2024 county round",
            contact="isj@example.ro",
            terms="Translation + re-publication granted for educational use.",
            status=ImportSource.Status.PENDING,
        )
        self.assertFalse(source.allows_publication)
        source.status = ImportSource.Status.GRANTED
        source.save()
        self.assertTrue(source.allows_publication)
        self.assertIn("GRANTED", str(source))

        problem = _mk_problem(
            "Imported", import_source=source, source_contest="OJI 2024"
        )
        self.assertEqual(problem.import_source.name, "OJI 2024 county round")
        self.assertEqual(problem.source_contest, "OJI 2024")


class CoverageClosureTests(ToolingBase):
    """Close the last branches (100% gate)."""

    def mk_quiz(self):
        from classroom.models import AssignmentQuizItem
        from classroom.models import MCQItem

        item = MCQItem.objects.create(
            grade=9,
            question_i18n={"en": "2+2?", "ro": "Cât e 2+2?"},
            variants_en=["3", "4", "5", "6"],
            variants_ro=["3", "4", "5", "6"],
            correct_index=1,
        )
        classroom = ClassRoom.objects.create(teacher=self.teacher, name="IX-C")
        quiz = Assignment.objects.create(
            classroom=classroom,
            title_i18n={"en": "Grile"},
            available_from=timezone.now() - timedelta(hours=1),
            due_at=timezone.now() + timedelta(days=1),
            kind=Assignment.Kind.QUIZ,
        )
        AssignmentQuizItem.objects.create(assignment=quiz, item=item, order=0)
        return quiz

    def test_quiz_grid_improving_reattempt(self):
        """Third attempt improves the best -> the current.update arm."""
        from classroom.models import QuizSubmission
        from classroom.quiz import shuffle_order

        quiz = self.mk_quiz()
        item = quiz.quiz_items.first().item
        for score in (0.0, 0.5, 1.0):  # improving tail exercises update()
            QuizSubmission.objects.create(
                assignment=quiz,
                student=self.student,
                answers={str(item.id): shuffle_order(quiz, self.student.id).index(1)},
                score=score,
                correct_count=int(score),
                total_count=1,
            )
        self.client.force_authenticate(self.teacher)
        grid = self.client.get(f"/api/v1/classroom/assignments/{quiz.id}/grid/")
        cell = grid.data["cells"][str(self.student.id)]
        self.assertEqual(cell["score"], 1.0)
        self.assertEqual(cell["attempts"], 3)

    def test_stress_run_str(self):
        from scratch.models import StressRun

        record = StressRun.objects.create(
            user=self.creator, iterations=1, found=False, detail={}
        )
        self.assertIn("stress", str(record))
        self.assertIn(str(record.id), str(record))

    def test_statement_revision_str(self):
        problem = _mk_problem("Str")
        revision = StatementRevision.objects.create(
            problem=problem, title_i18n={}, statement_i18n={}
        )
        self.assertIn("problem %d" % problem.id, str(revision))

    def test_changed_since_none_since(self):
        problem = _mk_problem("None")
        self.assertFalse(changed_since(problem, None))

    @mock.patch("problems.tooling.run_code_in_sandbox")
    @mock.patch("problems.tooling.compile_code_in_sandbox")
    def test_reference_crash_reported(self, compile_mock, run_mock):
        """The reference-solution crash arm (phase=reference)."""
        compile_mock.return_value = (True, "", "/tmp/fake.exe")
        newline = chr(10)
        calls = iter(
            [
                ("AC", 10, 1024, "9" + newline, ""),  # gen
                ("AC", 10, 1024, "10" + newline, ""),  # sol
                ("RE", 10, 1024, "", "ref died"),  # ref crashes
            ]
            * 50
        )
        run_mock.side_effect = lambda *a, **k: next(calls)
        self.client.force_authenticate(self.creator)
        response = self.client.post(
            "/api/v1/problems/tools/stress/",
            {
                "generator_language": "python3",
                "generator_code": "print(9)",
                "solution_language": "python3",
                "solution_code": "print(int(input())+1)",
                "reference_language": "python3",
                "reference_code": "raise SystemExit(1)",
                "iterations": 2,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["mismatch"]["phase"], "reference")


class AssignmentSolutionsJsonTest(TestCase):
    """JDG-13 v1: the structured ?format=json mode (diff-view data)."""

    def setUp(self):
        self.client = APIClient()
        from classroom.models import Assignment, ClassRoom, ClassMembership
        from problems.models import Problem
        from submissions.models import Submission

        self.teacher = User.objects.create_user(
            username="teach", password="p", role=User.Roles.TEACHER
        )
        self.student = User.objects.create_user(username="kid", password="p")
        self.room = ClassRoom.objects.create(
            teacher=self.teacher, name="C9", join_code="AAA111"
        )
        ClassMembership.objects.create(classroom=self.room, student=self.student)
        self.problem = Problem.objects.create(
            title_i18n={"en": "A+B"},
            statement_i18n={"en": "S"},
            status=Problem.ProblemStatus.APPROVED,
            author=self.teacher,
        )
        from django.utils import timezone

        now = timezone.now()
        self.assignment = Assignment.objects.create(
            classroom=self.room,
            title_i18n={"en": "HW1"},
            available_from=now - timezone.timedelta(days=2),
            due_at=now + timezone.timedelta(days=2),
        )
        from classroom.models import AssignmentProblem

        AssignmentProblem.objects.create(
            assignment=self.assignment, problem=self.problem, order=1, points=10
        )
        self.sub = Submission.objects.create(
            user=self.student,
            problem=self.problem,
            language="python3",
            code="print(3)",
            verdict=Submission.VerdictStatus.ACCEPTED,
            score=10,
            submission_time=now - timezone.timedelta(days=1),
        )

    def test_json_rows_carry_code_for_the_diff_view(self):
        self.client.force_authenticate(self.teacher)
        resp = self.client.get(
            f"/api/v1/problems/tools/assignment-solutions/{self.assignment.id}/"
            "?format=json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        data = resp.json()
        self.assertEqual(data["count"], 1)
        row = data["results"][0]
        self.assertEqual(row["username"], "kid")
        self.assertEqual(row["code"], "print(3)")
        self.assertEqual(row["id"], self.sub.id)

    def test_non_teacher_still_blocked(self):
        outsider = User.objects.create_user(username="out", password="p")
        self.client.force_authenticate(outsider)
        resp = self.client.get(
            f"/api/v1/problems/tools/assignment-solutions/{self.assignment.id}/"
            "?format=json"
        )
        self.assertEqual(resp.status_code, 403)
