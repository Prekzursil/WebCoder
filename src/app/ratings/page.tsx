'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RatingService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import UserChip from '@/components/common/UserChip';
import { MyRating, RatingLadderRow } from '@/types/api';
import { palette, hexAlpha } from '@/theme/tokens';
import EmptyState from '@/components/common/EmptyState';
import PageHeader from '@/components/common/PageHeader';

/** RAT-1/3: the public Glicko ladder with color-band handles. */
export default function RatingsPage() {
    const { t } = useTranslation();
    const auth = useAuth();
    const [rows, setRows] = useState<RatingLadderRow[] | null>(null);
    const [mine, setMine] = useState<MyRating | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [nextPage, setNextPage] = useState<number | null>(1);

    const load = useCallback(
        async (page: number) => {
            const append = page > 1;
            if (append) setLoadingMore(true);
            try {
                const response = await RatingService.getLadder(page);
                setRows((prev) => (append && prev ? [...prev, ...response.results] : response.results));
                setNextPage(response.next ? page + 1 : null);
            } catch (err) {
                setError(
                    err instanceof Error && err.message
                        ? err.message
                        : t('ratings_load_error', 'Failed to load the ratings ladder.')
                );
            } finally {
                if (append) setLoadingMore(false);
            }
        },
        [t]
    );

    useEffect(() => {
        load(1);
    }, [load]);

    useEffect(() => {
        if (auth.isAuthenticated) {
            RatingService.getMyRating()
                .then(setMine)
                .catch(() => setMine(null)); // rated:false is a UI state, not an error
        } else {
            setMine(null);
        }
    }, [auth.isAuthenticated]);

    return (
        <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
            <PageHeader
                title={t('ratings_title', 'Ratings')}
                subtitle={t(
                    'ratings_subtitle',
                    'Glicko contest rating. Color bands follow the handle ladder.'
                )}
            />

            {mine && (
                <div
                    data-testid="my-rating-card"
                    style={{
                        border: `1px solid ${palette.border}`,
                        background: hexAlpha(palette.accent, 0.08),
                        borderRadius: 12,
                        padding: '12px 16px',
                        marginBottom: 16,
                        display: 'flex',
                        gap: 16,
                        alignItems: 'baseline',
                        flexWrap: 'wrap',
                    }}
                >
                    <strong>{t('ratings_my_rating', 'Your rating')}</strong>
                    {mine.rated && mine.rating !== null ? (
                        <>
                            <UserChip username={auth.user?.username ?? ''} rating={mine.rating} bold />
                            <span style={{ color: palette.muted }}>
                                {mine.band.name_en} · RD {mine.rd}
                            </span>
                        </>
                    ) : (
                        <span style={{ color: palette.muted }}>
                            {t('ratings_not_yet', 'Unrated — enter a rated contest to get a rating.')}
                        </span>
                    )}
                </div>
            )}

            {error && (
                <div role="alert" style={{ color: palette.danger, marginBottom: 12 }}>
                    {error}{' '}
                    <button type="button" onClick={() => load(1)}>
                        {t('retry', 'Retry')}
                    </button>
                </div>
            )}

            {rows === null ? (
                <p aria-busy="true">{t('ratings_loading', 'Loading ladder…')}</p>
            ) : rows.length === 0 ? (
                <EmptyState
                    title={t('ratings_empty', 'Nobody is rated yet')}
                    description={t(
                        'ratings_empty_message',
                        'The ladder fills as the first rated contests finalize.'
                    )}
                />
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ textAlign: 'left', color: palette.muted }}>
                            <th style={{ padding: 8 }}>#</th>
                            <th>{t('ratings_handle', 'Handle')}</th>
                            <th>{t('ratings_rating', 'Rating')}</th>
                            <th>{t('ratings_contests', 'Contests')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr
                                key={row.user.id}
                                style={{ borderTop: `1px solid ${palette.border}` }}
                                data-testid={`rating-row-${row.user.username}`}
                            >
                                <td style={{ padding: 8 }}>{index + 1}</td>
                                <td style={{ padding: 8 }}>
                                    <UserChip
                                        username={row.user.username}
                                        rating={row.rating}
                                        href={`/profile/${row.user.id}`}
                                    />
                                </td>
                                <td style={{ padding: 8, fontWeight: 700 }}>{row.rating}</td>
                                <td style={{ padding: 8, color: palette.muted }}>
                                    {row.contests_count}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {nextPage && rows && (
                <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() => load(nextPage)}
                    style={{ marginTop: 16, padding: '8px 18px' }}
                >
                    {loadingMore ? t('loading_more', 'Loading…') : t('load_more', 'Load more')}
                </button>
            )}
        </main>
    );
}
