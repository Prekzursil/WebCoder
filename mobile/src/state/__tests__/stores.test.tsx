// AuthStore tests: bootstrap lanes, sign in/out/up, unauthorized handler.
import React from 'react';
import { render, renderHook, waitFor, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthStore';
import { __resetForTests, setTokenStore } from '../../services/ApiClient';
import { secureTokenStore } from '../tokenStore';
import * as SecureStore from 'expo-secure-store';

// The jest.setup in-memory keychain exposes seeding hooks.
const keychain = SecureStore as typeof SecureStore & {
  __set: (k: string, v: string) => void;
  __clear: () => void;
};

const calls = () => (global.fetch as jest.Mock).mock.calls;

const user = { id: 2, username: 'bob', email: 'b@x', role: 'BASIC' as const };

const okJson = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: '',
  json: async () => body,
  headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
});

async function harness() {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
  const hook = await renderHook(() => useAuth(), { wrapper });
  return { ...hook, wrapper };
}

beforeEach(() => {
  global.fetch = jest.fn();
  keychain.__clear();
  // __resetForTests clears the ApiClient store seam — reinstall it so each
  // test exercises the real SecureStore-backed implementation.
  setTokenStore(secureTokenStore);
});

afterEach(() => {
  __resetForTests();
});

describe('bootstrap', () => {
  it('goes anonymous without an access token (no /users/me call)', async () => {
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(0);
  });

  it('restores the session with a stored access token', async () => {
    keychain.__set('wc_access', 'TOKEN');
    keychain.__set('wc_refresh', 'REFRESH');
    (global.fetch as jest.Mock).mockResolvedValueOnce(okJson(user));
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user?.username).toBe('bob');
    const [url, init] = calls()[0];
    expect(url).toContain('/users/me/');
    expect(init.headers.Authorization).toBe('Bearer TOKEN');
  });

  it('degrades to anonymous when /users/me/ rejects', async () => {
    keychain.__set('wc_access', 'STALE');
    (global.fetch as jest.Mock).mockResolvedValueOnce(okJson({}, 401));
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });
});

describe('signIn', () => {
  it('stores the token pair and sets the user', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      okJson({ access: 'A', user }, 200, {
        'set-cookie': 'wc_refresh=R; Path=/',
      }),
    );
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signIn('bob', 'pw');
    });
    expect(result.current.status).toBe('authenticated');
    expect(await secureTokenStore.getAccess()).toBe('A');
    expect(await secureTokenStore.getRefresh()).toBe('R');
  });

  it('surfaces login errors without changing state', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(okJson({ non_field_errors: ['nope'] }, 400));
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    let caught: unknown = null;
    await act(async () => {
      try {
        await result.current.signIn('x', 'y');
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('nope');
    expect(result.current.status).toBe('anonymous');
    expect(result.current.error).toBe('nope');
  });
});

describe('signUp + signOut + refreshUser', () => {
  it('registers then auto-logs in', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okJson({ user, message: 'ok' }))
      .mockResolvedValueOnce(
        okJson({ access: 'A', user }, 200, { 'set-cookie': 'wc_refresh=R; Path=/' }),
      );
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => {
      await result.current.signUp({
        username: 'bob',
        email: 'b@x',
        password1: 'p',
        password2: 'p',
      });
    });
    expect(result.current.status).toBe('authenticated');
    expect(calls()[0][0]).toContain('/users/register/');
    expect(calls()[1][0]).toContain('/auth/login/');
  });

  it('signOut clears tokens + state even when the API call fails', async () => {
    keychain.__set('wc_access', 'A');
    keychain.__set('wc_refresh', 'R');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okJson(user)) // bootstrap me
      .mockResolvedValueOnce(okJson({}, 500)); // logout failure ignored
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.status).toBe('anonymous');
    expect(await secureTokenStore.getAccess()).toBeNull();
  });

  it('refreshUser swaps the user object', async () => {
    keychain.__set('wc_access', 'A');
    keychain.__set('wc_refresh', 'R');
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okJson(user))
      .mockResolvedValueOnce(okJson({ ...user, username: 'bob2' }));
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => {
      await result.current.refreshUser();
    });
    expect(result.current.user?.username).toBe('bob2');
  });
});

describe('unauthorized handler wiring', () => {
  it('force-logouts when a refresh fails mid-session', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (k: string) =>
      k === 'wc_access' ? 'STALE' : 'DEAD_REFRESH',
    );
    // bootstrap: /users/me/ → 401, refresh → 401 → anonymous
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(okJson({}, 401))
      .mockResolvedValueOnce(okJson({ detail: 'blacklisted' }, 401));
    const { result } = await harness();
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });
});

describe('useAuth outside the provider', () => {
  it('throws a helpful error', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(async () => renderHook(() => useAuth())).rejects.toThrow(/AuthProvider/);
    spy.mockRestore();
  });
});

describe('AuthProvider render smoke', () => {
  it('renders children', async () => {
    const rendered = await render(
      <AuthProvider>
        <></>
      </AuthProvider>,
    );
    expect(rendered).toBeTruthy();
  });
});
