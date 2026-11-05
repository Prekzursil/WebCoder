"use client";

// Full-locale language picker (i18n & translation platform wave).
//
// 23 locales do not fit a flat <select>, so this renders native
// <optgroup>s grouping the locales by script/region (LOCALE_GROUPS in
// src/i18n.ts; group labels are catalog keys translated per locale) with
// each option labelled by its language's endonym (languages, not flags).
// Switching writes the i18next cookie (read back by the server for SSR +
// <html lang>) and syncs documentElement lang AND dir (RTL for ar/fa)
// immediately.

import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  LOCALE_GROUPS,
  LOCALE_NATIVE_NAMES,
  localeDirection,
  normalizeUiLocale,
  type Locale,
} from "@/i18n";

export interface LanguageSwitcherProps {
  /** CSS module class for the wrapper (each layout styles its own control). */
  className?: string;
  /** Change handler hook for layouts that need to react to a switch. */
  onChange?: (locale: Locale) => void;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className, onChange }) => {
  const { i18n, t } = useTranslation();
  const current = normalizeUiLocale(i18n.language);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = normalizeUiLocale(event.target.value);
      i18n.changeLanguage(next);
      if (typeof document !== "undefined") {
        // [Q5 + RTL] keep <html lang> and <html dir> in sync. ALSO write
        // the i18nextLng cookie ourselves: SSR (public-i18n getLocale) and
        // the providers post-hydration re-application BOTH read this
        // cookie by name — the browser-languagedetector's own cookie
        // cache writes a DIFFERENT cookie ('i18next'), so without this
        // a later effect run would re-apply the STALE cookie locale and
        // clobber the user's in-session switch (caught by the RTL e2e).
        document.cookie = `i18nextLng=${next};path=/;max-age=31536000;samesite=lax`;
        document.documentElement.lang = next;
        document.documentElement.dir = localeDirection(next);
      }
      onChange?.(next);
    },
    [i18n, onChange],
  );

  return (
    <select
      className={className}
      value={current}
      onChange={handleChange}
      aria-label={t("nav_language_label", "Language")}
      title={t("nav_language_label", "Language")}
    >
      {LOCALE_GROUPS.map((group) => (
        <optgroup key={group.labelKey} label={t(group.labelKey)}>
          {group.locales.map((code) => (
            <option key={code} value={code}>
              {LOCALE_NATIVE_NAMES[code]}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
