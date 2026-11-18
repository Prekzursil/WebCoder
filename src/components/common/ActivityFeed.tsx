'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { FeedRow } from '@/types/api';
import { useAuth } from '@/context/AuthContext';
import { palette, hexAlpha } from '@/theme/tokens';

/**
 * COM-3 — the live activity feed: recent public verdicts (user, problem,
 * language, verdict — code never leaves the judge). Item 65 adds the
 * "Following" filter: only the people the caller follows.
 */
export default function ActivityFeed() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const lang = i18n.language === 'ro' ? 'ro' : 'en';
  const [rows, setRows] = useState<FeedRow[] | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    CommunityService.getFeed(1, following)
      .then((data) => {
        if (!cancelled) setRows(data.results);
      })
      .catch(() => setRows([]));
    return () => {
      cancelled = true;
    };
  }, [following]);

  return (
    <section aria-label={t('feed_title', 'Live activity')} data-testid="activity-feed">
      <h3 style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
        {t('feed_title', 'Live activity')}
        {auth.isAuthenticated && (
          <button
            type="button"
            onClick={() => setFollowing((value) => !value)}
            aria-pressed={following}
            data-testid="feed-following-toggle"
            style={{
              fontSize: '0.75rem',
              padding: '2px 10px',
              borderRadius: 999,
              cursor: 'pointer',
              border: `1px solid ${following ? palette.accent : palette.border}`,
              background: following ? hexAlpha(palette.accent, 0.15) : 'transparent',
              color: following ? palette.accent : palette.muted,
            }}
          >
            {t('feed_following', 'Following')}
          </button>
        )}
      </h3>
      {rows === null ? (
        <p aria-busy="true" style={{ color: palette.muted }}>
          {t('feed_loading', 'Loading recent verdicts…')}
        </p>
      ) : rows.length === 0 ? (
        <p style={{ color: palette.muted }}>
          {following
            ? t('feed_following_empty', 'Nothing from the people you follow yet.')
            : t('feed_empty', 'No public activity yet.')}
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
              <Link href={`/problems/${row.problem.id}`} style={{ color: palette.accent }}>
                {String(row.problem.title_i18n[lang] ?? row.problem.title_i18n.en ?? '')}
              </Link>
              <span style={{ color: palette.muted }}>{row.language}</span>
              <span
                style={{
                  color: row.verdict === 'AC' ? palette.success : palette.warn,
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
