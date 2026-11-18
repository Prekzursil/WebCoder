'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestDrama } from '@/types/api';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Item 58 — the frozen-board drama page: the public (frozen) standings
 * with, per participant, how many submissions the freeze is hiding and a
 * countdown to the reveal. The scoreboard-suspense spectator sport.
 */
export default function ContestDramaPage() {
  const { t } = useTranslation();
  const params = useParams<{ contestId: string }>();
  const contestId = Number(params.contestId);
  const [drama, setDrama] = useState<ContestDrama | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await ContestService.getDrama(contestId);
        if (!cancelled) setDrama(response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      }
    };
    load();
    const timer = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [contestId]);

  const revealIn = drama
    ? `${Math.floor(drama.seconds_until_reveal / 60)}m ${drama.seconds_until_reveal % 60}s`
    : '';

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('drama_title', 'Frozen board drama')}
        subtitle={t(
          'drama_subtitle',
          'The public board is frozen — here is who might still strike.',
        )}
      />
      <p>
        <Link href={`/contests/${contestId}`} style={{ color: palette.accent }}>
          ← {t('back_to_contest', 'Back to the contest')}
        </Link>
      </p>
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {!drama && !error && <p aria-busy="true">{t('loading', 'Loading…')}</p>}
      {drama && (
        <>
          <p
            data-testid="drama-state"
            style={{
              fontWeight: 700,
              color: drama.is_frozen ? palette.warn : palette.muted,
            }}
          >
            {drama.is_frozen
              ? t('drama_frozen', 'Frozen — reveal in {{time}}', { time: revealIn })
              : t('drama_not_frozen', 'The board is live — nothing is hidden.')}
          </p>
          {drama.results.length === 0 ? (
            <p style={{ color: palette.muted }}>{t('drama_empty', 'No standings rows yet.')}</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }} data-testid="drama-table">
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: `2px solid ${palette.border}` }}>
                  <th style={{ padding: 8 }}>#</th>
                  <th>{t('drama_participant', 'Participant')}</th>
                  <th>{t('drama_score', 'Score')}</th>
                  <th>{t('drama_solved', 'Solved')}</th>
                  <th>{t('drama_hidden', 'Hidden submissions')}</th>
                </tr>
              </thead>
              <tbody>
                {drama.results.map((row) => (
                  <tr
                    key={row.user.id}
                    data-testid={`drama-row-${row.user.username}`}
                    style={{ borderBottom: `1px solid ${palette.border}` }}
                  >
                    <td style={{ padding: 8 }}>{row.rank}</td>
                    <td>
                      <Link
                        href={`/profile/${row.user.username}`}
                        style={{ color: palette.foreground }}
                      >
                        {row.user.username}
                      </Link>
                    </td>
                    <td>{row.score}</td>
                    <td>{row.solved}</td>
                    <td
                      style={{
                        color: row.hidden_submissions > 0 ? palette.warn : palette.muted,
                        fontWeight: row.hidden_submissions > 0 ? 700 : 400,
                      }}
                    >
                      {row.hidden_submissions > 0
                        ? t('drama_hidden_count', '{{count}} under the freeze 🥶', {
                            count: row.hidden_submissions,
                          })
                        : t('drama_hidden_none', '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </main>
  );
}
