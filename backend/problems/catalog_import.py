"""Pure helpers for the catalog import pipeline (content wave).

Everything here is deterministic and side-effect free so the import
command (:mod:`problems.management.commands.import_catalog`) stays a thin
orchestration shell and these functions are unit-testable in isolation.

Licensing buckets (binding house rules):

- ``own``           - the owner's own content (posted under the owner's
                      accounts); detected via the marker below.
- ``licensed``      - explicit permissive license at the source.
- ``public-exam``   - public competition/exam-origin task.
- ``trivial``       - de-minimis statement (author-equivalent).
- ``reference-only``- metadata-only; the statement stays in the private
                      offline archive and never becomes platform content.
"""

from __future__ import annotations

import re
from typing import Any

from .models import Problem

#: Full-import buckets (complete problem + statement + attribution).
FULL_IMPORT_STATUSES = frozenset(
    {
        Problem.LicenseStatus.OWN,
        Problem.LicenseStatus.LICENSED,
        Problem.LicenseStatus.PUBLIC_EXAM,
        Problem.LicenseStatus.TRIVIAL,
    }
)

#: Case-insensitive marker identifying the platform owner's own postings
#: (licensing rule (a): own content, full rights).
OWNERSHIP_MARKER = "prekzursil"

# --------------------------------------------------------------------------
# pbinfo topic-tag mapping (Romanian category -> {en, slug}); unmapped tags
# pass through with a slugified Romanian name so no source tag is lost.
# --------------------------------------------------------------------------

PBINFO_TAG_MAP: dict[str, tuple[str, str]] = {
    "Elemente de baza ale limbajului": ("Language basics", "language-basics"),
    "Operatori și expresii": ("Operators and expressions", "operators-expressions"),
    "Structuri repetitive": ("Loops", "loops"),
    "Structuri decizionale": ("Conditionals", "conditionals"),
    "Tablouri unidimensionale (vectori)": ("One-dimensional arrays", "arrays-1d"),
    "Tablouri bidimensionale (matrice)": ("Two-dimensional arrays", "arrays-2d"),
    "Parcurgerea vectorilor": ("Array traversal", "array-traversal"),
    "Parcurgerea matricelor oarecare": ("Matrix traversal", "matrix-traversal"),
    "Vectori caracteristici / de frecventa": (
        "Frequency arrays",
        "frequency-arrays",
    ),
    "Șiruri de caractere": ("Strings", "strings"),
    "Funcții predefinite cu șiruri de caractere": (
        "String built-ins",
        "string-builtins",
    ),
    "Cifrele unui număr": ("Digits of a number", "digits"),
    "Divizibilitate": ("Divisibility", "divisibility"),
    "Subprograme": ("Subprograms (functions)", "subprograms"),
    "Recursivitate": ("Recursion", "recursion"),
    "Algoritmi elementari": ("Elementary algorithms", "elementary-algorithms"),
    "Probleme cu secvențe": ("Sequences", "sequences"),
    "Structuri de date liniare": ("Linear data structures", "linear-data-structures"),
    "Structuri de date": ("Data structures", "data-structures"),
    "Structuri de date arborescente": ("Tree data structures", "tree-data-structures"),
    "Coada": ("Queue", "queue"),
    "Stiva": ("Stack", "stack"),
    "Sortarea vectorilor": ("Sorting arrays", "sorting"),
    "Căutare binară": ("Binary search", "binary-search"),
    "Programare dinamică": ("Dynamic programming", "dynamic-programming"),
    "Probleme diverse de programare dinamică": (
        "Dynamic programming (misc)",
        "dynamic-programming-misc",
    ),
    "Teoria Grafurilor": ("Graph theory", "graph-theory"),
    "Parcurgerea grafurilor neorientate": (
        "Undirected graph traversal",
        "graph-traversal-undirected",
    ),
    "Probleme diverse cu grafuri orientate": (
        "Directed graphs (misc)",
        "graphs-directed-misc",
    ),
    "Grafuri cu costuri": ("Weighted graphs", "weighted-graphs"),
    "Arbori cu rădăcină": ("Rooted trees", "rooted-trees"),
    "Metoda Greedy": ("Greedy", "greedy"),
    "Probleme diverse cu metoda Greedy": ("Greedy (misc)", "greedy-misc"),
    "Backtracking": ("Backtracking", "backtracking"),
    "Combinatorică": ("Combinatorics", "combinatorics"),
    "Geometrie": ("Geometry", "geometry"),
    "Folclorul informatic": ("Programming folklore", "folklore"),
}

#: Grade tags: "Clasa a 9-a" -> grade-9 …
_GRADE_RE = re.compile(r"Clasa a (\d+)-a", re.IGNORECASE)

