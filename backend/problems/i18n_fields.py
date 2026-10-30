"""Localized-field helpers for problems (i18n & translation platform wave).

Owner rule (b): problems are authored in ONE language — English is
mandatory (``title_i18n["en"]`` and ``statement_i18n["en"]`` must be
non-empty); other languages are optional, one or many. Rule (d): English
is the universal fallback, so every problem must always expose an English
title + statement — the helpers here normalize legacy rows into that
invariant and validate new writes against it.
"""

import re

from webcoder_api.languages import FALLBACK_LANGUAGE

#: A language key is a short lowercase BCP-47-ish code ("en", "pt-BR" is
#: not used by the platform but stays structurally valid so legacy rows
#: with extra locales never hard-fail an edit).
_LANGUAGE_KEY_RE = re.compile(r"^[a-z]{2,8}$")


class LocalizedFieldError(ValueError):
    """Raised when a localized dict fails the English-mandatory rules."""


def normalize_localized_dict(value, *, field_name):
    """Validate + normalize a localized dict for storage.

    Rules:
    - must be a JSON object (dict);
    - every key must look like a language code (2–8 lowercase letters);
    - values must be non-empty strings after stripping — blank values are
      dropped (an empty string is "no translation", and lying about
      availability is worse than absence);
    - ``en`` must survive with a non-empty value (owner rule (b)).

    Returns the normalized dict. Raises :class:`LocalizedFieldError` with a
    caller-renderable message otherwise (serializers convert it into a
    field-level DRF ``ValidationError``).
    """
    if not isinstance(value, dict):
        raise LocalizedFieldError(f"{field_name} must be a JSON object mapping language codes to text.")

    normalized = {}
    for key, text in value.items():
        if not _LANGUAGE_KEY_RE.match(str(key)):
            raise LocalizedFieldError(
                f"{field_name}: '{key}' is not a valid language code (expected 2–8 lowercase letters, e.g. 'en', 'ro')."
            )
        if not isinstance(text, str) or not text.strip():
            # Blank entries are dropped, not stored — availability must be honest.
            continue
        normalized[str(key)] = text

    en_value = normalized.get(FALLBACK_LANGUAGE, "").strip() if isinstance(normalized.get(FALLBACK_LANGUAGE), str) else ""
    if not en_value:
        raise LocalizedFieldError(
            f"{field_name}: an English ('en') version is mandatory — every problem must be authored in English; other languages are optional."
        )
    return normalized


def ensure_english(value, *, field_name):
    """Best-effort legacy repair for rows written before EN was mandatory.

    ``en`` missing/blank -> copy the Romanian value if present, else the
    first non-empty entry. Returns the repaired dict (always contains a
    usable ``en``), or the input unchanged when it already satisfies the
    invariant or has nothing to copy from (an entirely empty dict is left
    alone — the data migration logs those instead of inventing content).
    """
    if not isinstance(value, dict) or not value:
        return value

    en_text = value.get(FALLBACK_LANGUAGE)
    if isinstance(en_text, str) and en_text.strip():
        return value

    repaired = dict(value)
    source = value.get("ro")
    if not (isinstance(source, str) and source.strip()):
        for key in sorted(value):
            candidate = value[key]
            if isinstance(candidate, str) and candidate.strip():
                source = candidate
                break
    if isinstance(source, str) and source.strip():
        repaired[FALLBACK_LANGUAGE] = source
        return repaired
    return value


def available_languages(problem):
    """Language codes the problem actually carries (title or statement).

    Sorted for stable API output; used for per-language availability
    badges and the mobile display contract ("show the user's language if a
    translation exists, else English").
    """
    languages = set()
    for value in (problem.title_i18n, problem.statement_i18n):
        if isinstance(value, dict):
            for key, text in value.items():
                if isinstance(text, str) and text.strip():
                    languages.add(str(key))
    return sorted(languages)
