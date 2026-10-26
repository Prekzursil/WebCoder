"""Import pipeline tests: helpers + management command behaviours."""

import json
import os
import tempfile
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from problems import catalog_import as ci
from problems.models import CatalogEntry, Problem, TestCase as ProblemTestCase


class HelperUnitTests(TestCase):
    def test_slugify(self):
        self.assertEqual(ci.slugify("Tablouri unidimensionale"), "tablouri-unidimensionale")
        self.assertEqual(ci.slugify("  Șiruri! "), "siruri")

    def test_is_own_content(self):
        self.assertTrue(ci.is_own_content("posted by Andrei Visalon (Prekzursil)"))
        self.assertFalse(ci.is_own_content("posted by Someone Else"))
        self.assertFalse(ci.is_own_content(None))

    def test_map_difficulty_all_paths(self):
        E, M, H = "EASY", "MEDIUM", "HARD"
        self.assertEqual(ci.map_difficulty(None), M)
        self.assertEqual(ci.map_difficulty({}), M)
        self.assertEqual(ci.map_difficulty({"value": "ușoară"}), E)
        self.assertEqual(ci.map_difficulty({"value": "usoara"}), E)
        self.assertEqual(ci.map_difficulty({"value": "medie"}), M)
        self.assertEqual(ci.map_difficulty({"value": "grea"}), H)
        self.assertEqual(ci.map_difficulty({"value": "concurs"}), H)
        self.assertEqual(ci.map_difficulty({"value": "weird"}), M)

    def test_extract_source_name_competition_marker_wins(self):
        self.assertEqual(
            ci.extract_source_name(
                {"source": "pbinfo", "tags": ["Clasa a 9-a", "ONI 2014, Clasa a IX-a"]}
            ),
            "ONI 2014, Clasa a IX-a",
        )
        self.assertEqual(
            ci.extract_source_name({"source": "dmoj", "tags": []}), "dmoj.ca"
        )
        self.assertEqual(ci.extract_source_name({"source": "kattis", "tags": []}), "kattis")

    def test_map_tags_grade_competition_drop_and_cap(self):
        out = ci.map_tags(
            {
                "tags": [
                    "Clasa a 10-a",
                    "ONI 2014",
                    "Probleme diverse",
                    "Programare dinamică",
                    "Unmapped Tag",
                    "Backtracking",
                    "Coada",
                ]
            }
        )
        slugs = [t["slug"] for t in out]
        self.assertEqual(slugs[:4], ["grade-10", "dynamic-programming", "unmapped-tag", "backtracking"])
        self.assertTrue(all("ONI" not in s for s in slugs))

    def test_detect_io_mode_all_paths(self):
        self.assertEqual(
            ci.detect_io_mode({"metadata": {"intrare/ieșire": "harta.in / harta.out"}, "statementText": ""}),
            ("FILES", "harta.in", "harta.out"),
        )
        self.assertEqual(
            ci.detect_io_mode(
                {"metadata": {}, "statementText": "Fişierul intrare/ieşire: 1expr.in, 1expr.out rest"}
            ),
            ("FILES", "1expr.in", "1expr.out"),
        )
        self.assertEqual(
            ci.detect_io_mode({"metadata": {}, "statementText": "plain stdin"}),
            ("STDIO", "input.txt", "output.txt"),
        )

    def test_parse_limits_metadata_and_header(self):
        self.assertEqual(
            ci.parse_limits({"metadata": {"limită timp": "0.5 secunde", "limită memorie": "16 MB"}}),
            (500, 16384),
        )
        self.assertEqual(
            ci.parse_limits(
                {
                    "metadata": {},
                    "statementText": "Timp execuţie pe test 0.175 sec Limită de memorie 65536 kbytes",
                }
            ),
            (175, 65536),
        )
        self.assertEqual(ci.parse_limits({"metadata": {}}), (1000, 262144))

    def test_clean_statement_infoarena_header_stripped(self):
        text = "chrome nav stuff Vezi solutiile trimise  |  Statistici \n real body"
        self.assertEqual(
            ci.clean_statement("infoarena", {"statementText": text}), "real body"
        )
        self.assertEqual(
            ci.clean_statement(
                "infoarena", {"statementText": "nav Vezi solutiile trimise body"}
            ),
            "body",
        )
        self.assertEqual(
            ci.clean_statement("pbinfo", {"statementText": "  body  "}), "body"
        )
        md = "## Title\nmarkdown body"
        self.assertEqual(
            ci.clean_statement("dmoj", {"statementMarkdown": md, "statementText": "x"}),
            md,
        )

    def test_parse_authors(self):
        self.assertEqual(
            ci.parse_authors({"attribution": "author: Constantin Galatan"}),
            ["Constantin Galatan"],
        )
        self.assertEqual(
            ci.parse_authors(
                {"attribution": "x", "statementText": "Autor    Mugurel Ionut Andreica   extra"}
            ),
            ["Mugurel Ionut Andreica"],
        )
        self.assertEqual(ci.parse_authors({"attribution": ""}), [])

    def test_points_for(self):
        self.assertEqual(ci.points_for(0), [])
        self.assertEqual(ci.points_for(1), [100])
        self.assertEqual(ci.points_for(3), [33, 33, 34])
        self.assertEqual(sum(ci.points_for(7)), 100)

    def test_build_stub_statement_en(self):
        out = ci.build_stub_statement_en("Tit", "ONI 2014", "corp", [{"in": "1", "out": "2"}])
        self.assertIn("Imported from **ONI 2014**", out)
        self.assertIn("## Examples", out)
        self.assertIn("corp", out)


