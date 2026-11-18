'use client';

// [Wave G item 79 — full dark mode WITH its light counterpart] The site
// shipped dark-only; this context makes the theme a user choice that
// covers every surface: CSS custom properties flip via
// html[data-theme="light"] (globals.css), MUI switches palette mode, and
// CodeMirror editors read the mode for their syntax theme. The choice
// persists in localStorage and applies before paint via the inline
// script in layout.tsx (no dark flash on reload).

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type ThemeMode = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'wc-theme-mode';

const ThemeModeContext = createContext<{
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}>({ mode: 'dark', toggle: () => {}, setMode: () => {} });

/** Read the persisted choice without hydration mismatch (client only). */
export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Apply the data-theme attribute + persistence. Idempotent. */
export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    /* private mode: the attribute still applies for this session */
  }
}

export function ThemeModeProvider({ children }: { children: ReactNode }) {
  // SSR always renders dark (layout's default); the stored choice applies
  // on mount via the effect below — one paint at most before the flip.
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    const stored = readStoredTheme();
    if (stored !== mode) {
      setModeState(stored);
      applyThemeMode(stored);
    }
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    applyThemeMode(next);
  }, []);

  const toggle = useCallback(() => {
    setModeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      applyThemeMode(next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ mode, toggle, setMode }), [mode, toggle, setMode]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeModeContext);
}
