import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Ten-locale UI (i18n & translation platform wave).
//
// The catalogs live as JSON under src/locales/<code>.json — one file per
// language, hand-translated (the RO/EN pair was ported verbatim from the
// old inline blocks in this module; the other eight were authored for this
// wave). The JSON files are the single source of truth for BOTH the client
// i18next resources and the server-side public dictionary
// (src/app/_lib/public-messages.ts derives from the same files), and the
// static copies under public/locales/ are what the future mobile app
// consumes — export them with `node scripts/export-locales.mjs`.
//
// The ten locales (see backend/webcoder_api/languages.py for the decision
// record): en (mandatory problem language + universal fallback), ro (home
// market), es/fr/de/pt/it (global + Romanian diaspora), ru (the historic
// competitive-programming lingua franca), pl (per-capita the strongest CP
// nation), uk (large community in the home region). No RTL locale ships
// because no RTL layout exists yet.
//
// Next.js adaptation note: this module is also evaluated server-side
// during App Router SSR/prerender, so the browser language detector is
// only attached in the browser (it reads window/document, which do not
// exist on the server). The initial language is pinned to 'en' on both
// server and client to prevent SSR/hydration mismatch; providers.tsx
// re-applies the cookie-cached choice right after hydration.

import en from './locales/en.json';
import ro from './locales/ro.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import it from './locales/it.json';
import ru from './locales/ru.json';
import pl from './locales/pl.json';
import uk from './locales/uk.json';

/** The supported UI locales — keep in sync with the backend registry. */
export const SUPPORTED_LOCALES = [
  'en',
  'ro',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ru',
  'pl',
  'uk',
] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/** Endonym shown in the language picker (languages, not flags). */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: 'English',
  ro: 'Română',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  pt: 'Português',
  it: 'Italiano',
  ru: 'Русский',
  pl: 'Polski',
  uk: 'Українська',
};

/** Map any BCP-47-ish string onto a supported locale ('en' fallback). */
export function normalizeUiLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'en';
  const lower = raw.toLowerCase();
  const exact = lower as Locale;
  if (SUPPORTED_LOCALES.includes(exact)) return exact;
  const prefix = lower.split('-')[0] as Locale;
  if (SUPPORTED_LOCALES.includes(prefix)) return prefix;
  return 'en'; // universal fallback (owner rule (d))
}

const resources = {
  en: { translation: en },
  ro: { translation: ro },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  pt: { translation: pt },
  it: { translation: it },
  ru: { translation: ru },
  pl: { translation: pl },
  uk: { translation: uk },
};

if (typeof window !== 'undefined') {
  // .use(Backend) // If you want to load translations from a backend
  i18n?.use(LanguageDetector); // Detect user language (browser only; see note above)
}

// Passes i18n down to react-i18next
i18n?.use(initReactI18next)?.init({
    resources,
    lng: 'en', // Pin initial language to English on both server and client to prevent SSR/hydration mismatch
    supportedLngs: SUPPORTED_LOCALES as unknown as string[],
    fallbackLng: 'en', // English is the universal fallback (owner rule (d))
    interpolation: {
      escapeValue: false, // React already safes from xss
    },
    detection: {
      // Order and from where user language should be detected
      order: ['querystring', 'cookie', 'localStorage', 'sessionStorage', 'navigator', 'htmlTag', 'path', 'subdomain'],
      caches: ['localStorage', 'cookie'], // Where to cache detected language
    }
  });

export default i18n;
