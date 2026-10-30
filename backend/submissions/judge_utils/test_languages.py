"""Tests for the judge language registry (judge_utils/languages.py) and the
backend argv builders (judge_utils/backend.py) it feeds.

Plain ``unittest.TestCase`` classes (no DB) — these are pure unit tests of
data/argv construction.
"""

import unittest

from submissions.judge_utils.backend import (
    CONTAINER,
    LOCAL,
    build_docker_run_command,
    judge_workspace_root,
)
from submissions.judge_utils.languages import (
    LANGUAGES,
    SUPPORTED_LANGUAGE_IDS,
    effective_limits,
    get_language,
)


#: The 14-language registry after the language-fairness wave: the six
#: wave-A/RO-5 entries plus the eight additions (go, rust, csharp, ruby,
#: kotlin, lua, php, haskell).
EXPANDED_IDS = frozenset(
    {
        "python3",
        "cpp17",
        "c11",
        "java11",
        "nodejs20",
        "pascal",
        "go",
        "rust",
        "csharp",
        "ruby",
        "kotlin",
        "lua",
        "php",
        "haskell",
    }
)


class RegistryContentTests(unittest.TestCase):
    def test_all_fourteen_languages_registered(self):
        # RO-5 (pascal) + the language-fairness wave's eight additions.
        self.assertEqual(set(LANGUAGES), EXPANDED_IDS)

    def test_supported_ids_sorted_and_complete(self):
        self.assertEqual(
            SUPPORTED_LANGUAGE_IDS,
            tuple(sorted(EXPANDED_IDS)),
        )

    def test_pascal_spec_shape(self):
        spec = LANGUAGES["pascal"]
        self.assertEqual(spec.source_filename, "user_code.pas")
        self.assertEqual(spec.compile_artifact, "user_program")
        self.assertEqual(spec.run_command, ("./user_program",))
        self.assertEqual(spec.time_multiplier, 1.0)

    def test_get_language_known_and_unknown(self):
        self.assertIsNotNone(get_language("python3"))
        self.assertIsNone(get_language("cobol"))
        self.assertIsNone(get_language(""))

    def test_interpreted_languages_have_no_compile_step(self):
        for lang in ("python3", "nodejs20"):
            spec = LANGUAGES[lang]
            self.assertIsNone(spec.compile_command)
            self.assertIsNone(spec.compile_artifact)
            self.assertIsNone(spec.compile_argv())

    def test_compiled_languages_produce_artifacts(self):
        # gcc/g++ compile with an explicit -o <artifact>; javac emits
        # Main.class implicitly (no output-name flag).
        cases = {
            "cpp17": ("user_code.cpp", "user_program", "g++", True),
            "c11": ("user_code.c", "user_program", "gcc", True),
            "java11": ("Main.java", "Main.class", "javac", False),
        }
        for lang, (src, artifact, compiler, artifact_in_argv) in cases.items():
            spec = LANGUAGES[lang]
            self.assertEqual(spec.source_filename, src)
            self.assertEqual(spec.compile_artifact, artifact)
            argv = spec.compile_argv()
            self.assertIsNotNone(argv)
            self.assertIn(compiler, argv)
            self.assertIn(src, argv)
            if artifact_in_argv:
                self.assertIn(artifact, argv)

    def test_java11_compiles_with_release_11(self):
        # SPEC drift fix: the judge-runner toolchain is OpenJDK 21; the
        # java11 id must compile with --release 11 (source AND bytecode).
        argv = LANGUAGES["java11"].compile_argv()
        self.assertIn("--release", argv)
        self.assertEqual(argv[argv.index("--release") + 1], "11")
        self.assertEqual(LANGUAGES["java11"].java_release, "11")

    def test_c11_std_flag(self):
        argv = LANGUAGES["c11"].compile_argv()
        self.assertIn("-std=c11", argv)
        self.assertIn("-lm", argv)

    def test_run_commands_reference_expected_programs(self):
        self.assertEqual(LANGUAGES["python3"].run_command, ("python", "user_code.py"))
        self.assertEqual(LANGUAGES["cpp17"].run_command, ("./user_program",))
        self.assertEqual(LANGUAGES["c11"].run_command, ("./user_program",))
        self.assertEqual(LANGUAGES["java11"].run_command, ("java", "-cp", ".", "Main"))
        self.assertEqual(LANGUAGES["nodejs20"].run_command, ("node", "user_code.js"))

    def test_compile_argv_retargeting_for_checkers(self):
        cpp = LANGUAGES["cpp17"]
        argv = cpp.compile_argv(
            source_name="checker.cpp", artifact_name="checker_program"
        )
        self.assertIn("checker.cpp", argv)
        self.assertIn("checker_program", argv)
        self.assertNotIn("user_code.cpp", argv)
        self.assertNotIn("user_program", argv)
        # std/opt flags survive retargeting.
        self.assertIn("-std=c++17", argv)

    def test_run_argv_retargeting_for_checkers(self):
        cpp = LANGUAGES["cpp17"]
        self.assertEqual(
            cpp.run_argv(artifact_name="checker_program"), ("./checker_program",)
        )
        py = LANGUAGES["python3"]
        self.assertEqual(py.run_argv(source_name="checker.py"), ("python", "checker.py"))

    def test_every_language_declares_a_local_docker_image(self):
        for lang, spec in LANGUAGES.items():
            self.assertTrue(spec.docker_image, lang)


