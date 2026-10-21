// Public problems catalog (Server Component) — see ProblemsListClient for
// the interactive island.
//
// Data-contract note (frontend wiring wave): list endpoints now return the
// DRF pagination envelope {count, next, previous, results} (backend SPEC-GAPS
// B4) instead of a bare array. The server fetches page 1 (page_size 100) via
// getProblemsPage(); ProblemsListClient appends further pages through the
// browser-side ApiService when the user hits "Load more".
//
// The client-side loading spinner and red error paragraph map to the App
// Router loading.tsx / error.tsx boundaries in this directory.

import type { Metadata } from 'next';
import { Suspense } from 'react';
import { createTranslator, getLocale } from '../_lib/public-i18n';
import { getProblemsPage } from './_lib/problems-api';
import ProblemsListClient from './ProblemsListClient';
import ProblemsTableSkeleton from './ProblemsTableSkeleton';

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

  let problems: Awaited<ReturnType<typeof getProblemsPage>>['results'] = [];
  let total = 0;
  let hasMore = false;
  let fetchError: string | null = null;

  try {
    const firstPage = await getProblemsPage(1);
    problems = firstPage.results;
    total = firstPage.count;
    hasMore = Boolean(firstPage.next);
  } catch (err) {
    fetchError =
      err instanceof Error ? err.message : 'Failed to load problems.';
  }

  return (
    <Suspense fallback={<ProblemsTableSkeleton />}>
      <ProblemsListClient
        problems={problems}
        totalCount={total}
        hasMore={hasMore}
        fetchError={fetchError}
        locale={locale}
      />
    </Suspense>
  );
}
