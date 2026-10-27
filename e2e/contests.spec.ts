import { test, expect } from '@playwright/test';

// Wave B contest/rating UI (mock mode): the /contests list renders real
// backend fields, the detail page shows the problems board (linking
// through ?contest= so submissions hit the contest gate) and standings,
// and /ratings renders the ladder. Backed by the mock-api fixtures
// (MOCK_CONTESTS / MOCK_STANDINGS / MOCK_RATINGS) — no real backend
// required; real-stack coverage lives in real-stack.spec.ts.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('contests surface (mock api)', () => {
  test('/contests lists scheduled contests with state and rated chips', async ({ page }) => {
    await page.goto('/contests');

    await expect(page.getByRole('link', { name: 'Autumn Open 2026' })).toBeVisible();
    await expect(page.getByTestId('contest-state-1')).toHaveText(/Running/);
    await expect(page.getByText('★ Rated')).toBeVisible();
    // ICS calendar feed link (CON-10).
    await expect(page.getByTestId('contests-ics-link')).toHaveAttribute(
      'href',
      /\/api\/v1\/contests\/calendar\.ics$/
    );
  });

  test('contest detail: problems board links through ?contest= and standings render', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/contests/1');

    await expect(page.getByRole('heading', { name: 'Autumn Open 2026' })).toBeVisible();
    // Default tab for a RUNNING contest is Problems; submissions opened
    // from there carry the contest id (backend gate + judge lane).
    await expect(page.getByRole('link', { name: 'Two Sum' })).toHaveAttribute(
      'href',
      '/problems/1?contest=1'
    );

    await page.getByRole('button', { name: 'Standings' }).click();
    await expect(page.getByTestId('standings-row-e2e_tester')).toContainText('150');
    await expect(page.getByTestId('standings-row-admin_e2e')).toContainText('40');
  });

  test('/ratings renders the ladder with the caller rating card', async ({ page }) => {
    await login(page);
    await page.goto('/ratings');

    await expect(page.getByTestId('my-rating-card')).toContainText('e2e_tester');
    await expect(page.getByTestId('rating-row-e2e_tester')).toContainText('1512');
  });

  test('navbar exposes Contests and Ratings (CON-1/RAT-1 surface)', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Contests' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ratings' })).toBeVisible();
  });
});
