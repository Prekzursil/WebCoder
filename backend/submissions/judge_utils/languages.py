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
    #: Memory floor in KB for runtimes with large fixed overheads (JVM,
    #: Node, Mono): the effective limit is max(problem limit, floor).
    memory_floor_kb: int = 0

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
            argv = [
                source_name if tok == self.source_filename else tok for tok in argv
            ]
        if artifact_name is not None and self.compile_artifact:
            argv = [
                artifact_name if tok == self.compile_artifact else tok
                for tok in argv
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
            argv = [
                tok.replace(self.compile_artifact, artifact_name) for tok in argv
            ]
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

#: All supported languages, keyed by submission-side language id.
LANGUAGES: dict[str, LanguageSpec] = {
    spec.language_id: spec
    for spec in (_PYTHON3, _CPP17, _C11, _JAVA11, _NODEJS20)
}

#: Sorted ids for validation error messages / API-facing lists.
SUPPORTED_LANGUAGE_IDS: tuple[str, ...] = tuple(sorted(LANGUAGES))


def get_language(language_id: str) -> LanguageSpec | None:
    """Return the spec for *language_id*, or ``None`` when unsupported."""
    return LANGUAGES.get(language_id)


def effective_limits(
    default_time_ms: int,
    default_memory_kb: int,
    language_id: str,
    limit_overrides: dict | None = None,
) -> tuple[int, int]:
    """Resolve the effective (time_ms, memory_kb) for one language (J5).

    Layers, most specific first:
    1. ``Problem.limit_overrides[language_id]`` — explicit author override.
    2. Language registry multipliers/floors — the default-time multiplier
       for the language, and the memory floor for heavy runtimes.
    """
    spec = LANGUAGES.get(language_id)
    multiplier = spec.time_multiplier if spec else 1.0
    floor_kb = spec.memory_floor_kb if spec else 0
    time_ms = int(default_time_ms * multiplier)
    memory_kb = max(default_memory_kb, floor_kb)

    overrides = (limit_overrides or {}).get(language_id)
    if isinstance(overrides, dict):
        if "time_ms" in overrides and overrides["time_ms"]:
            time_ms = int(overrides["time_ms"])
        if "memory_kb" in overrides and overrides["memory_kb"]:
            memory_kb = int(overrides["memory_kb"])
    return time_ms, memory_kb
