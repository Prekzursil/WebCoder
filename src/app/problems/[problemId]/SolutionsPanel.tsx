'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommunityService } from '@/services/ApiService';
import { AuthContext } from '@/context/AuthContext';
import { SolutionRow } from '@/types/api';
import { palette } from '@/theme/tokens';

/**
 * COM-7 — post-solve solution browsing. Renders only when the backend
 * grants access (the viewer has their own AC on the problem); the 403
 * payload's reason becomes the locked-state hint. Every payload carries
 * the platform-display license note.
 *
 * [wave E item 11] The showcase axes: sort the pool by speed (the default
 * best-solutions board), by code length (shortest readable) or recency,
 * and filter by language — a code-style lesson either way.
 */
const SORTS = ['fastest', 'shortest', 'newest'] as const;

export default function SolutionsPanel({ problemId }: { problemId: number }) {
  const { t } = useTranslation();
  // Direct context read: provider-less test renders stay anonymous.
  const auth = React.useContext(AuthContext);
  const [rows, setRows] = useState<SolutionRow[] | null>(null);
  const [license, setLicense] = useState('');
  const [lockedReason, setLockedReason] = useState<string | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [sort, setSort] = useState<(typeof SORTS)[number]>('fastest');
  const [language, setLanguage] = useState('');

  useEffect(() => {
    if (!auth?.isAuthenticated) return;
    let cancelled = false;
    CommunityService.getSolutions(problemId, { sort, language: language || undefined })
      .then((data) => {
        if (cancelled) return;
        setRows(data.results);
        setLicense(data.license);
      })
      .catch((err) => {
        if (cancelled) return;
        setRows(null);
        setLockedReason(
          err instanceof Error && err.message
            ? err.message
            : t('solutions_locked', 'Solve the problem first to browse community solutions.'),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [problemId, auth?.isAuthenticated, sort, language, t]);

  const languages = useMemo(
    () => (rows ? Array.from(new Set(rows.map((r) => r.language))).sort() : []),
    [rows],
  );

  if (!auth?.isAuthenticated) return null;

  return (
    <section aria-label={t('solutions_title', 'Community solutions')} data-testid="solutions-panel">
      <h3>{t('solutions_title', 'Community solutions')}</h3>
      {lockedReason !== null ? (
        <p data-testid="solutions-locked" style={{ color: palette.muted }}>
          🔒 {lockedReason}
        </p>
      ) : rows === null ? (
        <p aria-busy="true">{t('solutions_loading', 'Loading solutions…')}</p>
      ) : rows.length === 0 ? (
        <p style={{ color: palette.muted }}>{t('solutions_empty', 'No accepted solutions yet.')}</p>
      ) : (
        <>
          <div
            style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}
            data-testid="solutions-controls"
          >
            <label style={{ fontSize: '0.8rem' }}>
              {t('solutions_sort', 'Sort')}:{' '}
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as (typeof SORTS)[number])}
                aria-label={t('solutions_sort', 'Sort')}
                data-testid="solutions-sort"
              >
                {SORTS.map((key) => (
                  <option key={key} value={key}>
                    {t(`solutions_sort_${key}`, key)}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: '0.8rem' }}>
              {t('solutions_language', 'Language')}:{' '}
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label={t('solutions_language', 'Language')}
                data-testid="solutions-language"
              >
                <option value="">{t('solutions_all_languages', 'all')}</option>
                {languages.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {rows.map((row) => (
              <li
                key={row.id}
                style={{ borderTop: `1px solid ${palette.border}`, padding: '8px 0' }}
              >
                <button
                  type="button"
                  data-testid={`solution-toggle-${row.id}`}
                  onClick={() => setOpenId(openId === row.id ? null : row.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: palette.foreground,
                    cursor: 'pointer',
                    fontWeight: 600,
                    padding: 0,
                  }}
                >
                  {row.user} · {row.language}
                  {row.execution_time_ms !== null && row.execution_time_ms !== undefined && (
                    <span style={{ color: palette.muted, fontWeight: 400 }}>
                      {' '}
                      · {row.execution_time_ms} ms
                    </span>
                  )}
                  {sort === 'shortest' && row.code_length !== undefined && (
                    <span style={{ color: palette.muted, fontWeight: 400 }}>
                      {' '}
                      · {row.code_length} B
                    </span>
                  )}
                </button>{' '}
                <span
                  data-testid={`solution-license-${row.id}`}
                  style={{
                    fontSize: '0.7rem',
                    color: palette.muted,
                    border: `1px solid ${palette.border}`,
                    borderRadius: 999,
                    padding: '1px 8px',
                  }}
                  title={t('solution_license_title', 'Sharing license')}
                >
                  {row.license ?? 'PLATFORM_DISPLAY'}
                </span>
                {auth.user && row.user === auth.user.username && (
                  <select
                    aria-label={t('solution_license_title', 'Sharing license')}
                    data-testid={`solution-license-select-${row.id}`}
                    value={row.license ?? 'PLATFORM_DISPLAY'}
                    onChange={async (e) => {
                      await CommunityService.setSubmissionLicense(row.id, e.target.value);
                      setRows((current) =>
                        (current ?? []).map((r) =>
                          r.id === row.id ? { ...r, license: e.target.value } : r,
                        ),
                      );
                    }}
                    style={{ fontSize: '0.75rem', marginLeft: 8 }}
                  >
                    {['PLATFORM_DISPLAY', 'MIT', 'CC0', 'CC_BY_SA'].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                )}
                {openId === row.id && (
                  <pre
                    data-testid={`solution-code-${row.id}`}
                    style={{
                      background: 'rgba(127,127,127,0.1)',
                      padding: 10,
                      borderRadius: 8,
                      overflowX: 'auto',
                      fontSize: '0.85rem',
                    }}
                  >
                    {row.code}
                  </pre>
                )}
              </li>
            ))}
          </ul>
          {license && <p style={{ color: palette.muted, fontSize: '0.8rem' }}>{license}</p>}
        </>
      )}
    </section>
  );
}
