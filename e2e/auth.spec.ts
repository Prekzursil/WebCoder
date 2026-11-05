// E2E: login journey + auth-state hydration (client-side, src/app/login/page.tsx
// + src/context/AuthContext.tsx). The login POST goes browser -> mock API.

import { test, expect } from "@playwright/test";
import {
  isRealStack,
  ensureRealStackFixtures,
  E2E_ADMIN_USER,
  E2E_ADMIN_PASS,
} from "./lib/realStack";

// Real-backend mode: the login round-trip is login POST + /users/me/ (with
// DB hits) on a stack that may share a loaded host with the dev server —
// the default 10s expect timeout flaked under load even though every
// response was correct (observed: spinner held past timeout, then pass on
// retry). Give the whole file breathing room in real mode only.
if (isRealStack) {
  test.setTimeout(90_000);
}

test("login form rejects bad credentials with the API error", async ({ page }) => {
  await page?.goto("/login");

  await page?.fill("#login-username", "bad_user");
  await page?.fill("#login-password", "wrong-password");
  await page?.getByRole("button", { name: "Login", exact: true })?.click();

  // Next.js injects an empty aria-live route announcer that also carries
  // role=alert — filter to the MUI error alert by its text. The mock API
  // says "Invalid credentials."; real dj-rest-auth surfaces
  // non_field_errors ("Unable to log in with provided credentials.") —
  // apiFetch extracts both since the Q13 real-stack mode.
  const errorAlert = page?.getByRole("alert")?.filter({
    hasText: isRealStack ? "Unable to log in with provided credentials." : "Invalid credentials.",
  });
  await expect(errorAlert)?.toBeVisible();
});

test("successful login sets httpOnly session cookies and shows the authenticated navbar", async ({
  page,
  context,
}) => {
  // Real mode: the fixture user is seeded idempotently by the shared
  // helper (registration is a no-op when the account already exists).
  if (isRealStack) await ensureRealStackFixtures();
  await page?.goto("/login");

  await page?.fill("#login-username", "e2e_tester");
  await page?.fill("#login-password", "correct-horse-battery-staple");
  await page?.getByRole("button", { name: "Login", exact: true })?.click();

  // AuthService.login resolves -> auth.login(...) -> router.push('/')
  await expect(page)?.toHaveURL(/\/$/);
  // The navbar greets with the bare username (Navbar.tsx renders
  // `{auth.user?.username || 'User'}`), pinned by Navbar.test.tsx.
  await expect(page?.getByText("e2e_tester", { exact: true }))?.toBeVisible();

  // [SP1] cookie auth: the session lives in httpOnly wc_access/wc_refresh
  // cookies (readable via the browser context, never via JS/localStorage).
  const cookies = (await context?.cookies()) ?? [];
  const names = new Set(cookies.map((c) => c.name));
  expect(names).toContain("wc_access");
  expect(names).toContain("wc_refresh");
  const accessCookie = cookies.find((c) => c.name === "wc_access");
  const refreshCookie = cookies.find((c) => c.name === "wc_refresh");
  expect(accessCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.httpOnly).toBe(true);
  if (isRealStack) {
    // Real stack: actual JWTs (header.payload.signature) in both cookies.
    expect(accessCookie?.value).toMatch(/^ey[^.]+\.[^.]+\./);
    expect(refreshCookie?.value).toMatch(/^ey[^.]+\.[^.]+\./);
  } else {
    expect(accessCookie?.value).toBe("e2e-access-token");
  }
  // No tokens in JS-readable storage — that was the whole point of SP1.
  const leaked = await page?.evaluate(() => ({
    access: localStorage.getItem("accessToken"),
    refresh: localStorage.getItem("refreshToken"),
  }));
  expect(leaked?.access).toBeNull();
  expect(leaked?.refresh).toBeNull();
});

test("hydrated admin session derives role-gated navbar links", async ({ page, context }) => {
  if (isRealStack) {
    // Real stack: log in for real as the stack admin and derive the gated
    // links from a live session.
    await page?.goto("/login");
    await page?.fill("#login-username", E2E_ADMIN_USER);
    await page?.fill("#login-password", E2E_ADMIN_PASS);
    await page?.getByRole("button", { name: "Login", exact: true })?.click();
    await expect(page)?.toHaveURL(/\/$/);
    await expect(page?.getByText(E2E_ADMIN_USER, { exact: true }))?.toBeVisible();
  } else {
    // Mock mode: seed the session cookie + stored user snapshot before any
    // app script runs — exercises the AuthContext hydration path (cookie
    // session confirmed via /users/me/, optimistic user snapshot paints
    // meanwhile). The mock API is same-site (localhost), so the Lax cookie
    // flows on fetches.
    await context?.addCookies([
      { name: "wc_access", value: "e2e-admin-access", domain: "localhost", path: "/" },
    ]);
    await page?.addInitScript(() => {
      localStorage.setItem(
        "user",
        JSON.stringify({
          id: 2,
          username: "admin_e2e",
          email: "admin@e2e.local",
          role: "ADMIN",
        }),
      );
    });
    await page?.goto("/");
    await expect(page?.getByText("admin_e2e", { exact: true }))?.toBeVisible();
  }

  // A8: account + role links now live in the avatar dropdown menu.
  await page?.getByRole("button", { name: "Account menu" })?.click();
  const menu = page?.getByRole("menu");
  await expect(menu?.getByRole("menuitem", { name: "Admin Dashboard" }))?.toBeVisible();
  await expect(menu?.getByRole("menuitem", { name: "Verification Queue" }))?.toBeVisible();
  await expect(menu?.getByRole("menuitem", { name: "Create Problem" }))?.toBeVisible();
  await expect(menu?.getByRole("menuitem", { name: "Profile" }))?.toBeVisible();
});
