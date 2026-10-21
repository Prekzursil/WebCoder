'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LeaderboardService } from '@/services/ApiService';
import { MyLeaderboardEntry } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

// Leaderboard wired to the real standings endpoint (backend leaderboard app,
// PR #186): GET /api/v1/leaderboard/ is public, page-number paginated (50
// rows/page) and window-ranked server-side; GET /api/v1/leaderboard/me/ adds
// the caller's own card when authenticated. The old MOCK_LEADERBOARD lives on
// only as a fixture in page.test.tsx.
//
// success_rate arrives as a 0..1 fraction (4 dp) — the UI renders percent.
// Search/sort stay client-side over the loaded rows; "Load more" follows the
// envelope's `next` link. Any API failure keeps the page usable: error card +
// retry button.

interface Row {
  rank: number;
  username: string;
  total_points: number;
  solved_count: number;
  success_rate: number;
}

const badgeColors: { color: string; label: string }[] = [
  { color: palette.warn, label: '🥇' },
  { color: palette.muted, label: '🥈' },
  // Bronze has no design token — allowlisted in design-tokens.gate.test.ts.
  { color: '#b47c3c', label: '🥉' },
];

type SortKey = 'rank' | 'total_points' | 'solved_count' | 'success_rate';

const percent = (rate: number): number => Math.round(rate * 1000) / 10;

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [nextCursorPage, setNextCursorPage] = useState<number | null>(1);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myEntry, setMyEntry] = useState<MyLeaderboardEntry | null>(null);
  const [myEntryError, setMyEntryError] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await LeaderboardService.getLeaderboard({ page: 1 });
      setRows(response.results);
      setTotalCount(response.count);
      setNextCursorPage(response.next ? 2 : null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('leaderboard_load_error', 'Failed to load leaderboard.'));
    } finally {
      setLoading(false);
    }
    // t is stable between language switches; listed so the error message
    // re-localizes on locale change.
  }, [t]);

  useEffect(() => {
    loadFirstPage();
  }, [loadFirstPage]);

  useEffect(() => {
    // Own-rank card is best-effort: 401 (anonymous) or any failure just
    // hides it — the public standings remain fully usable.
    if (!auth.isAuthenticated) {
      setMyEntry(null);
      setMyEntryError(false);
      return;
    }
    let cancelled = false;
    LeaderboardService.getMyEntry()
      .then((entry) => {
        if (!cancelled) {
          setMyEntry(entry);
          setMyEntryError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setMyEntryError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.isAuthenticated, auth.user]);

  const loadMore = async () => {
    if (nextCursorPage === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await LeaderboardService.getLeaderboard({ page: nextCursorPage });
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.username));
        return [...prev, ...response.results.filter((r) => !seen.has(r.username))];
      });
      setNextCursorPage(response.next ? nextCursorPage + 1 : null);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t('leaderboard_load_more_error', 'Failed to load more entries.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const filtered = rows
    .filter((e) => e.username.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return (a[sortKey] - b[sortKey]) * mul;
    });

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>↕</span>;
    return <span style={{ color: 'var(--accent)', marginLeft: 4 }}>{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  const podium = rows.slice(0, 3);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <PageHeader
        title={t('leaderboard_header', 'Leaderboard')}
        subtitle={t('leaderboard_subtitle', 'Top competitive programmers ranked by total score.')}
      />

      {/* Loading / error states keep the page usable when the API fails */}
      {loading ? (
        <div role="status" style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted)' }}>
          {t('leaderboard_loading', 'Loading leaderboard…')}
        </div>
      ) : error && rows.length === 0 ? (
        <div
          role="alert"
          style={{
            padding: '1.25rem 1.5rem',
            borderRadius: 'var(--radius-md)',
            background: hexAlpha(palette.danger, 0.08),
            border: `1px solid ${hexAlpha(palette.danger, 0.2)}`,
            color: 'var(--danger)',
            marginBottom: '1.5rem',
          }}
        >
          {t('could_not_load_leaderboard', 'Could not load leaderboard: ')}{error}
          <div style={{ marginTop: '0.75rem' }}>
            <button onClick={loadFirstPage} className="btn">
              {t('retry_button', 'Retry')}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Own-rank card (authenticated) — best-effort */}
          {auth.isAuthenticated && myEntry && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1.5rem',
                alignItems: 'center',
                background: hexAlpha(palette.accent, 0.06),
                border: '1px solid rgba(56,189,248,0.25)',
                borderRadius: 'var(--radius-lg)',
                padding: '1rem 1.5rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>
                <div className="micro-label" style={{ color: 'var(--muted)' }}>{t('leaderboard_your_rank', 'Your rank')}</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>#{myEntry.rank}</div>
              </div>
              <div>
                <div className="micro-label" style={{ color: 'var(--muted)' }}>{t('leaderboard_points', 'Points')}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: palette.warn }}>
                  {myEntry.total_points.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="micro-label" style={{ color: 'var(--muted)' }}>{t('leaderboard_solved', 'Solved')}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--success)' }}>{myEntry.solved_count}</div>
              </div>
              <div>
                <div className="micro-label" style={{ color: 'var(--muted)' }}>{t('leaderboard_submissions', 'Submissions')}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--foreground)' }}>
                  {myEntry.total_submissions}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                {t('leaderboard_success_rate', 'Success rate')} {percent(myEntry.success_rate)}%
              </div>
            </div>
          )}
          {auth.isAuthenticated && !myEntry && myEntryError && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.8rem', marginBottom: '1rem' }}>
              {t('leaderboard_rank_card_unavailable', 'Your rank card is unavailable right now.')}
            </p>
          )}

          {/* Top 3 podium cards */}
          {podium.length > 0 && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '1rem',
                marginBottom: '2rem',
              }}
            >
              {podium.map((entry, idx) => {
                const badge = badgeColors[idx] ?? badgeColors[2];
                return (
                  <div
                    key={entry.username}
                    style={{
                      background: 'var(--surface)',
                      border: `1px solid ${hexAlpha(badge.color, 0.19)}`,
                      borderRadius: '12px',
                      padding: '1.5rem',
                      textAlign: 'center',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: '3px',
                        background: `linear-gradient(90deg, transparent, ${badge.color}, transparent)`,
                      }}
                    />
                    <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{badge.label}</div>
                    <div
                      style={{
                        fontSize: '1rem',
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        marginBottom: '0.25rem',
                      }}
                    >
                      {entry.username}
                    </div>
                    <div
                      style={{
                        fontSize: '1.5rem',
                        fontWeight: 800,
                        color: badge.color,
                        marginBottom: '0.5rem',
                      }}
                    >
                      {entry.total_points.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{entry.solved_count}</span> {t('leaderboard_solved_short', 'solved')}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{percent(entry.success_rate)}%</span> {t('leaderboard_rate_short', 'rate')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Search bar */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              placeholder={t('leaderboard_search_placeholder', 'Search by username…')}
              aria-label={t('leaderboard_search_label', 'Search by username')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{
                width: '100%',
                maxWidth: '320px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--foreground)',
                padding: '8px 14px',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>

          {/* Table */}
          <div
            style={{
              background: 'var(--surface)',
              borderRadius: '12px',
              border: '1px solid var(--border)',
              overflow: 'hidden',
            }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {(
                    [
                      { key: 'rank', label: t('leaderboard_th_rank', 'Rank') },
                      { key: null, label: t('leaderboard_th_user', 'User') },
                      { key: 'total_points', label: t('leaderboard_th_score', 'Score') },
                      { key: 'solved_count', label: t('leaderboard_th_solved', 'Solved') },
                      { key: null, label: t('leaderboard_th_success_rate', 'Success Rate') },
                    ] as { key: SortKey | null; label: string }[]
                  ).map(({ key, label }) => (
                    <th
                      key={label}
                      onClick={key ? () => handleSort(key) : undefined}
                      aria-sort={key && sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      style={{
                        padding: '12px 20px',
                        textAlign: 'left',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.07em',
                        color: 'var(--muted)',
                        cursor: key ? 'pointer' : 'default',
                        userSelect: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {label}
                      {key && <SortIcon col={key} />}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      style={{
                        padding: '3rem',
                        textAlign: 'center',
                        color: 'var(--muted)',
                        fontSize: '0.9rem',
                      }}
                    >
                      {t('leaderboard_no_users', 'No users found.')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((entry) => {
                    const badge = badgeColors[entry.rank - 1] ?? null;
                    const rate = percent(entry.success_rate);
                    return (
                      <tr key={entry.username} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '14px 20px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              background: badge ? hexAlpha(badge.color, 0.09) : 'rgba(255,255,255,0.04)',
                              border: `1px solid ${badge ? hexAlpha(badge.color, 0.19) : 'rgba(255,255,255,0.06)'}`,
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: badge ? badge.color : 'var(--muted)',
                            }}
                          >
                            {entry.rank}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '50%',
                                background: `hsl(${(entry.username.charCodeAt(0) * 37) % 360}, 55%, 35%)`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#fff',
                                flexShrink: 0,
                              }}
                            >
                              {entry.username[0].toUpperCase()}
                            </div>
                            <span style={{ color: 'var(--foreground)', fontWeight: 500, fontSize: '0.9rem' }}>
                              {entry.username}
                            </span>
                            {badge && <span style={{ fontSize: '0.85rem' }}>{badge.label}</span>}
                          </div>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span style={{ color: palette.warn, fontWeight: 700, fontSize: '0.95rem' }}>
                            {entry.total_points.toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '2px 10px',
                              borderRadius: '999px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              color: 'var(--success)',
                              background: hexAlpha(palette.success, 0.1),
                              border: '1px solid rgba(74,222,128,0.2)',
                            }}
                          >
                            {entry.solved_count}
                          </span>
                        </td>
                        <td style={{ padding: '14px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div
                              style={{
                                flex: 1,
                                maxWidth: '80px',
                                height: '4px',
                                background: 'rgba(255,255,255,0.08)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  height: '100%',
                                  borderRadius: '2px',
                                  width: `${Math.min(100, rate)}%`,
                                  background:
                                    rate >= 70 ? palette.success : rate >= 50 ? palette.warn : palette.danger,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                              {rate}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Paged loading */}
          {nextCursorPage !== null && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <button onClick={loadMore} disabled={loadingMore} className="btn">
                {loadingMore ? t('loading_more', 'Loading…') : t('load_more_button', 'Load more')}
              </button>
            </div>
          )}
          {error && rows.length > 0 && (
            <p role="alert" style={{ marginTop: '0.75rem', color: 'var(--danger)', fontSize: '0.8rem', textAlign: 'center' }}>
              {t('could_not_load_more_entries', 'Could not load more entries: ')}{error}
            </p>
          )}
          {totalCount !== null && (
            <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              {t('leaderboard_showing_info', 'Showing {{shown}} of {{total}} ranked users.', { shown: rows.length, total: totalCount.toLocaleString() })}{' '}
              {t('leaderboard_ranking_note', 'Rankings based on accepted submissions over approved problems.')}
            </p>
          )}
        </>
      )}

      {rows.length === 0 && !loading && !error && (
        <EmptyState title={t('leaderboard_empty_title', 'No ranked users yet.')} description={t('leaderboard_empty_description', 'Solve an approved problem to appear on the leaderboard.')} />
      )}
    </div>
  );
}
