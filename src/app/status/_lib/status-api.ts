// Server-side data access for the PUBLIC status page (items 135/139).
// Mirrors certificates-api.ts: centralized base URL, 30s revalidation
// (the page is an uptime surface, not a live dashboard), no silent
// catch — a down backend surfaces as the page's unknown state.

import { apiUrl } from '@/lib/api-config';

export interface StatusComponent {
  state: string;
  backlog?: number;
}

export interface StatusFeed {
  generated_at: string;
  overall: string;
  components: { api: StatusComponent; judge: StatusComponent };
  queue_lanes: { contest: number; practice: number };
  judge_last_24h: {
    window_hours: number;
    judged: number;
    avg_execution_ms: number | null;
    max_execution_ms: number | null;
  };
  error_rate_1h: number;
}

export async function getStatus(): Promise<StatusFeed | null> {
  const cacheOpts = process.env.E2E_API_BASE
    ? ({ cache: 'no-store' } as RequestInit)
    : ({ next: { revalidate: 30 } } as RequestInit);
  try {
    const response = await fetch(apiUrl('/ops/status/'), cacheOpts);
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as StatusFeed;
  } catch {
    // The status page itself must render when the API is unreachable —
    // that IS the incident signal it exists to show.
    return null;
  }
}
