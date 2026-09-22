// Server-side i18n for the PUBLIC page group (HomePage, ProblemsListPage,
// ProblemDetailPage, NotFoundPage).
//
// Ported from frontend/webcoder_ui (CRA reference), where these pages called
// react-i18next's `t(key, 'English default')` with ~90% fallback-English keys
// (docs/PORT-MAP.md §0.4). react-i18next only works inside client components,
// but these routes are SEO-facing Server Components, so this module provides
// the same `t(key, defaultValue, vars)` contract against a plain dictionary.
//
// Locale source: the CRA app caches its detected language in the `i18nextLng`
// cookie (src/i18n.ts detection.caches), so the server reads that cookie —
// this keeps SSR output locale-consistent with the hydrated client app
// without introducing [locale] URL routing (a scaffold-level decision).
//
// Behavior parity: `ro` carries ONLY the keys that have real Romanian values
// in the shared resources (src/i18n.ts). Every other key falls back to the
// English default — exactly what RO users see in the CRA app today.

import { cookies } from 'next/headers';

export type PublicLocale = 'en' | 'ro';

const LOCALE_COOKIE_NAME = 'i18nextLng';

const MESSAGES: Record<PublicLocale, Record<string, string>> = {
  en: {
    // Keys that exist in the shared resources (src/i18n.ts en block).
    welcome_message: 'Welcome to WebCoder',
    problem_list_header: 'Problems',
  },
  ro: {
    // Keys that exist in the shared resources (src/i18n.ts ro block).
    welcome_message: 'Bun venit la WebCoder',
    problem_list_header: 'Probleme',
  },
};

/** Reduce a raw cookie value like "ro-RO" / "en-US" to the supported set. */
export function normalizeLocale(raw: string | undefined): PublicLocale {
  const base = raw?.split('-')[0]?.toLowerCase();
  return base === 'ro' ? 'ro' : 'en';
}

/** Resolve the render locale from the i18next cookie (default: English). */
export async function getLocale(): Promise<PublicLocale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}

export interface TranslateVars {
  [key: string]: string | number;
}

/** Replace `{{name}}` placeholders, i18next-style. Missing vars become ''. */
export function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) =>
    vars[name] !== undefined ? String(vars[name]) : ''
  );
}

export type PublicTranslator = (
  key: string,
  defaultValue?: string,
  vars?: TranslateVars
) => string;

/** Build a `t()` with the same (key, defaultValue, vars) contract as i18next. */
export function createTranslator(locale: PublicLocale): PublicTranslator {
  return (key, defaultValue = key, vars) =>
    interpolate(MESSAGES[locale][key] ?? defaultValue, vars);
}