def cluster(
    cluster_id,
    source,
    source_id,
    title,
    license_status="public-exam",
    attribution="author: A B",
    tags=None,
    archived_metadata=None,
    difficulty="medie",
):
    return {
        "clusterId": cluster_id,
        "size": 1,
        "sources": [source],
        "canonical": {
            "source": source,
            "sourceId": str(source_id),
            "sourceUrl": f"https://ex/{source}/{source_id}",
            "title": title,
            "languages": ["ro"],
            "tags": tags if tags is not None else ["Clasa a 9-a", "Coada"],
            "difficultyProxy": {"kind": "pbinfo-difficulty", "value": difficulty},
            "sampleFingerprint": "fp" + str(source_id),
            "licenseStatus": license_status,
            "licenseBasis": "public competition marker" if license_status == "public-exam" else "de-minimis",
            "attribution": attribution,
            "archived": True,
            "retrievedAt": "2026-10-26",
            "grade": 9,
            "timeLimitSeconds": 1,
            "memoryLimitMb": 64,
            **(archived_metadata or {}),
        },
        "members": [],
    }


def archive_entry(samples=None, statement="cerința", metadata=None, text=None):
    return {
        "sourceUrl": "https://ex",
        "title": "T",
        "statementText": text if text is not None else statement,
        "samples": samples if samples is not None else [{"in": "1 2", "out": "3"}],
        "metadata": metadata or {},
        "attribution": "author: A B",
    }


