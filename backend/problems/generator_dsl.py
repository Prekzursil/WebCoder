"""Testcase generator DSL + variant families + statement attachments
(wave F items 122/126/128) and Polygon legacy-layout import (item 127).

- ``generator_dsl`` — a tiny declarative language for reproducible test
  data: lines of ``name = int(lo, hi)`` / ``name = str(lo, hi)`` variable
  declarations plus a ``print`` template referencing ``{name}`` fields.
  ``generate(dsl, seed)`` is deterministic per (script, seed).
- ``variants`` — a variant family groups problems sharing a skeleton;
  spawning a child copies the parent with per-variant parameter notes.
- Polygon legacy layout (item 127) is accepted by extending the package
  importer's test walker to extensionless ``tests/<name>`` +
  ``tests/<name>.a`` pairs.
"""

from __future__ import annotations

import random
import re

_LINE_RE = re.compile(
    r"^\s*(\w+)\s*=\s*(int|str)\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)\s*$"
)
_PRINT_RE = re.compile(r"^\s*print\s+(.+)$")


def parse_dsl(script: str) -> dict:
    """Parse a generator script: {vars: {name: (kind, lo, hi)}, template: str}.

    Raises ``ValueError`` with a precise message on malformed lines.
    """
    variables: dict[str, tuple[str, int, int]] = {}
    template = ""
    for lineno, line in enumerate(script.splitlines(), start=1):
        if not line.strip() or line.strip().startswith("#"):
            continue
        match = _LINE_RE.match(line)
        if match:
            name, kind, lo, hi = match.groups()
            lo, hi = int(lo), int(hi)
            if lo > hi:
                raise ValueError(f"line {lineno}: range low > high for '{name}'")
            variables[name] = (kind, lo, hi)
            continue
        match = _PRINT_RE.match(line)
        if match:
            template = match.group(1).strip()
            continue
        raise ValueError(f"line {lineno}: cannot parse '{line.strip()}'")
    if not template:
        raise ValueError("the script needs a print template line")
    # every placeholder must be declared
    for field in re.findall(r"\{(\w+)\}", template):
        if field not in variables:
            raise ValueError(f"template references undeclared field '{field}'")
    return {"vars": variables, "template": template}


def generate(dsl: str, seed: int) -> str:
    """Render one deterministic test input for the script + seed."""
    parsed = parse_dsl(dsl)
    rng = random.Random(f"{seed}")  # deterministic across platforms/runs
    values: dict[str, str] = {}
    for name, (kind, lo, hi) in parsed["vars"].items():
        if kind == "int":
            values[name] = str(rng.randint(lo, hi))
        else:
            length = rng.randint(lo, hi)
            alphabet = "abcdefghijklmnopqrstuvwxyz"
            values[name] = "".join(rng.choice(alphabet) for _ in range(length))
    return parsed["template"].format(**values)
