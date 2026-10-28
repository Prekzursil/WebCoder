import { describe, expect, it, vi, beforeEach } from 'vitest';
import { GET } from './route';
import type { NextRequest } from 'next/server';

// The same-origin gradebook proxy: cookie pass-through, upstream errors
// mapped 1:1, bad ids rejected — the anchor's href never leaves the app
// origin (the CodeQL js/xss + redirection fix).

const makeRequest = (cookie?: string) =>
    ({
        headers: new Headers(cookie ? { cookie } : {}),
    }) as unknown as NextRequest;

describe('gradebook export proxy route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('rejects non-numeric assignment ids', async () => {
    const response = await GET(makeRequest(), {
      params: Promise.resolve({ assignmentId: 'abc' }),
    });
    expect(response.status).toBe(400);
  });

  it('streams the CSV with a download disposition', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('student,verdict\nalice,AC', { status: 200 })
      )
    );
    const response = await GET(makeRequest('session=1'), {
      params: Promise.resolve({ assignmentId: '3' }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain(
      'assignment-3-grades.csv'
    );
    expect(await response.text()).toContain('alice,AC');
    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(calledUrl).toContain('/classroom/assignments/3/export/');
  });

  it('forwards the browser cookie header to the backend', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('x', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await GET(makeRequest('wc_access=tok'), {
      params: Promise.resolve({ assignmentId: '3' }),
    });
    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers.cookie).toBe('wc_access=tok');
  });

  it('maps 401/403 and upstream failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 403 })));
    const forbidden = await GET(makeRequest(), {
      params: Promise.resolve({ assignmentId: '3' }),
    });
    expect(forbidden.status).toBe(403);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const boom = await GET(makeRequest(), {
      params: Promise.resolve({ assignmentId: '3' }),
    });
    expect(boom.status).toBe(502);
  });
});
