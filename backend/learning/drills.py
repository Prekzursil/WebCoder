"""Wave E drill content + services (items 36/37/38/40).

The seeded deck and the answer-checking rules live here; the views in
``views.py`` stay thin.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date

from .models import Drill

#: Seeded drill deck: 3 per kind (read-the-code, complexity, fill-the-line),
#: each bilingual with an explanation. Code uses simple, language-obvious
#: snippets (python3) that read the same in both locales.
SEED_DRILLS = [
    {
        "kind": "READ_CODE",
        "tag": "loops",
        "payload": {
            "code": "s = 0\nfor i in range(4):\n    s += i\nprint(s)",
            "question_en": "What does this print?",
            "question_ro": "Ce afișează?",
            "options_en": ["4", "6", "10", "0"],
            "options_ro": ["4", "6", "10", "0"],
            "answer": 1,
            "explanation_en": "range(4) yields 0,1,2,3 — their sum is 6.",
            "explanation_ro": "range(4) produce 0,1,2,3 — suma lor este 6.",
        },
    },
    {
        "kind": "READ_CODE",
        "tag": "strings",
        "payload": {
            "code": 'w = "carte"\nprint(w[::-1])',
            "question_en": "What does this print?",
            "question_ro": "Ce afișează?",
            "options_en": ["etrac", "carte", "etrrac", "error"],
            "options_ro": ["etrac", "carte", "etrrac", "eroare"],
            "answer": 0,
            "explanation_en": "[::-1] is the idiomatic reverse slice.",
            "explanation_ro": "[::-1] este felionul idiomatic de inversare.",
        },
    },
    {
        "kind": "READ_CODE",
        "tag": "arrays",
        "payload": {
            "code": "a = [3, 1, 2]\nb = sorted(a)\nprint(a[0], b[0])",
            "question_en": "What does this print?",
            "question_ro": "Ce afișează?",
            "options_en": ["3 1", "1 1", "3 3", "1 3"],
            "options_ro": ["3 1", "1 1", "3 3", "1 3"],
            "answer": 0,
            "explanation_en": "sorted() returns a NEW list; a is untouched.",
            "explanation_ro": "sorted() returnează un list NOU; a rămâne neschimbat.",
        },
    },
    {
        "kind": "COMPLEXITY",
        "tag": "sorting",
        "payload": {
            "code": "a.sort()\nfor x in a:\n    print(x)",
            "question_en": "Total complexity?",
            "question_ro": "Complexitatea totală?",
            "options_en": ["O(n)", "O(n log n)", "O(n²)", "O(log n)"],
            "options_ro": ["O(n)", "O(n log n)", "O(n²)", "O(log n)"],
            "answer": 1,
            "explanation_en": "sort() is O(n log n) and dominates the O(n) loop.",
            "explanation_ro": "sort() e O(n log n) și domină bucla O(n).",
        },
    },
    {
        "kind": "COMPLEXITY",
        "tag": "binary-search",
        "payload": {
            "code": "while lo < hi:\n    mid = (lo + hi) // 2\n    if ok(mid):\n        hi = mid\n    else:\n        lo = mid + 1",
            "question_en": "How many iterations for n = 1,000,000?",
            "question_ro": "Câte iterații pentru n = 1.000.000?",
            "options_en": ["~20", "~1000", "~1,000,000", "~500,000"],
            "options_ro": ["~20", "~1000", "~1.000.000", "~500.000"],
            "answer": 0,
            "explanation_en": "Halving 10^6 takes about log2(10^6) ≈ 20 steps.",
            "explanation_ro": "Înjumătățirea lui 10^6 ia cam log2(10^6) ≈ 20 pași.",
        },
    },
    {
        "kind": "COMPLEXITY",
        "tag": "loops",
        "payload": {
            "code": "for i in range(n):\n    for j in range(i, n):\n        print(i, j)",
            "question_en": "Total complexity?",
            "question_ro": "Complexitatea totală?",
            "options_en": ["O(n)", "O(n log n)", "O(n²)", "O(1)"],
            "options_ro": ["O(n)", "O(n log n)", "O(n²)", "O(1)"],
            "answer": 2,
            "explanation_en": "The inner loop runs n + (n-1) + … + 1 = n(n+1)/2 times.",
            "explanation_ro": "Bucla interioară rulează n + (n-1) + … + 1 = n(n+1)/2 ori.",
        },
    },
    {
        "kind": "MICRO",
        "tag": "loops",
        "payload": {
            "code": "total = 0\nfor x in numbers:\n    ___\nprint(total)",
            "question_en": "Fill the line: sum the list into total.",
            "question_ro": "Completează linia: adună lista în total.",
            "accepted": ["total += x", "total = total + x"],
            "explanation_en": "The accumulator pattern: total += x inside the loop.",
            "explanation_ro": "Tiparul acumulator: total += x în interiorul buclei.",
        },
    },
    {
        "kind": "MICRO",
        "tag": "arrays",
        "payload": {
            "code": "best = a[0]\nfor x in a:\n    if ___:\n        best = x\nprint(best)",
            "question_en": "Fill the condition: keep the MAXIMUM.",
            "question_ro": "Completează condiția: păstrează MAXIMUL.",
            "accepted": ["x > best", "best < x"],
            "explanation_en": "Replace when strictly greater — the maximum survives.",
            "explanation_ro": "Înlocuiește când e strict mai mare — maximul supraviețuiește.",
        },
    },
    {
        "kind": "MICRO",
        "tag": "strings",
        "payload": {
            "code": 's = input()\nif ___:\n    print("palindrom")',
            "question_en": "Fill the condition: s equals its reverse.",
            "question_ro": "Completează condiția: s este egal cu inversul lui.",
            "accepted": ["s == s[::-1]", "s[::-1] == s"],
            "explanation_en": "Compare with the reversed slice — the palindrome test.",
            "explanation_ro": "Compară cu felionul invers — testul de palindrom.",
        },
    },
]

_WHITESPACE_RE = re.compile(r"\s+")


def normalize_answer(text: str) -> str:
    """Normalize a fill-the-line answer: collapse whitespace, strip, and
    drop the trailing statement separator — 'total += x' and
    'total+=x ;' must compare equal."""
    collapsed = _WHITESPACE_RE.sub(" ", text or "").strip()
    return collapsed.rstrip(";").strip()


def check_answer(drill: Drill, answer) -> tuple[bool, str | None]:
    """Check a submitted answer against the drill payload.

    Choice drills (READ_CODE/COMPLEXITY) take an option index; MICRO takes
    the typed line. Returns (correct, error) — the error is a stable code
    the frontend maps to a message.
    """
    payload = drill.payload or {}
    if drill.kind in (Drill.Kind.READ_CODE, Drill.Kind.COMPLEXITY):
        try:
            index = int(answer)
        except (TypeError, ValueError):
            return False, "bad_index"
        options = payload.get("options_en") or []
        if index < 0 or index >= len(options):
            return False, "bad_index"
        return index == payload.get("answer"), None
    if drill.kind == Drill.Kind.MICRO:
        accepted = payload.get("accepted") or []
        normalized = normalize_answer(str(answer))
        if not normalized:
            return False, "empty"
        return normalized in [normalize_answer(a) for a in accepted], None
    return False, "bad_kind"


def daily_drills(day: date | None = None) -> list[Drill]:
    """Item 40: the deterministic daily warmup — one drill per kind,
    chosen by a date-seeded hash (stable for everyone on the same day,
    different tomorrow; no new state to store)."""
    day = day or date.today()
    key = day.isoformat()
    picks: list[Drill] = []
    for kind, _label in Drill.Kind.choices:
        pool = list(Drill.objects.filter(kind=kind))
        if not pool:
            continue
        digest = hashlib.sha256(f"{key}:{kind}".encode()).hexdigest()
        picks.append(pool[int(digest, 16) % len(pool)])
    return picks
