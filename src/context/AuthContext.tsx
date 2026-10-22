'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthService, setUnauthorizedHandler } from '@/services/ApiService';
import { User } from '@/types';

// [SP1] httpOnly-cookie auth state. No tokens live in the browser's JS:
// the wc_access/wc_refresh cookies are httpOnly, so this context tracks
// ONLY the user profile. `isAuthenticated === !!user`, hydrated on mount
// via GET /users/me/ (which transparently refreshes expired cookies through
// ApiService). A cached `user` snapshot in localStorage keeps the first
// paint free of a logged-out flash; it is never a source of truth.

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = 'user';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);

  // Stable across renders — logout fires the backend logout (blacklisting
  // the refresh cookie) when a session existed, then clears local state.
  const logout = useCallback(() => {
    if (user) {
      // Fire-and-forget: blacklisting happens in the background; local
      // state clears immediately either way.
      AuthService.logout().catch(() => undefined);
    }
    setUser(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(USER_STORAGE_KEY);
    }
  }, [user]);

  // Session-expiry wiring: ApiService invokes the registered handler when a
  // token refresh fails. Injected via setter (not an import of ApiService's
  // state) to keep the dependency one-directional. Declared before the
  // hydrate effect so no request can 401 before the handler exists.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Hydrate the session from cookies after mount: the cached user snapshot
  // paints instantly, then GET /users/me/ confirms it against the backend
  // (200 → refresh snapshot; failure incl. failed refresh → clear).
  useEffect(() => {
    let cancelled = false;
    const storedUser =
      typeof window !== 'undefined' ? localStorage.getItem(USER_STORAGE_KEY) : null;
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }
    (async () => {
      try {
        const me = await AuthService.getMe();
        if (!cancelled && me) {
          setUser(me);
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(me));
        }
      } catch {
        // Anonymous or expired session: drop the optimistic snapshot. The
        // window guard keeps a LATE-settling promise (e.g. a test
        // environment torn down before the fetch settles) from dispatching
        // React state into a destroyed DOM.
        if (!cancelled && typeof window !== 'undefined') {
          setUser(null);
          localStorage.removeItem(USER_STORAGE_KEY);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((userData: User) => {
    setUser(userData);
    if (typeof window !== 'undefined') {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    }
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!user, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
