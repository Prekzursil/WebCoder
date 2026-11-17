'use client';

// [wave E item 31] The guided first-solve LADDER: beyond the three
// starters, the seeded first-solve-ladder track gives a six-rung ordered
// progression (read input → loops → arrays → sorting → binary search)
// with per-viewer solved marks — the "what next" answer for a brand-new
// learner, one click deep.

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { TrackService } from '@/services/ApiService';
import type { TrackDetail } from '@/types/api';
import { AuthContext } from '@/context/AuthContext';
import React from 'react';
import { palette, hexAlpha } from '@/theme/tokens';

export default function StartLadder(): ReactNode {
  const { t, i18n } = useTranslation();
  // Direct context read: provider-less test renders stay anonymous.
  const auth = React.useContext(AuthContext);
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    TrackService.get('first-solve-ladder')
      .then((data) => {
        if (!cancelled) setTrack(data);
      })
      .catch(() => {
        if (!cancelled) setError(t('start_ladder_error', 'The ladder is unavailable right now.'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  if (error || !track || !track.items || track.items.length === 0) return null;
  const lang = i18n.language.startsWith('ro') ? 'ro' : 'en';
  const solved = track.items.filter((i) => i.is_solved).length;

  return (
    <section style={{ marginBottom: '2rem' }} data-testid="start-ladder">
      <h2
        style={{
          fontSize: '1.25rem',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: '0.5rem',
          color: 'var(--foreground)',
        }}
      >
        {track.title_i18n?.[lang] || track.title_i18n?.en || t('start_ladder_title', 'The ladder')}
      </h2>
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 1rem' }}>
        {track.description_i18n?.[lang] ||
          t(
            'start_ladder_desc',
            'Six rungs from reading input to binary search — solve them in order.',
          )}
        {auth?.isAuthenticated && (
          <>
            {' '}
            <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
              {t('start_ladder_progress', '{{n}}/{{m}} solved', {
                n: solved,
                m: track.items.length,
              })}
            </span>
          </>
        )}
      </p>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
        {track.items.map((item, index) => (
          <li key={item.problem_id}>
            <Link
              href={`/problems/${item.problem_id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.7rem 1rem',
                background: item.is_solved ? hexAlpha(palette.success, 0.06) : 'var(--surface)',
                border: `1px solid ${item.is_solved ? hexAlpha(palette.success, 0.3) : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '26px',
                  height: '26px',
                  borderRadius: '999px',
                  background: item.is_solved
                    ? hexAlpha(palette.success, 0.15)
                    : hexAlpha(palette.accent, 0.1),
                  color: item.is_solved ? palette.success : 'var(--accent)',
                  fontSize: '0.8rem',
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {item.is_solved ? '✓' : index + 1}
              </span>
              <span style={{ color: 'var(--foreground)', fontSize: '0.92rem', fontWeight: 600 }}>
                {item.title_i18n?.[lang] || item.title_i18n?.en}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
