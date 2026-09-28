'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthService, setUnauthorizedHandler } from '@/services/ApiService';
import { User } from '@/types';

// Ported from frontend/webcoder_ui/src/context/AuthContext.tsx (CRA reference).
// Next.js adaptation: auth state hydrates from localStorage after mount
// instead of during initial render, because this component is also
// server-rendered during App Router SSR where localStorage is undefined.
//
// NEW (not in the CRA reference): the provider registers its logout() with
// ApiService so a failed token refresh (401 -> refresh fails) clears React
// auth state, not just localStorage.

interface AuthContextType {
  isAuthenticated: boolean;
  token: string | null;
  refreshToken: string | null;
  user: User | null;
  login: (access: string, refresh: string, userData: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  // Stable across renders — logout touches only localStorage and the state
  // setters, never component-scoped data.
  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setToken(null);
    setRefreshToken(null);
    setUser(null);
  }, []);

  // Session-expiry wiring: ApiService invokes the registered handler when a
  // token refresh fails. Injected via setter (not an import of ApiService's
  // state) to keep the dependency one-directional. Declared before the
  // hydrate effect so no request can 401 before the handler exists.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // Hydrate persisted auth state on the client after mount.
  useEffect(() => {
    setToken(localStorage.getItem('accessToken'));
    setRefreshToken(localStorage.getItem('refreshToken'));
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser) as User);
      } catch {
        localStorage.removeItem('user');
      }
    }
  }, []);

  useEffect(() => {
    const fetchUserOnLoad = async () => {
      if (token && !user) {
        try {
          const fetchedUser = await AuthService.getMe();
          if (fetchedUser) {
            setUser(fetchedUser);
            localStorage.setItem('user', JSON.stringify(fetchedUser));
          }
        } catch {
          logout();
        }
      }
    };
    fetchUserOnLoad();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const login = (access: string, refresh: string, userData: User) => {
    localStorage.setItem('accessToken', access);
    localStorage.setItem('refreshToken', refresh);
    localStorage.setItem('user', JSON.stringify(userData));
    setToken(access);
    setRefreshToken(refresh);
    setUser(userData);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated: !!token, token, refreshToken, user, login, logout }}>
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
