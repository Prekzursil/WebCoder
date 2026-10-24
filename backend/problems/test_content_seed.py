"""Wave A content tests (competitive roadmap ONB-1/X4, CNT-3, EDU-9):
seed_problems starter pack, curriculum taxonomy API, difficulty
provenance + calibration, /start trio.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from problems.models import CurriculumNode, Problem, ProblemEditorial, Tag, TestCase
from problems import seed_data
from submissions.models import Submission
from users.models import User

pytestmark = pytest.mark.django_db


def run_seed(dry_run=False):
    out = StringIO()
    args = ["seed_problems"]
    if dry_run:
        args.append("--dry-run")
    call_command(*args, stdout=out)
    return out.getvalue()


class TestSeedProblemsCommand:
    def test_seed_creates_full_pack(self):
        result = run_seed()
        assert Problem.objects.filter(
            difficulty_source=Problem.DifficultySource.SEED
        ).count() == len(seed_data.PROBLEMS)
        assert TestCase.objects.count() == sum(
            len(p["tests"]) for p in seed_data.PROBLEMS
        )
        assert Tag.objects.filter(slug__in=["loops", "arrays", "sorting"]).count() == 3
        assert CurriculumNode.objects.filter(kind="GRADE").count() == 2
        assert CurriculumNode.objects.filter(kind="CHAPTER").count() == 8
        assert ProblemEditorial.objects.count() == len(seed_data.EDITORIALS)
        # first test of each problem is the visible sample
        for problem in Problem.objects.filter(
            difficulty_source=Problem.DifficultySource.SEED
        ):
            first = problem.test_cases.get(order=0)
            assert first.is_sample is True
        assert "created=" in result

    def test_seed_is_idempotent(self):
        run_seed()
        result = run_seed()
        assert "created=0" in result
        assert Problem.objects.count() == len(seed_data.PROBLEMS)

    def test_seed_dry_run_writes_nothing(self):
        result = run_seed(dry_run=True)
        assert "dry run" in result
        assert Problem.objects.count() == 0
        assert CurriculumNode.objects.count() == 0

    def test_seed_problems_are_approved_with_bilingual_content(self):
        run_seed()
        problem = Problem.objects.get(title_i18n__en="Sum of Two Numbers")
        assert problem.status == Problem.ProblemStatus.APPROVED
        assert problem.title_i18n["ro"] == "Suma a două numere"
        assert "Indiciu" in problem.hints_ro[0] or problem.hints_ro
        assert problem.hints_en
        assert problem.curriculum_nodes.filter(slug="g9-elementary").exists()
        assert problem.tags.filter(slug="implementation").exists()

    def test_seed_editorials_are_after_ac(self):
        run_seed()
        editorial = ProblemEditorial.objects.get(
            problem__title_i18n__en="Sum of Two Numbers"
        )
        assert editorial.publish_policy == ProblemEditorial.PublishPolicy.AFTER_AC


class TestCurriculumAPI:
    def test_tree_lists_grades_with_chapters_and_counts(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/problems/curriculum/")
        assert response.status_code == 200
        # ReadOnlyModelViewSet list → paginated shape
        results = (
            response.data["results"] if "results" in response.data else response.data
        )
        slugs = [node["slug"] for node in results]
        assert slugs == ["g9", "g10"]
        g9 = results[0]
        assert g9["kind"] == "GRADE"
        chapter_slugs = [child["slug"] for child in g9["children"]]
        assert "g9-elementary" in chapter_slugs and "g9-loops" in chapter_slugs
        assert g9["problem_count"] == Problem.objects.filter(
            curriculum_nodes__slug="g9",
            status=Problem.ProblemStatus.APPROVED,
        ).count()

    def test_chapter_problem_count_counts_approved_only(self):
        run_seed()
        node = CurriculumNode.objects.get(slug="g9-loops")
        draft = Problem.objects.first()
        draft.status = Problem.ProblemStatus.DRAFT
        draft.save()
        node.problems.add(draft)
        client = APIClient()
        response = client.get(f"/api/v1/problems/curriculum/{node.id}/")
        assert response.status_code == 200
        expected = node.problems.filter(
            status=Problem.ProblemStatus.APPROVED
        ).count()
        assert response.data["problem_count"] == expected

    def test_problems_filter_by_curriculum_node(self):
        run_seed()
        node = CurriculumNode.objects.get(slug="g9-arrays")
        client = APIClient()
        response = client.get(
            f"/api/v1/problems/problems/?curriculum_node={node.id}"
        )
        assert response.status_code == 200
        results = (
            response.data["results"] if "results" in response.data else response.data
        )
        expected_titles = {
            p.title_i18n["en"]
            for p in Problem.objects.filter(curriculum_nodes=node)
        }
        assert {r["title_i18n"]["en"] for r in results} == expected_titles


class TestStartersEndpoint:
    def test_starters_returns_three_easy_problems_from_distinct_chapters(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/problems/problems/starters/")
        assert response.status_code == 200
        assert len(response.data) == 3
        chapters = set()
        for problem in response.data:
            assert problem["difficulty"] == "EASY"
            assert problem["status"] == "APPROVED"
        # distinct chapters: g9-elementary, g9-loops, g9-arrays in tree order
        titles = [p["title_i18n"]["en"] for p in response.data]
        assert titles == ["Sum of Two Numbers", "Sum 1..N", "Maximum in Array"]

    def test_starters_falls_back_without_curriculum_links(self):
        # No seeds: hand-place two easy problems with no curriculum links.
        author = User.objects.create_user(username="a1", password="pw-12345678")
        for title in ("Solo One", "Solo Two"):
            Problem.objects.create(
                title_i18n={"en": title, "ro": title},
                statement_i18n={"en": "s", "ro": "s"},
                author=author,
                status=Problem.ProblemStatus.APPROVED,
                difficulty=Problem.DifficultyLevel.EASY,
            )
        client = APIClient()
        response = client.get("/api/v1/problems/problems/starters/")
        assert response.status_code == 200
        assert len(response.data) == 2


class TestDifficultyProvenanceAndCalibration:
    def test_serializer_exposes_difficulty_source(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/problems/problems/")
        results = (
            response.data["results"] if "results" in response.data else response.data
        )
        assert results, "seeded catalog expected"
        assert results[0]["difficulty_source"] == "SEED"

    def _make_submissions(self, problem, user_ok, n_ac, n_wa):
        for i in range(n_ac):
            user = User.objects.create_user(username=f"ok-{i}-{problem.id}")
            Submission.objects.create(
                user=user,
                problem=problem,
                language="python3",
                code="print(1)",
                verdict=Submission.VerdictStatus.ACCEPTED,
            )
        for i in range(n_wa):
            user = User.objects.create_user(username=f"wa-{i}-{problem.id}")
            Submission.objects.create(
                user=user,
                problem=problem,
                language="python3",
                code="print(1)",
                verdict=Submission.VerdictStatus.WRONG_ANSWER,
            )

    def test_calibration_moves_difficulty_and_sets_source(self):
        run_seed()
        problem = Problem.objects.get(title_i18n__en="Fibonacci Number")
        self._make_submissions(problem, None, n_ac=1, n_wa=11)  # ~8% → HARD
        out = StringIO()
        call_command("calibrate_difficulty", stdout=out)
        problem.refresh_from_db()
        assert problem.difficulty == Problem.DifficultyLevel.HARD
        assert problem.difficulty_source == Problem.DifficultySource.CALIBRATED

    def test_calibration_respects_min_tried(self):
        run_seed()
        problem = Problem.objects.get(title_i18n__en="Sum of Two Numbers")
        self._make_submissions(problem, None, n_ac=1, n_wa=2)  # 3 < 10
        call_command("calibrate_difficulty", stdout=StringIO())
        problem.refresh_from_db()
        assert problem.difficulty_source == Problem.DifficultySource.SEED

    def test_calibration_dry_run_changes_nothing(self):
        run_seed()
        problem = Problem.objects.get(title_i18n__en="Prime Check")
        self._make_submissions(problem, None, n_ac=9, n_wa=1)  # 90% → EASY
        out = StringIO()
        call_command("calibrate_difficulty", "--dry-run", stdout=out)
        problem.refresh_from_db()
        assert problem.difficulty == Problem.DifficultyLevel.MEDIUM
        assert problem.difficulty_source == Problem.DifficultySource.SEED
        assert "dry run" in out.getvalue()

    def test_calibration_medium_band_and_noop_when_already_target(self):
        run_seed()
        # "Sort an Array" is EASY with seed difficulty; 4 AC / 6 WA users →
        # 0.4 → MEDIUM band.
        problem = Problem.objects.get(title_i18n__en="Sort an Array")
        self._make_submissions(problem, None, n_ac=4, n_wa=6)
        out = StringIO()
        call_command("calibrate_difficulty", stdout=out)
        problem.refresh_from_db()
        assert problem.difficulty == Problem.DifficultyLevel.MEDIUM
        assert problem.difficulty_source == Problem.DifficultySource.CALIBRATED
        # Second run: already at target → no change lines, source unchanged.
        out2 = StringIO()
        call_command("calibrate_difficulty", stdout=out2)
        assert "->" not in out2.getvalue()
        problem.refresh_from_db()
        assert problem.difficulty == Problem.DifficultyLevel.MEDIUM
