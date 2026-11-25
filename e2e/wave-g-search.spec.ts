// E2E [wave G items 82/84/88/91]: federated palette results, the digest
// picker, the onboarding checklist and the a11y display modes (mock).

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

test('the palette surfaces federated results (threads, contests, users)', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await page.getByPlaceholder(/type a command/i).fill('two sum');
  await expect(page.getByTestId('command-palette')).toContainText('Two Sum thread');
  await expect(page.getByTestId('command-palette')).toContainText('Two Sum Cup');
});

test('the a11y picker flips html[data-a11y] and persists', async ({ page }) => {
  await page.goto('/');
  const select = page.getByTestId('a11y-mode');
  await expect(select).toBeVisible();
  await select.selectOption('dyslexia');
  await expect(page.locator('html')).toHaveAttribute('data-a11y', 'dyslexia');
  await select.selectOption('contrast');
  await expect(page.locator('html')).toHaveAttribute('data-a11y', 'contrast');
  await page.reload();
  // The pre-paint script re-applies the stored mode.
  await expect(page.locator('html')).toHaveAttribute('data-a11y', 'contrast');
});

test('the digest picker offers none/daily/weekly', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/profile');
  await page.getByRole('button', { name: 'settings' }).click();
  const digest = page.getByTestId('identity-digest');
  await expect(digest).toBeVisible();
  await digest.selectOption('weekly');
});

test('the onboarding checklist shows progress on /start', async ({ page, context }) => {
  await login(page, context);
  await page.goto('/start');
  const card = page.getByTestId('onboarding-checklist');
  await expect(card).toBeVisible();
  await expect(card).toContainText('2/6');
  await expect(card.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
});
