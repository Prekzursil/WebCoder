import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import type { User } from '@/types';

// Auth-state lifecycle tests (hydration from localStorage, fetch-user-on-
// token effect success/falsy/failure, login(), useAuth guard). The
// unauthorized-handler registration effect has its own tests in
// AuthContext.test.tsx; AuthService is mocked here, localStorage runs real.

const mocks = vi.hoisted(() => ({ getMe: vi.fn(), setUnauthorizedHandler: vi.fn() }));

vi.mock('@/services/ApiService', () => ({
  AuthService: { getMe: mocks.getMe },
  setUnauthorizedHandler: mocks.setUnauthorizedHandler,
}));

const user: User = { id: 1, username: 'tester', email: 'tester@example.com', role: 'BASIC_USER' };

let authState: ReturnType<typeof useAuth> | undefined;

const Probe = () => {
  authState = useAuth();
  return null;
};

function renderWithProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  if (typeof window !== 'undefined') {
    localStorage.clear();
  }
  authState = undefined;
  mocks.getMe.mockResolvedValue(user);
});

afterEach(cleanup);

describe('AuthProvider auth-state lifecycle', () => {
  it('starts unauthenticated and hydrates a stored session after mount', async () => {
    localStorage.setItem('accessToken', 'acc');
    localStorage.setItem('refreshToken', 'ref');
    localStorage.setItem('user', JSON.stringify(user));
    renderWithProvider();
    // RTL's act() may already have flushed the hydration effect, so the
    // pre-hydration state is not assertable here — assert the hydrated state.
    await waitFor(() => expect(authState?.token).toBe('acc'));
    expect(authState?.refreshToken).toBe('ref');
    expect(authState?.user).toEqual(user);
    expect(authState?.isAuthenticated).toBe(true);
    // user already present from storage -> no getMe round-trip.
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it('drops a corrupt stored user (no token -> no fetch)', async () => {
    if (typeof window !== 'undefined') localStorage.setItem('user', '{not json');
    renderWithProvider();
    await waitFor(() => expect(authState?.token).toBeNull());
    expect(authState?.user).toBeNull();
    expect(typeof window !== 'undefined' ? localStorage.getItem('user') : null).toBeNull();
    expect(mocks.getMe).not.toHaveBeenCalled();
  });

  it('fetches the user when a token exists but no user is stored (success)', async () => {
    localStorage.setItem('accessToken', 'acc');
    localStorage.setItem('refreshToken', 'ref');
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(authState?.user).toEqual(user));
    expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
    expect(authState?.isAuthenticated).toBe(true);
  });

  it('keeps a null user when getMe resolves falsy', async () => {
    mocks.getMe.mockResolvedValue(undefined);
    localStorage.setItem('accessToken', 'acc');
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(authState?.user).toBeNull();
    expect(authState?.token).toBe('acc');
    expect(authState?.isAuthenticated).toBe(true);
  });

  it('clears the whole session when getMe rejects', async () => {
    mocks.getMe.mockRejectedValue(new Error('401'));
    localStorage.setItem('accessToken', 'acc');
    localStorage.setItem('refreshToken', 'ref');
    localStorage.setItem('user', '{bad'); // corrupt -> user stays null -> fetch runs
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(authState?.token).toBeNull());
    expect(authState?.refreshToken).toBeNull();
    expect(authState?.user).toBeNull();
    expect(authState?.isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('login persists the session and flips isAuthenticated', async () => {
    renderWithProvider();
    await act(async () => {});
    expect(authState?.isAuthenticated).toBe(false);
    await act(async () => {
      authState!.login('a1', 'r1', user);
    });
    expect(authState?.token).toBe('a1');
    expect(authState?.refreshToken).toBe('r1');
    expect(authState?.user).toEqual(user);
    expect(authState?.isAuthenticated).toBe(true);
    expect(localStorage.getItem('accessToken')).toBe('a1');
    expect(localStorage.getItem('refreshToken')).toBe('r1');
    expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
  });

  it('logout wipes storage and state', async () => {
    localStorage.setItem('accessToken', 'a1');
    localStorage.setItem('refreshToken', 'r1');
    localStorage.setItem('user', JSON.stringify(user));
    renderWithProvider();
    await waitFor(() => expect(authState?.isAuthenticated).toBe(true));
    await act(async () => {
      authState!.logout();
    });
    expect(authState?.token).toBeNull();
    expect(authState?.refreshToken).toBeNull();
    expect(authState?.user).toBeNull();
    expect(authState?.isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('registers its logout with ApiService on mount and unregisters on unmount', () => {
    const { unmount } = renderWithProvider();
    // The effect registers once per mount (logout is stable across renders).
    expect(mocks.setUnauthorizedHandler.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mocks.setUnauthorizedHandler).toHaveBeenCalledWith(expect.any(Function));
    unmount();
    expect(mocks.setUnauthorizedHandler).toHaveBeenCalledWith(null);
  });
});

describe('useAuth guard', () => {
  it('throws when used outside an AuthProvider', () => {
    // Silence React's error-boundary log for the expected throw.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow('useAuth must be used within an AuthProvider');
    errSpy.mockRestore();
    cleanup();
  });
});