class DockerRunBuilderTests(unittest.TestCase):
    def test_hardening_flags_and_defaults(self):
        argv = build_docker_run_command(
            ["python", "user_code.py"], "/tmp/ws", "python:3.11-slim"
        )
        self.assertEqual(argv[:3], ["docker", "run", "--rm"])
        for flag in (
            "--user",
            "--cap-drop=ALL",
            "--security-opt=no-new-privileges",
        ):
            self.assertIn(flag, argv)
        self.assertEqual(argv[argv.index("--user") + 1], "1000:1000")
        # Default: network isolated, interactive, read-only mount.
        self.assertEqual(argv[argv.index("--network") + 1], "none")
        self.assertIn("-i", argv)
        self.assertIn("/tmp/ws:/app:ro", argv)
        self.assertEqual(argv[argv.index("-w") + 1], "/app")
        self.assertEqual(argv[-2:], ["python", "user_code.py"])

    def test_memory_limit_flags_only_when_positive(self):
        argv = build_docker_run_command(
            ["true"], "/w", "i", memory_limit_kb=262144
        )
        self.assertIn("--memory", argv)
        self.assertEqual(argv[argv.index("--memory") + 1], "262144k")
        self.assertIn("--memory-swap", argv)
        # Zero/negative limit means "no per-problem cap": no flags emitted
        # (docker treats `--memory 0k` as unlimited but errors on some
        # versions; omitting is unambiguous).
        argv0 = build_docker_run_command(["true"], "/w", "i", memory_limit_kb=0)
        self.assertNotIn("--memory", argv0)
        argv_neg = build_docker_run_command(
            ["true"], "/w", "i", memory_limit_kb=-5
        )
        self.assertNotIn("--memory", argv_neg)

    def test_extra_mounts_appended(self):
        argv = build_docker_run_command(
            ["true"],
            "/w",
            "i",
            extra_volume_mounts=["-v", "/opt/boost:/usr/local/include/boost:ro"],
        )
        self.assertIn("/opt/boost:/usr/local/include/boost:ro", argv)

    def test_network_override_for_legacy_pip_flow(self):
        argv = build_docker_run_command(
            ["sh", "-c", "pip install"], "/w", "i", network="bridge"
        )
        self.assertEqual(argv[argv.index("--network") + 1], "bridge")


