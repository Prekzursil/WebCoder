"""COM-5 content filter: RO+EN profanity + grooming-pattern heuristics.

Policy is FLAG-NOT-BLOCK with admin review: a hit never rejects the
message — it is delivered with ``is_flagged`` + ``flag_categories`` set
and surfaces in the moderator queue (``/messages/moderation/flagged/``)
where a human decides. This is deliberately the opposite of a silent
block list: heuristics on short bilingual texts produce false positives,
and the cost of a missed reviewable flag is far lower than the cost of a
wrongly-censored private conversation.

Matching runs on a normalized form (lowercased, diacritics folded —
``ă``→``a`` etc. — whitespace collapsed) so Romanian typography and
shouting cannot evade it. Profanity matches use word boundaries to avoid
the Scunthorpe problem (``class`` must not hit ``ass``).
"""

import re
import unicodedata

#: English profanity stems (word-boundary matched on normalized text).
_PROFANITY_EN = (
    "fuck",
    "shit",
    "bitch",
    "asshole",
    "bastard",
    "cunt",
    "dickhead",
    "motherfucker",
)

#: Romanian profanity stems, stored diacritic-free (normalization folds
#: the real spellings onto these).
_PROFANITY_RO = (
    "pula",
    "pizda",
    "muie",
    "fute",
    "coaie",
    "cacat",
    "bulangiu",
)

#: Grooming-pattern heuristics (RO+EN), matched on normalized text:
#: age probing, secrecy demands around adults, nude solicitation and
#: offline-meet extraction. High-precision phrasings only — each hit
#: queues a human review, it never acts alone.
_GROOMING_PATTERNS = tuple(
    re.compile(pattern)
    for pattern in (
        r"\b(how old are you|cati ani ai|ce varsta (ai|aveti))\b",
        r"\b(don'?t tell|nu (spune|zice|zi))\b"
        r".{0,40}\b(anyone|nimeni|your (mom|dad|parents|teacher)"
        r"|parinti(lor)?|mama|tata|profesorul?|doamna|domnul)\b",
        r"\b(send|trimite|da[- ]?mi)\b.{0,25}\b(nudes?|nud)\b",
        r"\b(ne|intalnim|intalnire|intalnesc|meet)\b"
        r".{0,30}\b(offline|in person|in real|fata in fata|singuri|secret)\b",
    )
)


def normalize_text(text: str) -> str:
    """Lowercase, fold diacritics and collapse whitespace.

    >>> normalize_text("Câți  ANI  ai?")
    'cati ani ai?'
    """
    folded = (
        unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    )
    return re.sub(r"\s+", " ", folded).strip().lower()


_PROFANITY_EN_RE = re.compile(
    r"\b(?:%s)\b" % "|".join(re.escape(word) for word in _PROFANITY_EN)
)
_PROFANITY_RO_RE = re.compile(
    r"\b(?:%s)\b" % "|".join(re.escape(word) for word in _PROFANITY_RO)
)


def scan_message(body: str) -> list:
    """Return the list of filter categories a message body hits.

    One of ``profanity_en`` / ``profanity_ro`` / ``grooming`` per
    category; empty list = clean. Never raises — an unparsable body is
    simply treated as clean text by the regex pass.
    """
    normalized = normalize_text(body or "")
    categories = []
    if _PROFANITY_EN_RE.search(normalized):
        categories.append("profanity_en")
    if _PROFANITY_RO_RE.search(normalized):
        categories.append("profanity_ro")
    if any(pattern.search(normalized) for pattern in _GROOMING_PATTERNS):
        categories.append("grooming")
    return categories