#: Tags that carry no topical signal; dropped instead of mapped.
_DROPPED_TAGS = {"Probleme diverse", "Diverse"}

#: Competition markers that turn a tag into the problem's source name.
COMPETITION_RE = re.compile(
    r"(ONI|OJI|OSI|Admitere|Bacalaureat|ONISI|Campion|infoarena|campion|"
    r"Harbour|Olimpiada|concurs|Concurs|exam|Exam)",
)

#: Difficulty proxy value -> platform difficulty.
DIFFICULTY_MAP = {
    "ușoară": Problem.DifficultyLevel.EASY,
    "usoara": Problem.DifficultyLevel.EASY,
    "easy": Problem.DifficultyLevel.EASY,
    "medie": Problem.DifficultyLevel.MEDIUM,
    "medium": Problem.DifficultyLevel.MEDIUM,
    "grea": Problem.DifficultyLevel.HARD,
    "hard": Problem.DifficultyLevel.HARD,
    "concurs": Problem.DifficultyLevel.HARD,
}

_IO_RE = re.compile(r"([\w.-]+\.in)\s*/\s*([\w.-]+\.out)", re.IGNORECASE)

# infoarena page header fields (the archived text starts with site chrome).
_IA_FILE_RE = re.compile(
    r"Fi[sş]ierul intrare/ie[sş]ire:\s*([\w.-]+)\s*,\s*([\w.-]+)"
)
_IA_SOURCE_RE = re.compile(r"Surs[aă]\s+(.{2,80}?)\s{2,}")
_IA_AUTHOR_RE = re.compile(r"Autor\s+(.{2,60}?)\s{2,}")
_IA_TIME_RE = re.compile(r"Timp execu[ţt]ie pe test\s+([\d.]+)\s*sec")
_IA_MEM_RE = re.compile(r"Limit[aă] de memorie\s+(\d+)\s*kbytes")
_IA_BODY_SPLIT = "Vezi solutiile trimise"


_TRANSLIT = str.maketrans(
    "ăâîșşțţĂÂÎȘŞȚŢ", "aiissttaiisstt"
)


def slugify(text: str) -> str:
    """ASCII-ish slug for tag names (Django SlugField-compatible)."""
    s = text.strip().lower().translate(_TRANSLIT)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:100] or "tag"


def is_own_content(attribution: str | None) -> bool:
    """Rule (a): rows posted by the owner carry full rights."""
    return OWNERSHIP_MARKER in (attribution or "").lower()


def map_difficulty(proxy: dict[str, Any] | None) -> str:
    """Map a catalog difficulty proxy onto the platform ladder."""
    if not proxy:
        return Problem.DifficultyLevel.MEDIUM
    value = str(proxy.get("value", "")).strip().lower()
    return DIFFICULTY_MAP.get(value, Problem.DifficultyLevel.MEDIUM)


def extract_source_name(canonical: dict[str, Any]) -> str:
    """Best human-readable origin: competition tag, else the site name."""
    for tag in canonical.get("tags") or []:
        if COMPETITION_RE.search(tag):
            return tag
    metadata_source = {
        "pbinfo": "pbinfo.ro",
        "infoarena": "infoarena.ro",
        "dmoj": "dmoj.ca",
        "codeforces": "codeforces.com",
        "atcoder": "atcoder.jp",
        "codechef": "codechef.com",
        "leetcode": "leetcode.com",
        "codewars": "codewars.com",
    }.get(canonical.get("source", ""), canonical.get("source", ""))
    return metadata_source


def map_tags(canonical: dict[str, Any]) -> list[dict[str, str]]:
    """Map source tags onto ``{"en", "ro", "slug"}`` tag descriptors.

    Grade tags become ``grade-9`` style; competition markers are consumed
    by :func:`extract_source_name` and dropped here; filler tags are
    dropped. Output is de-duplicated, order-preserving, capped at 4.
    """
    out: list[dict[str, str]] = []
    seen: set[str] = set()

    def push(en: str, ro: str, slug: str) -> None:
        if slug not in seen and len(out) < 4:
            seen.add(slug)
            out.append({"en": en, "ro": ro, "slug": slug})

    for tag in canonical.get("tags") or []:
        tag = tag.strip()
        if not tag or tag in _DROPPED_TAGS:
            continue
        grade = _GRADE_RE.search(tag)
        if grade:
            n = grade.group(1)
            push(f"Grade {n}", tag, f"grade-{n}")
            continue
        if COMPETITION_RE.search(tag):
            continue  # origin, not topic
        mapped = PBINFO_TAG_MAP.get(tag)
        if mapped:
            push(mapped[0], tag, mapped[1])
        else:
            push(tag, tag, slugify(tag))
    return out


