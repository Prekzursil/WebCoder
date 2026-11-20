// E2E [wave G item 99]: the teacher-side join QR on the classes page
// (mock mode; the mobile scanner side is covered by mobile jest).

import { test, expect } from '@playwright/test';

const AUTH_COOKIE = [
  { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
];

test('the teacher class list renders a join QR with the code', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
      }),
    );
  });
  await page.goto('/classes');
  const qr = page.getByTestId('class-qr-AB12CD');
  await expect(qr).toBeVisible();
  await expect(qr.locator('img')).toBeVisible();
  await expect(qr).toContainText('AB12CD');
  // The class joins with a password: the local embed input appears.
  await expect(page.getByTestId('qr-password-AB12CD')).toBeVisible();
});
