import { test, expect } from '@playwright/test';

// Wave F items 125/129/131/132 (mock mode): the author analytics
// dashboard, the saved-search strip on the catalog, and the changelog
// API surface.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F content ops (mock api)', () => {
  test('author analytics: summary chips + drop calendar', async ({ page }) => {
    await login(page);
    await page.goto('/author/analytics');
    const summary = page.getByTestId('analytics-summary');
    await expect(summary).toContainText('42.5%');
    await expect(summary).toContainText('33');
    await expect(page.getByTestId('analytics-difficulty-HARD')).toContainText('1');
    await expect(page.getByTestId('drop-row-9')).toContainText('Graph Marathon');
  });

  test('catalog: saved-search strip saves and applies', async ({ page }) => {
    await login(page);
    await page.goto('/problems?difficulty=EASY');
    const strip = page.getByTestId('saved-searches');
    await expect(strip).toBeVisible();
    // The saved preset chip applies its params.
    await page.getByTestId('saved-search-apply-7').click();
    await expect(page).toHaveURL(/difficulty=EASY/);
    // Saving a new set works.
    await page.getByTestId('saved-search-name').fill('Mine');
    await page.getByTestId('saved-search-save').click();
    await expect(page.getByTestId('saved-search-name')).toHaveValue('');
  });

  test('changelog endpoint serves the ledger (API-level probe)', async ({ request }) => {
    const response = await request.get(
      'http://localhost:8901/api/v1/problems/problems/1/changelog/',
    );
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.results[0].note).toBe('clarify');
  });
});
