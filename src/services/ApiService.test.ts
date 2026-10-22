import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, ProblemService, setUnauthorizedHandler } from './ApiService';

// Refresh-flow tests for apiFetch under the [SP1] cookie model: every
// request is sent with `credentials: 'include'` and NO Authorization header
// (the httpOnly wc_access cookie authenticates). On a 401 the wrapper POSTs
// the dj-rest-auth cookie refresh endpoint (`/api/v1/auth/token/refresh/`,
// EMPTY body — the server reads the wc_refresh cookie), retries the
// original request once, and invokes the unauthorized handler (AuthContext's
// logout) when the refresh fails. A retried 401 must never trigger a second
// refresh. Unsafe methods additionally carry the X-CSRFToken double-submit
// header when the csrftoken cookie is readable.

const API_BASE = 'http://localhost:8000/api/v1';
const REFRESH_URL = `${API_BASE}/auth/token/refresh/`;
const CSRF_URL = `${API_BASE}/auth/csrf/`;

type FetchMock = ReturnType<typeof mockFetch>;

function mockFetch(impl: (input: unknown, init?: RequestInit) => Promise<Response>) {
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

function unauthorized(detail = 'Given token not valid'): Response {
  return jsonResponse({ detail }, { status: 401, statusText: 'Unauthorized' });
}

function countRefreshCalls(fetchMock: FetchMock): number {
  return fetchMock.mock.calls.filter(([input]) => String(input) === REFRESH_URL).length;
}

function seedCsrfCookie(value = 'unit-csrf-token'): void {
  document.cookie = `csrftoken=${value}`;
}

let logoutSpy: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  logoutSpy = vi.fn<() => void>();
  setUnauthorizedHandler(logoutSpy);
});

afterEach(() => {
  setUnauthorizedHandler(null);
  localStorage.clear();
  document.cookie = 'csrftoken=; Max-Age=0';
  vi.unstubAllGlobals();
});

