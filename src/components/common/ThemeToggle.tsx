'use client';

// [Wave G item 79] The theme toggle: dark (default) ↔ light. Renders an
// icon button; the mode itself lives in ThemeModeContext so MUI, the CSS
// vars and the CodeMirror themes all flip together.

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useThemeMode } from '@/context/ThemeModeContext';

export default function ThemeToggle({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  const { mode, toggle } = useThemeMode();
  const isDark = mode === 'dark';
  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      data-testid="theme-toggle"
      aria-pressed={mode === 'light'}
      aria-label={t('theme_toggle_label', 'Toggle light / dark theme')}
      title={t('theme_toggle_label', 'Toggle light / dark theme')}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '36px',
        height: '36px',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--wash-6)',
        border: '1px solid var(--border)',
        color: 'var(--foreground)',
        cursor: 'pointer',
      }}
    >
      {isDark ? <DarkModeOutlinedIcon fontSize="small" /> : <LightModeOutlinedIcon fontSize="small" />}
    </button>
  );
}
