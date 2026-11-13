// AuthStore — the mobile counterpart of the web's AuthContext: bootstrap
// from persisted tokens, login/register/logout, and the
// unauthorized-handler wiring that force-logouts when a refresh fails.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { setTokenStore, setUnauthorizedHandler } from '../services/ApiClient';
import { AuthService, login as loginRequest } from '../services/AuthService';
import type { User } from '../types/api';
import { clearTokens, secureTokenStore } from './tokenStore';

export type AuthStatus = 'bootstrapping' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  /** Login with username/password; resolves the user on success. */
  signIn: (username: string, password: string) => Promise<void>;
  /** Register then auto-login (dj-rest-auth registration is separate). */
  signUp: (data: {
    username: string;
    email: string;
    password1: string;
    password2: string;
  }) => Promise<void>;
  signOut: () => Promise<void>;
  /** Re-fetch /users/me/ (pull-to-refresh on profile surfaces). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

setTokenStore(secureTokenStore);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('bootstrapping');
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Bootstrap: tokens exist → /users/me/ decides authenticated/anonymous.
  useEffect(() => {
    let alive = true;
    (async () => {
      const access = await secureTokenStore.getAccess();
      if (!access) {
        if (alive) setStatus('anonymous');
        return;
      }
      try {
        const me = await AuthService.getMe();
        if (alive) {
          setUser(me);
          setStatus('authenticated');
        }
      } catch {
        if (alive) setStatus('anonymous');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // A failed refresh anywhere in the app force-logouts (web parity).
  useEffect(() => {
    const handler = () => {
      setUser(null);
      setStatus('anonymous');
      setError(null);
    };
    setUnauthorizedHandler(handler);
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setError(null);
    try {
      const { user: me, tokens } = await loginRequest({ username, password });
      if (tokens) {
        await secureTokenStore.setAccess(tokens.access);
        await secureTokenStore.setRefresh(tokens.refresh);
      }
      setUser(me);
      setStatus('authenticated');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    }
  }, []);

  const signUp = useCallback(
    async (data: { username: string; email: string; password1: string; password2: string }) => {
      setError(null);
      await AuthService.register(data);
      await signIn(data.username, data.password1);
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    try {
      await AuthService.logout();
    } catch {
      // Fire-and-forget: the local session is cleared regardless.
    }
    await clearTokens();
    setUser(null);
    setStatus('anonymous');
    setError(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await AuthService.getMe();
    setUser(me);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      error,
      signIn,
      signUp,
      signOut,
      refreshUser,
    }),
    [status, user, error, signIn, signUp, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
