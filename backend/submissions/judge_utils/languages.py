"""Language registry for the judge — the single source of truth for judged
languages, replacing the per-module if/elif chains that used to duplicate
compile/run knowledge across ``compilation.py``, ``execution.py`` and
``checkers.py``.

Every supported language is one :class:`LanguageSpec` entry. The compile and
run argv are expressed **relative to the submission working directory** so the
exact same argv works under both judge backends:

- ``JUDGE_BACKEND=container`` (production): the argv runs inside the hardened
  ``webcoder-judge-runner`` container via ``docker exec -w <submission dir>``
  (``judge_utils/backend.py``). The submission dir lives on the shared
  ``judge-sandbox`` volume mounted at ``/srv/judge`` in both the worker and
  the judge-runner, so paths are identical on both sides.
- ``JUDGE_BACKEND=local`` (host dev): the argv runs through a per-run
  ``docker run`` that bind-mounts the submission dir at ``/app`` and sets
  ``-w /app``, using ``LanguageSpec.docker_image``.

Toolchain contract (``backend/Dockerfile.judge`` builds the judge-runner image
with all of these):

- python3  -> python 3.11 (image base)
- cpp17    -> g++ (GNU C++17)
- c11      -> gcc (GNU C11)
- java11   -> OpenJDK 21 javac/java compiled with ``--release 11`` so the
              language id stays honest: source level AND bytecode target are
              Java 11 regardless of the JDK in the image.
- nodejs20 -> Node.js 20
- pascal   -> Free Pascal (RO olympiad staple, RO-5)
- go       -> Go (Debian trixie ``golang``)
- rust     -> Rust (``rustc`` direct; judged programs are single-file, no
              cargo project)
- csharp   -> C# via Mono ``mcs``/``mono`` (SPEC-GAPS J11d design)
- ruby     -> Ruby (``ruby`` CLI)
- kotlin   -> Kotlin (pinned ``kotlinc`` ZIP on the image's OpenJDK)
- lua      -> Lua 5.4 (``lua5.4``)
- php      -> PHP CLI (``php-cli``)
- haskell  -> GHC (``ghc``)

**Language-fair limits (owner requirement; competitive roadmap J5/JDG-5).**
A hard limit tuned for C/C++ must not make a problem solvable ONLY in a
low-level language: the judge normalizes time AND memory per language.
``Problem.default_time_limit_ms`` / ``default_memory_limit_kb`` are the
C-baseline; the EFFECTIVE limit for a submission is::

    time_ms   = override  or  default_time_limit_ms * spec.time_multiplier
    memory_kb = override  or  max(default_memory_limit_kb
                                  * spec.memory_multiplier,
                                  spec.memory_floor_kb)

The shipped multiplier table (documented against major judges' published
practice — HackerRank's Execution Environment page documents per-language
defaults e.g. C 2s / Python 10s / Go 4s; Codeforces publishes per-language
factor lists per problem; DMOJ exposes ``language_resource_limits``):

============ ======== ======== =========== ====================================
language     time ×   mem ×   mem floor   rationale
============ ======== ======== =========== ====================================
c11          1.0      1.0     —           baseline (compiled, no runtime)
cpp17        1.0      1.0     —           baseline
pascal       1.0      1.0     —           FPC -O2 is competitive with gcc
go           1.0      1.0     262144 KB   compiled; the runtime wants a
                                            little heap headroom
rust         1.0      1.0     —           compiled
haskell      1.0      1.0     262144 KB   compiled; the GHC RTS wants heap
                                            headroom beyond a C program
java11       2.0      1.0     524288 KB   JVM startup + JIT warmup (~2× is
                                            the Codeforces/HackerRank norm);
                                            JVM heap + metaspace floor
kotlin       2.0      1.0     524288 KB   same JVM story as java11
csharp       2.0      1.0     524288 KB   Mono runtime behaves like the JVM
                                            (SPEC-GAPS J11d)
python3      3.0      1.5     —           CPython runs ~3–5× slower than C
                                            on contest workloads (HackerRank
                                            grants 5×); object + GC overhead
                                            needs memory headroom
ruby         3.0      1.5     —           MRI is in the CPython class
php          3.0      1.5     —           PHP CLI, interpreted class
nodejs20     2.0      1.0     524288 KB   V8 JIT + heap floor (J5 design)
lua          2.0      1.0     —           lua5.4 is fast for an interpreter;
                                            2× is the honest band
============ ======== ======== =========== ====================================

Per-problem ``Problem.limit_overrides`` beat every row above for that
language, on either axis.

Custom-library caveats (unchanged by this registry):

- Python ``custom_libraries_allowed`` pip-install flow: only meaningful on the
  per-run ``docker run`` (local) backend, which is the only one with network
  egress for pip. The hardened judge-runner is network-isolated
  (``network_mode: none``) with a read-only rootfs, so pip cannot fetch or
  install there — such submissions fail closed at the pip step.
- ``boost_headers`` (C++) and Java JAR libraries rely on host-directory
  bind-mounts, which likewise only exist on the local per-run backend.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class LanguageSpec:
    """Everything the judge needs to compile and run one language."""

    #: Submission-side language id (Submission.language / Problem.allowed_languages).
    language_id: str
    #: Human-readable name for feedback strings.
    display_name: str
    #: Filename the submitted source is written to, inside the submission dir.
    source_filename: str
    #: Compile argv (relative to the submission dir) or ``None`` when the
    #: language is interpreted (no compile step).
    compile_command: tuple[str, ...] | None
    #: Artifact filename the compile step must produce (existence check), or
    #: ``None`` for interpreted languages (the source file is the "executable").
    compile_artifact: str | None
    #: Run argv (relative to the submission dir). Java's classpath is built at
    #: run time (custom JARs), so it carries a placeholder resolved in
    #: ``execution.py``; see ``java_classpath_run``.
    run_command: tuple[str, ...]
    #: Image used by the per-run ``docker run`` on the LOCAL backend only.
    docker_image: str
    #: Java source/bytecode release level (``javac --release``); ``None`` for
    #: non-Java languages. Kept as data so tests can pin the drift fix
    #: (java11 must compile with --release 11 even under a JDK 21 toolchain).
    java_release: str | None = None
    #: CPU-time multiplier applied to the problem's default limit for this
    #: language (competitive roadmap J5): interpreted/JVM/Node runtimes need
    #: more than C/C++ for the same algorithm. 1.0 = no adjustment.
    time_multiplier: float = 1.0
    #: Memory multiplier for runtimes whose memory overhead scales with the
    #: data (boxed objects, GC): effective memory is
    #: max(limit * memory_multiplier, memory_floor_kb). 1.0 = no adjustment.
    memory_multiplier: float = 1.0
    #: Memory floor in KB for runtimes with large fixed overheads (JVM,
    #: Node, Mono): the effective limit is max(problem limit, floor).
    memory_floor_kb: int = 0
    #: In-container compile deadline in seconds (JDG-8/J11c): slower
    #: toolchains (Go first build, Kotlin, GHC) get a longer budget than
    #: the 30s default.
    compile_timeout_s: int = 30
    #: Whether this spec can serve as a custom-checker/interactor language
    #: (``checkers.py``). False for languages whose argv cannot be
    #: retargeted to arbitrary file names: Java's run argv is a fixed
    #: class name, and Go/Kotlin compile through an ``sh -c`` string whose
    #: tokens cannot be swapped for the checker's file names.
    checker_capable: bool = True

    def compile_argv(
        self,
        source_name: str | None = None,
        artifact_name: str | None = None,
    ) -> tuple[str, ...] | None:
        """Compile argv, optionally retargeted to different file names.

        With no arguments the registry's ``compile_command`` is returned
        verbatim. Custom checker compilation reuses the same toolchain with
        the checker's own file names (e.g. ``checker.cpp`` ->
        ``checker_program``): *source_name* replaces the token equal to
        ``source_filename`` and *artifact_name* the token equal to
        ``compile_artifact``. Returns ``None`` for interpreted languages.
        """
        if self.compile_command is None:
            return None
        argv = list(self.compile_command)
        if source_name is not None:
            argv = [source_name if tok == self.source_filename else tok for tok in argv]
        if artifact_name is not None and self.compile_artifact:
            argv = [
                artifact_name if tok == self.compile_artifact else tok for tok in argv
            ]
        return tuple(argv)

    def run_argv(
        self,
        source_name: str | None = None,
        artifact_name: str | None = None,
    ) -> tuple[str, ...]:
        """Run argv, optionally retargeted to different file names.

        Substring replacement (the run argv may embed the artifact in
        ``./user_program``); safe because the replaced tokens are
        registry-controlled file names.
        """
        argv = list(self.run_command)
        if source_name is not None:
            argv = [tok.replace(self.source_filename, source_name) for tok in argv]
        if artifact_name is not None and self.compile_artifact:
            argv = [tok.replace(self.compile_artifact, artifact_name) for tok in argv]
        return tuple(argv)


#: Java run argv is built dynamically (classpath depends on custom libs), so
#: the registry entry carries the plain no-libs form and execution.py extends
#: the classpath when the problem allows JARs.
_PYTHON3 = LanguageSpec(
    language_id="python3",
    display_name="Python 3",
    source_filename="user_code.py",
    compile_command=None,
    compile_artifact=None,
    run_command=("python", "user_code.py"),
    docker_image="python:3.11-slim",
    time_multiplier=3.0,
    memory_multiplier=1.5,
)

_CPP17 = LanguageSpec(
    language_id="cpp17",
    display_name="C++17",
    source_filename="user_code.cpp",
    compile_command=(
        "g++",
        "user_code.cpp",
        "-o",
        "user_program",
        "-std=c++17",
        "-O2",
    ),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="gcc:latest",
)

_C11 = LanguageSpec(
    language_id="c11",
    display_name="C (C11)",
    source_filename="user_code.c",
    compile_command=(
        "gcc",
        "user_code.c",
        "-o",
        "user_program",
        "-std=c11",
        "-O2",
        "-lm",
    ),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="gcc:latest",
)

_JAVA11 = LanguageSpec(
    language_id="java11",
    display_name="Java 11",
    source_filename="Main.java",
    compile_command=(
        "javac",
        "--release",
        "11",
        "Main.java",
    ),
    compile_artifact="Main.class",
    run_command=("java", "-cp", ".", "Main"),
    docker_image="openjdk:11-jdk-slim",
    java_release="11",
    time_multiplier=2.0,
    memory_floor_kb=524288,
    checker_capable=False,
)

_NODEJS20 = LanguageSpec(
    language_id="nodejs20",
    display_name="JavaScript (Node.js 20)",
    source_filename="user_code.js",
    compile_command=None,
    compile_artifact=None,
    run_command=("node", "user_code.js"),
    docker_image="node:20-slim",
    time_multiplier=2.0,
    memory_floor_kb=524288,
)

# RO-5 (competitive roadmap): Free Pascal — RO schools still teach it;
# infoarena runs FreePascal 3.0.0. The docker_image serves the LOCAL dev
# backend only; the container backend uses the fp-compiler toolchain
# installed in Dockerfile.judge.
_PASCAL = LanguageSpec(
    language_id="pascal",
    display_name="Free Pascal",
    source_filename="user_code.pas",
    compile_command=("fpc", "-O2", "-ouser_program", "user_code.pas"),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="frolvlad/alpine-fpc",
)

# ---------------------------------------------------------------------------
# Wave: language-fairness expansion (owner requirement "very large number of
# languages"). Inclusion rationale per language — judged against what school
# and contest users actually submit, and the marginal image/maintenance cost:
#
# - go:      compiled systems language, offered by every major judge
#            (HackerRank/DMOJ/Codewars); Debian trixie ships 1.24.
#            Needs GOCACHE/HOME in the writable /tmp (J11c).
# - rust:    fast-growing, memory-safe compiled language; ``rustc`` alone
#            judges single-file programs (no cargo). Slower compiles than
#            gcc but well inside a 60s budget.
# - csharp:  SPEC-GAPS J11d: Mono ``mcs`` (~200ms compile) instead of a
#            dotnet publish flow that costs seconds per submission.
# - ruby:    classic interpreted language, tiny apt cost, common in
#            club/retiree cohorts and reference solutions.
# - kotlin:  the modern JVM language RO universities increasingly teach;
#            kotlinc cold compiles are slow (raised compile budget), runs
#            on the image's existing OpenJDK.
# - lua:     ~1MB interpreter, the standard first scripting language for
#            game/modding clubs; cheapest language in the set.
# - php:     huge install base in RO freelancing/lectures; php-cli is a
#            small apt package.
# - haskell: the functional-programming course language (facultate);
#            GHC is the heaviest toolchain in the image (~1GB) — kept
#            because a judge's language breadth is itself a feature and
#            the marginal maintenance after the toolchain lands is zero.
#
# Deliberately EXCLUDED (documented for honesty): Visual Basic (no
# maintained Linux toolchain), Objective-C/Swift (Apple toolchains, no
# school demand), assembly (per-arch grading disputes), R/MATLAB (licence
# + runtime size; numpy covers the numeric niche via pip allowlist),
# Perl (demand collapsed; re-add is one LanguageSpec away).
# ---------------------------------------------------------------------------

_GO = LanguageSpec(
    language_id="go",
    display_name="Go",
    source_filename="user_code.go",
    compile_command=(
        "sh",
        "-c",
        "export HOME=/tmp GOCACHE=/tmp/gocache GOFLAGS=-mod=mod "
        "&& go build -o user_program user_code.go",
    ),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="golang:1.24",
    memory_floor_kb=262144,
    compile_timeout_s=60,
    checker_capable=False,
)

_RUST = LanguageSpec(
    language_id="rust",
    display_name="Rust",
    source_filename="user_code.rs",
    compile_command=(
        "rustc",
        "-O",
        "-o",
        "user_program",
        "user_code.rs",
    ),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="rust:1-slim",
    compile_timeout_s=60,
)

_CSHARP = LanguageSpec(
    language_id="csharp",
    display_name="C# (Mono)",
    source_filename="user_code.cs",
    compile_command=(
        "mcs",
        "-out:user_program.exe",
        "user_code.cs",
    ),
    compile_artifact="user_program.exe",
    run_command=("mono", "user_program.exe"),
    docker_image="mono:6.12",
    time_multiplier=2.0,
    memory_floor_kb=524288,
    compile_timeout_s=60,
)

_RUBY = LanguageSpec(
    language_id="ruby",
    display_name="Ruby",
    source_filename="user_code.rb",
    compile_command=None,
    compile_artifact=None,
    run_command=("ruby", "user_code.rb"),
    docker_image="ruby:3.3-slim",
    time_multiplier=3.0,
    memory_multiplier=1.5,
)

_KOTLIN = LanguageSpec(
    language_id="kotlin",
    display_name="Kotlin",
    source_filename="user_code.kt",
    compile_command=(
        "sh",
        "-c",
        "kotlinc user_code.kt -d user_program.jar",
    ),
    compile_artifact="user_program.jar",
    run_command=("kotlin", "user_program.jar"),
    # LOCAL-backend image only: zenika/kotlin is the one maintained
    # kotlinc-in-docker base on Docker Hub (Kotlin 1.4-era; production
    # judging uses the pinned kotlinc installed in Dockerfile.judge).
    docker_image="zenika/kotlin:latest",
    time_multiplier=2.0,
    memory_floor_kb=524288,
    compile_timeout_s=120,
    checker_capable=False,
)

_LUA = LanguageSpec(
    language_id="lua",
    display_name="Lua 5.4",
    source_filename="user_code.lua",
    compile_command=None,
    compile_artifact=None,
    run_command=("lua5.4", "user_code.lua"),
    docker_image="nickblah/lua:5.4",
    time_multiplier=2.0,
)

_PHP = LanguageSpec(
    language_id="php",
    display_name="PHP",
    source_filename="user_code.php",
    compile_command=None,
    compile_artifact=None,
    run_command=("php", "user_code.php"),
    docker_image="php:8.4-cli",
    time_multiplier=3.0,
    memory_multiplier=1.5,
)

_HASKELL = LanguageSpec(
    language_id="haskell",
    display_name="Haskell (GHC)",
    source_filename="user_code.hs",
    compile_command=(
        "ghc",
        "-O",
        "-o",
        "user_program",
        "user_code.hs",
    ),
    compile_artifact="user_program",
    run_command=("./user_program",),
    docker_image="haskell:9.6-slim",
    memory_floor_kb=262144,
    compile_timeout_s=90,
)

#: All supported languages, keyed by submission-side language id.
LANGUAGES: dict[str, LanguageSpec] = {
    spec.language_id: spec
    for spec in (
        _PYTHON3,
        _CPP17,
        _C11,
        _JAVA11,
        _NODEJS20,
        _PASCAL,
        _GO,
        _RUST,
        _CSHARP,
        _RUBY,
        _KOTLIN,
        _LUA,
        _PHP,
        _HASKELL,
    )
}

#: Sorted ids for validation error messages / API-facing lists.
SUPPORTED_LANGUAGE_IDS: tuple[str, ...] = tuple(sorted(LANGUAGES))


def get_language(language_id: str) -> LanguageSpec | None:
    """Return the spec for *language_id*, or ``None`` when unsupported."""
    return LANGUAGES.get(language_id)


#: Wave D engine 2 — Scratch block programs are a SUBMISSION language, not
#: a judge toolchain: the source is an sb3 project JSON that the judge
#: transpiles to Python (problems/scratch_transpiler.py documents why the
#: transpiling path shipped instead of headless scratch-vm). For
#: language-fair limits the transpiled program IS a CPython program, so
#: scratch inherits python3's multipliers — anything else would re-create
#: exactly the low-level-only bias this wave exists to remove.
SCRATCH_LANGUAGE_ID = "scratch"
SCRATCH_JUDGED_AS = "python3"


def judged_language(language_id: str) -> str:
    """The registry language a submission is actually executed as.

    Every registry id maps to itself; the Scratch pseudo-language maps to
    ``python3`` (the transpiler's target), so compile/run paths and the
    J5 effective limits stay registry-driven for block submissions too.
    """
    if language_id == SCRATCH_LANGUAGE_ID:
        return SCRATCH_JUDGED_AS
    return language_id


def effective_limits(
    default_time_ms: int,
    default_memory_kb: int,
    language_id: str,
    limit_overrides: dict | None = None,
) -> tuple[int, int]:
    """Resolve the effective (time_ms, memory_kb) for one language (J5).

    Layers, most specific first:
    1. ``Problem.limit_overrides[language_id]`` — explicit author override
       (keyed by the SUBMISSION language, so a 'scratch' override beats
       the python3 multipliers the pseudo-language inherits).
    2. Language registry multipliers/floors — the time multiplier, the
       memory multiplier, and the memory floor for heavy runtimes
       (``max(limit * memory_multiplier, memory_floor_kb)``). The Scratch
       pseudo-language resolves through :func:`judged_language` (→ python3).
    """
    spec = LANGUAGES.get(judged_language(language_id))
    time_mult = spec.time_multiplier if spec else 1.0
    mem_mult = spec.memory_multiplier if spec else 1.0
    floor_kb = spec.memory_floor_kb if spec else 0
    time_ms = int(default_time_ms * time_mult)
    memory_kb = max(int(default_memory_kb * mem_mult), floor_kb)

    overrides = (limit_overrides or {}).get(language_id)
    if isinstance(overrides, dict):
        if "time_ms" in overrides and overrides["time_ms"]:
            time_ms = int(overrides["time_ms"])
        if "memory_kb" in overrides and overrides["memory_kb"]:
            memory_kb = int(overrides["memory_kb"])
    return time_ms, memory_kb
