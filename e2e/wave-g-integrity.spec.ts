// E2E [wave G items 113-119]: the integrity panel (scans, flags, abuse
// queue SLA, multi-accounts, appeals) + the AI-assisted declaration and
// the bounty page (mock mode).

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

test('the admin dashboard carries the integrity tabs', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/admin/dashboard');
  const panel = page.getByTestId('integrity-panel');
  await expect(panel).toBeVisible();

  // Abuse queue with SLA breach.
  await expect(page.getByTestId('integ-queue')).toContainText('2 open');
  await expect(page.getByTestId('integ-queue')).toContainText('breached');

  // Similarity scan + confirm.
  await page.getByTestId('integ-tab-flags').click();
  await page.getByTestId('scan-problem-input').fill('1');
  await page.getByRole('button', { name: /^scan$/i }).click();
  await expect(page.getByTestId('integ-flags')).toContainText('bob');
  await expect(page.getByTestId('integ-flags')).toContainText('carol');

  // Multi-account clusters.
  await page.getByTestId('integ-tab-accounts').click();
  await expect(page.getByTestId('integ-accounts')).toContainText('farm_a ↔ farm_b');

  // Appeals.
  await page.getByTestId('integ-tab-appeals').click();
  await expect(page.getByTestId('integ-appeals')).toContainText('dave');
});

test('the submit form carries the AI-assisted declaration', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/problems/1');
  const toggle = page.getByTestId('ai-assisted-toggle');
  await expect(toggle).toBeVisible();
  await toggle.check();
  await expect(toggle).toBeChecked();
});

test('the bug bounty page renders scope and reporting channel', async ({ page }) => {
  await page.goto('/security');
  await expect(page.getByRole('heading', { name: /security & bug bounty/i })).toBeVisible();
  await expect(page.getByText(/GitHub Private Vulnerability Reporting/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /report privately on github/i })).toHaveAttribute(
    'href',
    'https://github.com/Prekzursil/WebCoder/security/advisories/new',
  );
});
