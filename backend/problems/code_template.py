"""Partial-code problems (HackerRank-style) — the template model.

Owner requirement (judge-fairness wave E): a problem ships a FULL source
skeleton with LOCKED regions and one or more editable completion points
(function signatures to fill); the editor renders the entire file with
locked regions visibly greyed and non-editable; on submit the SERVER
verifies locked-region integrity (byte-identical modulo a documented
whitespace policy) before judging — no bypassing by re-submitting altered
scaffolding. The pbinfo context-free function-paste is the degenerate case
(a skeleton whose only editable region is a function body); this model is
strictly more expressive because the learner sees and keeps the whole
program — includes, main, I/O scaffolding and all.

Template format
===============

``Problem.code_template`` holds the full file with sentinel lines marking
the EDITABLE regions::

    #include <cstdio>
    WC_EDIT_START
    WC_EDIT_END
    int main() { ... }

Sentinels are matched at line level: an optional comment prefix
(``//``, ``#``, ``--``, ``;``), whitespace, then the token — so the same
marker works in Python, C-family, Lua and Haskell skeletons alike.
Everything OUTSIDE the sentinel pairs is locked. Everything OUTSIDE the
sentinel pairs is locked.

Integrity policy (documented, exact)
====================================

On submit, the client sends the FULL assembled file. The server walks the
template's segments in order and requires every LOCKED segment to appear
in the submission **byte-identical modulo the whitespace policy**:

- CRLF is normalized to LF;
- trailing whitespace at the end of each line is ignored;
- a single trailing newline at EOF is optional (present or absent).

Editable content is whatever sits between consecutive locked segments.
The first differing locked line is reported to the submitter (HTTP 400 at
submit time; COMPILE_ERROR at judge time as defense in depth for clients
that skip API validation).

Slicing note (recorded per the wave's slicing rule): per-function test
targeting (running each completion point against its own harness) is a
natural follow-up on top of this model — the template already knows where
each editable region sits — but v1 judges the assembled file against the
problem's normal test suite, which covers the degenerate pbinfo-style
function-completion case exactly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Sentinel tokens (whole-line; leading whitespace allowed before them).
EDIT_START = "WC_EDIT_START"
EDIT_END = "WC_EDIT_END"

#: Sentinels may sit inside any language's line-comment syntax: the line
#: may carry a comment prefix (// C-family, # Python/Lua-adjacent,
#: -- Lua/SQL/Haskell, ; Lisp/asm) before the token.
_SENTINEL_RE = re.compile(
    rf"^\s*(?://|#|--|;)?\s*({EDIT_START}|{EDIT_END})\s*$"
)

MAX_TEMPLATE_CHARS = 100_000


@dataclass(frozen=True)
class Segment:
    """One template region: locked scaffolding or an editable hole."""

    locked: bool
    text: str


class TemplateError(ValueError):
    """Malformed template (authoring-time and submit-time share this)."""


def parse_template(template: str | None) -> list[Segment]:
    """Split a template into ordered locked/editable segments.

    Raises :class:`TemplateError` for unbalanced sentinels, an editable
    region inside another, or no editable region at all.
    """
    if not template:
        return []
    if len(template) > MAX_TEMPLATE_CHARS:
        raise TemplateError("Template too large (100KB cap).")

    segments: list[Segment] = []
    locked_buf: list[str] = []
    editable_buf: list[str] | None = None

    for line in template.splitlines(keepends=True):
        if _SENTINEL_RE.match(line):
            token = _SENTINEL_RE.match(line).group(1)  # type: ignore[union-attr]
            if token == EDIT_START:
                if editable_buf is not None:
                    raise TemplateError(f"Nested {EDIT_START} sentinel.")
                if locked_buf:
                    segments.append(Segment(True, "".join(locked_buf)))
                    locked_buf = []
                editable_buf = []
            else:  # EDIT_END
                if editable_buf is None:
                    raise TemplateError(f"{EDIT_END} without {EDIT_START}.")
                segments.append(Segment(False, "".join(editable_buf)))
                editable_buf = None
            continue
        (editable_buf if editable_buf is not None else locked_buf).append(line)

    if editable_buf is not None:
        raise TemplateError(f"Unclosed {EDIT_START} sentinel.")
    if locked_buf:
        segments.append(Segment(True, "".join(locked_buf)))

    if segments and not any(not seg.locked for seg in segments):
        raise TemplateError("Template has no editable region.")
    return segments


def _normalize(text: str) -> str:
    """The documented whitespace policy: CRLF -> LF, strip each line's
    trailing whitespace, collapse runs of trailing newlines at EOF."""
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    lines = [line.rstrip() for line in lines]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def verify_locked_integrity(
    template: str | None, submitted_code: str
) -> tuple[bool, str]:
    """Check the submission keeps every locked region intact.

    Returns ``(ok, message)`` — ``message`` names the first differing
    locked line (template coordinates, 1-based) so the submitter can find
    it, or describes the structural problem.
    """
    try:
        segments = parse_template(template)
    except TemplateError as err:
        return False, f"Broken problem template: {err}"

    return _verify_ordered(segments, _normalize(submitted_code))


def _verify_ordered(segments: list[Segment], submission: str) -> tuple[bool, str]:
    """Sequential matcher: locked segments must match at the cursor;
    editable holes consume up to the next locked segment's text."""
    pos = 0
    for index, segment in enumerate(segments):
        if segment.locked:
            if not segment.text.strip():
                continue
            expected = _normalize(segment.text)
            if not submission.startswith(expected, pos):
                # The locked text is missing at the cursor: either edited,
                # deleted, or reordered. Give the first differing line.
                line_no = 1
                for prior in segments[:index]:
                    line_no += prior.text.count("\n") + (1 if prior.text else 0)
                return False, _first_diff(segment.text, submission, line_no)
            pos += len(expected)
        else:
            # find where the next locked segment starts in the submission
            next_locked = next(
                (s for s in segments[index + 1 :] if s.locked and s.text.strip()),
                None,
            )
            if next_locked is None:
                return True, ""  # trailing editable hole: anything goes
            needle = _normalize(next_locked.text)
            found = submission.find(needle, pos)
            if found == -1:
                # Either the hole swallowed too much or the locked region
                # was edited: name the first differing locked line either
                # way (clearer than a generic "missing").
                line_no = 1
                for prior in segments[: segments.index(next_locked)]:
                    line_no += prior.text.count("\n") + (1 if prior.text else 0)
                return False, _first_diff(next_locked.text, submission, line_no)
            pos = found
    return True, ""


def _first_diff(
    locked_text: str, submitted_code: str, template_start_line: int
) -> str:
    """Human message for the first differing locked line."""
    locked_lines = [ln.rstrip() for ln in locked_text.replace("\r\n", "\n").split("\n")]
    submitted_lines = [
        ln.rstrip() for ln in submitted_code.replace("\r\n", "\n").split("\n")
    ]
    for offset, expected in enumerate(locked_lines):
        found = expected in submitted_lines
        if not found:
            shown = expected.strip() or "(blank line)"
            return (
                f"Locked region modified: line ~{template_start_line + offset} "
                f"of the template ({shown!r}) is missing or changed in your "
                f"submission. Locked regions must stay exactly as given."
            )
    return (
        "A locked region of the template does not match your submission — "
        "restore the original scaffolding."
    )
