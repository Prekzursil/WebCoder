'use client';

import { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/context/AuthContext';
import Navbar from '@/components/layout/Navbar';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import { ThemeProvider, createTheme, CssBaseline } from '@mui/material';

import '@/i18n';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0f172a',
      paper: '#1e293b',
    },
    text: {
      primary: '#f1f5f9',
      secondary: '#64748b',
    },
    primary: {
      main: '#38bdf8',
    },
    error: {
      main: '#f87171',
    },
    success: {
      main: '#4ade80',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontFamily: "'DM Sans', 'Manrope', system-ui, -apple-system, sans-serif",
  },
  shape: {
    borderRadius: 12,
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
            borderColor: 'rgba(255,255,255,0.08)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.2)',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#38bdf8',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.08)',
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
            background: '#38bdf8',
            color: '#0f172a',
            fontWeight: 600,
            '&:hover': {
              background: '#7dd3fc',
            },
          },
        },
        {
          props: { variant: 'outlined', color: 'primary' },
          style: {
            borderColor: 'rgba(56,189,248,0.4)',
            color: '#38bdf8',
            '&:hover': {
              borderColor: '#38bdf8',
              background: 'rgba(56,189,248,0.08)',
            },
          },
        },
      ],
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(255,255,255,0.08)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <AuthProvider>
          <Navbar />
          {children}
          <Toaster
            toastOptions={{
              style: {
                background: '#1e293b',
                color: '#f1f5f9',
                border: '1px solid rgba(255,255,255,0.08)',
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
