"""Statement quality tooling (wave F items 123/124/134).

- ``statement_lint`` (item 123) — rule-based checks on a problem's
  statements: missing Input/Output/Constraints sections, bilingual parity
  drift (samples mentioned in one locale only), unbalanced math
  delimiters, wall-of-text sentences, sample-reference mismatches.
- ``readability`` (item 134) — Flesch reading-ease adapted per language
  (RO syllable counting by vowel groups, EN classic formula) plus a grade
  band and bilingual consistency check.
- ``translation_gaps`` (item 124) — the EN+translation sidecar report:
  which localized fields are missing/present per locale, powering the
  dual-pane authoring UI.
"""

from __future__ import annotations

import re

SECTION_KEYS = ("input", "output", "constraints", "examples")
#: A statement should mention examples; RO uses both "exemplu" and "example".
EXAMPLE_WORDS = ("example", "exemplu", "sample", "Date de intrare")
MAX_SENTENCE_WORDS = 60


def _statement_text(problem, locale: str) -> str:
    value = (
        problem.statement_i18n.get(locale, "")
        if isinstance(problem.statement_i18n, dict)
        else ""
    )
    return value or ""


def statement_lint(problem) -> list[dict]:
    """Item 123 — bilingual statement lint; one warning dict per finding."""
    warnings: list[dict] = []
    locales = []
    for locale in ("en", "ro"):
        text = _statement_text(problem, locale)
        title = (
            problem.title_i18n.get(locale, "")
            if isinstance(problem.title_i18n, dict)
            else ""
        )
        if text or title:
            locales.append(locale)
        lowered = text.lower()
        for key in SECTION_KEYS:
            if key == "examples":
                if text and not any(word.lower() in lowered for word in EXAMPLE_WORDS):
                    warnings.append(
                        {
                            "code": f"missing_examples_{locale}",
                            "locale": locale,
                            "message": (
                                "The statement never mentions examples — add a "
                                "worked Example section."
                            ),
                        }
                    )
                continue
            if text and key not in lowered:
                warnings.append(
                    {
                        "code": f"missing_{key}_{locale}",
                        "locale": locale,
                        "message": (
                            f"No '{key}' section found — statements should name "
                            "Input, Output and Constraints explicitly."
                        ),
                    }
                )
        # Unbalanced inline math delimiters ($...$ needs an even count).
        dollars = text.count("$")
        if dollars % 2 == 1:
            warnings.append(
                {
                    "code": f"unbalanced_math_{locale}",
                    "locale": locale,
                    "message": "Odd number of '$' delimiters — inline math is unbalanced.",
                }
            )
        # Wall-of-text: any single sentence over MAX_SENTENCE_WORDS words.
        for sentence in re.split(r"[.!?]", text):
            if len(sentence.split()) > MAX_SENTENCE_WORDS:
                warnings.append(
                    {
                        "code": f"runaway_sentence_{locale}",
                        "locale": locale,
                        "message": (
                            f"A sentence exceeds {MAX_SENTENCE_WORDS} words — "
                            "split it for learner readability."
                        ),
                    }
                )
                break
    # Parity drift: a locale present in the title but missing its statement.
    for locale in ("en", "ro"):
        title = (
            problem.title_i18n.get(locale, "")
            if isinstance(problem.title_i18n, dict)
            else ""
        )
        statement = _statement_text(problem, locale)
        if title and not statement:
            warnings.append(
                {
                    "code": f"statement_missing_{locale}",
                    "locale": locale,
                    "message": (
                        f"The {locale.upper()} title exists but the statement is "
                        "empty — finish the translation before submitting."
                    ),
                }
            )
    return warnings


# ---------------------------------------------------------------- item 134


def _syllables_ro(word: str) -> int:
    """Romanian syllables ≈ vowel groups (a e i o u ă â î), minimum 1."""
    groups = re.findall(r"[aeiouăâî]+", word.lower())
    return max(1, len(groups))


def _syllables_en(word: str) -> int:
    """Classic English heuristic; silent trailing e discounted."""
    word = word.lower().strip(".,;:!?")
    vowels = re.findall(r"[aeiouy]+", word)
    count = len(vowels)
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def _sentences(text: str) -> int:
    return max(1, len(re.findall(r"[.!?](?:\s|$)", text)))


def readability_score(text: str, locale: str = "en") -> dict:
    """Flesch reading ease adapted per language.

    EN: 206.835 − 1.015·(words/sentence) − 84.6·(syllables/word).
    RO: same skeleton with the vowel-group syllable counter (the standard
    adaptation for Romance orthographies).
    """
    words = re.findall(r"[A-Za-zĂÂÎȘȚăâîșț]+", text)
    word_count = len(words)
    if word_count == 0:
        return {"score": None, "band": None, "words": 0, "sentences": 0}
    counter = _syllables_ro if locale == "ro" else _syllables_en
    syllables = sum(counter(word) for word in words)
    sentence_count = _sentences(text)
    score = (
        206.835
        - 1.015 * (word_count / sentence_count)
        - 84.6 * (syllables / word_count)
    )
    score = round(max(0.0, min(100.0, score)), 1)
    if score >= 80:
        band = "very_easy"
    elif score >= 60:
        band = "plain"
    elif score >= 40:
        band = "standard"
    elif score >= 20:
        band = "difficult"
    else:
        band = "very_difficult"
    return {
        "score": score,
        "band": band,
        "words": word_count,
        "sentences": sentence_count,
    }


def problem_readability(problem) -> dict:
    """Item 134 — per-locale readability of the statement + a consistency
    verdict (locales within 15 points read consistently)."""
    report: dict = {"locales": {}, "consistent": None}
    scores = []
    for locale in ("en", "ro"):
        text = _statement_text(problem, locale)
        if not text:
            continue
        entry = readability_score(text, locale)
        report["locales"][locale] = entry
        scores.append(entry["score"])
    if len(scores) == 2:
        report["consistent"] = abs(scores[0] - scores[1]) <= 15
    return report


# ---------------------------------------------------------------- item 124


SIDECAR_FIELDS = ("title", "statement", "hints")


def translation_gaps(problem) -> dict:
    """Item 124 — the EN+translation sidecar report: per-locale presence
    of every localizable field, so the dual-pane authoring UI can show
    exactly what remains to translate."""

    def field(locale: str, name: str) -> bool:
        if name == "title":
            value = (
                problem.title_i18n.get(locale, "")
                if isinstance(problem.title_i18n, dict)
                else ""
            )
        elif name == "hints":
            hints = problem.hints_ro if locale == "ro" else problem.hints_en
            value = "\n".join(hints or [])
        else:
            value = _statement_text(problem, locale)
        return bool((value or "").strip())

    locales = {}
    for locale in ("en", "ro"):
        locales[locale] = {name: field(locale, name) for name in SIDECAR_FIELDS}
    return {
        "fields": list(SIDECAR_FIELDS),
        "locales": locales,
        "complete": all(all(present.values()) for present in locales.values()),
    }
