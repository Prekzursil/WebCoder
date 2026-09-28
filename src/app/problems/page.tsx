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
    <div>
      <h2>{t('problem_list_header', 'Problems')}</h2>
      {fetchError ? (
        <p style={{ color: 'red' }}>
          {t('problems_load_error', 'Could not load problems: ')}
          {fetchError}
        </p>
      ) : problems.length === 0 ? (
        <p>{t('no_problems_available', 'No problems available at the moment.')}</p>
      ) : (
        <ul>
          {problems.map((problem) => (
            <li key={problem.id}>
              <Link href={`/problems/${problem.id}`}>
                {problem.title_i18n[locale] ||
                  problem.title_i18n.en ||
                  `Problem ID: ${problem.id}`}
              </Link>
              {' - '}
              {t(`difficulty_${problem.difficulty?.toLowerCase()}`, problem.difficulty)}
              {' ('}
              {t(`status_${problem.status?.toLowerCase()}`, problem.status)}
              {')'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