describe('apiFetch refresh flow (cookie model)', () => {
  it('on 401 POSTs the cookie refresh endpoint with an EMPTY body and retries once (happy path)', async () => {
    let meCalls = 0;
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ access: 'rotated-server-set-cookie' });
      }
      meCalls += 1;
      return meCalls === 1 ? unauthorized() : jsonResponse({ id: 7, username: 'u' });
    });

    const me = await AuthService.getMe();

    expect(me).toEqual({ id: 7, username: 'u' });
    // original request + refresh POST + one retry — nothing more.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The refresh POST carries NO body (the server reads the httpOnly
    // cookie), no Authorization header, and asks for credentials.
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toBe(REFRESH_URL);
    expect(refreshCall[1]?.method).toBe('POST');
    expect(refreshCall[1]?.body).toBeUndefined();
    expect(refreshCall[1]?.credentials).toBe('include');
    expect(new Headers(refreshCall[1]?.headers).get('Authorization')).toBeNull();

    // The retry is cookie-authenticated too (no injected Bearer token).
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[0]).toBe(`${API_BASE}/users/me/`);
    expect(retryCall[1]?.credentials).toBe('include');
    expect(new Headers(retryCall[1]?.headers).get('Authorization')).toBeNull();

    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('when the refresh fails, calls the unauthorized handler and throws the original error without retrying', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ detail: 'Token is invalid or expired' }, { status: 401, statusText: 'Unauthorized' });
      }
      return unauthorized();
    });

    await expect(AuthService.getMe()).rejects.toThrow('Given token not valid');

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    // original request + failed refresh — the request is NOT retried.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(countRefreshCalls(fetchMock)).toBe(1);
  });

  it('does not loop when the retried request 401s again (exactly one refresh, one retry)', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ access: 'new-access' });
      }
      // Both the original request and the retry are rejected.
      return unauthorized('Still invalid');
    });

    await expect(ProblemService.getTags()).rejects.toThrow('Still invalid');

    // original + refresh + single retry — the retried 401 triggers no second refresh.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(countRefreshCalls(fetchMock)).toBe(1);
    // The refresh itself succeeded, so no logout fires.
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('a 200 refresh with an empty body still counts as success (cookies are opaque to JS)', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({});
      }
      const isFirst = fetchMock.mock.calls.length === 1;
      return isFirst ? unauthorized() : jsonResponse({ id: 9 });
    });

    await expect(AuthService.getMe()).resolves.toEqual({ id: 9 });
    expect(countRefreshCalls(fetchMock)).toBe(1);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('does not attempt a refresh for non-401 errors', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ detail: 'Service unavailable' }, { status: 503 }));

    await expect(AuthService.getMe()).rejects.toThrow('Service unavailable');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('treats a network failure during refresh as a failed refresh', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        throw new TypeError('Failed to fetch');
      }
      return unauthorized();
    });

    await expect(AuthService.getMe()).rejects.toThrow('Given token not valid');

    expect(logoutSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares one refresh POST across concurrent 401s (single flight)', async () => {
    let refreshCalls = 0;
    let resolveRefresh: (value: Response) => void = () => undefined;
    const refreshGate = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });

    const fetchMock = mockFetch(async () => {
      const isFirst = fetchMock.mock.calls.length === 1;
      return isFirst ? unauthorized() : jsonResponse({ id: 1 });
    });
    // Overwrite: count refreshes separately.
    const originalImpl = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input: unknown) => {
      if (String(input) === REFRESH_URL) {
        refreshCalls += 1;
        return refreshGate;
      }
      return originalImpl!(input);
    });

    const first = AuthService.getMe();
    const second = AuthService.getMe();

    // Both originals 401'd and exactly ONE refresh POST was issued.
    await vi.waitFor(() => expect(refreshCalls).toBe(1));
    resolveRefresh(jsonResponse({ access: 'new-access' }));

    const results = await Promise.all([first, second]);

    expect(results).toEqual([{ id: 1 }, { id: 1 }]);
    expect(refreshCalls).toBe(1);
    expect(logoutSpy).not.toHaveBeenCalled();
  });

  it('still rejects cleanly when no unauthorized handler is registered', async () => {
    setUnauthorizedHandler(null);
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });
      }
      return unauthorized();
    });

    await expect(AuthService.getMe()).rejects.toThrow('Given token not valid');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('apiFetch baseline behavior (cookie + CSRF)', () => {
  it('sends every request with credentials: include and NO Authorization header', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 7 }));

    await AuthService.getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE}/users/me/`);
    expect(init?.credentials).toBe('include');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
  });

  it('never reads or writes auth tokens from localStorage', async () => {
    mockFetch(async () => jsonResponse({ id: 7 }));
    await AuthService.getMe();
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('attaches X-CSRFToken on unsafe methods when the csrftoken cookie is readable', async () => {
    seedCsrfCookie('unit-csrf-token');
    const fetchMock = mockFetch(async () => jsonResponse({ user: { id: 1 } }));

    await AuthService.login({ username: 'u', password: 'p' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE}/auth/login/`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(init?.headers).get('X-CSRFToken')).toBe('unit-csrf-token');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ username: 'u', password: 'p' });
    expect(init?.credentials).toBe('include');
  });

  it('seeds the csrftoken cookie via GET /auth/csrf/ before an unsafe method when absent', async () => {
    // jsdom does not apply Set-Cookie from fetch responses, so the seed
    // GET happens and the header is simply absent — asserting the
    // best-effort contract (request still proceeds).
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === CSRF_URL) {
        return jsonResponse({ detail: 'CSRF cookie set' });
      }
      return jsonResponse({ user: { id: 1 } });
    });

    await AuthService.login({ username: 'u', password: 'p' });

    const csrfCall = fetchMock.mock.calls.find(([input]) => String(input) === CSRF_URL);
    expect(csrfCall).toBeDefined();
    expect(csrfCall?.[1]?.credentials).toBe('include');
    const loginCall = fetchMock.mock.calls.find(([input]) => String(input) === `${API_BASE}/auth/login/`);
    expect(loginCall).toBeDefined();
    expect(new Headers(loginCall?.[1]?.headers).get('X-CSRFToken')).toBeNull();
  });

  it('shares one csrf seed GET across concurrent unsafe methods', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === CSRF_URL) {
        return jsonResponse({ detail: 'CSRF cookie set' });
      }
      return jsonResponse({ user: { id: 1 } });
    });

    await Promise.all([
      AuthService.login({ username: 'a', password: 'b' }),
      AuthService.login({ username: 'c', password: 'd' }),
    ]);

    const csrfCalls = fetchMock.mock.calls.filter(([input]) => String(input) === CSRF_URL);
    expect(csrfCalls.length).toBe(1);
  });

  it('returns an empty object for 204 responses', async () => {
    seedCsrfCookie();
    const fetchMock = mockFetch(async () => new Response(null, { status: 204 }));

    await expect(ProblemService.deleteProblem(5)).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws Error(statusText) when the error body has no detail', async () => {
    mockFetch(async () => jsonResponse({}, { status: 500, statusText: 'Internal Server Error' }));
    await expect(AuthService.getMe()).rejects.toThrow('Internal Server Error');
  });

  // [Q13] Real Django error shapes — dj-rest-auth posts failures as
  // non_field_errors, serializers as {field: [msgs]}; before the fix these
  // all surfaced as the bare statusText ("Bad Request").
  it('surfaces non_field_errors from real login failures', async () => {
    seedCsrfCookie();
    mockFetch(async () =>
      jsonResponse(
        { non_field_errors: ['Unable to log in with provided credentials.'] },
        { status: 400, statusText: 'Bad Request' }
      )
    );
    await expect(AuthService.login({ username: 'x', password: 'y' })).rejects.toThrow(
      'Unable to log in with provided credentials.'
    );
  });

  it('surfaces the first serializer field error when there is no detail', async () => {
    mockFetch(async () =>
      jsonResponse(
        { password1: ['This password is too common.'] },
        { status: 400, statusText: 'Bad Request' }
      )
    );
    await expect(AuthService.getMe()).rejects.toThrow('This password is too common.');
  });

  it('still prefers detail over the other shapes', async () => {
    mockFetch(async () =>
      jsonResponse(
        { detail: 'Not found.', non_field_errors: ['ignored'] },
        { status: 404, statusText: 'Not Found' }
      )
    );
    await expect(AuthService.getMe()).rejects.toThrow('Not found.');
  });
});
