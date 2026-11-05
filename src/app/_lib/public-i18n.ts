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
// The dictionary, types, and createTranslator() live in the client-safe
// ./public-messages module; this file adds the cookie-backed locale lookup
// (next/headers is server-only, which is exactly why the split exists).
// Everything is re-exported so existing `from './public-i18n'` imports keep
// working.

import { cookies } from "next/headers";
import { normalizeLocale, type PublicLocale } from "./public-messages";

export * from "./public-messages";

const LOCALE_COOKIE_NAME = "i18nextLng";

/** Resolve the render locale from the i18next cookie (default: English). */
export async function getLocale(): Promise<PublicLocale> {
  const store = await cookies();
  return normalizeLocale(store.get(LOCALE_COOKIE_NAME)?.value);
}
