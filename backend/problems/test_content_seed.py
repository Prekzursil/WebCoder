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
        # EDU-10: the tree now spans gimnaziu (g5-g8) + liceu v1 (g9-g10).
        assert CurriculumNode.objects.filter(kind="GRADE").count() == 6
        assert CurriculumNode.objects.filter(kind="CHAPTER").count() == 16
        assert list(
            CurriculumNode.objects.filter(kind="GRADE")
            .order_by("order")
            .values_list("slug", flat=True)
        ) == ["g5", "g6", "g7", "g8", "g9", "g10"]
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


class TestGimnaziuPack:
    """EDU-10 (Wave D): grades 5-8 taxonomy + the VERY_EASY ladder."""

    def test_gimnaziu_ladder_seeds_with_band_and_facet(self):
        run_seed()
        ladder = Problem.objects.filter(difficulty="VERY_EASY")
        assert ladder.count() == 10
        assert all(p.grade_group == "gimnaziu" for p in ladder)
        # Every gimnaziu chapter carries at least one problem.
        for slug in [
            "g5-first-steps",
            "g5-arithmetic",
            "g6-conditionals",
            "g6-loops",
            "g7-sequences",
            "g7-divisibility",
            "g8-arrays",
        ]:
            node = CurriculumNode.objects.get(slug=slug)
            assert node.problems.count() >= 1, slug

    def test_gimnaziu_problem_is_bilingual_and_simple(self):
        run_seed()
        problem = Problem.objects.get(title_i18n__en="Hello, Judge!")
        assert problem.difficulty == "VERY_EASY"
        assert problem.title_i18n["ro"] == "Salut, evaluator!"
        assert "Salut, evaluator!" in problem.statement_i18n["ro"]
        assert problem.hints_ro and problem.hints_en

    def test_very_easy_counts_in_ladder_and_stats(self):
        from users.statistics import LADDER_WEIGHTS, user_statistics

        run_seed()
        author = User.objects.create_user(username="gim", password="pw-123456")
        hello = Problem.objects.get(title_i18n__en="Hello, Judge!")
        medium = Problem.objects.create(
            title_i18n={"en": "M"},
            statement_i18n={"en": "S"},
            difficulty="MEDIUM",
            status=Problem.ProblemStatus.APPROVED,
        )
        for target in (hello, medium):
            Submission.objects.create(
                user=author,
                problem=target,
                language="python3",
                code="print(1)",
                verdict=Submission.VerdictStatus.ACCEPTED,
            )
        stats = user_statistics(author)
        # EDU-10: the beginner band has its own bucket...
        assert stats["per_difficulty"]["VERY_EASY"]["solved"] == 1
        # ...and credits the ladder like EASY (weight 1) + MEDIUM (3) = 4.
        assert stats["ladder"]["points"] == (
            LADDER_WEIGHTS[Problem.DifficultyLevel.VERY_EASY]
            + LADDER_WEIGHTS[Problem.DifficultyLevel.MEDIUM]
        )

    def test_curriculum_api_lists_gimnaziu_grades_first(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/problems/curriculum/")
        assert response.status_code == 200
        results = (
            response.data
            if isinstance(response.data, list)
            else response.data["results"]
        )
        slugs = [grade["slug"] for grade in results]
        assert slugs[:4] == ["g5", "g6", "g7", "g8"]

    def test_public_api_filters_by_very_easy(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/public/problems/?difficulty=VERY_EASY")
        assert response.status_code == 200
        assert response.data["count"] == 10
        assert all(row["difficulty"] == "VERY_EASY" for row in response.data["results"])


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
        # EDU-10: gimnaziu (g5-g8) now leads the liceu v1 tree (g9-g10).
        assert slugs == ["g5", "g6", "g7", "g8", "g9", "g10"]
        g9 = next(node for node in results if node["slug"] == "g9")
        assert g9["kind"] == "GRADE"
        chapter_slugs = [child["slug"] for child in g9["children"]]
        assert "g9-elementary" in chapter_slugs and "g9-loops" in chapter_slugs
        assert (
            g9["problem_count"]
            == Problem.objects.filter(
                curriculum_nodes__slug="g9",
                status=Problem.ProblemStatus.APPROVED,
            ).count()
        )

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
        expected = node.problems.filter(status=Problem.ProblemStatus.APPROVED).count()
        assert response.data["problem_count"] == expected

    def test_problems_filter_by_curriculum_node(self):
        run_seed()
        node = CurriculumNode.objects.get(slug="g9-arrays")
        client = APIClient()
        response = client.get(f"/api/v1/problems/problems/?curriculum_node={node.id}")
        assert response.status_code == 200
        results = (
            response.data["results"] if "results" in response.data else response.data
        )
        expected_titles = {
            p.title_i18n["en"] for p in Problem.objects.filter(curriculum_nodes=node)
        }
        assert {r["title_i18n"]["en"] for r in results} == expected_titles


class TestStartersEndpoint:
    def test_starters_returns_three_easy_problems_from_distinct_chapters(self):
        run_seed()
        client = APIClient()
        response = client.get("/api/v1/problems/problems/starters/")
        assert response.status_code == 200
        assert len(response.data) == 3
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


class TestStartersCoverageClosure:
    """Single-branch 100% gate: a chapter with no easy APPROVED problem
    (candidate None arm) and the fallback trio hitting its break."""

    def test_starters_skips_empty_chapter_and_falls_back(self):
        from problems.models import CurriculumNode

        root = CurriculumNode.objects.create(
            kind=CurriculumNode.NodeKind.GRADE,
            name_i18n={"en": "Grade 9"},
            slug="cc-grade",
            order=0,
        )
        chapter_ok = CurriculumNode.objects.create(
            kind=CurriculumNode.NodeKind.CHAPTER,
            parent=root,
            name_i18n={"en": "Warmups"},
            slug="cc-ch-ok",
            order=0,
        )
        chapter_empty = CurriculumNode.objects.create(
            kind=CurriculumNode.NodeKind.CHAPTER,
            parent=root,
            name_i18n={"en": "Advanced"},
            slug="cc-ch-empty",
            order=1,
        )
        linked = Problem.objects.create(
            title_i18n={"en": "Linked Easy"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            difficulty=Problem.DifficultyLevel.EASY,
        )
        chapter_ok.problems.add(linked)
        medium = Problem.objects.create(
            title_i18n={"en": "Medium Only"},
            statement_i18n={"en": "s"},
            status=Problem.ProblemStatus.APPROVED,
            difficulty=Problem.DifficultyLevel.MEDIUM,
        )
        chapter_empty.problems.add(medium)
        loose_titles = []
        for title in ("Loose One", "Loose Two"):
            Problem.objects.create(
                title_i18n={"en": title},
                statement_i18n={"en": "s"},
                status=Problem.ProblemStatus.APPROVED,
                difficulty=Problem.DifficultyLevel.EASY,
            )
            loose_titles.append(title)

        client = APIClient()
        response = client.get("/api/v1/problems/problems/starters/")
        assert response.status_code == 200
        titles = [p["title_i18n"]["en"] for p in response.data]
        assert titles == ["Linked Easy", "Loose One", "Loose Two"]

    def test_curriculum_node_str_both_name_shapes(self):
        from problems.models import CurriculumNode

        dict_node = CurriculumNode.objects.create(
            kind=CurriculumNode.NodeKind.GRADE,
            name_i18n={"en": "Loops"},
            slug="cc-node-dict",
        )
        assert str(dict_node) == "cc-node-dict (Loops)"
        plain_node = CurriculumNode(
            kind=CurriculumNode.NodeKind.GRADE,
            name_i18n="plain",
            slug="cc-node-plain",
        )
        assert str(plain_node) == "cc-node-plain"
