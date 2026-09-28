import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import { ProblemService, setUnauthorizedHandler } from '@/services/ApiService';

// Wiring tests: AuthProvider must register its logout with ApiService so a
// failed token refresh (401 -> refresh fails) clears React auth state and
// localStorage. These tests render the REAL provider with fetch stubbed —
// no module mocks — because the registration itself is the behavior under
// test.

const API_BASE = 'http://localhost:8000/api/v1';
const REFRESH_URL = `${API_BASE}/token/refresh/`;

const storedUser = { id: 1, username: 'alice', email: 'alice@example.com', role: 'ADMIN' } as const;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function unauthorized(): Response {
  return jsonResponse({ detail: 'Given token not valid' }, { status: 401, statusText: 'Unauthorized' });
}

function seedSession(): void {
  localStorage.setItem('accessToken', 'expired-access');
  localStorage.setItem('refreshToken', 'stored-refresh');
  localStorage.setItem('user', JSON.stringify(storedUser));
}

const AuthStateProbe: React.FC = () => {
  const auth = useAuth();
  return <div data-testid="auth-state">{auth.isAuthenticated ? 'authed' : 'anon'}</div>;
};

afterEach(() => {
  cleanup();
  setUnauthorizedHandler(null);
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('AuthContext <-> ApiService session-expiry wiring', () => {
  it('logs out via the provider when a refresh fails (401 -> refresh 401)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse({ detail: 'Token is invalid or expired' }, { status: 401, statusText: 'Unauthorized' });
        }
        return unauthorized();
      })
    );

    seedSession();
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );

    // Hydration promoted the persisted session into React state.
    await screen.findByText('authed');

    // A service call whose refresh fails must trigger the provider's logout.
    await act(async () => {
      await ProblemService.getTags().catch(() => undefined);
    });

    expect(screen.getByTestId('auth-state')).toHaveTextContent('anon');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('keeps the session when the refresh succeeds and persists the rotated access token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse({ access: 'new-access' });
        }
        const auth = new Headers(init?.headers).get('Authorization');
        return auth === 'Bearer new-access' ? jsonResponse([{ id: 3, name: 'arrays' }]) : unauthorized();
      })
    );

    seedSession();
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );
    await screen.findByText('authed');

    let tags: unknown;
    await act(async () => {
      tags = await ProblemService.getTags();
    });

    expect(tags).toEqual([{ id: 3, name: 'arrays' }]);
    expect(screen.getByTestId('auth-state')).toHaveTextContent('authed');
    expect(localStorage.getItem('accessToken')).toBe('new-access');
  });

  it('unregisters the handler on unmount so later refresh failures do not touch the provider', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse({ detail: 'expired' }, { status: 401, statusText: 'Unauthorized' });
        }
        return unauthorized();
      })
    );

    seedSession();
    const { unmount } = render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>
    );
    await screen.findByText('authed');
    unmount();

    // Re-seed a session; a failed refresh after unmount must NOT clear it
    // (the handler is detached, so nothing observes the expiry anymore).
    seedSession();
    await ProblemService.getTags().catch(() => undefined);

    expect(localStorage.getItem('accessToken')).toBe('expired-access');
    expect(localStorage.getItem('refreshToken')).toBe('stored-refresh');
  });
});
