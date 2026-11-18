'use client';

// [Wave G item 81] The keyboard map: a "?" overlay listing every global
// shortcut. Ships with the palette (80) so the shortcuts are discoverable,
// not folklore. Pure overlay — no routing.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import KeyboardOutlinedIcon from '@mui/icons-material/KeyboardOutlined';

interface ShortcutRow {
  keys: string;
  labelKey: string;
  labelDefault: string;
}

export const GLOBAL_SHORTCUTS: ShortcutRow[] = [
  { keys: '/', labelKey: 'shortcut_search', labelDefault: 'Focus the problem search box' },
  { keys: 'Ctrl K', labelKey: 'shortcut_palette', labelDefault: 'Open the command palette' },
  { keys: '?', labelKey: 'shortcut_help', labelDefault: 'Show this keyboard map' },
  { keys: 'Esc', labelKey: 'shortcut_escape', labelDefault: 'Close overlays and menus' },
  { keys: 'Ctrl Enter', labelKey: 'shortcut_submit', labelDefault: 'Submit the solution (editor)' },
  { keys: 'Tab', labelKey: 'shortcut_indent', labelDefault: 'Indent in the code editor' },
];

export default function ShortcutHelp(): ReactNode {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      event.preventDefault();
      setOpen((wasOpen) => !wasOpen);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('shortcut_title', 'Keyboard shortcuts')}
      data-testid="shortcut-help"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1rem',
        background: 'rgba(0, 0, 0, 0.55)',
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        style={{
          width: 'min(480px, 100%)',
          background: 'var(--surface)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1rem' }}>
          <span style={{ color: 'var(--accent)', display: 'inline-flex' }} aria-hidden="true">
            <KeyboardOutlinedIcon fontSize="small" />
          </span>
          <strong style={{ fontSize: '1rem', color: 'var(--foreground)' }}>
            {t('shortcut_title', 'Keyboard shortcuts')}
          </strong>
        </div>
        <table style={{ width: '100%' }}>
          <tbody>
            {GLOBAL_SHORTCUTS.map((row) => (
              <tr key={row.keys}>
                <td style={{ width: '38%' }}>
                  <kbd
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.75rem',
                      padding: '2px 8px',
                      borderRadius: 4,
                      border: '1px solid var(--border-strong)',
                      background: 'var(--wash-6)',
                      color: 'var(--foreground)',
                    }}
                  >
                    {row.keys}
                  </kbd>
                </td>
                <td style={{ color: 'var(--body)', fontSize: '0.875rem' }}>
                  {t(row.labelKey, row.labelDefault)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          className="btn"
          style={{ marginTop: '1rem' }}
          onClick={() => setOpen(false)}
        >
          {t('shortcut_close', 'Close')}
        </button>
      </div>
    </div>
  );
}
