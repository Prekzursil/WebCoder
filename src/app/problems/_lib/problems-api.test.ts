import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getProblemDetail, getProblems } from './problems-api';

function mockFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

// process.env values are strings — assigning `undefined` yields the literal
// string "undefined", so the unset state must be produced with delete.
const ORIGINAL_BASE = process.env.NEXT_PUBLIC_API_BASE;

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_API_BASE;
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_BASE === undefined) {
    delete process.env.NEXT_PUBLIC_API_BASE;
  } else {
    process.env.NEXT_PUBLIC_API_BASE = ORIGINAL_BASE;
  }
});

describe('getProblems', () => {
  it('fetches the list endpoint with ISR revalidation and returns the parsed array', async () => {
    const fetchMock = mockFetch(async () =>
      jsonResponse([{ id: 1, title_i18n: { en: 'A' }, difficulty: 'EASY', status: 'APPROVED' }])
    );
    const problems = await getProblems();

    expect(problems).toEqual([
      { id: 1, title_i18n: { en: 'A' }, difficulty: 'EASY', status: 'APPROVED' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8000/api/v1/problems/problems/', {
      next: { revalidate: 60 },
    });
  });

  it('honors NEXT_PUBLIC_API_BASE when set', async () => {
    process.env.NEXT_PUBLIC_API_BASE = 'http://api.test';
    const fetchMock = mockFetch(async () => jsonResponse([]));
    await getProblems();
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/api/v1/problems/problems/', {
      next: { revalidate: 60 },
    });
  });

  it('throws Error(detail) when the API responds with a detail body', async () => {
    mockFetch(async () => jsonResponse({ detail: 'Service unavailable' }, { status: 503 }));
    await expect(getProblems()).rejects.toThrow('Service unavailable');
  });

  it('throws Error(statusText) when the error body has no detail', async () => {
    mockFetch(async () => jsonResponse({}, { status: 500, statusText: 'Internal Server Error' }));
    await expect(getProblems()).rejects.toThrow('Internal Server Error');
  });

  it('throws Error(statusText) when the error body is not JSON (json() rejects)', async () => {
    mockFetch(async () => new Response('not-json', { status: 502, statusText: 'Bad Gateway' }));
    await expect(getProblems()).rejects.toThrow('Bad Gateway');
  });

  it('propagates network failures', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(getProblems()).resolves.toEqual([]);
  });
});

describe('getProblemDetail', () => {
  it('returns the problem object on success', async () => {
    const problem = { id: 9, title_i18n: { en: 'Two Sum' }, difficulty: 'EASY', status: 'APPROVED' };
    mockFetch(async () => jsonResponse(problem));
    await expect(getProblemDetail(9)).resolves.toEqual(problem);
  });

  it('returns null on HTTP 404 so the page can render notFound()', async () => {
    mockFetch(async () => new Response(null, { status: 404, statusText: 'Not Found' }));
    await expect(getProblemDetail('missing')).resolves.toBeNull();
  });

  it('throws Error(detail) on other error statuses', async () => {
    mockFetch(async () => jsonResponse({ detail: 'Throttled' }, { status: 429 }));
    await expect(getProblemDetail(3)).rejects.toThrow('Throttled');
  });

  it('throws Error(statusText) when the error body has no detail', async () => {
    mockFetch(async () => jsonResponse({}, { status: 502, statusText: 'Bad Gateway' }));
    await expect(getProblemDetail(3)).rejects.toThrow('Bad Gateway');
  });

  it('throws Error(statusText) when the error body is not JSON (json() rejects)', async () => {
    mockFetch(async () => new Response('not-json', { status: 500, statusText: 'Internal Server Error' }));
    await expect(getProblemDetail(3)).rejects.toThrow('Internal Server Error');
  });
});
