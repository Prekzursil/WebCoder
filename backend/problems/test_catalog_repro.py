"""Catalog reproducibility (2026-11-20 sweep): export → import round-trip.

A fresh environment must rebuild the same imported catalog from the
committed fixture — closing the gap where the 2026-11 content waves
imported ~1 850 problems through workspace scripts that never landed in
the repo (translations.json also lagged the DB ledger by ~77 EN rows;
the DB is now the source of truth).
"""

import gzip
import json
import tempfile
from io import StringIO
from pathlib import Path

import pytest
from django.core.management import call_command

from problems.models import CurriculumNode, ImportSource, Problem, Tag, TestCase
from users.models import User

pytestmark = pytest.mark.django_db


def run(*args):
    out = StringIO()
    call_command(*args, stdout=out)
    return out.getvalue()


@pytest.fixture
def author():
    return User.objects.create_user(username="importer_guy", password="pw-12345678")


def make_problem(author, **extra):
    return Problem.objects.create(
        title_i18n={"en": "Repo Row", "ro": "Rând de repo"},
        statement_i18n={"en": "# Repo Row\n\nbody", "ro": "# Rând\n\ncorp"},
        status=Problem.ProblemStatus.APPROVED,
        author=author,
        **extra,
    )


def export(tmp_path, *args):
    run("export_catalog", "--out", str(tmp_path), *args)
    return tmp_path


class TestExport:
    def test_exports_rows_tests_and_ledger(self, author, tmp_path):
        problem = make_problem(author, source_url="https://x.example/p/1")
        TestCase.objects.create(
            problem=problem, input_data="1\n", expected_output_data="2\n", points=10
        )
        ImportSource.objects.create(
            name="Example",
            contact="ops@example",
            terms="CC-BY",
            evidence_url="https://example/terms",
            status="granted",
            notes="",
        )
        out = run("export_catalog", "--out", str(tmp_path))
        assert "1 problems (1 tests)" in out
        payload = json.load(gzip.open(tmp_path / "problems.json.gz", "rt", encoding="utf-8"))
        assert payload["problems"][0]["key"] == "https://x.example/p/1"
        assert payload["problems"][0]["tests"][0]["input_data"] == "1\n"
        sources = json.load(gzip.open(tmp_path / "sources.json.gz", "rt", encoding="utf-8"))
        assert sources["sources"][0]["name"] == "Example"

    def test_imported_only_flag(self, author, tmp_path):
        make_problem(author)  # no source_url -> excluded
        make_problem(author, source_url="https://y.example/p/9")
        run("export_catalog", "--out", str(tmp_path), "--imported-only")
        payload = json.load(gzip.open(tmp_path / "problems.json.gz", "rt", encoding="utf-8"))
        assert [p["key"] for p in payload["problems"]] == ["https://y.example/p/9"]


