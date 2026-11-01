"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { AuthService, setUnauthorizedHandler } from "@/services/ApiService";
import { User } from "@/types";

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
  // False until the mount-time hydration (optimistic localStorage
  // snapshot + /users/me/ confirmation) settles. ProtectedRoute waits
  // for it before redirecting, so a not-yet-loaded session never
  // bounces a signed-in user to /login. Optional: older test contexts
  // omit it and keep the redirect-immediately behavior.
  isHydrated?: boolean;
  // OPS-2 (Wave D): re-fetch /users/me/ after a profile mutation the UI
  // reacts to (e.g. TOTP enrollment flips two_factor_enabled). Optional so
  // partial test contexts stay constructible; the real provider always
  // supplies it.
  refreshUser?: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

const USER_STORAGE_KEY = "user";

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  // One backend-logout POST per live session. Without the guard, a session
  // expiry loops: logout() POSTs /auth/logout/ → that 401s (cookies already
  // dead) → apiFetch's refresh fails → the unauthorized handler calls
  // logout() again → POST again … (unbounded; exhausted the CI worker heap
  // before the guard existed).
  const logoutPostedRef = useRef(false);

  // Stable across renders — logout fires the backend logout (blacklisting
  // the refresh cookie) when a session existed, then clears local state.
  const logout = useCallback(() => {
    if (user && !logoutPostedRef.current) {
      logoutPostedRef.current = true;
      // Fire-and-forget: blacklisting happens in the background; local
      // state clears immediately either way.
      AuthService.logout().catch(() => undefined);
    }
    setUser(null);
    if (typeof window !== "undefined") {
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
      typeof window !== "undefined" ? localStorage.getItem(USER_STORAGE_KEY) : null;
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
        if (!cancelled && typeof window !== "undefined") {
          setUser(null);
          localStorage.removeItem(USER_STORAGE_KEY);
        }
      } finally {
        // Same teardown guard as the catch arm: a late-settling promise
        // (test env torn down first) must not dispatch into a dead DOM.
        if (!cancelled && typeof window !== "undefined") {
          setIsHydrated(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((userData: User) => {
    logoutPostedRef.current = false; // a fresh session may log out again
    setUser(userData);
    if (typeof window !== "undefined") {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userData));
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await AuthService.getMe();
      if (me) {
        setUser(me);
        if (typeof window !== "undefined") {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(me));
        }
      }
    } catch {
      // A failed refresh leaves the current snapshot standing; the next
      // hydration or 401 path reconciles.
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!user,
        user,
        login,
        logout,
        refreshUser,
        isHydrated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