class WorkspaceRootTests(unittest.TestCase):
    def test_local_backend_uses_system_temp(self):
        import pathlib
        import tempfile

        from django.test import override_settings

        with override_settings(JUDGE_BACKEND=LOCAL):
            root = judge_workspace_root()
        self.assertEqual(root, pathlib.Path(tempfile.gettempdir()))

    def test_container_backend_uses_sandbox_root_setting(self):
        import pathlib

        from django.test import override_settings

        with override_settings(JUDGE_BACKEND=CONTAINER, JUDGE_SANDBOX_ROOT="/srv/judge"):
            self.assertEqual(judge_workspace_root(), pathlib.Path("/srv/judge"))
        with override_settings(
            JUDGE_BACKEND=CONTAINER, JUDGE_SANDBOX_ROOT="/custom/sandbox"
        ):
            self.assertEqual(
                judge_workspace_root(), pathlib.Path("/custom/sandbox")
            )

    def test_container_backend_defaults_to_srv_judge_without_setting(self):
        import pathlib

        from django.test import override_settings

        from submissions.judge_utils import backend as judge_backend

        had = hasattr(judge_backend.settings, "JUDGE_SANDBOX_ROOT")
        previous = getattr(judge_backend.settings, "JUDGE_SANDBOX_ROOT", None)
        if had:
            del judge_backend.settings.JUDGE_SANDBOX_ROOT
        try:
            with override_settings(JUDGE_BACKEND=CONTAINER):
                self.assertEqual(
                    judge_workspace_root(), pathlib.Path("/srv/judge")
                )
        finally:
            if had:
                judge_backend.settings.JUDGE_SANDBOX_ROOT = previous


class BuilderEdgeCaseTests(unittest.TestCase):
    def test_non_interactive_docker_run_omits_i_flag(self):
        argv = build_docker_run_command(["true"], "/w", "img", interactive=False)
        self.assertNotIn("-i", argv)
        argv_on = build_docker_run_command(["true"], "/w", "img")
        self.assertIn("-i", argv_on)


class LanguageFairLimitTests(unittest.TestCase):
    """Owner requirement: a hard 0.1s-style limit must not make a problem
    solvable only in low-level languages — the registry normalizes time AND
    memory per language (wave item A)."""

    def test_multiplier_table_shipped_values(self):
        # (time ×, mem ×, mem floor) — the documented fairness table.
        table = {
            "c11": (1.0, 1.0, 0),
            "cpp17": (1.0, 1.0, 0),
            "pascal": (1.0, 1.0, 0),
            "go": (1.0, 1.0, 262144),
            "rust": (1.0, 1.0, 0),
            "haskell": (1.0, 1.0, 262144),
            "java11": (2.0, 1.0, 524288),
            "kotlin": (2.0, 1.0, 524288),
            "csharp": (2.0, 1.0, 524288),
            "python3": (3.0, 1.5, 0),
            "ruby": (3.0, 1.5, 0),
            "php": (3.0, 1.5, 0),
            "nodejs20": (2.0, 1.0, 524288),
            "lua": (2.0, 1.0, 0),
        }
        self.assertEqual(set(table), set(LANGUAGES))
        for lang, (t, m, floor) in table.items():
            spec = LANGUAGES[lang]
            self.assertEqual(spec.time_multiplier, t, lang)
            self.assertEqual(spec.memory_multiplier, m, lang)
            self.assertEqual(spec.memory_floor_kb, floor, lang)

    def test_effective_limits_new_languages(self):
        # Compiled additions are unadjusted; interpreted ones scaled.
        self.assertEqual(effective_limits(1000, 262144, "rust"), (1000, 262144))
        self.assertEqual(effective_limits(1000, 262144, "ruby"), (3000, 393216))
        self.assertEqual(
            effective_limits(1000, 262144, "csharp"),
            (2000, 524288),  # 2x time, JVM-class memory floor
        )
        self.assertEqual(effective_limits(1000, 262144, "kotlin"), (2000, 524288))
        self.assertEqual(effective_limits(1000, 262144, "lua"), (2000, 262144))
        # Floor beats a small default even without a multiplier.
        self.assertEqual(effective_limits(1000, 100000, "haskell"), (1000, 262144))

    def test_python_memory_multiplier_and_floor_composition(self):
        # python3: no floor, 1.5x memory — a 256MB default becomes 384MB.
        self.assertEqual(effective_limits(1000, 262144, "python3"), (3000, 393216))

    def test_override_beats_multipliers_on_new_language(self):
        self.assertEqual(
            effective_limits(
                1000, 262144, "ruby", {"ruby": {"time_ms": 500, "memory_kb": 65536}}
            ),
            (500, 65536),
        )

    def test_010s_baseline_is_python_solvable_with_multiplier(self):
        # The owner's canonical scenario: a 0.1s C-baseline limit.
        self.assertEqual(effective_limits(100, 262144, "python3")[0], 300)
        self.assertEqual(effective_limits(100, 262144, "cpp17")[0], 100)


