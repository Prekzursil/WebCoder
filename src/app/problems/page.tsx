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
import { createTranslator, getLocale } from '../_lib/public-i18n';
import { getProblems } from './_lib/problems-api';
import ProblemsListClient from './ProblemsListClient';

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
    <ProblemsListClient
      problems={problems}
      fetchError={fetchError}
      locale={locale}
      t={t}
    />
  );
}
