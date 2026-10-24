'use client';

// [roadmap UXP-7 / QW-9 / X9] Problem-page metadata: tried / solved /
// acceptance rate + the 3-level satisfaction vote. Gives verifiers signal
// beyond solve rates and completes the catalog-honesty pack on the detail
// page (the list cards already carry the counts from B8's annotation).

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';

interface ProblemStats {
  tried: number;
  solved: number;
  acceptance_rate: number | null;
  rating_avg: number | null;
  rating_count: number;
}

export default function ProblemStatsPanel({ problemId }: { problemId: string }): ReactNode {
  const { t } = useTranslation();
  const auth = useAuth();
  const [stats, setStats] = useState<ProblemStats | null>(null);
  const [yourRating, setYourRating] = useState<number | null>(null);
  const [ratingBusy, setRatingBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ProblemService.getStatistics(problemId)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        // Stats are supplementary — a failure leaves the panel hidden.
      });
    return () => {
      cancelled = true;
    };
  }, [problemId]);

  if (!stats) return null;

  const vote = async (value: 1 | 2 | 3) => {
    setRatingBusy(true);
    try {
      const result = await ProblemService.rate(problemId, value);
      setYourRating(result.your_rating);
    } catch {
      // Vote failures are silent — the widget simply stays at its last state.
    } finally {
      setRatingBusy(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        gap: '1.25rem',
        flexWrap: 'wrap',
        alignItems: 'center',
        padding: '0.75rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        marginBottom: '1.25rem',
        fontSize: '0.8rem',
      }}
    >
      <span>
        <strong style={{ color: 'var(--foreground)' }}>{stats.tried}</strong>{' '}
        <span style={{ color: 'var(--muted)' }}>{t('stat_tried', 'tried')}</span>
      </span>
      <span>
        <strong style={{ color: 'var(--success)' }}>{stats.solved}</strong>{' '}
        <span style={{ color: 'var(--muted)' }}>{t('stat_solved', 'solved')}</span>
      </span>
      {stats.acceptance_rate != null && (
        <span>
          <strong style={{ color: 'var(--accent)' }}>
            {(stats.acceptance_rate * 100).toFixed(0)}%
          </strong>{' '}
          <span style={{ color: 'var(--muted)' }}>{t('stat_acceptance', 'AC rate')}</span>
        </span>
      )}
      {stats.rating_count > 0 && stats.rating_avg != null && (
        <span>
          <strong style={{ color: 'var(--warn)' }}>{stats.rating_avg.toFixed(1)}</strong>{' '}
          <span style={{ color: 'var(--muted)' }}>
            {t('stat_satisfaction', 'rating ({{n}} votes)', { n: stats.rating_count })}
          </span>
        </span>
      )}
      {auth.isAuthenticated && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' }}>
          <span style={{ color: 'var(--muted)', marginRight: '2px' }}>
            {t('rate_problem_label', 'Rate:')}
          </span>
          {([1, 2, 3] as const).map((value) => (
            <button
              key={value}
              type="button"
              disabled={ratingBusy}
              aria-pressed={yourRating === value}
              aria-label={t('rate_problem_aria', 'Rate this problem {{value}} of 3', { value })}
              onClick={() => vote(value)}
              className="btn"
              style={{
                padding: '2px 8px',
                fontSize: '0.7rem',
                minHeight: '26px',
                ...(yourRating === value
                  ? {
                      color: palette.warn,
                      borderColor: hexAlpha(palette.warn, 0.4),
                      background: hexAlpha(palette.warn, 0.08),
                    }
                  : {}),
              }}
            >
              {value === 1 ? '😕' : value === 2 ? '🙂' : '🤩'}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
