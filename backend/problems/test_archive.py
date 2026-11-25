"""Test-archive parsing (problem-page experience wave, item B1).

Turns an uploaded ``.zip`` / ``.tar`` / ``.tar.gz`` / ``.tgz`` archive of
test files into paired ``(name, input, expected, is_sample)`` rows the
author previews and bulk-creates as TestCases.

Pairing conventions (Kattis/Polygon/pbinfo-compatible):

- ``x.in`` paired with a sibling answer ``x.ans`` / ``x.out`` / ``x.a``
  (same directory, same stem) — the Kattis layout ``data/sample/*`` /
  ``data/secret/*`` marks samples by the ``sample`` path segment;
- the legacy Polygon flat layout ``tests/<n>`` + ``tests/<n>.a``;
- a bare ``x.in`` without an answer is skipped (reported, not fatal).

Guards (all settings-configurable): a per-file size cap, a total
uncompressed-size cap, a member-count cap and a compression-ratio cap
(zip-bomb defense), plus zip-slip/traversal rejection of unsafe member
names. Nothing is ever extracted to disk — members are read into memory
one at a time.
"""

from __future__ import annotations

import io
import re
import tarfile
import zipfile

from django.conf import settings
from django.core.exceptions import ValidationError

#: Answer suffixes recognized beside an ``.in`` (or extensionless) input.
ANSWER_SUFFIXES = (".ans", ".out", ".a")

DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024
DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024
DEFAULT_MAX_MEMBERS = 10_000
DEFAULT_MAX_RATIO = 500


class ArchiveMember:
    """One in-memory archive member (name, bytes)."""

    __slots__ = ("name", "data")

    def __init__(self, name: str, data: bytes):
        self.name = name
        self.data = data


def _caps() -> tuple[int, int, int, int]:
    return (
        int(getattr(settings, "TEST_ARCHIVE_MAX_FILE_BYTES", DEFAULT_MAX_FILE_BYTES)),
        int(getattr(settings, "TEST_ARCHIVE_MAX_TOTAL_BYTES", DEFAULT_MAX_TOTAL_BYTES)),
        int(getattr(settings, "TEST_ARCHIVE_MAX_MEMBERS", DEFAULT_MAX_MEMBERS)),
        int(getattr(settings, "TEST_ARCHIVE_MAX_RATIO", DEFAULT_MAX_RATIO)),
    )


def safe_member_name(name: str) -> bool:
    """Reject absolute paths, drive letters and traversal (zip-slip)."""
    if not name or name.startswith("/") or name.startswith("\\"):
        return False
    if re.match(r"^[A-Za-z]:", name):
        return False
    parts = re.split(r"[/\\]", name)
    return not any(part in ("..", "") for part in parts if part) and "\\" not in name


def _read_zip(raw: bytes) -> list[ArchiveMember]:
    """Stream a zip's members under the bomb guards."""
    max_file, max_total, max_members, max_ratio = _caps()
    package = zipfile.ZipFile(io.BytesIO(raw))
    infos = [i for i in package.infolist() if not i.is_dir()]
    if len(infos) > max_members:
        raise ValidationError(
            f"Archive has {len(infos)} members; the cap is {max_members}."
        )
    members: list[ArchiveMember] = []
    total = 0
    for info in infos:
        name = info.filename
        if not safe_member_name(name):
            raise ValidationError(f"Unsafe path in archive: {name!r}")
        size = info.file_size
        if size > max_file:
            raise ValidationError(
                f"Archive member {name!r} is {size} bytes; the per-file cap is {max_file}."
            )
        if info.compress_size and size / max(info.compress_size, 1) > max_ratio:
            raise ValidationError(
                f"Archive member {name!r} exceeds the {max_ratio}:1 compression-ratio cap (zip-bomb defense)."
            )
        total += size
        if total > max_total:
            raise ValidationError(
                f"Archive total uncompressed size exceeds the {max_total}-byte cap."
            )
        members.append(ArchiveMember(name, package.read(name)))
    return members


