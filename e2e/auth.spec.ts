// E2E: login journey + auth-state hydration (client-side, src/app/login/page.tsx
// + src/context/AuthContext.tsx). The login POST goes browser -> mock API.

import { test, expect } from '@playwright/test';
import { isRealStack, ensureRealStackFixtures, E2E_ADMIN_USER, E2E_ADMIN_PASS } from './lib/realStack';

// Real-backend mode: the login round-trip is login POST + /users/me/ (with
// DB hits) on a stack that may share a loaded host with the dev server —
// the default 10s expect timeout flaked under load even though every
// response was correct (observed: spinner held past timeout, then pass on
// retry). Give the whole file breathing room in real mode only.
if (isRealStack) {
  test.setTimeout(90_000);
}

test('login form rejects bad credentials with the API error', async ({
  page,
}) => {
  await page?.goto('/login');

  await page?.fill('#login-username', 'bad_user');
  await page?.fill('#login-password', 'wrong-password');
  await page?.getByRole('button', { name: 'Login', exact: true })?.click();

  // Next.js injects an empty aria-live route announcer that also carries
  // role=alert — filter to the MUI error alert by its text. The mock API
  // says "Invalid credentials."; real dj-rest-auth surfaces
  // non_field_errors ("Unable to log in with provided credentials.") —
  // apiFetch extracts both since the Q13 real-stack mode.
  const errorAlert = page
    ?.getByRole('alert')
    ?.filter({ hasText: isRealStack ? 'Unable to log in with provided credentials.' : 'Invalid credentials.' });
  await expect(errorAlert)?.toBeVisible();
});

test('successful login persists tokens and shows the authenticated navbar', async ({
  page,
}) => {
  // Real mode: the fixture user is seeded idempotently by the shared
  // helper (registration is a no-op when the account already exists).
  if (isRealStack) await ensureRealStackFixtures();
  await page?.goto('/login');

  await page?.fill('#login-username', 'e2e_tester');
  await page?.fill('#login-password', 'correct-horse-battery-staple');
  await page?.getByRole('button', { name: 'Login', exact: true })?.click();

  // AuthService.login resolves -> auth.login(...) -> router.push('/')
  await expect(page)?.toHaveURL(/\/$/);
  // The navbar greets with the bare username (Navbar.tsx renders
  // `{auth.user?.username || 'User'}`), pinned by Navbar.test.tsx.
  await expect(page?.getByText('e2e_tester', { exact: true }))?.toBeVisible();

  // AuthContext persists both tokens + user snapshot in localStorage.
  const accessToken = await page?.evaluate(() =>
    localStorage.getItem('accessToken')
  );
  const refreshToken = await page?.evaluate(() =>
    localStorage.getItem('refreshToken')
  );
  if (isRealStack) {
    // Real stack: actual JWTs (header.payload.signature), seeded by
    // e2e/lib/realStack.ts before the suite runs.
    expect(accessToken).toMatch(/^ey[^.]+\.[^.]+\./);
    expect(refreshToken).toMatch(/^ey[^.]+\.[^.]+\./);
  } else {
    expect(accessToken)?.toBe('e2e-access-token');
    expect(refreshToken)?.toBe('e2e-refresh-token');
  }
});

test('hydrated admin session derives role-gated navbar links', async ({
  page,
}) => {
  if (isRealStack) {
    // Real stack: a fake token is (correctly) rejected — any authorized
    // API call 401s and the app clears the stale session. Log in for real
    // as the stack admin and derive the gated links from a live session.
    await page?.goto('/login');
    await page?.fill('#login-username', E2E_ADMIN_USER);
    await page?.fill('#login-password', E2E_ADMIN_PASS);
    await page?.getByRole('button', { name: 'Login', exact: true })?.click();
    await expect(page)?.toHaveURL(/\/$/);
    await expect(page?.getByText(E2E_ADMIN_USER, { exact: true }))?.toBeVisible();
  } else {
    // Mock mode: seed localStorage before any app script runs — exercises
    // the AuthContext hydration path (token + stored user, no /users/me/).
    await page?.addInitScript(() => {
      localStorage.setItem('accessToken', 'e2e-access-token');
      localStorage.setItem('refreshToken', 'e2e-refresh-token');
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: 2,
          username: 'admin_e2e',
          email: 'admin@e2e.local',
          role: 'ADMIN',
        })
      );
    });
    await page?.goto('/');
    await expect(page?.getByText('admin_e2e', { exact: true }))?.toBeVisible();
  }

  // A8: account + role links now live in the avatar dropdown menu.
  await page?.getByRole('button', { name: 'Account menu' })?.click();
  const menu = page?.getByRole('menu');
  await expect(menu?.getByRole('menuitem', { name: 'Admin Dashboard' }))?.toBeVisible();
  await expect(menu?.getByRole('menuitem', { name: 'Verification Queue' }))?.toBeVisible();
  await expect(menu?.getByRole('menuitem', { name: 'Create Problem' }))?.toBeVisible();
  await expect(menu?.getByRole('menuitem', { name: 'Profile' }))?.toBeVisible();
});
