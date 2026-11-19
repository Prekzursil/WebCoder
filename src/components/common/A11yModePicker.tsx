'use client';

// [Wave G item 91] Dyslexia-friendly and high-contrast display modes. A
// three-way picker (default / dyslexia / contrast) setting
// html[data-a11y]; globals.css owns the overrides (readable font stack +
// spacing for dyslexia, boosted contrast tokens for the contrast mode).
// Persisted in localStorage, applied pre-paint by the layout script.

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccessibilityNewOutlinedIcon from '@mui/icons-material/AccessibilityNewOutlined';

export type A11yMode = 'default' | 'dyslexia' | 'contrast';

export const A11Y_STORAGE_KEY = 'wc-a11y-mode';

const MODES: A11yMode[] = ['default', 'dyslexia', 'contrast'];

export function readStoredA11yMode(): A11yMode {
  if (typeof window === 'undefined') return 'default';
  try {
    const value = window.localStorage.getItem(A11Y_STORAGE_KEY);
    return MODES.includes(value as A11yMode) ? (value as A11yMode) : 'default';
  } catch {
    return 'default';
  }
}

export function applyA11yMode(mode: A11yMode): void {
  if (typeof document === 'undefined') return;
  if (mode === 'default') {
    document.documentElement.removeAttribute('data-a11y');
  } else {
    document.documentElement.setAttribute('data-a11y', mode);
  }
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, mode);
  } catch {
    /* private mode */
  }
}

export default function A11yModePicker({ className }: { className?: string }): ReactNode {
  const { t } = useTranslation();
  const [mode, setMode] = useState<A11yMode>('default');

  useEffect(() => {
    const stored = readStoredA11yMode();
    setMode(stored);
    applyA11yMode(stored);
  }, []);

  const labels: Record<A11yMode, string> = {
    default: t('a11y_mode_default', 'Default display'),
    dyslexia: t('a11y_mode_dyslexia', 'Dyslexia-friendly'),
    contrast: t('a11y_mode_contrast', 'High contrast'),
  };

  return (
    <label
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '0.75rem',
        color: 'var(--muted)',
      }}
    >
      <AccessibilityNewOutlinedIcon fontSize="small" />
      <span className="visually-hidden, sr-only">{t('a11y_mode_label', 'Display mode')}</span>
      <select
        value={mode}
        data-testid="a11y-mode"
        onChange={(e) => {
          const next = e.target.value as A11yMode;
          setMode(next);
          applyA11yMode(next);
        }}
        aria-label={t('a11y_mode_label', 'Display mode')}
        style={{ fontSize: '0.75rem', padding: '4px 6px', minWidth: 120 }}
      >
        {MODES.map((value) => (
          <option key={value} value={value}>
            {labels[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
