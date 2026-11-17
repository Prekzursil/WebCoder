"""Compile-error explainers (wave E item 14).

Compiler diagnostics are written for compiler writers. This module maps
the small set of diagnostics that actually dominate beginner CE verdicts —
missing semicolons, undeclared names, unbalanced brackets, wrong-shift
types, Java's "cannot find symbol" — to a short human explanation in both
RO and EN. The hints are advisory annotations on the CE submission
detail, never a replacement for the raw diagnostic (which stays verbatim).
"""

from __future__ import annotations

import re

#: (pattern, hint EN, hint RO) — first match wins per pattern; the list is
#: ordered by how often each diagnostic trips beginners up.
_COMPILE_HINTS: list[tuple[re.Pattern, str, str]] = [
    (
        re.compile(r"expected\s+[;']"),
        "Every statement in this language ends with a semicolon — check the "
        "line just above the error.",
        "Fiecare instrucțiune se termină cu punct și virgulă — verifică linia "
        "de deasupra erorii.",
    ),
    (
        re.compile(r"was not declared in this scope"),
        "A name is used before it exists: check the spelling, add the "
        "missing #include, or declare the variable earlier.",
        "Un nume e folosit înainte să existe: verifică scrierea, adaugă "
        "#include-ul lipsă sau declară variabila mai sus.",
    ),
    (
        re.compile(r"expected\s+'\)'\s|expected\s+'\}'\s|expected\s+'\]'"),
        "Brackets are unbalanced — count every opening ( against its closing "
        ") on the reported line and above it.",
        "Parantezele nu sunt închise — verifică fiecare ( desprins de ) lui "
        "pe linia raportată și mai sus.",
    ),
    (
        re.compile(r"no match for 'operator>>'|no match for 'operator<<'"),
        "The >> / << operands have mismatched types — e.g. reading into a "
        "constant or shifting a string.",
        "Operanzii lui >> / << au tipuri nepotrivite — de ex. citești într-o "
        "constantă sau shiftezi un string.",
    ),
    (
        re.compile(r"cannot find symbol|symbol:\s*variable"),
        "Java: the variable or class isn't declared/imported — check the "
        "declaration and its scope.",
        "Java: variabila sau clasa nu e declarată/importată — verifică "
        "declarația și domeniul de vizibilitate.",
    ),
    (
        re.compile(r"expected an indented block|unexpected indent|IndentationError"),
        "Python is indent-sensitive: blocks after ':' must be indented by a "
        "consistent amount (4 spaces is the convention).",
        "Python ține cont de indentare: blocurile după ':' trebuie indentate "
        "consistent (convenția e 4 spații).",
    ),
    (
        re.compile(r"SyntaxError: invalid syntax"),
        "The line doesn't parse — most often a missing colon after if/for/"
        "while/def, an unclosed quote, or a stray character.",
        "Linia nu se poate interpreta — cel mai des lipsește ':' după if/for/"
        "while/def, un ghilimel neînchis sau un caracter în plus.",
    ),
    (
        re.compile(r"NameError|is not defined"),
        "A name is used before assignment — define it first or check the "
        "spelling (Python names are case-sensitive).",
        "Un nume e folosit înainte de atribuire — definește-l întâi sau "
        "verifică scrierea (numele Python țin cont de majuscule).",
    ),
    (
        re.compile(r"invalid conversion from|cannot convert"),
        "An implicit conversion isn't allowed — cast explicitly or use the right type.",
        "O conversie implicită nu e permisă — fă un cast explicit sau "
        "folosește tipul potrivit.",
    ),
    (
        re.compile(r"expected unqualified-id|expected initializer"),
        "C++ syntax slip outside a function body — usually a stray semicolon "
        "after a function signature or a missing type.",
        "Greșeală de sintaxă C++ în afara unui corp de funcție — de obicei un "
        "';' în plus după semnătura funcției sau un tip lipsă.",
    ),
]

#: Hints are advisory — cap them so a wall of diagnostics stays readable.
MAX_HINTS = 3


def explain_compile_errors(feedback: str | None) -> list[dict]:
    """Map raw compiler output to beginner-friendly bilingual hints.

    Returns up to MAX_HINTS hint dicts ({hint_en, hint_ro}); an empty list
    when nothing matches (unmatched diagnostics keep their raw text only).
    """
    if not feedback:
        return []
    hints: list[dict] = []
    for pattern, en, ro in _COMPILE_HINTS:
        if pattern.search(feedback):
            hints.append({"hint_en": en, "hint_ro": ro})
            if len(hints) >= MAX_HINTS:
                break
    return hints
