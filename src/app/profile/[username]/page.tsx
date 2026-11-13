'use client';

// RAT-1 (competitive roadmap Wave B): the public per-user rating profile —
// the "profile rating graph + leaderboard column" pair of the ratings
// design. The ladder and contest standings link their UserChips here
// (`/profile/{username}`); the page renders the Glicko history returned by
// the existing public endpoint `GET /api/v1/ratings/ratings/users/{u}/`:
// a band-colored handle header, an SVG rating-over-contests chart and the
// per-contest history table (rank, rating, Δ). Unrated users get the
// honest empty state — no fabricated curve.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { RatingService } from '@/services/ApiService';
import UserChip from '@/components/common/UserChip';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';
import { UserRatingHistory } from '@/types/api';
import { palette, hexAlpha } from '@/theme/tokens';

/** Chart geometry — one viewBox, scales with its container. */
const CHART_W = 720;
const CHART_H = 240;
const CHART_PAD = 28;

function LocalizedContestTitle({ title }: { title: Record<string, string> | null }) {
  const { i18n } = useTranslation();
  if (!title) return <>—</>;
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  return <>{title[lang] ?? title.en ?? title.ro ?? ''}</>;
}

/** Pure scale-and-draw for the display-rating polyline (exported for tests). */
export function chartPoints(
  values: number[],
): { points: string; area: string; min: number; max: number } | null {
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A single point (or a flat series) still needs a drawable span.
  const span = max - min || Math.max(1, max * 0.05);
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const innerW = CHART_W - CHART_PAD * 2;
  const innerH = CHART_H - CHART_PAD * 2;
  const xy = values.map((v, i) => {
    const x =
      values.length === 1 ? CHART_PAD + innerW / 2 : CHART_PAD + (i / (values.length - 1)) * innerW;
    const y = CHART_PAD + innerH - ((v - lo) / (hi - lo)) * innerH;
    return [x, y] as const;
  });
  const points = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${CHART_PAD},${CHART_H - CHART_PAD} ${points} ${
    xy[xy.length - 1][0]
  },${CHART_H - CHART_PAD}`;
  return { points, area, min, max };
}

export default function PublicRatingProfilePage() {
  const { t } = useTranslation();
  const params = useParams<{ username: string }>();
  const username = Array.isArray(params?.username) ? params.username[0] : params?.username || '';
  const [data, setData] = useState<UserRatingHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await RatingService.getRatingHistory(username));
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : t('rating_profile_load_error', 'Failed to load the rating profile.'),
      );
    } finally {
      setLoading(false);
    }
  }, [username, t]);

  useEffect(() => {
    if (username) load();
  }, [load, username]);

  const chart = useMemo(
    () => chartPoints((data?.history ?? []).map((h) => h.display_rating)),
    [data],
  );

  const band = data?.rating.band;

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('rating_profile_title', 'Rating profile')}
        subtitle={t('rating_profile_subtitle', 'Glicko contest rating history.')}
      />

      {loading && (
        <p data-testid="rating-profile-loading" style={{ color: palette.muted }}>
          {t('loading', 'Loading…')}
        </p>
      )}

      {!loading && error && (
        <div data-testid="rating-profile-error">
          <EmptyState
            title={t('rating_profile_load_error', 'Failed to load the rating profile.')}
            description={error}
            action={
              <button
                type="button"
                onClick={load}
                className="text-link"
                style={{
                  background: 'none',
                  border: 'none',
                  color: palette.accent,
                  cursor: 'pointer',
                  padding: 0,
                  font: 'inherit',
                }}
              >
                {t('retry', 'Retry')}
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && data && (
        <>
          <div
            data-testid="rating-profile-header"
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 16,
              flexWrap: 'wrap',
              marginBottom: 16,
            }}
          >
            {data.rating.rated ? (
              <UserChip username={data.username} rating={data.rating.rating ?? 0} bold />
            ) : (
              <strong style={{ fontSize: '1.1rem' }}>{data.username}</strong>
            )}
            {data.rating.rated ? (
              <span style={{ color: palette.muted }} data-testid="rating-profile-summary">
                {data.rating.rating} ± {Math.round(data.rating.rd ?? 0)} · {band?.name_en ?? ''} ·{' '}
                {data.rating.contests_count} {t('rating_profile_contests', 'contests')}
              </span>
            ) : (
              <span style={{ color: palette.muted }}>
                {t('rating_profile_not_rated', 'Not rated yet')}
              </span>
            )}
          </div>

          {chart ? (
            <figure
              style={{
                margin: '0 0 24px',
                border: `1px solid ${palette.border}`,
                borderRadius: 12,
                padding: 12,
              }}
              data-testid="rating-profile-chart"
            >
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                role="img"
                aria-label={t('rating_profile_chart_label', 'Rating over contests')}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              >
                <title>
                  {`${t('rating_profile_chart_label', 'Rating over contests')}: ${chart.min}–${chart.max}`}
                </title>
                {/* gridlines at the min/max of the series */}
                {[0, 1].map((g) => {
                  const y = CHART_PAD + (CHART_H - CHART_PAD * 2) * g;
                  return (
                    <line
                      key={g}
                      x1={CHART_PAD}
                      x2={CHART_W - CHART_PAD}
                      y1={y}
                      y2={y}
                      stroke={palette.border}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                  );
                })}
                <polygon points={chart.area} fill={hexAlpha(palette.accent, 0.12)} />
                <polyline
                  data-testid="rating-profile-line"
                  points={chart.points}
                  fill="none"
                  stroke={band?.color ?? palette.accent}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {chart.points
                  .split(' ')
                  .map((pair) => pair.split(',').map(Number))
                  .map(([cx, cy], i) => (
                    <circle key={i} cx={cx} cy={cy} r={3.5} fill={band?.color ?? palette.accent} />
                  ))}
              </svg>
              <figcaption
                style={{
                  color: palette.muted,
                  fontSize: '0.8rem',
                  marginTop: 6,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>{chart.min}</span>
                <span>{t('rating_profile_chart_label', 'Rating over contests')}</span>
                <span>{chart.max}</span>
              </figcaption>
            </figure>
          ) : (
            <div data-testid="rating-profile-empty">
              <EmptyState
                title={t('rating_profile_empty', 'No rated contests yet')}
                description={t(
                  'rating_profile_empty_hint',
                  'Finish a rated contest to start the curve.',
                )}
              />
            </div>
          )}

          {data.history.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.9rem',
                  minWidth: 560,
                }}
                data-testid="rating-profile-history"
              >
                <thead>
                  <tr style={{ textAlign: 'left', color: palette.muted }}>
                    <th style={{ padding: 8 }}>{t('rating_profile_contest', 'Contest')}</th>
                    <th style={{ padding: 8 }}>{t('rating_profile_rank', 'Rank')}</th>
                    <th style={{ padding: 8 }}>{t('rating_profile_rating', 'Rating')}</th>
                    <th style={{ padding: 8 }}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {data.history.map((h) => (
                    <tr
                      key={h.contest}
                      style={{ borderTop: `1px solid ${palette.border}` }}
                      data-testid={`rating-history-row-${h.contest}`}
                    >
                      <td style={{ padding: 8 }}>
                        <Link
                          href={`/contests/${h.contest}`}
                          style={{
                            color: palette.accent,
                            textDecoration: 'none',
                          }}
                        >
                          <LocalizedContestTitle title={h.contest_title} />
                        </Link>
                      </td>
                      <td style={{ padding: 8 }}>#{h.rank}</td>
                      <td style={{ padding: 8, fontWeight: 700 }}>{h.display_rating}</td>
                      <td
                        style={{
                          padding: 8,
                          color: h.delta >= 0 ? palette.success : palette.danger,
                          fontWeight: 700,
                        }}
                      >
                        {h.delta >= 0 ? `+${h.delta}` : h.delta}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
