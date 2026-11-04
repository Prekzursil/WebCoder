// Localized problem-text resolution — the mobile twin of the web's
// statement pick: render in the USER'S language, fall back to EN (owner
// rule (d)), and surface the translation-contribution affordance when the
// chosen language has no statement.

import type { Locale } from "../i18n";

/** Locale argument: a registry Locale or any resolved i18n key. */
export type LocaleArg = Locale | string;
import type { TranslationAttribution } from "../types/api";

export interface LocalizedTextSource {
  title_i18n?: Record<string, string>;
  statement_i18n?: Record<string, string>;
  translations?: TranslationAttribution[];
}

export interface ResolvedText {
  /** Rendered text ('' when nothing exists at all). */
  text: string;
  /** Locale actually used ('' when no text existed). */
  resolvedLocale: string;
  /** True when the user's locale was served (not the EN fallback). */
  native: boolean;
}

/**
 * Resolve a localized field: user locale → en → '' (web parity). BCP-47
 * partial matching means 'sr-Latn' matches a 'sr' key and vice versa.
 */
export function resolveLocalized(
  source: Record<string, string> | undefined,
  locale: LocaleArg,
): ResolvedText {
  if (!source) return { text: "", resolvedLocale: "", native: false };
  const direct = source[locale];
  if (direct !== undefined && direct !== "") {
    return { text: direct, resolvedLocale: locale, native: true };
  }
  const prefix = locale.split("-")[0];
  const prefixKey = Object.keys(source).find(
    (key) => key === prefix || key.split("-")[0] === prefix,
  );
  if (prefixKey !== undefined && source[prefixKey] !== "") {
    return { text: source[prefixKey], resolvedLocale: prefixKey, native: true };
  }
  if (source.en !== undefined && source.en !== "") {
    return { text: source.en, resolvedLocale: "en", native: false };
  }
  const anyKey = Object.keys(source)[0];
  if (anyKey !== undefined) {
    return { text: source[anyKey], resolvedLocale: anyKey, native: false };
  }
  return { text: "", resolvedLocale: "", native: false };
}

export function problemTitle(problem: LocalizedTextSource, locale: LocaleArg): ResolvedText {
  return resolveLocalized(problem.title_i18n, locale);
}

export function problemStatement(problem: LocalizedTextSource, locale: LocaleArg): ResolvedText {
  return resolveLocalized(problem.statement_i18n, locale);
}

/** The "translated by @user" credit for the rendered locale, if approved. */
export function translationCredit(problem: LocalizedTextSource, locale: LocaleArg): string | null {
  const attribution = problem.translations?.find((t) => t.language === locale);
  return attribution ? attribution.contributor_username : null;
}

/**
 * True when the statement fell back to EN (or nothing) — the signal the
 * problem page uses to show the "help translate this problem" entry point
 * (the i18n wave's translation-contribution surface).
 */
export function needsTranslation(problem: LocalizedTextSource, locale: LocaleArg): boolean {
  const prefix = locale.split("-")[0];
  return !Object.keys(problem.statement_i18n ?? {}).some(
    (key) => key === locale || key.split("-")[0] === prefix,
  );
}
