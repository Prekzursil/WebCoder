import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { AuthService, ProblemService, setUnauthorizedHandler } from "@/services/ApiService";

// Wiring tests under the [SP1] cookie model: AuthProvider must register its
// logout with ApiService so a failed cookie refresh (401 -> refresh 401)
// clears React auth state and the cached user snapshot. These tests render
// the REAL provider with fetch stubbed — no module mocks — because the
// registration itself is the behavior under test.

const API_BASE = "http://localhost:8000/api/v1";
const REFRESH_URL = `${API_BASE}/auth/token/refresh/`;
const ME_URL = `${API_BASE}/users/me/`;
const LOGOUT_URL = `${API_BASE}/auth/logout/`;

const storedUser = { id: 1, username: "alice", email: "alice@example.com", role: "ADMIN" } as const;

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function unauthorized(): Response {
  return jsonResponse(
    { detail: "Given token not valid" },
    { status: 401, statusText: "Unauthorized" },
  );
}

function seedSession(): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("user", JSON.stringify(storedUser));
  }
}

const AuthStateProbe: React.FC = () => {
  const auth = useAuth();
  return <div data-testid="auth-state">{auth.isAuthenticated ? "authed" : "anon"}</div>;
};

afterEach(() => {
  cleanup();
  setUnauthorizedHandler(null);
  if (typeof window !== "undefined") {
    localStorage.clear();
  }
  // jsdom has no cookie jar behavior for Set-Cookie on fetch; tests here
  // stub responses directly, so nothing else to reset.
  vi.unstubAllGlobals();
});

describe("AuthContext <-> ApiService session-expiry wiring (cookie model)", () => {
  it("logs out via the provider when a refresh fails (401 -> refresh 401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse(
            { detail: "Token is invalid or expired" },
            { status: 401, statusText: "Unauthorized" },
          );
        }
        return unauthorized();
      }),
    );

    seedSession();
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );

    // The hydration me round-trip fails, the refresh fails -> provider logout.
    await screen.findByText("anon");

    // A service call whose refresh fails must trigger the provider's logout.
    await act(async () => {
      await ProblemService.getTags().catch(() => undefined);
    });

    expect(screen.getByTestId("auth-state")).toHaveTextContent("anon");
    expect(localStorage.getItem("user")).toBeNull();
  });

  it("POSTs the backend logout at most ONCE per session (no re-entrant loop)", async () => {
    // Regression: with dead cookies, logout()'s POST /auth/logout/ 401s ->
    // apiFetch's refresh fails -> the unauthorized handler calls logout()
    // again -> another POST... unbounded. The provider must post once per
    // live session and stop (this loop exhausted the CI worker's heap).
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input) === REFRESH_URL) {
        return jsonResponse({ detail: "expired" }, { status: 401, statusText: "Unauthorized" });
      }
      return unauthorized();
    });
    vi.stubGlobal("fetch", fetchMock);

    seedSession();
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await screen.findByText("anon");

    const logoutPosts = () =>
      fetchMock.mock.calls.filter(([input]) => String(input) === LOGOUT_URL).length;
    await vi.waitFor(() => expect(logoutPosts()).toBe(1));
    // Give any (buggy) re-entrant loop room to fire more posts — none may.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(logoutPosts()).toBe(1);
    expect(screen.getByTestId("auth-state")).toHaveTextContent("anon");
  });

  it("keeps the session when the refresh succeeds and retries with cookies", async () => {
    let meCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown, init?: RequestInit) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse({ access: "rotated" });
        }
        if (String(input) === ME_URL) {
          meCalls += 1;
          // First me (hydration) 401s -> refresh -> retry succeeds.
          if (meCalls === 1) return unauthorized();
          return jsonResponse(storedUser);
        }
        const auth = new Headers(init?.headers).get("Authorization");
        return auth === null ? jsonResponse([{ id: 3, name: "arrays" }]) : unauthorized();
      }),
    );

    seedSession();
    render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await screen.findByText("authed");

    let tags: unknown;
    await act(async () => {
      tags = await ProblemService.getTags();
    });

    expect(tags).toEqual([{ id: 3, name: "arrays" }]);
    expect(screen.getByTestId("auth-state")).toHaveTextContent("authed");
    // Cookie mode: requests carry NO Authorization header and DO ask for
    // credentials.
    const fetchMock = vi.mocked(fetch);
    const call = fetchMock.mock.calls.at(-1);
    expect(new Headers(call?.[1]?.headers).get("Authorization")).toBeNull();
    expect(call?.[1]?.credentials).toBe("include");
  });

  it("unregisters the handler on unmount so later refresh failures do not touch the provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        if (String(input) === REFRESH_URL) {
          return jsonResponse({ detail: "expired" }, { status: 401, statusText: "Unauthorized" });
        }
        return unauthorized();
      }),
    );

    seedSession();
    const { unmount } = render(
      <AuthProvider>
        <AuthStateProbe />
      </AuthProvider>,
    );
    await screen.findByText("anon");
    unmount();

    // Re-seed a session; a failed refresh after unmount must NOT clear it
    // (the handler is detached, so nothing observes the expiry anymore).
    seedSession();
    await AuthService.getMe().catch(() => undefined);

    expect(localStorage.getItem("user")).toBe(JSON.stringify(storedUser));
  });
});
