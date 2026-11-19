// [wave G items 135/139] getStatus: the public feed contract — success,
// HTTP failure and network failure all resolve (never throw) so the
// /status page itself renders during an outage.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStatus } from './status-api';

const feed = {
  generated_at: '2026-11-20T10:00:00.000Z',
  overall: 'ok',
  components: { api: { state: 'ok' }, judge: { state: 'ok', backlog: 2 } },
  queue_lanes: { contest: 1, practice: 1 },
  judge_last_24h: {
    window_hours: 24,
    judged: 5,
    avg_execution_ms: 100,
    max_execution_ms: 900,
  },
  error_rate_1h: 0.01,
};

describe('getStatus [items 135/139]', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the parsed feed on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(feed),
    });
    vi.stubGlobal('fetch', fetchMock);
    expect(await getStatus()).toEqual(feed);
  });

  it('returns null on an HTTP error (never throws)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({}) }),
    );
    expect(await getStatus()).toBeNull();
  });

  it('returns null when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await getStatus()).toBeNull();
  });
});
