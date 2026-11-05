// Server-side data access for the public problems catalog.
//
// Uses the centralized src/lib/api-config.ts module so the base URL is
// consistent across all environments (local dev, staging, production).
//
// `next: { revalidate: 60 }` caches responses for ISR-style freshness on the
// SEO-critical catalog routes.
//
// Pagination note (frontend wiring wave, backend SPEC-GAPS B4): list
// endpoints now return the DRF envelope {count, next, previous, results}
// instead of a bare array. getProblemsPage() exposes that envelope for the
// catalog's paged loading; getProblems() follows `next` links (bounded by
// MAX_CATALOG_PAGES) for the callers that legitimately want the whole
// catalog (sitemap, problem-detail prev/next pager).

import { ProblemType } from "@/types";
import { PaginatedResponse } from "@/types/api";
import { apiUrl } from "@/lib/api-config";

async function fetchJson<T>(path: string): Promise<T> {
  // Real-backend e2e mode [Q13]: the suite seeds/unseeds problems around
  // each run and cannot tolerate the 60s ISR window — disable the cache
  // there (E2E_API_BASE is set on the dev server by playwright.config).
  const cacheOpts = process.env.E2E_API_BASE
    ? ({ cache: "no-store" } as RequestInit)
    : ({ next: { revalidate: 60 } } as RequestInit);
  const response = await fetch(apiUrl(path), cacheOpts);
  if (!response.ok) {
    const errorData: { detail?: string } = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || response.statusText);
  }
  return (await response.json()) as T;
}

/** Server-side fetch cap for full-catalog consumers: 5 x 100 = 500 problems. */
export const MAX_CATALOG_PAGES = 5;
const CATALOG_PAGE_SIZE = 100;

/**
 * One page of the public problem catalog (server-side; anonymous users only
 * see APPROVED). [SPEC-GAPS F2] No `.catch(() => [])`: a down backend must
 * surface as the page's error state, not masquerade as an empty catalog.
 */
export function getProblemsPage(
  page = 1,
  filters: { curriculumNode?: number | string } = {},
): Promise<PaginatedResponse<ProblemType>> {
  const nodeQs = filters.curriculumNode ? `&curriculum_node=${filters.curriculumNode}` : "";
  return fetchJson<PaginatedResponse<ProblemType>>(
    `/problems/problems/?page=${page}&page_size=${CATALOG_PAGE_SIZE}${nodeQs}`,
  );
}

export interface CurriculumChapter {
  id: number;
  kind: string;
  name_i18n: Record<string, string>;
  slug: string;
  order: number;
  problem_count: number;
}

export interface CurriculumGrade {
  id: number;
  kind: string;
  name_i18n: Record<string, string>;
  slug: string;
  order: number;
  problem_count: number;
  children: CurriculumChapter[];
}

/** [roadmap EDU-9] Curriculum tree (grades -> chapters + APPROVED counts). */
export function getCurriculum(): Promise<PaginatedResponse<CurriculumGrade>> {
  return fetchJson<PaginatedResponse<CurriculumGrade>>("/problems/curriculum/");
}

/** [roadmap ONB-1] First-run trio: one easy problem per paradigm. */
export function getStarterProblems(): Promise<ProblemType[]> {
  return fetchJson<ProblemType[]>("/problems/problems/starters/");
}

/**
 * Full catalog (sitemap + problem-detail prev/next neighbors): follows the
 * envelope's `next` links up to MAX_CATALOG_PAGES pages. Bounded on purpose
 * — an unbounded follow could loop a hostile next-chain forever.
 */
export async function getProblems(): Promise<ProblemType[]> {
  const out: ProblemType[] = [];
  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    const response = await getProblemsPage(page);
    out.push(...response.results);
    if (!response.next) break;
  }
  return out;
}

/**
 * Problem detail (server-side). Returns null on HTTP 404 so the page can call
 * notFound() (proper 404 status for SEO, vs the CRA app's 200 with a message);
 * every other failure rejects with the shared Error(detail || statusText).
 */
export async function getProblemDetail(id: string | number): Promise<ProblemType | null> {
  const response = await fetch(apiUrl(`/problems/problems/${id}/`), {
    next: { revalidate: 60 },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const errorData: { detail?: string } = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || response.statusText);
  }
  return (await response.json()) as ProblemType;
}
