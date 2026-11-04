// SettingsStore — the UI locale selection (persisted, defaults to the
// device locale) plus the `t()` React binding. RTL locales flip
// I18nManager so the whole layout mirrors (owner rule: every shipped
// language selectable; ar/fa are right-to-left).
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { I18nManager } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocales } from "expo-localization";
import { localeDirection, normalizeUiLocale, translate, type Locale } from "../i18n";

const LOCALE_KEY = "wc_ui_locale";

export interface SettingsState {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  /** translate() bound to the active locale; a string 2nd arg is a
   * fallback used when the key is missing from every catalog. */
  t: (key: string, varsOrFallback?: Record<string, string | number> | string) => string;
  isRTL: boolean;
}

const SettingsContext = createContext<SettingsState | null>(null);

/** Device locale → supported UI locale ('en' fallback). */
export function deviceLocale(): Locale {
  const tag = getLocales()[0]?.languageTag;
  return normalizeUiLocale(tag);
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => deviceLocale());

  // Load the persisted choice once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await AsyncStorage.getItem(LOCALE_KEY);
      if (alive && saved) setLocaleState(normalizeUiLocale(saved));
    })();
    return () => {
      alive = false;
    };
  }, []);

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next);
    await AsyncStorage.setItem(LOCALE_KEY, next);
    // RTL flip needs a reload to fully apply; set the flag so the next
    // launch renders mirrored (I18nManager semantics).
    const rtl = localeDirection(next) === "rtl";
    if (I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
    }
  }, []);

  const value = useMemo<SettingsState>(
    () => ({
      locale,
      setLocale,
      t: (key: string, varsOrFallback?: Record<string, string | number> | string) =>
        typeof varsOrFallback === "string"
          ? translate(locale, key) === key
            ? varsOrFallback
            : translate(locale, key)
          : translate(locale, key, varsOrFallback),
      isRTL: localeDirection(locale) === "rtl",
    }),
    [locale, setLocale],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsState {
  const context = useContext(SettingsContext);
  if (!context) throw new Error("useSettings must be used inside <SettingsProvider>");
  return context;
}
