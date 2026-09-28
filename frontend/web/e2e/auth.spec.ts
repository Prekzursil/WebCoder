// E2E: login journey + auth-state hydration (client-side, src/app/login/page.tsx
// + src/context/AuthContext.tsx). The login POST goes browser -> mock API.

import { test, expect } from '@playwright/test';

test('login form rejects bad credentials with the API error', async ({
  page,
}) => {
  await page.goto('/login');

  await page.fill('#login-username', 'bad_user');
  await page.fill('#login-password', 'wrong-password');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // Next.js injects an empty aria-live route announcer that also carries
  // role=alert — filter to the MUI error alert by its text.
  const errorAlert = page
    .getByRole('alert')
    .filter({ hasText: 'Invalid credentials.' });
  await expect(errorAlert).toBeVisible();
});

test('successful login persists tokens and shows the authenticated navbar', async ({
  page,
}) => {
  await page.goto('/login');

  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // AuthService.login resolves -> auth.login(...) -> router.push('/')
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText('Welcome, e2e_tester!')).toBeVisible();

  // AuthContext persists both tokens + user snapshot in localStorage.
  const accessToken = await page.evaluate(() =>
    localStorage.getItem('accessToken')
  );
  const refreshToken = await page.evaluate(() =>
    localStorage.getItem('refreshToken')
  );
  expect(accessToken).toBe('e2e-access-token');
  expect(refreshToken).toBe('e2e-refresh-token');
});

test('hydrated admin session derives role-gated navbar links', async ({
  page,
}) => {
  // Seed localStorage before any app script runs — exercises the
  // AuthContext hydration path (token + stored user, no /users/me/ call).
  await page.addInitScript(() => {
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

  await page.goto('/');

  await expect(page.getByText('Welcome, admin_e2e!')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Admin Dashboard' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Verification Queue' })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Create Problem' })
  ).toBeVisible();
});
