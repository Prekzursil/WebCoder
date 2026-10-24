'use client';

// [roadmap EDT-2 / QW-1] Progressive hints ladder: hints reveal one at a
// time so a stuck learner gets the smallest next nudge instead of a full
// spoiler. No penalty v1 (per the roadmap design).

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { palette, hexAlpha } from '@/theme/tokens';

export default function HintsPanel({ hints }: { hints: string[] }): ReactNode {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(0);

  if (!hints.length) return null;

  return (
    <div
      style={{
        background: hexAlpha(palette.warn, 0.05),
        border: `1px solid ${hexAlpha(palette.warn, 0.2)}`,
        borderRadius: 'var(--radius-md)',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      <div
        className="micro-label"
        style={{
          fontSize: '0.72rem',
          fontWeight: 700,
          color: 'var(--warn)',
          letterSpacing: '0.06em',
          marginBottom: '0.6rem',
        }}
      >
        {t('hints_header', 'Hints — reveal one step at a time')}
      </div>
      <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {hints.slice(0, revealed).map((hint, index) => (
          <li key={index} style={{ fontSize: '0.85rem', color: 'var(--body)', lineHeight: 1.6 }}>
            {hint}
          </li>
        ))}
      </ol>
      {revealed < hints.length ? (
        <button
          type="button"
          className="btn"
          style={{ marginTop: '0.75rem', padding: '4px 12px', fontSize: '0.72rem', minHeight: '30px' }}
          onClick={() => setRevealed((n) => n + 1)}
        >
          {t('show_hint_button', 'Show hint {{current}} of {{total}}', {
            current: revealed + 1,
            total: hints.length,
          })}
        </button>
      ) : (
        <button
          type="button"
          className="btn"
          style={{ marginTop: '0.75rem', padding: '4px 12px', fontSize: '0.72rem', minHeight: '30px' }}
          onClick={() => setRevealed(0)}
        >
          {t('hide_hints_button', 'Hide hints')}
        </button>
      )}
    </div>
  );
}