def parse_limits(entry: dict[str, Any]) -> tuple[int, int]:
    """Extract (time_ms, memory_kb) from an archived entry.

    Sources: pbinfo ``metadata`` dict, infoarena header text inside the
    statement, dmoj/raw seconds fields. Defaults keep the platform norms.
    """
    time_ms: int | None = None
    memory_kb: int | None = None

    meta = entry.get("metadata") or {}
    if isinstance(meta, dict):
        for key, value in meta.items():
            key_l = str(key).lower()
            m = re.search(r"([\d.]+)\s*(sekunde|secunde|sec|s)\b", str(value), re.I)
            if "timp" in key_l or "time" in key_l:
                if m:
                    time_ms = int(float(m.group(1)) * 1000)
            m = re.search(r"(\d+)\s*(mb)", str(value), re.I)
            if "memorie" in key_l or "memory" in key_l:
                if m:
                    memory_kb = int(m.group(1)) * 1024

    if time_ms is None or memory_kb is None:
        text = entry.get("statementText") or ""
        if time_ms is None:
            m = _IA_TIME_RE.search(text)
            if m:
                time_ms = int(float(m.group(1)) * 1000)
        if memory_kb is None:
            m = _IA_MEM_RE.search(text)
            if m:
                memory_kb = int(m.group(1))

    return (
        time_ms if time_ms and time_ms > 0 else 1000,
        memory_kb if memory_kb and memory_kb > 0 else 262144,
    )


def detect_io_mode(entry: dict[str, Any]) -> tuple[str, str, str]:
    """Return (io_mode, input_filename, output_filename).

    FILES mode is set only where the source problem itself used file I/O
    (pbinfo metadata / infoarena header); everything else stays STDIO.
    """
    meta = entry.get("metadata") or {}
    for value in list(meta.values()) + [entry.get("statementText") or ""]:
        if not value:
            continue
        m = _IO_RE.search(str(value))
        if m:
            return (
                Problem.IOMode.FILES,
                m.group(1),
                m.group(2),
            )
        m = _IA_FILE_RE.search(str(value))
        if m:
            return (Problem.IOMode.FILES, m.group(1), m.group(2))
    return (Problem.IOMode.STDIO, "input.txt", "output.txt")


def clean_statement(source: str, entry: dict[str, Any]) -> str:
    """Pick the cleanest statement body for the source."""
    if source == "dmoj":
        return (entry.get("statementMarkdown") or entry.get("statementText") or "").strip()
    text = entry.get("statementText") or ""
    if source == "infoarena" and _IA_BODY_SPLIT in text:
        text = text.split(_IA_BODY_SPLIT, 1)[1]
        text = re.sub(r"^\s*\|\s*Statistici\s*", "", text)
    return text.strip()


def parse_authors(entry: dict[str, Any]) -> list[str]:
    """Author names recorded on the archived page, when known."""
    authors: list[str] = []
    attribution = entry.get("attribution") or ""
    m = re.search(r"author:\s*(.+)", attribution)
    if m:
        authors.append(m.group(1).strip())
    text = entry.get("statementText") or ""
    m = _IA_AUTHOR_RE.search(text)
    if m and m.group(1).strip() not in authors:
        authors.append(m.group(1).strip())
    return [a for a in authors if a and a.lower() != "author unknown at source"]


def points_for(sample_count: int) -> list[int]:
    """Split 100 points across ``sample_count`` tests (remainder to last)."""
    if sample_count <= 0:
        return []
    base = 100 // sample_count
    points = [base] * sample_count
    points[-1] += 100 - base * sample_count
    return points


def build_stub_statement_en(
    title: str, source_name: str, statement_ro: str, samples: list[dict[str, str]]
) -> str:
    """Deterministic EN scaffold used when no translation is available.

    Honest by design: it says the task was imported, lists the I/O contract
    of every sample, and states that the full English translation is
    pending — it never pretends to be a translation.
    """
    lines = [
        f"# {title}",
        "",
        f"> Imported from **{source_name}**. The original statement is in "
        "Romanian; a full English translation is pending.",
        "",
    ]
    if samples:
        lines.append("## Examples")
        for idx, sample in enumerate(samples, 1):
            lines += [
                f"**Input {idx}**",
                "```",
                str(sample.get("in", "")).strip(),
                "```",
                f"**Output {idx}**",
                "```",
                str(sample.get("out", "")).strip(),
                "```",
                "",
            ]
    if statement_ro:
        lines += ["## Original statement (Romanian)", "", statement_ro]
    return "\n".join(lines)
