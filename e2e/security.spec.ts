// E2E: OPS-2 (Wave D) security surfaces — the warn-phase banner on
// privileged pages and the Profile → Security enrollment + token flows.
// Mock mode only: the mock TOTP accepts the deterministic code 123456;
// the real stack has no such backdoor (by design).

import { test, expect, type Page } from '@playwright/test';
import { isRealStack } from './lib/realStack';

test.skip(isRealStack, 'mock-only: the deterministic TOTP code exists only in the mock API');

// Mock-mode session seeding (the auth.spec pattern): cookie + optimistic
// user snapshot before any app script runs, so protected routes never
// bounce through the hydration race. The login flow itself is covered by
// auth.spec.
async function login(page: Page, context: import('@playwright/test').BrowserContext) {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access-token', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 1,
        username: 'e2e_tester',
        email: 'e2e@example.com',
        role: 'PROBLEM_CREATOR',
        two_factor_enabled: false,
        two_factor_required: true,
      })
    );
  });
}

test('privileged pages carry the two-factor warn banner with a profile link', async ({
  page,
  context,
}) => {
  await login(page, context);
  await page.goto('/my-created-problems');

  const banner = page.getByTestId('two-factor-banner');
  await expect(banner).toBeVisible();
  await expect(banner.getByRole('link', { name: /Profile → Security/i })).toHaveAttribute(
    'href',
    '/profile'
  );
});

test('profile → settings walks TOTP enrollment end to end', async ({
  page,
  context,
}) => {
  await login(page, context);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'settings', exact: true }).click();

  await expect(page.getByText(/Two-Factor Authentication \(TOTP\)/i)).toBeVisible();

  // Begin: the secret + otpauth URI appear.
  await page.getByRole('button', { name: /Enable two-factor/i }).click();
  await expect(page.getByTestId('totp-secret')).toHaveText('MOCKSECRETMOCKSECRETMOCKSECRET32');
  await expect(page.getByText(/otpauth:\/\/totp\//)).toBeVisible();

  // The mock only accepts 123456 — a wrong code is rejected with the
  // backend message.
  await page.getByLabel(/Authenticator code/i).fill('000000');
  await page.getByRole('button', { name: /Verify and enable/i }).click();
  await expect(page.getByText('Invalid or expired code.')).toBeVisible();

  // The right code completes enrollment (banner disappears after the
  // user snapshot refresh).
  await page.getByLabel(/Authenticator code/i).fill('123456');
  await page.getByRole('button', { name: /Verify and enable/i }).click();
  await expect(page.getByText(/Two-factor authentication enabled/i)).toBeVisible();

  await page.goto('/my-created-problems');
  await expect(page.getByTestId('two-factor-banner')).toHaveCount(0);
});

test('profile → settings mints and revokes the personal API token', async ({
  page,
  context,
}) => {
  await login(page, context);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'settings', exact: true }).click();

  await expect(page.getByText(/Personal API Token/i)).toBeVisible();
  await page.getByRole('button', { name: /Create token/i }).click();

  // The key is shown exactly once, with the store-it-now warning.
  await expect(page.getByText(/Store this key now/i)).toBeVisible();
  await expect(page.getByText(/e2e-mock-personal-token-0123456789abcdef/)).toBeVisible();

  // Revoke returns to the mint state.
  await page.getByRole('button', { name: /^Revoke$/i }).click();
  await expect(page.getByRole('button', { name: /Create token/i })).toBeVisible({
    timeout: 5000,
  });
  await expect(page.getByText(/e2e-mock-personal-token-0123456789abcdef/)).toHaveCount(0);
});
