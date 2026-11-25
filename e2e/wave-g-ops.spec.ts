// E2E [wave G items 135-145]: the public /status page (judge queue
// transparency + component health) and the admin Operations panel
// (autoscale card, cost projection, error stream). Mock mode.

import { test, expect } from '@playwright/test';

const AUTH_COOKIE = [
  { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
];

test('the public status page shows overall health and the queue lanes', async ({ page }) => {
  await page.goto('/status');
  await expect(page.getByTestId('status-page')).toBeVisible();
  await expect(page.getByTestId('status-overall')).toContainText(/operational/i);
  await expect(page.getByTestId('status-component-judge')).toContainText(/ok/i);
  await expect(page.getByTestId('status-lane-contest')).toContainText('1');
  await expect(page.getByTestId('status-lane-practice')).toContainText('1');
  await expect(page.getByTestId('status-judge-count')).toContainText('128');
  await expect(page.getByTestId('status-error-rate')).toContainText('0.08');
});

test('the admin dashboard carries the Operations panel', async ({ page, context }) => {
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
  await page.goto('/admin/dashboard');
  const panel = page.getByTestId('ops-panel');
  await expect(panel).toBeVisible();
  await expect(page.getByTestId('ops-autoscale')).toContainText('1 → 2');
  await expect(page.getByTestId('ops-cost-total')).toContainText('24.05');
  await expect(page.getByTestId('ops-errors')).toContainText('/api/v1/problems/');
});
