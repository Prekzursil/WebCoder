import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, ProblemService, setUnauthorizedHandler } from './ApiService';

// Refresh-flow tests for apiFetch: on a 401 the wrapper must POST the
// simplejwt refresh endpoint (`/api/v1/token/refresh/`, see
// backend/webcoder_api/urls.py), retry the original request exactly once,
// and invoke the unauthorized handler (AuthContext's logout) when the
// refresh fails. A retried 401 must never trigger a second refresh.

const API_BASE = 'http://localhost:8000/api/v1';
const REFRESH_URL = `${API_BASE}/token/refresh/`;

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

let logoutSpy: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  localStorage.setItem('accessToken', 'expired-access');
  localStorage.setItem('refreshToken', 'stored-refresh');
  logoutSpy = vi.fn<() => void>();
  setUnauthorizedHandler(logoutSpy);
});

afterEach(() => {
  setUnauthorizedHandler(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('apiFetch refresh flow', () => {
  it('on 401 refreshes the token and retries the original request once (happy path)', async () => {
    const fetchMock = mockFetch(async (input, init) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ access: 'new-access' });
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer new-access' ? jsonResponse({ id: 7, username: 'u' }) : unauthorized();
    });

    const me = await AuthService.getMe();

    expect(me).toEqual({ id: 7, username: 'u' });
    // original request + refresh POST + one retry — nothing more.
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // The refresh POST carries the stored refresh token and no Authorization header.
    const refreshCall = fetchMock.mock.calls[1];
    expect(refreshCall[0]).toBe(REFRESH_URL);
    expect(refreshCall[1]?.method).toBe('POST');
    expect(JSON.parse(String(refreshCall[1]?.body))).toEqual({ refresh: 'stored-refresh' });
    expect(new Headers(refreshCall[1]?.headers).get('Authorization')).toBeNull();

    // The retry used the freshly rotated access token.
    const retryCall = fetchMock.mock.calls[2];
    expect(retryCall[0]).toBe(`${API_BASE}/users/me/`);
    expect(new Headers(retryCall[1]?.headers).get('Authorization')).toBe('Bearer new-access');

    // The rotated access token is persisted.
    expect(localStorage.getItem('accessToken')).toBe('new-access');
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

  it('skips the refresh POST when no refresh token is stored and treats it as session expiry', async () => {
    localStorage.removeItem('refreshToken');
    const fetchMock = mockFetch(async () => unauthorized());

    await expect(AuthService.getMe()).rejects.toThrow('Given token not valid');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logoutSpy).toHaveBeenCalledTimes(1);
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

  it('treats a refresh response without an access token as a failed refresh', async () => {
    const fetchMock = mockFetch(async (input) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({});
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

    const fetchMock = mockFetch(async (input, init) => {
      if (String(input) === REFRESH_URL) {
        refreshCalls += 1;
        return refreshGate;
      }
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer new-access' ? jsonResponse({ id: 1 }) : unauthorized();
    });

    const first = AuthService.getMe();
    const second = AuthService.getMe();

    // Both originals 401'd and exactly ONE refresh POST was issued.
    await vi.waitFor(() => expect(fetchMock.mock.calls.length).toBe(3));
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

describe('apiFetch baseline behavior (unchanged by the refresh wrapper)', () => {
  it('attaches the stored access token as a Bearer header', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 7 }));

    await AuthService.getMe();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE}/users/me/`);
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer expired-access');
  });

  it('sends JSON bodies with Content-Type and no Authorization header when logged out', async () => {
    localStorage.clear();
    const fetchMock = mockFetch(async () => jsonResponse({ access: 'a', refresh: 'r', user: { id: 1 } }));

    await AuthService.login({ username: 'u', password: 'p' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(`${API_BASE}/auth/login/`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(new Headers(init?.headers).get('Authorization')).toBeNull();
    expect(JSON.parse(String(init?.body))).toEqual({ username: 'u', password: 'p' });
  });

  it('returns an empty object for 204 responses', async () => {
    const fetchMock = mockFetch(async () => new Response(null, { status: 204 }));

    await expect(ProblemService.deleteProblem(5)).resolves.toEqual({});

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws Error(statusText) when the error body has no detail', async () => {
    mockFetch(async () => jsonResponse({}, { status: 500, statusText: 'Internal Server Error' }));
    await expect(AuthService.getMe()).rejects.toThrow('Internal Server Error');
  });
});

describe('apiFetch refresh concurrency (in-flight dedup)', () => {
  it('concurrent 401s share ONE refresh POST and both retry after it settles', async () => {
    let releaseRefresh!: (v: Response) => void;
    const refreshGate = new Promise<Response>((resolve) => { releaseRefresh = resolve; });
    let refreshSettled = false;
    const fetchMock = mockFetch(async (input: unknown) => {
      if (String(input) === REFRESH_URL) {
        const resp = await refreshGate;
        refreshSettled = true;
        return resp;
      }
      // Original requests 401 until the refresh lands; retries succeed.
      if (!refreshSettled) return unauthorized();
      return jsonResponse({ ok: true });
    });

    // Two concurrent authenticated calls whose access token is expired.
    const p1 = AuthService.getMe();
    const p2 = AuthService.getMe();
    // Let both wrappers reach their 401 -> refresh transition.
    await vi.waitFor(() => expect(countRefreshCalls(fetchMock)).toBe(1));
    releaseRefresh(jsonResponse({ access: 'new-access' }));
    await Promise.all([p1, p2]);

    // The in-flight slot dedups: exactly one refresh POST, never two.
    expect(countRefreshCalls(fetchMock)).toBe(1);
    expect(localStorage.getItem('accessToken')).toBe('new-access');
    expect(logoutSpy).not.toHaveBeenCalled();
  });
});
