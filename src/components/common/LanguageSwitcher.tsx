'use client';

// Ten-locale language picker (i18n & translation platform wave).
//
// Replaces the old two-button EN/RO toggle in Navbar + Footer: ten locales
// do not fit a button row, so this renders a native <select> labelled with
// each language's endonym (languages, not flags). Switching writes the
// i18next cookie (read back by the server for SSR + <html lang>) and syncs
// document.documentElement.lang immediately.

import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LOCALE_NATIVE_NAMES,
  SUPPORTED_LOCALES,
  normalizeUiLocale,
  type Locale,
} from '@/i18n';

export interface LanguageSwitcherProps {
  /** CSS module class for the wrapper (each layout styles its own control). */
  className?: string;
  /** Change handler hook for layouts that need to react to a switch. */
  onChange?: (locale: Locale) => void;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  className,
  onChange,
}) => {
  const { i18n, t } = useTranslation();
  const current = normalizeUiLocale(i18n.language);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const next = normalizeUiLocale(event.target.value);
      i18n.changeLanguage(next);
      if (typeof document !== 'undefined') {
        // [Q5] keep <html lang> in sync; i18next's cookie cache persists
        // the choice for the next SSR render.
        document.documentElement.lang = next;
      }
      onChange?.(next);
    },
    [i18n, onChange]
  );

  return (
    <select
      className={className}
      value={current}
      onChange={handleChange}
      aria-label={t('nav_language_label', 'Language')}
      title={t('nav_language_label', 'Language')}
    >
      {SUPPORTED_LOCALES.map((code) => (
        <option key={code} value={code}>
          {LOCALE_NATIVE_NAMES[code]}
        </option>
      ))}
    </select>
  );
};

export default LanguageSwitcher;