class ImportCommandTests(TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.archive = os.path.join(self.tmp, "archive")
        os.makedirs(os.path.join(self.archive, "pbinfo"), exist_ok=True)
        os.makedirs(os.path.join(self.archive, "dmoj"), exist_ok=True)

    def write_catalog(self, clusters):
        path = os.path.join(self.tmp, "catalog.jsonl")
        with open(path, "w", encoding="utf-8") as fh:
            for c in clusters:
                fh.write(json.dumps(c, ensure_ascii=False) + "\n")
        return path

    def write_archive(self, source, source_id, entry):
        path = os.path.join(self.archive, source, f"{source_id}.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(entry, fh, ensure_ascii=False)
        return path

    def call(self, catalog, *args, **kwargs):
        out = StringIO()
        call_command(
            "import_catalog",
            "--catalog",
            catalog,
            "--archive-dir",
            self.archive,
            *args,
            **kwargs,
            stdout=out,
        )
        return out.getvalue()

    def test_full_import_with_translation(self):
        self.write_archive("pbinfo", "1103", archive_entry(metadata={"limită timp": "0.5 secunde", "limită memorie": "16 MB", "intrare/ieșire": "harta.in / harta.out"}))
        translations = {"pbinfo:1103": {"title_en": "The Map", "statement_en": "EN body"}}
        tpath = os.path.join(self.tmp, "tr.json")
        with open(tpath, "w", encoding="utf-8") as fh:
            json.dump(translations, fh)
        catalog = self.write_catalog([cluster("c1", "pbinfo", "1103", "Harta")])
        out = self.call(catalog, "--translations", tpath)

        self.assertIn("1 imported", out)
        p = Problem.objects.get(source_url="https://ex/pbinfo/1103")
        self.assertEqual(p.title_i18n["en"], "The Map")
        self.assertEqual(p.title_i18n["ro"], "Harta")
        self.assertEqual(p.statement_i18n["en"], "EN body")
        self.assertEqual(p.statement_i18n["ro"], "cerința")
        self.assertEqual(p.status, "APPROVED")
        self.assertEqual(p.io_mode, "FILES")
        self.assertEqual(p.io_input_filename, "harta.in")
        self.assertEqual(p.default_time_limit_ms, 500)
        self.assertEqual(p.default_memory_limit_kb, 16384)
        self.assertEqual(p.license_status, "public-exam")
        self.assertTrue(p.license_basis)
        self.assertEqual(p.source_authors, ["A B"])
        self.assertEqual(p.full_score, 100)
        tc = ProblemTestCase.objects.get(problem=p)
        self.assertTrue(tc.is_sample)
        self.assertEqual(tc.points, 100)
        entry = CatalogEntry.objects.get(cluster_id="c1")
        self.assertEqual(entry.imported_problem, p)
        self.assertTrue(
            p.tags.filter(slug="grade-9").exists() and p.tags.filter(slug="queue").exists()
        )

    def test_own_marker_overrides_to_own_license(self):
        self.write_archive("pbinfo", "2682", archive_entry())
        catalog = self.write_catalog(
            [cluster("c2", "pbinfo", "2682", "Lungime", attribution="posted by Andrei Visalon (Prekzursil)", license_status="reference-only")]
        )
        tpath = os.path.join(self.tmp, "tr.json")
        with open(tpath, "w", encoding="utf-8") as fh:
            json.dump({"pbinfo:2682": {"title_en": "Max", "statement_en": "EN"}}, fh)
        out = self.call(catalog, "--translations", tpath)
        self.assertIn("1 imported", out)
        p = Problem.objects.get(source_url="https://ex/pbinfo/2682")
        self.assertEqual(p.license_status, "own")
        self.assertIn("own content", p.license_basis)
        self.assertEqual(CatalogEntry.objects.get(cluster_id="c2").license_status, "own")

    def test_dmoj_native_english_no_translation_needed(self):
        self.write_archive(
            "dmoj",
            "cco03p4",
            {
                "statementMarkdown": "## CCO task",
                "statementText": "x",
                "samples": [{"in": "3", "out": "1"}, {"in": "4", "out": "4"}],
                "metadata": {},
                "attribution": "DMOJ authors",
            },
        )
        catalog = self.write_catalog([cluster("c3", "dmoj", "cco03p4", "CCO Task")])
        out = self.call(catalog)  # en-mode=require, no translations file
        self.assertIn("1 imported", out)
        p = Problem.objects.get(source_url="https://ex/dmoj/cco03p4")
        self.assertEqual(p.statement_i18n["en"], "## CCO task")
        self.assertNotIn("ro", p.statement_i18n)
        self.assertEqual(p.io_mode, "STDIO")
        self.assertEqual(
            list(p.test_cases.order_by("order").values_list("points", flat=True)),
            [50, 50],
        )

    def test_reference_only_is_metadata_only(self):
        catalog = self.write_catalog(
            [cluster("c4", "codeforces", "4A", "Watermelon", license_status="reference-only")]
        )
        out = self.call(catalog)
        self.assertIn("1 metadata-only", out)
        self.assertEqual(Problem.objects.count(), 0)
        entry = CatalogEntry.objects.get(cluster_id="c4")
        self.assertEqual(entry.license_status, "reference-only")
        self.assertFalse(entry.archived)

    def test_unarchived_public_exam_is_metadata_only(self):
        catalog = self.write_catalog([cluster("c5", "pbinfo", "999", "NoArchive")])
        out = self.call(catalog)
        self.assertIn("1 metadata-only", out)
        entry = CatalogEntry.objects.get(cluster_id="c5")
        self.assertEqual(entry.license_status, "public-exam")
        self.assertFalse(entry.archived)
        self.assertIsNone(entry.imported_problem)

    def test_pending_translation_skipped_and_retryable(self):
        self.write_archive("pbinfo", "555", archive_entry())
        catalog = self.write_catalog([cluster("c6", "pbinfo", "555", "P")])
        out = self.call(catalog)
        self.assertIn("1 pending translation", out)
        self.assertEqual(CatalogEntry.objects.count(), 0)  # retryable later
        # A second run with the translation lands it.
        tpath = os.path.join(self.tmp, "tr.json")
        with open(tpath, "w", encoding="utf-8") as fh:
            json.dump({"pbinfo:555": {"title_en": "P", "statement_en": "EN"}}, fh)
        out = self.call(catalog, "--translations", tpath)
        self.assertIn("1 imported", out)

    def test_stub_mode_creates_honest_scaffold(self):
        self.write_archive("pbinfo", "777", archive_entry(samples=[{"in": "5", "out": "6"}]))
        catalog = self.write_catalog([cluster("c7", "pbinfo", "777", "Stubbed")])
        out = self.call(catalog, "--en-mode", "stub")
        self.assertIn("1 imported", out)
        p = Problem.objects.get(source_url="https://ex/pbinfo/777")
        self.assertIn("full English translation is pending", p.statement_i18n["en"])

    def test_dry_run_writes_nothing(self):
        self.write_archive("pbinfo", "888", archive_entry())
        catalog = self.write_catalog([cluster("c8", "pbinfo", "888", "D")])
        out = self.call(catalog, "--en-mode", "stub", "--dry-run")
        self.assertIn("1 imported", out)
        self.assertEqual(Problem.objects.count(), 0)
        self.assertEqual(CatalogEntry.objects.count(), 0)

    def test_idempotent_rerun_skips_existing(self):
        self.write_archive("pbinfo", "9", archive_entry())
        catalog = self.write_catalog([cluster("c9", "pbinfo", "9", "I")])
        self.call(catalog, "--en-mode", "stub")
        out = self.call(catalog, "--en-mode", "stub")
        self.assertIn("1 already present", out)
        self.assertEqual(Problem.objects.count(), 1)

    def test_sources_filter_and_limit(self):
        self.write_archive("pbinfo", "10", archive_entry())
        self.write_archive("pbinfo", "11", archive_entry())
        catalog = self.write_catalog(
            [
                cluster("ca", "pbinfo", "10", "A"),
                cluster("cb", "pbinfo", "11", "B"),
            ]
        )
        out = self.call(catalog, "--en-mode", "stub", "--limit", "1")
        self.assertIn("1 imported", out)
        self.assertEqual(Problem.objects.count(), 1)
        out = self.call(catalog, "--en-mode", "stub", "--statuses", "licensed")
        self.assertIn("already present", out)  # ca recorded; cb filtered by status

    def test_missing_catalog_raises(self):
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            self.call(os.path.join(self.tmp, "nope.jsonl"))

    def test_problem_without_samples_is_pending_approval(self):
        self.write_archive("pbinfo", "12", archive_entry(samples=[]))
        catalog = self.write_catalog([cluster("cc", "pbinfo", "12", "NoSamples")])
        self.call(catalog, "--en-mode", "stub")
        p = Problem.objects.get(source_url="https://ex/pbinfo/12")
        self.assertEqual(p.status, "PENDING")
        self.assertEqual(p.test_cases.count(), 0)

    def test_alt_sources_recorded_for_merged_members(self):
        """Dedupe-merged mirrors land on the problem as alt-source records."""
        self.write_archive("pbinfo", "10", archive_entry())
        c = cluster("cx", "pbinfo", "10", "Suma")
        c["members"] = [
            {
                "source": "pbinfo",
                "sourceId": "10",
                "sourceUrl": "https://ex/pbinfo/10",
                "title": "Suma",
                "isCanonical": True,
            },
            {
                "source": "infoarena",
                "sourceId": "sum",
                "sourceUrl": "https://ex/infoarena/sum",
                "title": "Suma",
            },
            {"source": "", "sourceId": "ghost"},  # skipped: no source
        ]
        catalog = self.write_catalog([c])
        self.call(catalog, "--en-mode", "stub")
        p = Problem.objects.get(source_url="https://ex/pbinfo/10")
        self.assertEqual(
            p.alt_sources,
            [
                {
                    "source": "infoarena",
                    "sourceId": "sum",
                    "sourceUrl": "https://ex/infoarena/sum",
                    "title": "Suma",
                }
            ],
        )

    def test_malformed_rows_skipped_and_sources_filter_excludes(self):
        """Blank lines, clusterId-less rows and filtered-out sources pass by."""
        self.write_archive("pbinfo", "10", archive_entry())
        path = os.path.join(self.tmp, "mixed.jsonl")
        c = cluster("cz", "pbinfo", "10", "A")
        other = cluster("cy", "dmoj", "x1", "B")
        with open(path, "w", encoding="utf-8") as fh:
            fh.write("\n")  # blank line
            fh.write(json.dumps({"no": "cluster id"}) + "\n")
            # canonical passes the source filter but lacks a clusterId
            fh.write(
                json.dumps(
                    {"canonical": {"source": "pbinfo", "sourceId": "98"}}
                )
                + "\n"
            )
            fh.write(json.dumps(other) + "\n")  # filtered out by --sources
            fh.write(json.dumps(c) + "\n")
        out = self.call(path, "--en-mode", "stub", "--sources", "pbinfo")
        self.assertIn("1 imported", out)
        self.assertFalse(Problem.objects.filter(source_url="https://ex/dmoj/x1").exists())

    def test_missing_archive_dir_means_metadata_only(self):
        catalog = self.write_catalog([cluster("cw", "pbinfo", "10", "A")])
        out = StringIO()
        call_command(
            "import_catalog",
            "--catalog",
            catalog,
            "--en-mode",
            "stub",
            stdout=out,
        )
        self.assertIn("1 metadata-only", out.getvalue())
        self.assertEqual(Problem.objects.count(), 0)
        self.assertTrue(CatalogEntry.objects.filter(cluster_id="cw").exists())

    def test_empty_metadata_values_ignored_in_io_detection(self):
        self.write_archive(
            "pbinfo",
            "13",
            archive_entry(metadata={"limită timp": ""}),
        )
        catalog = self.write_catalog([cluster("cv", "pbinfo", "13", "A")])
        self.call(catalog, "--en-mode", "stub")
        p = Problem.objects.get(source_url="https://ex/pbinfo/13")
        self.assertEqual(p.io_mode, "STDIO")

