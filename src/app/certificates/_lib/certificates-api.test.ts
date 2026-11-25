// [Wave D certifications] Server-side verification fetch: 200 → row,
// 404 → null (honest not-found page), 5xx → thrown (never a phantom
// "valid"), and the real-backend e2e bypass of the ISR cache.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCertificate } from './certificates-api';

const CERT = {
  uuid: 'b0b0b0b0-1111-2222-3333-444444444444',
  serial: 'WC-2026-000001',
  kind: 'CONTEST_PARTICIPATION',
  status: 'VALID',
  holder: 'alice',
  details: { rank: 1, rating_after: 1662 },
  issued_at: '2026-11-14T00:00:00Z',
  revoked_at: null,
  revoked_reason: '',
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  delete process.env.E2E_API_BASE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.E2E_API_BASE;
});

describe('certificates-api [Wave D]', () => {
  it('returns the certificate on 200 and revalidates by default', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(CERT));
    vi.stubGlobal('fetch', fetchMock);
    const cert = await getCertificate(CERT.uuid);
    expect(cert?.serial).toBe('WC-2026-000001');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init as { next?: { revalidate: number } }).next?.revalidate).toBe(60);
  });

  it('maps 404 to null (the not-found page path)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"detail":"Not found."}', { status: 404 })),
    );
    expect(await getCertificate('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('throws on a non-404 failure instead of faking an answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500, statusText: 'Internal Server Error' })),
    );
    await expect(getCertificate(CERT.uuid)).rejects.toThrow('Internal Server Error');
  });

  it('bypasses the cache in real-backend e2e mode', async () => {
    process.env.E2E_API_BASE = 'http://127.0.0.1:8010';
    const fetchMock = vi.fn(async () => jsonResponse(CERT));
    vi.stubGlobal('fetch', fetchMock);
    await getCertificate(CERT.uuid);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init as { cache?: string }).cache).toBe('no-store');
  });
});
