"""Polish-sweep content commands (2026-11-20): catalog_cleanup (e2e/ad-hoc
fixture removal) and catalog_polish (yukicoder translation fixes, exact-dupe
removal, RO backfill) against the committed catalog_polish.json payload.
"""

from io import StringIO

import pytest
from django.core.management import call_command
from django.db import connection

from problems.management.commands.catalog_cleanup import (
    FIXTURE_TITLES,
    PLAUSIBLE_TITLES,
    PROBE_TITLES,
    fixture_queryset,
)
from problems.models import Problem, TestCase
from submissions.models import Submission
from users.models import User

pytestmark = pytest.mark.django_db


def make_problem(
    title, *, statement=None, status=Problem.ProblemStatus.APPROVED, author
):
    return Problem.objects.create(
        title_i18n={"en": title},
        statement_i18n=statement or {"en": f"# {title}\n\nbody"},
        status=status,
        author=author,
    )


@pytest.fixture
def admin():
    # A plain author independent of the role-parametrized shared fixtures.
    return User.objects.create_user(username="polish_admin", password="pw-12345678")


def run(*args):
    out = StringIO()
    call_command(*args, stdout=out)
    return out.getvalue()


class TestCatalogCleanup:
    def test_dry_run_reports_without_deleting(self, admin):
        make_problem("Two Sum", author=admin)
        out = run("catalog_cleanup")
        assert "would delete" in out
        assert Problem.objects.filter(title_i18n__en="Two Sum").exists()

    def test_apply_deletes_fixture_rows(self, admin):
        make_problem("Reverse String", author=admin)
        make_problem("Live Proof", status=Problem.ProblemStatus.DRAFT, author=admin)
        out = run("catalog_cleanup", "--apply")
        assert "2 deleted" in out
        assert not fixture_queryset().exists()

    def test_real_content_with_testcases_is_protected(self, admin):
        problem = make_problem("Two Sum", author=admin)  # shares a fixture title
        TestCase.objects.create(
            problem=problem, input_data="1", expected_output_data="2", points=10
        )
        run("catalog_cleanup", "--apply")
        assert Problem.objects.filter(pk=problem.pk).exists()

    def test_probe_prefix_catches_timestamped_rows(self, admin):
        problem = make_problem("A+B Sum (live verify 1792653177)", author=admin)
        TestCase.objects.create(
            problem=problem, input_data="1 2\n", expected_output_data="3\n", points=10
        )
        run("catalog_cleanup", "--apply")
        assert not Problem.objects.filter(pk=problem.pk).exists()

    def test_probe_titles_go_even_with_testcases(self, admin):
        # "Proof A ..." is unmistakably a probe artifact: deleted regardless
        # of status/shape (judge-fairness proof rows carried real tests).
        problem = make_problem("Proof A tight (no multiplier)", author=admin)
        TestCase.objects.create(
            problem=problem, input_data="1", expected_output_data="2", points=10
        )
        run("catalog_cleanup", "--apply")
        assert not Problem.objects.filter(pk=problem.pk).exists()

    def test_e2e_submissions_need_flag(self, admin):
        e2e_user = User.objects.create_user(
            username="e2e_tester", password="pw-12345678"
        )
        problem = make_problem("Two Sum", author=admin)
        Submission.objects.create(
            user=e2e_user, problem=problem, language="python3", code="x"
        )
        out = run("catalog_cleanup", "--apply")
        assert "rerun with --allow-submissions" in out
        assert Problem.objects.filter(pk=problem.pk).exists()
        out = run("catalog_cleanup", "--apply", "--allow-submissions")
        assert "1 deleted" in out
        assert not Problem.objects.filter(pk=problem.pk).exists()

    def test_probe_submissions_from_admin_bob_are_deletable(self, admin):
        bob = User.objects.create_user(username="bob", password="pw-12345678")
        root = User.objects.create_user(username="admin", password="pw-12345678")
        problem = make_problem("JFW-A multiplier proof (pinned 100ms)", author=admin)
        Submission.objects.create(
            user=root, problem=problem, language="python3", code="x"
        )
        Submission.objects.create(
            user=bob, problem=problem, language="python3", code="x"
        )
        out = run("catalog_cleanup", "--apply", "--allow-submissions")
        assert "1 deleted" in out
        assert not Problem.objects.filter(pk=problem.pk).exists()

    def test_stranger_submissions_always_keep(self, admin):
        stranger = User.objects.create_user(username="stranger", password="pw-12345678")
        problem = make_problem("Proof A fair (3x multiplier)", author=admin)
        Submission.objects.create(
            user=stranger, problem=problem, language="python3", code="x"
        )
        run("catalog_cleanup", "--apply", "--allow-submissions")
        assert Problem.objects.filter(pk=problem.pk).exists()

    def test_fixture_title_list_exact(self):
        # Guards against accidentally widening the deletion match.
        assert "Sum of Two Numbers" not in FIXTURE_TITLES
        assert len(FIXTURE_TITLES) == 9
        assert len(PROBE_TITLES) == 6
        assert set(PROBE_TITLES).isdisjoint(PLAUSIBLE_TITLES)


