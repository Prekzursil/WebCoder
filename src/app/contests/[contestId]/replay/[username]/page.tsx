'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { ContestReplay } from '@/types/api';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Item 57 — replay a user's contest: every submission as a minute-offset
 * event with the running total, plus a time scrubber that replays the
 * board state at any minute of the contest.
 */
export default function ContestReplayPage() {
  const { t } = useTranslation();
  const params = useParams<{ contestId: string; username: string }>();
  const contestId = Number(params.contestId);
  const username = String(params.username ?? '');
  const [replay, setReplay] = useState<ContestReplay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minute, setMinute] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await ContestService.getReplay(contestId, username);
        if (!cancelled) setReplay(response);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contestId, username]);

  const lastMinute = useMemo(
    () =>
      replay && replay.events.length > 0
        ? Math.ceil(replay.events[replay.events.length - 1].minute_offset)
        : 0,
    [replay],
  );
  const scrub = minute ?? lastMinute;
  const visible = replay ? replay.events.filter((event) => event.minute_offset <= scrub) : [];
  const runningTotal = visible.length > 0 ? visible[visible.length - 1].total : 0;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('replay_title', 'Replay — {{user}}', { user: username })}
        subtitle={t(
          'replay_subtitle',
          'Every submission with its in-contest moment and the running score.',
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
      {!replay && !error && <p aria-busy="true">{t('loading', 'Loading…')}</p>}
      {replay && (
        <>
          <p data-testid="replay-summary">
            {replay.final_rank !== null
              ? t('replay_final_rank', 'Final rank: #{{rank}}', { rank: replay.final_rank })
              : t('replay_no_rank', 'No final rank on the official board.')}
            {replay.rating_change && (
              <>
                {' · '}
                {t('replay_rating', 'Rating {{delta}}', {
                  delta: `${replay.rating_change.delta >= 0 ? '+' : ''}${replay.rating_change.delta}`,
                })}
              </>
            )}
          </p>
          <div style={{ margin: '14px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
            <label htmlFor="replay-scrub" style={{ fontWeight: 600 }}>
              {t('replay_at_minute', 'At minute {{n}}', { n: scrub })}
            </label>
            <input
              id="replay-scrub"
              type="range"
              min={0}
              max={Math.max(lastMinute, 1)}
              value={scrub}
              onChange={(e) => setMinute(Number(e.target.value))}
              data-testid="replay-scrubber"
            />
            <strong data-testid="replay-running-total">{runningTotal}</strong>
          </div>
          {replay.events.length === 0 ? (
            <p style={{ color: palette.muted }}>
              {t('replay_empty', 'No in-window submissions for this participant.')}
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 6 }}>
              {replay.events.map((event) => {
                const shown = event.minute_offset <= scrub;
                return (
                  <li
                    key={event.submission_id}
                    data-testid={`replay-event-${event.submission_id}`}
                    style={{
                      border: `1px solid ${palette.border}`,
                      borderRadius: 8,
                      padding: '8px 10px',
                      display: 'flex',
                      gap: 10,
                      opacity: shown ? 1 : 0.35,
                      flexWrap: 'wrap',
                    }}
                  >
                    <strong style={{ color: palette.accent, minWidth: 64 }}>
                      +{event.minute_offset}m
                    </strong>
                    <span>{event.problem_label}</span>
                    <span>{event.verdict}</span>
                    <span>
                      {event.score}/{event.problem_max}
                    </span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700 }}>Σ {event.total}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
