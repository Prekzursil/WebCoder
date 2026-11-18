'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ProblemService } from '@/services/ApiService';
import { useAuth } from '@/context/AuthContext';
import { palette } from '@/theme/tokens';
import PageHeader from '@/components/common/PageHeader';

/**
 * Items 131/132 — the author content-ops dashboard: the analytics
 * derivation (funnel, AC rate, difficulty mix, editorial coverage, bounty
 * activity) and the scheduled-drop calendar.
 */

interface Analytics {
  problems_total: number;
  problems_approved: number;
  by_difficulty: Record<string, number>;
  submissions_total: number;
  acceptance_rate: number | null;
  unique_solvers: number;
  editorial_coverage: number;
  open_test_bounties: number;
}

interface DropRow {
  problem_id: number;
  title: string;
  publish_at: string;
}

export default function AuthorAnalyticsPage() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [profile, setProfile] = useState<Analytics | null>(null);
  const [drops, setDrops] = useState<DropRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isAuthor = ['PROBLEM_CREATOR', 'PROBLEM_VERIFIER', 'TEACHER', 'ADMIN'].includes(
    auth.user?.role ?? '',
  );

  const load = useCallback(async () => {
    try {
      setError(null);
      const [analytics, dropRows] = await Promise.all([
        ProblemService.getAuthorAnalytics(),
        ProblemService.getDrops().catch(() => null),
      ]);
      setProfile(analytics);
      setDrops(dropRows ? dropRows.results : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    }
  }, []);

  useEffect(() => {
    if (isAuthor) load();
  }, [isAuthor, load]);

  if (!isAuthor) {
    return (
      <main style={{ maxWidth: 800, margin: '0 auto', padding: '24px 16px' }}>
        <PageHeader title={t('analytics_title', 'Author analytics')} />
        <p style={{ color: palette.muted }}>
          {t('tools_creators_only', 'These tools are for problem creators and verifiers.')}
        </p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <PageHeader
        title={t('analytics_title', 'Author analytics')}
        subtitle={t(
          'analytics_subtitle',
          'Your authoring funnel: problems, submissions, coverage and bounties.',
        )}
      />
      {error && (
        <p role="alert" style={{ color: palette.danger }}>
          {error}
        </p>
      )}
      {profile === null ? (
        <p aria-busy="true">{t('loading', 'Loading…')}</p>
      ) : (
        <div
          data-testid="analytics-summary"
          style={{
            border: `1px solid ${palette.border}`,
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <strong>{profile.problems_approved}</strong> {t('analytics_approved', 'approved')} /{' '}
          {profile.problems_total} {t('analytics_total', 'authored')} ·{' '}
          <strong>{profile.submissions_total}</strong> {t('analytics_submissions', 'submissions')} ·{' '}
          {profile.acceptance_rate !== null
            ? `${profile.acceptance_rate}% ${t('analytics_acceptance', 'AC')}`
            : t('analytics_no_submissions', 'no submissions yet')}{' '}
          · <strong>{profile.unique_solvers}</strong> {t('analytics_solvers', 'unique solvers')} ·{' '}
          <strong>{profile.editorial_coverage}</strong>{' '}
          {t('analytics_editorials', 'with editorial')} ·{' '}
          <strong>{profile.open_test_bounties}</strong> {t('analytics_bounties', 'open bounties')}
        </div>
      )}
      {profile && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {Object.entries(profile.by_difficulty).map(([level, count]) => (
            <span
              key={level}
              data-testid={`analytics-difficulty-${level}`}
              style={{
                border: `1px solid ${palette.border}`,
                borderRadius: 999,
                padding: '2px 10px',
                fontSize: '0.8rem',
                color: palette.muted,
              }}
            >
              {level}: {count}
            </span>
          ))}
        </div>
      )}

      <section data-testid="drops-calendar">
        <h3>{t('drops_title', 'Scheduled drops')}</h3>
        {drops === null ? (
          <p aria-busy="true">{t('loading', 'Loading…')}</p>
        ) : drops.length === 0 ? (
          <p style={{ color: palette.muted }}>
            {t('drops_empty', 'Nothing scheduled — approved problems drop immediately.')}
          </p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {drops.map((row) => (
              <li key={row.problem_id} data-testid={`drop-row-${row.problem_id}`}>
                {row.title} — {new Date(row.publish_at).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
