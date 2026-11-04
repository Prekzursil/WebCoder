// Locale registry for the mobile app — a direct port of the web app's
// src/i18n.ts registry (owner rule: the platform ships 28 UI locales and
// the app uses the SAME catalogs, every shipped language selectable).
// The catalogs under src/i18n/locales/ are verbatim copies of the web
// app's src/locales/*.json (scripts/copy-locales.mjs + parity test).
import ar from './locales/ar.json';
import bg from './locales/bg.json';
import ca from './locales/ca.json';
import de from './locales/de.json';
import el from './locales/el.json';
import en from './locales/en.json';
import es from './locales/es.json';
import fa from './locales/fa.json';
import fr from './locales/fr.json';
import hi from './locales/hi.json';
import hr from './locales/hr.json';
import hu from './locales/hu.json';
import id from './locales/id.json';
import it from './locales/it.json';
import ja from './locales/ja.json';
import kk from './locales/kk.json';
import ko from './locales/ko.json';
import pl from './locales/pl.json';
import pt from './locales/pt.json';
import ro from './locales/ro.json';
import ru from './locales/ru.json';
import srLatn from './locales/sr-Latn.json';
import th from './locales/th.json';
import tr from './locales/tr.json';
import uk from './locales/uk.json';
import vi from './locales/vi.json';
import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';

/**
 * A message catalog: flat string keys plus nested namespaces (the web
 * catalogs carry `admin_dashboard` / `errors` sub-objects) addressed with
 * dot-paths, e.g. t('admin_dashboard.update_role_success').
 */
export type CatalogValue = string | Record<string, unknown>;
export type Catalog = Record<string, CatalogValue>;

/** Follow dot-paths through nested namespaces; undefined when absent. */
function lookup(catalog: Catalog, key: string): string | undefined {
  const parts = key.split('.');
  let node: CatalogValue | undefined = catalog;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Catalog)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** The supported UI locales — keep in sync with the web registry (28). */
export const SUPPORTED_LOCALES = [
  'en',
  'ro',
  'es',
  'fr',
  'de',
  'pt',
  'it',
  'ca',
  'pl',
  'hu',
  'hr',
  'sr-Latn',
  'ru',
  'uk',
  'bg',
  'el',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'ko',
  'hi',
  'vi',
  'th',
  'id',
  'tr',
  'kk',
  'ar',
  'fa',
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
  ca: 'Català',
  pl: 'Polski',
  hu: 'Magyar',
  hr: 'Hrvatski',
  'sr-Latn': 'Srpski (latinica)',
  ru: 'Русский',
  uk: 'Українська',
  bg: 'Български',
  el: 'Ελληνικά',
  'zh-Hans': '简体中文',
  'zh-Hant': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  hi: 'हिन्दी',
  vi: 'Tiếng Việt',
  th: 'ไทย',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  kk: 'Қазақша',
  ar: 'العربية',
  fa: 'فارسی',
};

/** Right-to-left locales — mirrored layout via I18nManager. */
export const RTL_LOCALES: ReadonlySet<Locale> = new Set<Locale>(['ar', 'fa']);

/** Text direction for a locale ('rtl' | 'ltr'). */
export function localeDirection(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

/** Picker grouping (same optgroups as the web picker). */
export interface LocaleGroup {
  labelKey: string;
  locales: Locale[];
}

export const LOCALE_GROUPS: LocaleGroup[] = [
  { labelKey: 'lang_group_worldwide', locales: ['en'] },
  {
    labelKey: 'lang_group_europe_latin_west',
    locales: ['ro', 'es', 'fr', 'de', 'pt', 'it', 'ca'],
  },
  {
    labelKey: 'lang_group_europe_latin_east',
    locales: ['pl', 'hu', 'hr', 'sr-Latn'],
  },
  { labelKey: 'lang_group_cyrillic_greek', locales: ['ru', 'uk', 'bg', 'el'] },
  {
    labelKey: 'lang_group_east_asian',
    locales: ['zh-Hans', 'zh-Hant', 'ja', 'ko'],
  },
  {
    labelKey: 'lang_group_south_southeast_asian',
    locales: ['hi', 'vi', 'th', 'id'],
  },
  { labelKey: 'lang_group_turkic', locales: ['tr', 'kk'] },
  { labelKey: 'lang_group_right_to_left', locales: ['ar', 'fa'] },
];

/** Region/script variants that normalize onto a different supported locale. */
const LOCALE_ALIASES: Record<string, Locale> = {
  'zh-tw': 'zh-Hant',
  'zh-hk': 'zh-Hant',
  'zh-mo': 'zh-Hant',
  'zh-hant': 'zh-Hant',
  'sr-cyrl': 'sr-Latn',
  sr: 'sr-Latn',
};

/** Map any BCP-47-ish string onto a supported locale ('en' fallback). */
export function normalizeUiLocale(raw: string | null | undefined): Locale {
  if (!raw) return 'en';
  const lower = raw.toLowerCase();
  const exact = SUPPORTED_LOCALES.find(
    (code) => code.toLowerCase() === lower
  );
  if (exact) return exact;
  const aliased = LOCALE_ALIASES[lower];
  if (aliased) return aliased;
  const prefix = lower.split('-')[0];
  const prefixExact = SUPPORTED_LOCALES.find(
    (code) => code.toLowerCase() === prefix
  );
  if (prefixExact) return prefixExact;
  if (prefix === 'zh') return 'zh-Hans'; // neutral Chinese → Simplified
  return 'en'; // universal fallback (owner rule (d))
}

const CATALOGS: Record<Locale, Catalog> = {
  en,
  ro,
  es,
  fr,
  de,
  pt,
  it,
  ca,
  pl,
  hu,
  hr,
  'sr-Latn': srLatn,
  ru,
  uk,
  bg,
  el,
  'zh-Hans': zhHans,
  'zh-Hant': zhHant,
  ja,
  ko,
  hi,
  vi,
  th,
  id,
  tr,
  kk,
  ar,
  fa,
};

/**
 * Translate a catalog key in `locale`, falling back to EN then the key
 * itself. Interpolation replaces {{name}} placeholders from `vars`.
 */
export function translate(
  locale: Locale,
  key: string,
  vars?: Record<string, string | number>
): string {
  const raw = lookup(CATALOGS[locale] ?? {}, key) ?? lookup(CATALOGS.en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name)
      ? String(vars[name])
      : match
  );
}
