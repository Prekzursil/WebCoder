// E2E: [ONB-1] the password-reset journey the roadmap pins for Wave A
// ("verified password-reset E2E once SP5 lands"). Mock mode drives the
// full UI happy path (request → mailed-link landing → new password set →
// back to login). Real mode (E2E_API_BASE) verifies the same UI against
// the live dj-rest-auth stack for both endpoints; the confirm happy path
// there needs the single-use token from the mail body, which the backend
// pytest round-trip covers (users/test_password_reset.py) — the UI side
// pins the request-success and expired-token states, which need no mail
// access and stay deterministic.

import { test, expect } from '@playwright/test';
import { isRealStack, E2E_USER } from './lib/realStack';

test('login page links the forgot-password flow', async ({ page }) => {
  await page?.goto('/login');
  await expect(page?.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute(
    'href',
    '/forgot-password'
  );
});

test('requesting a reset shows the account-agnostic confirmation', async ({ page }) => {
  await page?.goto('/forgot-password');

  await page?.fill('#forgot-password-email', 'learner@example.com');
  await page?.getByRole('button', { name: 'Send reset link' }).click();

  await expect(page?.getByTestId('forgot-password-sent')).toBeVisible();
  await expect(page?.getByTestId('forgot-password-sent')).toContainText(
    /If that email belongs to an account/
  );
});

test('reset confirm consumes uid+token from the mailed link and lands on success', async ({
  page,
}) => {
  // Mock-only: the deterministic mock-uid/mock-token pair exists solely in
  // the mock API; against the real stack the pair is (correctly) rejected.
  // The real happy path is covered end-to-end by the backend round-trip
  // pytest (users/test_password_reset.py) against real allauth tokens, and
  // the UI side of the real stack is covered by the forged-token lane
  // below.
  test.skip(isRealStack, 'mock-only: deterministic mock uid/token pair');
  // The link the mail carries: /reset-password?uid=...&token=...
  await page?.goto('/reset-password?uid=mock-uid&token=mock-token');

  await page?.fill('#reset-password-new', 'NewPass-2026!y');
  await page?.fill('#reset-password-confirm', 'NewPass-2026!y');
  await page?.getByRole('button', { name: 'Set new password' }).click();

  await expect(page?.getByTestId('reset-password-done')).toBeVisible();
  await expect(page?.getByTestId('reset-password-done')).toContainText('Password updated');
  await expect(
    page?.getByRole('link', { name: 'Back to login' })
  ).toHaveAttribute('href', '/login');
});

test('a used or forged token routes to the request-a-new-link state', async ({ page }) => {
  await page?.goto('/reset-password?uid=forged&token=forged');

  await page?.fill('#reset-password-new', 'NewPass-2026!y');
  await page?.fill('#reset-password-confirm', 'NewPass-2026!y');
  await page?.getByRole('button', { name: 'Set new password' }).click();

  await expect(page?.getByTestId('reset-password-invalid')).toBeVisible();
  await expect(
    page?.getByRole('link', { name: 'Request a new link' })
  ).toHaveAttribute('href', '/forgot-password');
});

test('opening the confirm page without a link shows the invalid state', async ({ page }) => {
  await page?.goto('/reset-password');
  await expect(page?.getByTestId('reset-password-invalid')).toBeVisible();
});

// ---------------------------------------------------------------------------
// Real-stack lane (runs only with E2E_API_BASE set; inert in CI mock mode).
// ---------------------------------------------------------------------------

if (isRealStack) {
  test.describe('real stack: reset endpoints answer through the UI', () => {
    test('request for the fixture account succeeds through the real API', async ({ page }) => {
      // The seeded fixture user's address (e2e/lib/realStack.ts). The
      // console email backend prints the mail server-side; the UI success
      // state is what a user sees either way.
      await page?.goto('/forgot-password');
      await page?.fill('#forgot-password-email', `${E2E_USER}@e2e.local`);
      await page?.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page?.getByTestId('forgot-password-sent')).toBeVisible();
    });

    test('unknown email still answers 200 through the UI (no enumeration)', async ({ page }) => {
      await page?.goto('/forgot-password');
      await page?.fill('#forgot-password-email', 'nobody@nowhere.invalid');
      await page?.getByRole('button', { name: 'Send reset link' }).click();
      await expect(page?.getByTestId('forgot-password-sent')).toBeVisible();
    });

    test('forged token against the real API shows the invalid state', async ({ page }) => {
      await page?.goto('/reset-password?uid=not-a-uid&token=not-a-token');
      await page?.fill('#reset-password-new', 'NewPass-2026!y');
      await page?.fill('#reset-password-confirm', 'NewPass-2026!y');
      await page?.getByRole('button', { name: 'Set new password' }).click();
      await expect(page?.getByTestId('reset-password-invalid')).toBeVisible();
    });
  });
}
