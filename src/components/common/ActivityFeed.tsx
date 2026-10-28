'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { FeedRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * COM-3 — the live activity feed: recent public verdicts (user, problem,
 * language, verdict — code never leaves the judge). One fetch per mount,
 * the "site heartbeat" the roadmap wants on the home page.
 */
export default function ActivityFeed() {
    const { t, i18n } = useTranslation();
    const lang = i18n.language === 'ro' ? 'ro' : 'en';
    const [rows, setRows] = useState<FeedRow[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        CommunityService.getFeed()
            .then((data) => {
                if (!cancelled) setRows(data.results);
            })
            .catch(() => setRows([]));
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <section aria-label={t('feed_title', 'Live activity')} data-testid="activity-feed">
            <h3>{t('feed_title', 'Live activity')}</h3>
            {rows === null ? (
                <p aria-busy="true" style={{ color: palette.muted }}>
                    {t('feed_loading', 'Loading recent verdicts…')}
                </p>
            ) : rows.length === 0 ? (
                <p style={{ color: palette.muted }}>
                    {t('feed_empty', 'No public activity yet.')}
                </p>
            ) : (
                <ul style={{ listStyle: 'none', padding: 0 }}>
                    {rows.slice(0, 8).map((row) => (
                        <li
                            key={row.id}
                            data-testid={`feed-row-${row.id}`}
                            style={{
                                borderTop: `1px solid ${palette.border}`,
                                padding: '6px 0',
                                fontSize: '0.9rem',
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                            }}
                        >
                            <span style={{ fontWeight: 600 }}>{row.user}</span>
                            <Link
                                href={`/problems/${row.problem.id}`}
                                style={{ color: palette.accent }}
                            >
                                {String(
                                    row.problem.title_i18n[lang] ??
                                        row.problem.title_i18n.en ??
                                        ''
                                )}
                            </Link>
                            <span style={{ color: palette.muted }}>{row.language}</span>
                            <span
                                style={{
                                    color:
                                        row.verdict === 'AC' ? palette.success : palette.warn,
                                }}
                            >
                                {row.verdict}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
