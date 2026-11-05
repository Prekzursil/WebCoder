import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// Full-locale UI (i18n & translation platform wave — owner requirements of
// 2026-10-31: base ten + Asian + regional + the union bar of every UI
// language any major judge ships).
//
// The catalogs live as JSON under src/locales/<code>.json — one file per
// language, hand-translated. The JSON files are the single source of truth
// for BOTH the client i18next resources and the server-side public
// dictionary (src/app/_lib/public-messages.ts derives from the same files),
// and the static copies under public/locales/ are what the future mobile
// app consumes — export them with `node scripts/export-locales.mjs`.
//
// The set (see backend/webcoder_api/languages.py for the decision record
// with the verified union-bar matrix):
//   • base ten — en (mandatory problem language + universal fallback), ro
//     (home market), es/fr/de/pt/it, ru, pl, uk;
//   • Asian (owner directive) — zh-Hans, ja, ko, hi, vi, th, id + tr, ar,
//     fa per the research;
//   • regional (owner-named) — el, bg, hu.
//
// RTL: ar and fa render right-to-left (RTL_LOCALES + <html dir> sync in
// layout/providers/LanguageSwitcher; RTL layout verified by e2e).
//
// Next.js adaptation note: this module is also evaluated server-side
// during App Router SSR/prerender, so the browser language detector is
// only attached in the browser (it reads window/document, which do not
// exist on the server). The initial language is pinned to 'en' on both
// server and client to prevent SSR/hydration mismatch; providers.tsx
// re-applies the cookie-cached choice right after hydration.

import en from "./locales/en.json";
import ro from "./locales/ro.json";
import es from "./locales/es.json";
import fr from "./locales/fr.json";
import de from "./locales/de.json";
import pt from "./locales/pt.json";
import it from "./locales/it.json";
import ca from "./locales/ca.json";
import pl from "./locales/pl.json";
import hu from "./locales/hu.json";
import hr from "./locales/hr.json";
import srLatn from "./locales/sr-Latn.json";
import ru from "./locales/ru.json";
import uk from "./locales/uk.json";
import bg from "./locales/bg.json";
import el from "./locales/el.json";
import zhHans from "./locales/zh-Hans.json";
import zhHant from "./locales/zh-Hant.json";
import ja from "./locales/ja.json";
import ko from "./locales/ko.json";
import hi from "./locales/hi.json";
import vi from "./locales/vi.json";
import th from "./locales/th.json";
import id from "./locales/id.json";
import tr from "./locales/tr.json";
import kk from "./locales/kk.json";
import ar from "./locales/ar.json";
import fa from "./locales/fa.json";

/** The supported UI locales — keep in sync with the backend registry. */
export const SUPPORTED_LOCALES = [
  "en",
  "ro",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ca",
  "pl",
  "hu",
  "hr",
  "sr-Latn",
  "ru",
  "uk",
  "bg",
  "el",
  "zh-Hans",
  "zh-Hant",
  "ja",
  "ko",
  "hi",
  "vi",
  "th",
  "id",
  "tr",
  "kk",
  "ar",
  "fa",
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Endonym shown in the language picker (languages, not flags). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  ro: "Română",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  pt: "Português",
  it: "Italiano",
  ca: "Català",
  pl: "Polski",
  hu: "Magyar",
  hr: "Hrvatski",
  "sr-Latn": "Srpski (latinica)",
  ru: "Русский",
  uk: "Українська",
  bg: "Български",
  el: "Ελληνικά",
  "zh-Hans": "简体中文",
  "zh-Hant": "繁體中文",
  ja: "日本語",
  ko: "한국어",
  hi: "हिन्दी",
  vi: "Tiếng Việt",
  th: "ไทย",
  id: "Bahasa Indonesia",
  tr: "Türkçe",
  kk: "Қазақша",
  ar: "العربية",
  fa: "فارسی",
};

