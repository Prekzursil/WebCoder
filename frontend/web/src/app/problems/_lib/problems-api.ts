// Server-side data access for the public problems catalog.
//
// The client ApiService (src/services/ApiService.ts) reads the auth token
// from localStorage, which does not exist during server rendering, so the
// SEO-facing server components use this module instead. It mirrors the
// ApiService contract where it matters:
//   - same base URL env var (NEXT_PUBLIC_API_BASE, default http://localhost:8000)
//     and same /api/v1 endpoint paths;
//   - same error contract — Error(detail || statusText) (ApiService.ts:39-40);
//   - same response shapes — the DRF backend (backend/problems/views.py) is a
//     plain ModelViewSet with no pagination and no {data: ...} envelope
//     (webcoder_api/settings.py defines none), so list returns ProblemType[]
//     and retrieve returns the problem object directly. The CRA pages'
//     `response.data` reads were the bug (docs/PORT-MAP.md §0.1).
//
// `next: { revalidate: 60 }` caches responses for ISR-style freshness on the
// SEO-critical catalog routes.

import { ProblemType } from '@/types';

function apiUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:8000';
  return `${base}/api/v1${path}`;
}

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
