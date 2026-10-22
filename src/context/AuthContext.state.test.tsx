import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act, cleanup } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import type { User } from '@/types';

// Auth-state lifecycle tests under the [SP1] cookie model: NO tokens —
// the provider tracks only the user profile; hydration optimistically
// paints the cached `user` snapshot then confirms via GET /users/me/.
// The unauthorized-handler registration effect has its own tests in
// AuthContext.test.tsx; AuthService is mocked here, localStorage runs real.

const mocks = vi.hoisted(() => ({
  getMe: vi.fn(),
  logout: vi.fn(),
  setUnauthorizedHandler: vi.fn(),
}));

vi.mock('@/services/ApiService', () => ({
  AuthService: { getMe: mocks.getMe, logout: mocks.logout },
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
  mocks.logout.mockResolvedValue({ detail: 'Logged out.' });
});

afterEach(cleanup);

describe('AuthProvider auth-state lifecycle (cookie model)', () => {
  it('starts unauthenticated and hydrates a stored user snapshot, then refreshes it from /users/me/', async () => {
    const fresh: User = { ...user, username: 'tester-refreshed' };
    mocks.getMe.mockResolvedValue(fresh);
    localStorage.setItem('user', JSON.stringify(user));
    renderWithProvider();
    // Optimistic snapshot paints first...
    await waitFor(() => expect(authState?.user).toEqual(user));
    // ...then the me round-trip replaces it.
    await waitFor(() => expect(authState?.user).toEqual(fresh));
    expect(authState?.isAuthenticated).toBe(true);
    expect(mocks.getMe).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('user')).toBe(JSON.stringify(fresh));
  });

  it('signs in an anonymous visitor when /users/me/ 401s', async () => {
    mocks.getMe.mockRejectedValue(new Error('401'));
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(authState?.user).toBeNull();
    expect(authState?.isAuthenticated).toBe(false);
  });

  it('drops a corrupt stored user but still confirms via getMe', async () => {
    localStorage.setItem('user', '{not json');
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(authState?.user).toEqual(user));
    expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
  });

  it('login(user) persists the snapshot and flips isAuthenticated', async () => {
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await act(async () => {
      authState!.login(user);
    });
    expect(authState?.user).toEqual(user);
    expect(authState?.isAuthenticated).toBe(true);
    expect(localStorage.getItem('user')).toBe(JSON.stringify(user));
    // No token keys are ever written.
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('logout wipes storage and state, posting the backend logout when a session exists', async () => {
    localStorage.setItem('user', JSON.stringify(user));
    renderWithProvider();
    await waitFor(() => expect(authState?.isAuthenticated).toBe(true));
    await act(async () => {
      authState!.logout();
    });
    expect(authState?.user).toBeNull();
    expect(authState?.isAuthenticated).toBe(false);
    expect(localStorage.getItem('user')).toBeNull();
    expect(mocks.logout).toHaveBeenCalledTimes(1);
  });

  it('logout with no session does not POST the backend logout', async () => {
    mocks.getMe.mockRejectedValue(new Error('401'));
    renderWithProvider();
    await waitFor(() => expect(mocks.getMe).toHaveBeenCalledTimes(1));
    await act(async () => {});
    await act(async () => {
      authState!.logout();
    });
    expect(mocks.logout).not.toHaveBeenCalled();
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