/** Right-to-left locales — <html dir="rtl"> + mirrored layout. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(["ar", "fa"]);

/** Text direction for a locale ('rtl' | 'ltr'). */
export function localeDirection(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

/**
 * Picker grouping — 23 endonyms in one flat <select> is unusable, so the
 * picker renders optgroups by script/region (labels are catalog keys
 * lang_group_*, translated into every locale). Group order follows display
 * order in SUPPORTED_LOCALES; every locale appears in exactly one group
 * (pinned by the parity test).
 */
export interface LocaleGroup {
  /** Catalog key for the group label. */
  labelKey: string;
  locales: Locale[];
}

export const LOCALE_GROUPS: LocaleGroup[] = [
  { labelKey: "lang_group_worldwide", locales: ["en"] },
  {
    labelKey: "lang_group_europe_latin_west",
    locales: ["ro", "es", "fr", "de", "pt", "it", "ca"],
  },
  {
    labelKey: "lang_group_europe_latin_east",
    locales: ["pl", "hu", "hr", "sr-Latn"],
  },
  { labelKey: "lang_group_cyrillic_greek", locales: ["ru", "uk", "bg", "el"] },
  { labelKey: "lang_group_east_asian", locales: ["zh-Hans", "zh-Hant", "ja", "ko"] },
  { labelKey: "lang_group_south_southeast_asian", locales: ["hi", "vi", "th", "id"] },
  { labelKey: "lang_group_turkic", locales: ["tr", "kk"] },
  { labelKey: "lang_group_right_to_left", locales: ["ar", "fa"] },
];

/**
 * Region/script variants browsers report that normalize onto a DIFFERENT
 * supported locale than their neutral prefix would (zh-TW/zh-HK/zh-MO are
 * written in Traditional script; zh-CN/zh-SG in Simplified). Extend when
 * the corresponding locale ships.
 */
const LOCALE_ALIASES: Record<string, Locale> = {
  // Traditional-script regions → the shipped Traditional catalog.
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  "zh-hant": "zh-Hant",
  // Serbian also written in Cyrillic → the Latin script we ship.
  "sr-cyrl": "sr-Latn",
  sr: "sr-Latn",
};

/**
 * Map any BCP-47-ish string onto a supported locale ('en' fallback).
 * Canonicalization is case-insensitive ('ZH-HANS' → 'zh-Hans'); a neutral
 * prefix match wins next (pt-BR → pt, fa-IR → fa); the alias table handles
 * script-region variants; a neutral zh defaults to Simplified.
 */
export function normalizeUiLocale(raw: string | null | undefined): Locale {
  if (!raw) return "en";
  const lower = raw.toLowerCase();
  const exact = SUPPORTED_LOCALES.find((code) => code.toLowerCase() === lower);
  if (exact) return exact;
  const aliased = LOCALE_ALIASES[lower];
  if (aliased) return aliased;
  const prefix = lower.split("-")[0];
  const prefixExact = SUPPORTED_LOCALES.find((code) => code.toLowerCase() === prefix);
  if (prefixExact) return prefixExact;
  if (prefix === "zh") return "zh-Hans"; // neutral Chinese → Simplified default
  return "en"; // universal fallback (owner rule (d))
}

const resources = {
  en: { translation: en },
  ro: { translation: ro },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  ca: { translation: ca },
  pl: { translation: pl },
  hu: { translation: hu },
  hr: { translation: hr },
  "sr-Latn": { translation: srLatn },
  ru: { translation: ru },
  uk: { translation: uk },
  bg: { translation: bg },
  el: { translation: el },
  "zh-Hans": { translation: zhHans },
  "zh-Hant": { translation: zhHant },
  ja: { translation: ja },
  ko: { translation: ko },
  hi: { translation: hi },
  vi: { translation: vi },
  th: { translation: th },
  id: { translation: id },
  tr: { translation: tr },
  kk: { translation: kk },
  ar: { translation: ar },
  fa: { translation: fa },
};

if (typeof window !== "undefined") {
  // .use(Backend) // If you want to load translations from a backend
  i18n?.use(LanguageDetector); // Detect user language (browser only; see note above)
}

// Passes i18n down to react-i18next
i18n?.use(initReactI18next)?.init({
  resources,
  lng: "en", // Pin initial language to English on both server and client to prevent SSR/hydration mismatch
  supportedLngs: SUPPORTED_LOCALES as unknown as string[],
  fallbackLng: "en", // English is the universal fallback (owner rule (d))
  interpolation: {
    escapeValue: false, // React already safes from xss
  },
  detection: {
    // Order and from where user language should be detected
    order: [
      "querystring",
      "cookie",
      "localStorage",
      "sessionStorage",
      "navigator",
      "htmlTag",
      "path",
      "subdomain",
    ],
    // NOTE on cookie persistence: the detector's DEFAULT cookie name is
    // 'i18next', while SSR (public-i18n getLocale) and the providers
    // post-hydration re-application read 'i18nextLng'. Do NOT pin
    // lookupCookie here — i18next caches the INIT-pinned 'en' through
    // the detector, which would clobber the visitor's incoming
    // i18nextLng cookie before providers re-apply it. The picker
    // (LanguageSwitcher) writes i18nextLng explicitly on every switch;
    // that is the one cookie everything reads.
    caches: ["localStorage", "cookie"], // Where to cache detected language
  },
});

export default i18n;