class TestCatalogPolish:
    def test_dedupe_retitles_and_patches(self, admin):
        # Two exact duplicates of the yukicoder A+B import (one has the
        # Japanese fragment in en+ro; the other is a bare copy).
        jp = "整数 $a, b$ が与えられます。 $a + b$ を出力してください。"
        first = make_problem(
            "Simple AplusB",
            statement={
                "en": f"# Simple AplusB\n\n{jp}\n",
                "ro": f"# AplusB simplu\n\n{jp}\n",
            },
            author=admin,
        )
        second = make_problem("Simple AplusB", author=admin)
        out = run("catalog_polish", "--apply")
        assert "dedupe delete" in out
        assert not Problem.objects.filter(pk=second.pk).exists()
        first.refresh_from_db()
        assert first.title_i18n["en"] == "Simple A+B"
        assert first.title_i18n["ro"] == "A+B simplu"
        assert first.title_i18n["de"] == "Einfaches A+B"
        assert "整数" not in first.statement_i18n["en"]
        assert "Se dau două numere întregi" in first.statement_i18n["ro"]

    def test_dedupe_detaches_import_ledger(self, admin):
        # The content-import pipeline left a raw problems_catalogentry table
        # (no ORM model) whose imported_problem_id FK would block the dupe
        # delete; the command must null it first.
        with connection.cursor() as cursor:
            cursor.execute(
                "CREATE TABLE IF NOT EXISTS problems_catalogentry ("
                "id integer primary key, imported_problem_id integer)"
            )
        make_problem(
            "Simple AplusB",
            statement={"en": "# Simple AplusB\n\nx\n", "ro": "# AplusB simplu\n\nx\n"},
            author=admin,
        )
        dupe = make_problem("Simple AplusB", author=admin)
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO problems_catalogentry (id, imported_problem_id) VALUES (1, %s)",
                [dupe.pk],
            )
        run("catalog_polish", "--apply")
        assert not Problem.objects.filter(pk=dupe.pk).exists()
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT imported_problem_id FROM problems_catalogentry WHERE id=1"
            )
            assert cursor.fetchone()[0] is None

    def test_pending_dupe_dropped_only_when_approved_twin_exists(self, admin):
        approved = make_problem("Sumdiv", author=admin)
        approved.status = Problem.ProblemStatus.APPROVED
        approved.save()
        pending = make_problem(
            "Sumdiv", status=Problem.ProblemStatus.PENDING_APPROVAL, author=admin
        )
        run("catalog_polish", "--apply")
        assert Problem.objects.filter(pk=approved.pk).exists()
        assert not Problem.objects.filter(pk=pending.pk).exists()

    def test_pending_dupe_kept_without_approved_twin(self, admin):
        # No APPROVED "Sumdiv" in this test's DB -> the drop is skipped
        # (never delete the only copy).
        pending = make_problem(
            "Sumdiv", status=Problem.ProblemStatus.PENDING_APPROVAL, author=admin
        )
        out = run("catalog_polish", "--apply")
        assert "no APPROVED 'Sumdiv'" in out
        assert Problem.objects.filter(pk=pending.pk).exists()

    def test_idempotent_second_run(self, admin):
        make_problem(
            "Simple AplusB",
            statement={"en": "# Simple AplusB\n\nx\n", "ro": "# AplusB simplu\n\nx\n"},
            author=admin,
        )
        run("catalog_polish", "--apply")
        out = run("catalog_polish", "--apply")
        # Titles already replaced -> the payload matches nothing.
        assert "no match for 'Simple AplusB'" in out
        assert Problem.objects.filter(title_i18n__en="Simple A+B").count() == 1

    def test_dry_run_changes_nothing(self, admin):
        make_problem(
            "Simple AplusB",
            statement={"en": "# Simple AplusB\n\nx\n", "ro": "# AplusB simplu\n\nx\n"},
            author=admin,
        )
        out = run("catalog_polish")
        assert "would apply" in out
        assert "(dry-run)" in out
        assert Problem.objects.filter(title_i18n__en="Simple AplusB").exists()

    def test_missing_anchor_and_locale_warn_but_pass(self, admin):
        problem = make_problem(
            "注文の多い順列",
            statement={"en": "# 注文の多い順列\n\nunrelated text"},
            author=admin,
        )
        # ro statement absent -> the ro patch warns and skips; the en patch
        # anchor for the duplicated condition is missing -> warns; the title
        # patch and the heading patch still land.
        out = run("catalog_polish", "--apply")
        assert "no 'ro' statement" in out
        assert "patch anchor not found" in out
        problem.refresh_from_db()
        assert problem.title_i18n["en"] == "The Demanding Permutation"
        assert "unrelated text" in problem.statement_i18n["en"]
        assert problem.statement_i18n["en"].startswith("# The Demanding Permutation")

    def test_drop_broken_minor_locales(self, admin):
        problem = make_problem(
            "sum = length",
            statement={
                "en": "body $f(a)=aを入力で与えた時の入力の長さ$ (excluding the trailing newline)",
                "ro": "corp $f(a)=aを入力で与えた時の入力の長さ$ (excluzând newline-ul final)",
                "de": "Körper mit demselben japanischen Fragment",
            },
            author=admin,
        )
        run("catalog_polish", "--apply")
        problem.refresh_from_db()
        assert "de" not in problem.statement_i18n
        assert "を入力で与えた時の入力の長さ" not in problem.statement_i18n["en"]
        assert "the length of the input string" in problem.statement_i18n["en"]
        assert problem.title_i18n["de"] == "Summe = Länge"

    def test_missing_ro_backfill(self, admin):
        problem = make_problem(
            "Sumdiv",
            statement={"en": "# Sumdiv\n\nS = sum of divisors of A^B"},
            author=admin,
        )
        run("catalog_polish", "--apply")
        problem.refresh_from_db()
        assert "suma divizorilor naturali" in problem.statement_i18n["ro"]
        assert problem.title_i18n["ro"] == "Sumdiv"

    def test_existing_ro_kept(self, admin):
        problem = make_problem(
            "Road Reparation",
            statement={"en": "e", "ro": "# Repararea drumurilor\n\nexistent"},
            author=admin,
        )
        out = run("catalog_polish", "--apply")
        assert "keep existing RO" in out
        problem.refresh_from_db()
        assert "existent" in problem.statement_i18n["ro"]