class TestRoundTrip:
    def test_fresh_rebuild_matches_source(self, author, tmp_path):
        problem = make_problem(author, source_url="https://z.example/p/7")
        problem.tags.add(Tag.objects.create(slug="round-trip", name_i18n={"en": "rt", "ro": "rt"}))
        TestCase.objects.create(
            problem=problem,
            input_data="3\n",
            expected_output_data="6\n",
            is_sample=True,
            points=10,
        )
        export(tmp_path)

        # Simulate the fresh environment: wipe the catalog, keep the file.
        Problem.objects.all().delete()
        assert Problem.objects.count() == 0

        out = run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        assert "1 created" in out
        rebuilt = Problem.objects.get(source_url="https://z.example/p/7")
        assert rebuilt.title_i18n["ro"] == "Rând de repo"
        assert rebuilt.status == Problem.ProblemStatus.APPROVED
        assert rebuilt.author.username == "importer_guy"
        assert [t.slug for t in rebuilt.tags.all()] == ["round-trip"]
        assert rebuilt.test_cases.count() == 1

    def test_curriculum_and_update_path(self, author, tmp_path):
        node = CurriculumNode.objects.create(
            slug="g9-ch", kind="CHAPTER", name_i18n={"en": "Ch", "ro": "Cap"}, order=1
        )
        problem = make_problem(author, source_url="https://t.example/p/5")
        problem.curriculum_nodes.add(node)
        export(tmp_path)
        # dry-run over an EXISTING row (update branch) writes nothing
        out = run("import_catalog", "--file", str(tmp_path / "problems.json.gz"), "--dry-run")
        assert "0 created, 1 updated" in out
        run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        rebuilt = Problem.objects.get(source_url="https://t.example/p/5")
        assert [n.slug for n in rebuilt.curriculum_nodes.all()] == ["g9-ch"]

    def test_reimport_updates_in_place_no_duplicates(self, author, tmp_path):
        make_problem(author, source_url="https://w.example/p/3")
        export(tmp_path)
        run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        assert Problem.objects.filter(source_url="https://w.example/p/3").count() == 1

    def test_missing_author_falls_back(self, author, tmp_path):
        make_problem(author, source_url="https://v.example/p/2")
        export(tmp_path)
        Problem.objects.all().delete()
        User.objects.filter(username="importer_guy").delete()
        run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        rebuilt = Problem.objects.get(source_url="https://v.example/p/2")
        assert rebuilt.author.username == "catalog_importer"

    def test_dry_run_reports_without_writing(self, author, tmp_path):
        make_problem(author, source_url="https://u.example/p/4")
        export(tmp_path)
        Problem.objects.all().delete()
        out = run("import_catalog", "--file", str(tmp_path / "problems.json.gz"), "--dry-run")
        assert "1 created, 0 updated" in out
        assert "dry-run" in out
        assert Problem.objects.count() == 0

    def test_ledger_imported_from_sources_file(self, tmp_path):
        ImportSource.objects.create(
            name="Ledger",
            contact="a@b",
            terms="ok",
            evidence_url="https://ev",
            status="granted",
            notes="",
        )
        export(tmp_path)
        ImportSource.objects.all().delete()
        assert Path(tmp_path / "problems.json.gz").exists()
        out = run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        assert "import source: Ledger" in out
        assert ImportSource.objects.filter(name="Ledger").exists()

    def test_from_release_fetch(self, tmp_path, monkeypatch):
        from problems.management.commands import import_catalog as mod

        # clear any cached download from a previous test run
        cache = Path(tempfile.gettempdir()) / "webcoder-catalog-catalog-2026-11-20.json.gz"
        cache.unlink(missing_ok=True)
        monkeypatch.setenv("CATALOG_RELEASE_BASE", "https://mirror.example/dl")
        captured = {}

        def fake_urlretrieve(url, dest):
            captured.setdefault("urls", []).append(url)
            Path(dest).write_bytes(b"x")

        monkeypatch.setattr(mod.urllib.request, "urlretrieve", fake_urlretrieve)
        path = mod._fetch_release("catalog-2026-11-20")
        assert captured["urls"] == [
            "https://mirror.example/dl/catalog-2026-11-20/problems.json.gz"
        ]
        assert Path(path).exists()
        # second call is served from the local cache (no new download)
        mod._fetch_release("catalog-2026-11-20")
        assert len(captured["urls"]) == 1

    def test_from_release_flag_routes_to_fetched_file(self, author, tmp_path, monkeypatch):
        from problems.management.commands import import_catalog as mod

        fetched = tmp_path / "downloaded.json.gz"
        make_problem(author, source_url="https://r.example/p/1")
        run("export_catalog", "--out", str(tmp_path))
        (tmp_path / "problems.json.gz").rename(fetched)

        def fake_fetch(tag):
            assert tag == "catalog-test"
            return str(fetched)

        monkeypatch.setattr(mod, "_fetch_release", fake_fetch)
        Problem.objects.all().delete()
        out = run("import_catalog", "--from-release", "catalog-test")
        assert "1 created" in out
        assert Problem.objects.filter(source_url="https://r.example/p/1").exists()

    def test_ledger_missing_file_is_tolerated(self, tmp_path):
        # --file pointing at a lone problems.json.gz without sources.json.gz
        # beside it must not crash the import.
        problem_data = {"problems": []}
        with gzip.open(tmp_path / "problems.json.gz", "wt", encoding="utf-8") as fh:
            json.dump(problem_data, fh)
        out = run("import_catalog", "--file", str(tmp_path / "problems.json.gz"))
        assert "0 created" in out
