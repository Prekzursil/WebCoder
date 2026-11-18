'use client';

import { ReactNode, useEffect, useMemo } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import ServiceWorkerRegistrar from '@/components/common/ServiceWorkerRegistrar';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { palette, lightPalette, fontFamily, typeRamp, radius, hexAlpha } from '@/theme/tokens';
import { ThemeModeProvider, useThemeMode } from '@/context/ThemeModeContext';
import CommandPalette from '@/components/common/CommandPalette';
import ShortcutHelp from '@/components/common/ShortcutHelp';

import '@/i18n';
import { localeDirection, normalizeUiLocale } from '@/i18n';

// Themes built entirely from src/theme/tokens.ts — no literal colors here.
// [SPEC-GAPS A2/A12] Item 79: the MUI palette follows the site theme mode
// (dark default, light counterpart from lightPalette).
function buildTheme(mode: 'dark' | 'light') {
  const p = mode === 'light' ? lightPalette : palette;
  return createTheme({
    palette: {
      mode,
      background: {
        default: p.bg,
        paper: p.surface,
      },
      text: {
        primary: p.foreground,
        secondary: p.muted,
      },
      primary: {
        main: p.accent,
      },
      error: {
        main: p.danger,
      },
      success: {
        main: p.success,
      },
      warning: {
        main: p.warn,
      },
      divider: p.border,
    },
    typography: {
      fontFamily: fontFamily.sans,
      pageTitle: typeRamp.pageTitle,
      sectionLabel: typeRamp.sectionLabel,
      microLabel: typeRamp.microLabel,
      // mono is delivered via the --font-mono token (globals.css `code, pre`)
    },
    shape: {
      borderRadius: radius.lg,
    },
    components: {
      MuiTextField: {
        defaultProps: {
          variant: 'outlined',
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            '& .MuiOutlinedInput-notchedOutline': {
              borderColor: p.border,
            },
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: p.borderStrong,
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: p.accent,
            },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none',
            border: `1px solid ${p.border}`,
          },
        },
      },
      MuiButton: {
        // MUI v6+ dropped the composite `containedPrimary` / `outlinedPrimary`
        // styleOverrides keys; `variants` is the supported equivalent. Colours and
        // hover states below are unchanged from the original overrides.
        variants: [
          {
            props: { variant: 'contained', color: 'primary' },
            style: {
              background: p.accent,
              color: p.onAccent,
              fontWeight: 600,
              '&:hover': {
                background: p.accentHover,
              },
            },
          },
          {
            props: { variant: 'outlined', color: 'primary' },
            style: {
              borderColor: hexAlpha(p.accent, 0.4),
              color: p.accent,
              '&:hover': {
                borderColor: p.accent,
                background: hexAlpha(p.accent, 0.08),
              },
            },
          },
        ],
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: p.border,
          },
        },
      },
      MuiAlert: {
        styleOverrides: {
          root: {
            borderRadius: radius.md,
          },
        },
      },
    },
  });
}

export default function Providers({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { mode } = useThemeMode();
  const muiTheme = useMemo(() => buildTheme(mode), [mode]);
  const surfacePalette = mode === 'light' ? lightPalette : palette;

  useEffect(() => {
    // [Q5/Q12] i18n initializes pinned to 'en' (SSR/hydration safety), which
    // disables detector-based lookup for the first render — so a visitor who
    // previously picked Romanian got English client chrome back on every
    // reload while server pages honored the cookie. Re-apply the cached
    // choice (cookie — the same source getLocale reads server-side) AFTER
    // hydration; a post-mount changeLanguage re-renders like any state flip.
    const match = document.cookie.split('; ').find((row) => row.startsWith('i18nextLng='));
    const cached = match?.split('=')[1];
    const locale = cached ? normalizeUiLocale(cached) : null;
    if (cached && locale) {
      // [Q5 + RTL] keep <html lang>/<html dir> in sync on re-application
      // too — SSR renders lang="en" dir="ltr" (layout.tsx) and only the
      // switcher updated them before.
      document.documentElement.lang = locale;
      document.documentElement.dir = localeDirection(locale);
      if (locale !== i18n.language) {
        i18n.changeLanguage(locale);
      }
    }
  }, [i18n]);

  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeModeProvider>
        <ThemeProvider theme={muiTheme}>
          <CssBaseline />
          <AuthProvider>
            {/* Keyboard skip link + one main landmark for every route. [Q11] */}
            <a href="#main-content" className="skip-link">
              {t('skip_to_content', 'Skip to content')}
            </a>
            <Navbar />
            <main id="main-content">{children}</main>
            <Footer />
            <Toaster
              toastOptions={{
                style: {
                  background: surfacePalette.surface,
                  color: surfacePalette.foreground,
                  border: `1px solid ${surfacePalette.border}`,
                },
              }}
            />
            {/* OPS-6: PWA service-worker registration (production only) */}
            <ServiceWorkerRegistrar />
            {/* Wave G item 80: the Ctrl-K command palette (global). */}
            <CommandPalette />
            {/* Wave G item 81: the "?" keyboard map overlay (global). */}
            <ShortcutHelp />
          </AuthProvider>
        </ThemeProvider>
      </ThemeModeProvider>
    </AppRouterCacheProvider>
  );
}
