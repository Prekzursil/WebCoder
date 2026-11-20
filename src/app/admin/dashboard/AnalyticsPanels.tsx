'use client';

// [Wave G items 105/110/111/112] The analytics tabs on the admin
// dashboard: org (school) segments, the activation funnel, search
// analytics (top + zero-result queries) and the season reports. One
// client island fetching /api/v1/analytics/* — ADMIN only by route.

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiFetch } from '@/services/ApiService';

interface FunnelStep {
  key: string;
  count: number;
  rate: number | null;
  step_rate?: number | null;
}

interface OrgRow {
  school: string;
  county: string;
  members: number;
  weekly_active_solvers: number;
  total_solves: number;
  submissions_30d: number;
}

type Tab = 'funnel' | 'org' | 'search' | 'season';

export default function AnalyticsPanels(): ReactNode {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('funnel');
  const [funnel, setFunnel] = useState<FunnelStep[] | null>(null);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [orgQuery, setOrgQuery] = useState('');
  const [orgError, setOrgError] = useState<string | null>(null);
  const [searchStats, setSearchStats] = useState<{
    total_searches: number;
    top_queries: { query: string; n: number }[];
    zero_result_queries: { query: string; n: number }[];
  } | null>(null);
  const [seasons, setSeasons] = useState<
    { season: string; markdown?: string; generated_at?: string }[]
  >([]);
  const [seasonDraft, setSeasonDraft] = useState('2026Q4');
  const [seasonBody, setSeasonBody] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadFunnel = useCallback(() => {
    apiFetch<{ steps: FunnelStep[] }>('/analytics/funnel/')
      .then((data) => setFunnel(data.steps))
      .catch(() => setFunnel(null));
  }, []);

  const loadSearch = useCallback(() => {
    apiFetch<{
      total_searches: number;
      top_queries: { query: string; n: number }[];
      zero_result_queries: { query: string; n: number }[];
    }>('/analytics/search/')
      .then(setSearchStats)
      .catch(() => setSearchStats(null));
  }, []);

  const loadSeasons = useCallback(() => {
    apiFetch<{ season: string; generated_at: string }[]>('/analytics/season-reports/')
      .then(setSeasons)
      .catch(() => setSeasons([]));
  }, []);

  useEffect(() => {
    loadFunnel();
    loadSearch();
    loadSeasons();
  }, [loadFunnel, loadSearch, loadSeasons]);

  const lookupOrg = async () => {
    const name = orgQuery.trim();
    if (!name) return;
    setBusy(true);
    setOrgError(null);
    try {
      const data = await apiFetch<OrgRow>(`/analytics/org/?school=${encodeURIComponent(name)}`);
      setOrg(data);
    } catch {
      setOrg(null);
      setOrgError(t('org_lookup_failed', 'No segment found for that school.'));
    } finally {
      setBusy(false);
    }
  };

  const generateSeason = async () => {
    const season = seasonDraft.trim();
    if (!/^\d{4}Q[1-4]$/.test(season)) {
      setOrgError(null);
      setSeasonBody(t('season_bad_format', 'Use the 2026Q4 shape.'));
      return;
    }
    setBusy(true);
    try {
      const data = await apiFetch<{ season: string; markdown: string }>(
        '/analytics/season-reports/',
        { method: 'POST', body: JSON.stringify({ season }) },
      );
      setSeasonBody(data.markdown);
      loadSeasons();
    } catch {
      setSeasonBody(t('season_failed', 'Could not generate the report.'));
    } finally {
      setBusy(false);
    }
  };

  const showSeason = async (season: string) => {
    try {
      const data = await apiFetch<{ markdown: string }>(
        `/analytics/season-reports/?season=${season}`,
      );
      setSeasonBody(data.markdown);
    } catch {
      setSeasonBody(null);
    }
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'funnel', label: t('analytics_tab_funnel', 'Funnel') },
    { id: 'org', label: t('analytics_tab_org', 'Orgs') },
    { id: 'search', label: t('analytics_tab_search', 'Search') },
    { id: 'season', label: t('analytics_tab_season', 'Seasons') },
  ];

  return (
    <div className="card" style={{ marginTop: '1.5rem' }} data-testid="analytics-panels">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`chip ${tab === id ? 'nav-link--active' : ''}`}
            onClick={() => setTab(id)}
            data-testid={`analytics-tab-${id}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'funnel' && (
        <div data-testid="analytics-funnel">
          {!funnel ? (
            <p style={{ color: 'var(--muted)' }}>{t('analytics_empty', 'No data yet.')}</p>
          ) : (
            funnel.map((step) => (
              <div key={step.key} style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--body)' }}>
                  {step.key} — {step.count}
                  {step.rate != null && ` (${Math.round(step.rate * 100)}%)`}
                </div>
                <div
                  role="progressbar"
                  aria-label={step.key}
                  aria-valuenow={Math.round((step.rate ?? 0) * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  style={{
                    height: 8,
                    borderRadius: 4,
                    background: 'var(--surface-2)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.round((step.rate ?? 0) * 100)}%`,
                      height: '100%',
                      background: 'var(--accent)',
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'org' && (
        <div data-testid="analytics-org">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
            <input
              value={orgQuery}
              onChange={(e) => setOrgQuery(e.target.value)}
              placeholder={t('org_school_placeholder', 'School name…')}
              aria-label={t('org_school_placeholder', 'School name…')}
              data-testid="org-school-input"
            />
            <button type="button" className="btn" onClick={lookupOrg} disabled={busy}>
              {t('org_lookup', 'Look up')}
            </button>
          </div>
          {orgError && (
            <p role="alert" style={{ color: 'var(--danger)' }}>
              {orgError}
            </p>
          )}
          {org && (
            <table>
              <tbody>
                <tr>
                  <th>{t('org_members', 'Members')}</th>
                  <td>{org.members}</td>
                </tr>
                <tr>
                  <th>{t('org_weekly', 'Weekly active solvers')}</th>
                  <td>{org.weekly_active_solvers}</td>
                </tr>
                <tr>
                  <th>{t('org_solves', 'Total solves')}</th>
                  <td>{org.total_solves}</td>
                </tr>
                <tr>
                  <th>{t('org_subs30', 'Submissions (30d)')}</th>
                  <td>{org.submissions_30d}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'search' && (
        <div data-testid="analytics-search">
          {!searchStats ? (
            <p style={{ color: 'var(--muted)' }}>{t('analytics_empty', 'No data yet.')}</p>
          ) : (
            <>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {t('search_total', '{{n}} searches logged', { n: searchStats.total_searches })}
              </p>
              <strong style={{ fontSize: '0.8rem' }}>{t('search_top', 'Top queries')}</strong>
              <ul style={{ fontSize: '0.8rem', color: 'var(--body)' }}>
                {searchStats.top_queries.map((row) => (
                  <li key={row.query}>
                    {row.query} × {row.n}
                  </li>
                ))}
              </ul>
              <strong style={{ fontSize: '0.8rem' }}>
                {t('search_zero', 'Zero-result queries (content gaps)')}
              </strong>
              <ul style={{ fontSize: '0.8rem', color: 'var(--body)' }}>
                {searchStats.zero_result_queries.map((row) => (
                  <li key={row.query}>
                    {row.query} × {row.n}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {tab === 'season' && (
        <div data-testid="analytics-season">
          <div style={{ display: 'flex', gap: '8px', marginBottom: '0.75rem' }}>
            <input
              value={seasonDraft}
              onChange={(e) => setSeasonDraft(e.target.value)}
              aria-label="Season"
              data-testid="season-input"
              style={{ maxWidth: 120 }}
            />
            <button
              type="button"
              className="btn btn--primary"
              onClick={generateSeason}
              disabled={busy}
            >
              {t('season_generate', 'Generate')}
            </button>
          </div>
          {seasons.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              {seasons.map((row) => (
                <button
                  key={row.season}
                  type="button"
                  className="chip"
                  onClick={() => showSeason(row.season)}
                >
                  {row.season}
                </button>
              ))}
            </div>
          )}
          {seasonBody && (
            <pre
              data-testid="season-body"
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.8rem',
                background: 'var(--surface-2)',
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--foreground)',
              }}
            >
              {seasonBody}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
