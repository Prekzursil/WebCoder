"""UI/statement language registry (i18n & translation platform wave).

Single source of truth for the languages the PLATFORM understands: the ten
UI locales and the languages a problem statement may carry. Both the
problems app (authoring validation + display) and the translations app
(community proposals) import from here so the two can never drift.

The ten languages (owner requirement: English + Romanian mandatory, then
the most-used global languages, + one more by usage judgement; no RTL
language because the platform ships no RTL layout yet):

1. en — English: mandatory problem-authoring language + universal fallback.
2. ro — Romanian: home market (Romania + Moldova).
3. es — Spanish: ~500M speakers, the largest non-English Western language;
   also the #1 language of the Romanian diaspora (Spain).
4. fr — French: global + diaspora (France is the largest Romanian
   diaspora destination).
5. de — German: diaspora (Germany/Austria) + Europe's largest economy.
6. pt — Portuguese: Brazil's enormous competitive-programming community
   (Codeforces' largest Lusophone user base) + diaspora (Portugal).
7. it — Italian: diaspora + strong olympiad tradition (Italy).
8. ru — Russian: the historical lingua franca of competitive programming
   (Codeforces, e-olymp); also spoken in the Moldova region.
9. pl — Polish: per-capita the strongest competitive-programming nation
   (IOI/ICPC medal tables); Latin script so no new layout risk.
10. uk — Ukrainian: large community in Romania/Poland since 2022 (home
    market relevance); shares Cyrillic-script layout work with ru.

No RTL language (Arabic/Hebrew) ships because RTL layout support is not
built; adding one later requires the RTL layout work first.
"""

from django.utils.translation import gettext_lazy as _

#: The ten UI locales, in display order. ``en`` first (fallback), then the
#: home market, then the global set — the language picker renders this list.
SUPPORTED_LANGUAGES = ["en", "ro", "es", "fr", "de", "pt", "it", "ru", "pl", "uk"]

SUPPORTED_LANGUAGES_SET = frozenset(SUPPORTED_LANGUAGES)

#: Endonym + English name per language, used by pickers and curation UI.
LANGUAGE_NAMES = {
    "en": {"endonym": "English", "english": "English"},
    "ro": {"endonym": "Română", "english": "Romanian"},
    "es": {"endonym": "Español", "english": "Spanish"},
    "fr": {"endonym": "Français", "english": "French"},
    "de": {"endonym": "Deutsch", "english": "German"},
    "pt": {"endonym": "Português", "english": "Portuguese"},
    "it": {"endonym": "Italiano", "english": "Italian"},
    "ru": {"endonym": "Русский", "english": "Russian"},
    "pl": {"endonym": "Polski", "english": "Polish"},
    "uk": {"endonym": "Українська", "english": "Ukrainian"},
}

#: Languages community members may translate problems INTO. English is the
#: mandatory authoring source (owners' rule (b)) — corrections to the
#: English original go through the normal problem-edit/verification flow,
#: not the translation pipeline.
TRANSLATABLE_LANGUAGES = [code for code in SUPPORTED_LANGUAGES if code != "en"]

#: Locale code -> human label for API surfaces (verbose, lazily translated
#: where DRF renders it into a response).
LANGUAGE_CHOICES = [(code, _(LANGUAGE_NAMES[code]["english"])) for code in SUPPORTED_LANGUAGES]

#: The universal fallback locale (owner requirement (d)).
FALLBACK_LANGUAGE = "en"