def _read_tar(raw: bytes) -> list[ArchiveMember]:
    """Stream a tar/tar.gz/tgz's members under the same guards."""
    max_file, max_total, max_members, _ratio = _caps()
    tf = tarfile.open(fileobj=io.BytesIO(raw), mode="r:*")
    members: list[ArchiveMember] = []
    total = 0
    count = 0
    for info in tf:
        if not info.isfile():
            continue
        count += 1
        if count > max_members:
            raise ValidationError(f"Archive has more than {max_members} file members.")
        name = info.name
        if not safe_member_name(name):
            raise ValidationError(f"Unsafe path in archive: {name!r}")
        if info.size > max_file:
            raise ValidationError(
                f"Archive member {name!r} is {info.size} bytes; the per-file cap is {max_file}."
            )
        total += info.size
        if total > max_total:
            raise ValidationError(
                f"Archive total uncompressed size exceeds the {max_total}-byte cap."
            )
        fh = tf.extractfile(info)
        if fh is None:  # pragma: no cover - isfile() members always extract
            continue
        members.append(ArchiveMember(name, fh.read()))
    return members


def read_archive(filename: str, raw: bytes) -> list[ArchiveMember]:
    """Dispatch by extension; ValidationError on anything unsupported."""
    if not raw:
        raise ValidationError("Empty archive.")
    low = (filename or "").lower()
    if low.endswith(".zip"):
        return _read_zip(raw)
    if low.endswith((".tar", ".tar.gz", ".tgz")):
        return _read_tar(raw)
    raise ValidationError("Unsupported archive type — upload .zip, .tar or .tar.gz.")


def pair_tests(members: list[ArchiveMember]) -> tuple[list[dict], list[str]]:
    """Pair inputs with answers by naming convention.

    Returns ``(pairs, skipped)`` where each pair is
    ``{"name", "input", "expected", "is_sample"}`` and ``skipped`` lists
    the input members that had no sibling answer (surfaced in the preview
    so the author can fix the archive).
    """
    by_name = {m.name: m for m in members}
    names = sorted(by_name)
    pairs: list[dict] = []
    paired_answers: set[str] = set()
    skipped: list[str] = []

    def _is_sample(name: str) -> bool:
        return any(part.lower() == "sample" for part in re.split(r"[/\\]", name))

    def _decode(data: bytes, name: str) -> str:
        return data.decode("utf-8", errors="replace")

    for name in names:
        if not name.lower().endswith(".in"):
            continue
        stem = name[:-3]
        answer = None
        for ext in ANSWER_SUFFIXES:
            candidate = stem + ext
            if candidate in by_name:
                answer = candidate
                break
        if answer is None:
            skipped.append(name)
            continue
        paired_answers.add(answer)
        pairs.append(
            {
                "name": stem,
                "input": _decode(by_name[name].data, name),
                "expected": _decode(by_name[answer].data, answer),
                "is_sample": _is_sample(name),
            }
        )
    # Legacy Polygon layout: extensionless tests/<n> + tests/<n>.a.
    seen = {pair["name"] for pair in pairs}
    for name in names:
        parts = re.split(r"[/\\]", name)
        if parts[0].lower() != "tests" or len(parts) != 2 or "." in parts[1]:
            continue
        stem = name
        if stem in seen:
            continue
        answer = None
        for ext in ANSWER_SUFFIXES:
            candidate = stem + ext
            if candidate in by_name:
                answer = candidate
                break
        if answer is None:
            continue
        paired_answers.add(answer)
        pairs.append(
            {
                "name": stem,
                "input": _decode(by_name[name].data, name),
                "expected": _decode(by_name[answer].data, answer),
                "is_sample": False,
            }
        )
    return pairs, skipped


def parse_archive(filename: str, raw: bytes) -> dict:
    """Full parse for preview: pairs + skipped inputs + unparsed files."""
    members = read_archive(filename, raw)
    pairs, skipped = pair_tests(members)
    pair_names = {p["name"] for p in pairs}
    skipped_set = set(skipped)

    def _consumed(name: str) -> bool:
        # An input member of a pair (``x.in`` with stem ``x``, or the
        # extensionless legacy Polygon name itself).
        if name in skipped_set or (name.endswith(".in") and name[:-3] in pair_names):
            return True
        if name in pair_names:
            return True
        # The paired answer member: any recognized suffix stripped lands on
        # a pair stem.
        for ext in ANSWER_SUFFIXES:
            if name.endswith(ext) and name[: -len(ext)] in pair_names:
                return True
        return False

    others = [m.name for m in members if not _consumed(m.name)]
    return {
        "pairs": pairs,
        "skipped": skipped,
        "other_files": sorted(others)[:50],
        "total_members": len(members),
    }
