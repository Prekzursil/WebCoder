// E2E [wave G items 102/104/105/110/111/112]: per-problem language
// stats, the time-of-day profile chart and the admin analytics tabs
// (mock mode).

import { test, expect } from '@playwright/test';

const AUTH_COOKIE = [
  { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
];

async function login(
  page: import('@playwright/test').Page,
  context: import('@playwright/test').BrowserContext,
) {
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
}

test('the problem stats panel shows the per-language table', async ({ page }) => {
  await page.goto('/problems/1');
  const langs = page.getByTestId('language-stats');
  await expect(langs).toBeVisible();
  await expect(langs).toContainText('python3');
  await expect(langs).toContainText('cpp17');
});

test('the profile renders the time-of-day activity chart', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/profile');
  await expect(page.getByTestId('time-of-day')).toBeVisible();
});

test('the admin dashboard carries the analytics tabs', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/admin/dashboard');
  const panels = page.getByTestId('analytics-panels');
  await expect(panels).toBeVisible();

  // Funnel (default).
  await expect(page.getByTestId('analytics-funnel')).toContainText('signup — 100');
  await expect(page.getByTestId('analytics-funnel')).toContainText('first_ac — 45');

  // Search analytics.
  await page.getByTestId('analytics-tab-search').click();
  await expect(page.getByTestId('analytics-search')).toContainText('sum × 5');
  await expect(page.getByTestId('analytics-search')).toContainText('segment tree × 3');

  // Org segment.
  await page.getByTestId('analytics-tab-org').click();
  await page.getByTestId('org-school-input').fill('CNIT');
  await page.getByRole('button', { name: /look up/i }).click();
  await expect(page.getByTestId('analytics-org')).toContainText('12');

  // Season reports.
  await page.getByTestId('analytics-tab-season').click();
  await page.getByRole('button', { name: /generate/i }).click();
  await expect(page.getByTestId('season-body')).toContainText('2026Q4 report');
});