class ExpansionShapeTests(unittest.TestCase):
    """Structural invariants for the eight added languages."""

    def test_go_compiles_through_sh_with_writable_caches(self):
        argv = LANGUAGES["go"].compile_argv()
        self.assertEqual(argv[:2], ("sh", "-c"))
        self.assertIn("GOCACHE=/tmp/gocache", argv[2])
        self.assertIn("go build", argv[2])

    def test_rust_compiles_with_rustc_o(self):
        argv = LANGUAGES["rust"].compile_argv()
        self.assertEqual(argv[0], "rustc")
        self.assertIn("-O", argv)

    def test_csharp_uses_mcs_and_mono(self):
        self.assertEqual(LANGUAGES["csharp"].compile_argv()[0], "mcs")
        self.assertEqual(LANGUAGES["csharp"].run_command, ("mono", "user_program.exe"))

    def test_kotlin_compiles_to_jar_and_runs_with_kotlin_runner(self):
        argv = LANGUAGES["kotlin"].compile_argv()
        self.assertEqual(argv[:2], ("sh", "-c"))
        self.assertIn("kotlinc user_code.kt -d user_program.jar", argv[2])
        self.assertEqual(LANGUAGES["kotlin"].run_command, ("kotlin", "user_program.jar"))

    def test_interpreted_additions_have_no_compile_step(self):
        for lang in ("ruby", "lua", "php"):
            spec = LANGUAGES[lang]
            self.assertIsNone(spec.compile_command, lang)
            self.assertIsNone(spec.compile_artifact, lang)

    def test_haskell_compiles_with_ghc(self):
        self.assertEqual(LANGUAGES["haskell"].compile_argv()[0], "ghc")

    def test_slow_toolchains_get_raised_compile_budgets(self):
        self.assertEqual(LANGUAGES["go"].compile_timeout_s, 60)
        self.assertEqual(LANGUAGES["rust"].compile_timeout_s, 60)
        self.assertEqual(LANGUAGES["csharp"].compile_timeout_s, 60)
        self.assertEqual(LANGUAGES["kotlin"].compile_timeout_s, 120)
        self.assertEqual(LANGUAGES["haskell"].compile_timeout_s, 90)
        # Default stays 30s for the fast toolchains.
        for lang in ("cpp17", "python3", "pascal"):
            self.assertEqual(LANGUAGES[lang].compile_timeout_s, 30, lang)

    def test_checker_capability_flags(self):
        # java11 (fixed class-name run argv) and the sh -c compilers
        # (go, kotlin) cannot serve as checker/interactor languages.
        for lang in ("java11", "go", "kotlin"):
            self.assertFalse(LANGUAGES[lang].checker_capable, lang)
        for lang in ("python3", "cpp17", "c11", "rust", "haskell", "pascal"):
            self.assertTrue(LANGUAGES[lang].checker_capable, lang)
