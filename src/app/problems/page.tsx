// Ported from frontend/webcoder_ui/src/pages/problems/ProblemsListPage.tsx
// (CRA reference) — route "/problems" (App.tsx:34).
//
// SEO-critical public catalog: rendered as a Server Component that fetches
// server-side (src/app/problems/_lib/problems-api.ts) with ISR-style
// revalidation, plus generateMetadata for the document head.
//
// Data-contract note: the CRA page read `response.data` from
// ProblemService.getProblems(); the DRF backend returns a bare JSON array
// (backend/problems/views.py — ModelViewSet; no pagination or envelope in
// webcoder_api/settings.py), so the port consumes the array directly —
// docs/PORT-MAP.md §0.1, settled against backend source.
//
// The CRA client-side loading spinner and red error paragraph are mapped to
// the App Router loading.tsx / error.tsx boundaries in this directory.

import type { Metadata } from 'next';
import Link from 'next/link';
import { createTranslator, getLocale } from '../_lib/public-i18n';
import { getProblems } from './_lib/problems-api';

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return {
    title: t('problem_list_header', 'Problems'),
    description: t(
      'problems_page_description',
      'Browse the public competitive programming problem catalog on WebCoder.'
    ),
  };
}

const difficultyColors: Record<string, string> = {
  easy: '#4ade80',
  medium: '#fbbf24',
  hard: '#f87171',
};

export default async function ProblemsListPage() {
  const locale = await getLocale();
  const t = createTranslator(locale);

  let problems: Awaited<ReturnType<typeof getProblems>> = [];
  let fetchError: string | null = null;

  try {
    problems = await getProblems();
  } catch (err) {
    fetchError =
      err instanceof Error ? err.message : 'Failed to load problems.';
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          color: '#f1f5f9',
          marginBottom: '0.5rem',
        }}>
          {t('problem_list_header', 'Problems')}
        </h1>
        <p style={{ color: '#64748b', fontSize: '0.9rem' }}>
          {t('problems_page_description', 'Browse the public competitive programming problem catalog.')}
        </p>
      </div>

      {fetchError ? (
        <div style={{
          padding: '1.25rem 1.5rem',
          borderRadius: '10px',
          background: 'rgba(248, 113, 113, 0.08)',
          border: '1px solid rgba(248, 113, 113, 0.2)',
          color: '#f87171',
          fontSize: '0.9rem',
        }}>
          {t('problems_load_error', 'Could not load problems: ')}{fetchError}
        </div>
      ) : problems.length === 0 ? (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#64748b',
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {t('no_problems_available', 'No problems available at the moment.')}
        </div>
      ) : (
        <div style={{
          background: '#1e293b',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <th style={{
                  padding: '12px 20px',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#64748b',
                  width: '60px',
                }}>#</th>
                <th style={{
                  padding: '12px 20px',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#64748b',
                }}>{t('problem_title_th', 'Title')}</th>
                <th style={{
                  padding: '12px 20px',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#64748b',
                }}>{t('problem_difficulty_th', 'Difficulty')}</th>
                <th style={{
                  padding: '12px 20px',
                  textAlign: 'left',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.07em',
                  color: '#64748b',
                }}>{t('problem_status_th', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem, idx) => {
                const diff = problem.difficulty?.toLowerCase() ?? '';
                const diffColor = difficultyColors[diff] ?? '#94a3b8';
                return (
                  <tr key={problem.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '14px 20px', color: '#475569', fontSize: '0.8rem' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <Link href={`/problems/${problem.id}`} style={{
                        color: '#f1f5f9',
                        fontWeight: 500,
                        fontSize: '0.9rem',
                        textDecoration: 'none',
                        transition: 'color 150ms ease',
                      }}>
                        {problem.title_i18n[locale] || problem.title_i18n.en || `Problem #${problem.id}`}
                      </Link>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: diffColor,
                        background: `${diffColor}18`,
                        border: `1px solid ${diffColor}30`,
                      }}>
                        {t(`difficulty_${diff}`, problem.difficulty)}
                      </span>
                    </td>
                    <td style={{ padding: '14px 20px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 10px',
                        borderRadius: '999px',
                        fontSize: '0.75rem',
                        fontWeight: 500,
                        color: '#94a3b8',
                        background: 'rgba(148,163,184,0.08)',
                        border: '1px solid rgba(148,163,184,0.15)',
                      }}>
                        {t(`status_${problem.status?.toLowerCase()}`, problem.status)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
