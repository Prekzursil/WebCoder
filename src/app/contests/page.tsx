'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ContestService } from '@/services/ApiService';
import { Contest } from '@/types/api';
import { API_BASE_URL } from '@/lib/api-config';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

type StateFilter = '' | 'UPCOMING' | 'RUNNING' | 'FINISHED';

/** CON-10: countdown to the next start, ticking once per second. */
function useCountdown(target: string | null): string | null {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!target) return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [target]);
    if (!target) return null;
    const diff = new Date(target).getTime() - now;
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    const s = Math.floor((diff % 60_000) / 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function LocalizedTitle({ title }: { title: Contest['title_i18n'] }) {
    // Matches the site convention: prefer current document language.
    const { i18n } = useTranslation();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';
    return <>{title[lang] ?? title.en ?? title.ro ?? ''}</>;
}

export default function ContestsPage() {
    const { t } = useTranslation();
    const [contests, setContests] = useState<Contest[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [nextPage, setNextPage] = useState<number | null>(1);
    const [stateFilter, setStateFilter] = useState<StateFilter>('');

    const nextStart =
        contests
            .filter((c) => c.state === 'UPCOMING')
            .map((c) => c.start_at)
            .sort()[0] ?? null;
    const countdown = useCountdown(nextStart);

    const load = useCallback(
        async (page: number, state: StateFilter) => {
            const append = page > 1;
            if (append) setLoadingMore(true);
            else setLoading(true);
            setError(null);
            try {
                const response = await ContestService.getContests(state ? { state } : {}, { page });
                setContests((prev) =>
                    append ? [...prev, ...response.results] : response.results
                );
                setNextPage(response.next ? page + 1 : null);
            } catch (err) {
                setError(
                    err instanceof Error && err.message
                        ? err.message
                        : t('contests_load_error', 'Failed to load contests.')
                );
            } finally {
                if (append) setLoadingMore(false);
                else setLoading(false);
            }
        },
        [t]
    );

    useEffect(() => {
        load(1, stateFilter);
    }, [load, stateFilter]);

    const stateBadge = (state: Contest['state']) =>
        state === 'RUNNING'
            ? { label: t('contest_state_running', 'Running'), color: palette.success }
            : state === 'UPCOMING'
                ? { label: t('contest_state_upcoming', 'Upcoming'), color: palette.accent }
                : { label: t('contest_state_finished', 'Finished'), color: palette.muted };

    const fmt = (iso: string) =>
        new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

    return (
        <main style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={t('contests_title', 'Contests')}
                subtitle={t(
                    'contests_subtitle',
                    'Timed contests with live standings, ratings and freeze drama.'
                )}
            />
            <div
                style={{
                    display: 'flex',
                    gap: 8,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: 16,
                }}
            >
                {(['', 'UPCOMING', 'RUNNING', 'FINISHED'] as StateFilter[]).map((value) => (
                    <button
                        key={value || 'all'}
                        type="button"
                        onClick={() => setStateFilter(value)}
                        aria-pressed={stateFilter === value}
                        style={{
                            padding: '6px 14px',
                            borderRadius: 999,
                            border: `1px solid ${stateFilter === value ? palette.accent : palette.border}`,
                            background:
                                stateFilter === value ? hexAlpha(palette.accent, 0.15) : 'transparent',
                            color: stateFilter === value ? palette.accent : palette.foreground,
                            cursor: 'pointer',
                            fontWeight: 600,
                        }}
                    >
                        {value === ''
                            ? t('contests_filter_all', 'All')
                            : value === 'UPCOMING'
                                ? t('contest_state_upcoming', 'Upcoming')
                                : value === 'RUNNING'
                                    ? t('contest_state_running', 'Running')
                                    : t('contest_state_finished', 'Finished')}
                    </button>
                ))}
                <a
                    href={`${API_BASE_URL}/api/v1/contests/calendar.ics`}
                    style={{ marginLeft: 'auto', color: palette.accent, fontWeight: 600 }}
                    data-testid="contests-ics-link"
                >
                    {t('contests_ics', '📅 Calendar (.ics)')}
                </a>
            </div>

            {countdown && (
                <p
                    data-testid="next-contest-countdown"
                    style={{ color: palette.accent, fontWeight: 700, marginBottom: 12 }}
                >
                    {t('contests_starts_in', 'Next contest starts in')} {countdown}
                </p>
            )}

            {loading ? (
                <p aria-busy="true">{t('contests_loading', 'Loading contests…')}</p>
            ) : error ? (
                <div role="alert" style={{ color: palette.danger, marginBottom: 12 }}>
                    {error}{' '}
                    <button type="button" onClick={() => load(1, stateFilter)}>
                        {t('retry', 'Retry')}
                    </button>
                </div>
            ) : contests.length === 0 ? (
                <EmptyState
                    title={t('contests_empty', 'No contests yet')}
                    description={t(
                        'contests_empty_message',
                        'When a contest is scheduled it will appear here with a countdown.'
                    )}
                />
            ) : (
                <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
                    {contests.map((contest) => {
                        const badge = stateBadge(contest.state);
                        return (
                            <li
                                key={contest.id}
                                style={{
                                    border: `1px solid ${palette.border}`,
                                    borderRadius: 12,
                                    padding: '14px 16px',
                                    display: 'flex',
                                    gap: 12,
                                    alignItems: 'baseline',
                                    flexWrap: 'wrap',
                                }}
                            >
                                <Link
                                    href={`/contests/${contest.id}`}
                                    style={{ fontWeight: 700, fontSize: 17, color: palette.foreground }}
                                >
                                    <LocalizedTitle title={contest.title_i18n} />
                                </Link>
                                <span
                                    style={{ color: badge.color, fontWeight: 700, fontSize: 13 }}
                                    data-testid={`contest-state-${contest.id}`}
                                >
                                    ● {badge.label}
                                </span>
                                {contest.is_rated && (
                                    <span style={{ color: palette.warn, fontWeight: 700, fontSize: 13 }}>
                                        ★ {t('contest_rated', 'Rated')}
                                    </span>
                                )}
                                {contest.is_window && (
                                    <span style={{ color: palette.violet, fontSize: 13 }}>
                                        ⏱ {t('contest_windowed', 'Windowed')}
                                    </span>
                                )}
                                <span style={{ color: palette.muted, fontSize: 13 }}>
                                    {t('contest_problems_count', '{{count}} problems', {
                                        count: contest.problem_count,
                                    })}
                                    {' · '}
                                    {t('contest_participants_count', '{{count}} participants', {
                                        count: contest.participant_count,
                                    })}
                                </span>
                                <span
                                    style={{ marginLeft: 'auto', color: palette.muted, fontSize: 13 }}
                                >
                                    {fmt(contest.start_at)} → {fmt(contest.end_at)}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {nextPage && !loading && (
                <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => load(nextPage, stateFilter)}
                    style={{ marginTop: 16, padding: '8px 18px' }}
                >
                    {loadingMore ? t('loading_more', 'Loading…') : t('load_more', 'Load more')}
                </button>
            )}
        </main>
    );
}
