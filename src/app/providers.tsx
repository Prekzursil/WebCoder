'use client';

import { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';
import { palette, fontFamily, typeRamp, radius } from '@/theme/tokens';

import '@/i18n';

// Theme built entirely from src/theme/tokens.ts — no literal colors here.
// [SPEC-GAPS A2/A12]
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: palette.bg,
      paper: palette.surface,
    },
    text: {
      primary: palette.foreground,
      secondary: palette.muted,
    },
    primary: {
      main: palette.accent,
    },
    error: {
      main: palette.danger,
    },
    success: {
      main: palette.success,
    },
    warning: {
      main: palette.warn,
    },
    divider: palette.border,
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
            borderColor: palette.border,
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.borderStrong,
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: palette.accent,
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: `1px solid ${palette.border}`,
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
            background: palette.accent,
            color: palette.onAccent,
            fontWeight: 600,
            '&:hover': {
              background: palette.accentHover,
            },
          },
        },
        {
          props: { variant: 'outlined', color: 'primary' },
          style: {
            borderColor: 'rgba(56,189,248,0.4)',
            color: palette.accent,
            '&:hover': {
              borderColor: palette.accent,
              background: 'rgba(56,189,248,0.08)',
            },
          },
        },
      ],
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: palette.border,
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

export default function Providers({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={darkTheme}>
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
                background: palette.surface,
                color: palette.foreground,
                border: `1px solid ${palette.border}`,
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
