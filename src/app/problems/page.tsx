// Public problems catalog (Server Component) — see ProblemsListClient for
// the interactive island.
//
// Data-contract note (frontend wiring wave): list endpoints now return the
// DRF pagination envelope {count, next, previous, results} (backend SPEC-GAPS
// B4) instead of a bare array. The server fetches page 1 (page_size 100) via
// getProblemsPage(); ProblemsListClient appends further pages through the
// browser-side ApiService when the user hits "Load more".
//
// [roadmap EDU-9] The curriculum tree (grades -> chapters, APPROVED counts)
// is fetched server-side alongside the catalog: the browse axis renders
// with the page and ?curriculum=<nodeId> filters the SERVER fetch (the
// backend supports ?curriculum_node= natively), so deep links to a chapter
// return exactly that chapter's problems.
//
// The client-side loading spinner and red error paragraph map to the App
// Router loading.tsx / error.tsx boundaries in this directory.

import type { Metadata } from "next";
import { Suspense } from "react";
import { createTranslator, getLocale } from "../_lib/public-i18n";
import { getCurriculum, getProblemsPage } from "./_lib/problems-api";
import type { CurriculumGrade } from "./_lib/problems-api";
import ProblemsListClient from "./ProblemsListClient";
import ProblemsTableSkeleton from "./ProblemsTableSkeleton";

export async function generateMetadata(): Promise<Metadata> {
  const t = createTranslator(await getLocale());
  return {
    title: t("problem_list_header", "Problems"),
    description: t(
      "problems_page_description",
      "Browse the public competitive programming problem catalog on WebCoder.",
    ),
  };
}

interface ProblemsListPageProps {
  searchParams: Promise<{ curriculum?: string }>;
}

export default async function ProblemsListPage({ searchParams }: ProblemsListPageProps) {
  const locale = await getLocale();
  const { curriculum: curriculumParam } = await searchParams;

  let problems: Awaited<ReturnType<typeof getProblemsPage>>["results"] = [];
  let total = 0;
  let hasMore = false;
  let fetchError: string | null = null;
  let curriculum: CurriculumGrade[] | null = null;

  const curriculumFetch = getCurriculum()
    .then((response) => {
      curriculum = response.results ?? [];
    })
    .catch(() => {
      // The curriculum axis is supplementary: no tree renders without it,
      // the catalog itself stays fully usable.
      curriculum = null;
    });

  try {
    const [firstPage] = await Promise.all([
      getProblemsPage(1, { curriculumNode: curriculumParam }),
      curriculumFetch,
    ]);
    problems = firstPage.results;
    total = firstPage.count;
    hasMore = Boolean(firstPage.next);
  } catch (err) {
    await curriculumFetch.catch(() => undefined);
    fetchError = err instanceof Error ? err.message : "Failed to load problems.";
  }

  return (
    <Suspense fallback={<ProblemsTableSkeleton />}>
      <ProblemsListClient
        problems={problems}
        totalCount={total}
        hasMore={hasMore}
        fetchError={fetchError}
        locale={locale}
        curriculum={curriculum}
      />
    </Suspense>
  );
}
