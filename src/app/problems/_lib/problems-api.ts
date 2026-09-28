// Server-side data access for the public problems catalog.
//
// Uses the centralized src/lib/api-config.ts module so the base URL is
// consistent across all environments (local dev, staging, production).
//
// `next: { revalidate: 60 }` caches responses for ISR-style freshness on the
// SEO-critical catalog routes.

import { ProblemType } from '@/types';
import { apiUrl } from '@/lib/api-config';

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path), { next: { revalidate: 60 } });
  if (!response.ok) {
    const errorData: { detail?: string } = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || response.statusText);
  }
  return (await response.json()) as T;
}

/** Public problem list (server-side; anonymous users only see APPROVED). */
export function getProblems(): Promise<ProblemType[]> {
  return fetchJson<ProblemType[]>('/problems/problems/');
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
