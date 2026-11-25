import { test, expect, type Page } from '@playwright/test';

// X12 study tracks (mock api): the hub lists curated playlists with
// progress, the detail page orders problems with solved checks + a
// Continue CTA, and the owner mutates the track (add/move/remove).

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('study tracks (X12, mock api)', () => {
  test('hub lists the track card with counts', async ({ page }) => {
    await page.goto('/tracks');

    const card = page.getByRole('link', { name: 'Beginner ladder' });
    await expect(card).toBeVisible();
    await expect(page.getByText(/2 problems/)).toBeVisible();
    // Anonymous visitors browse but get no curator form.
    await expect(page.getByRole('button', { name: /create track/i })).toHaveCount(0);
  });

  test('signed-in curator sees the create form', async ({ page }) => {
    await login(page);
    await page.goto('/tracks');

    await expect(page.getByRole('link', { name: 'Beginner ladder' })).toBeVisible();
    await expect(page.getByRole('button', { name: /create track/i })).toBeVisible();
  });

  test('detail orders problems, marks solved, links Continue', async ({ page }) => {
    await page.goto('/tracks/beginner-ladder');

    await expect(page.getByRole('link', { name: 'A Plus B' })).toBeVisible();
    await expect(page.getByTestId('track-solved-1')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Two Sum' })).toBeVisible();
    await expect(page.getByText(/1\/2 solved/)).toBeVisible();
    await expect(page.getByRole('link', { name: /continue/i })).toHaveAttribute(
      'href',
      '/problems/2',
    );
  });

  test('owner adds, moves and removes a problem', async ({ page }) => {
    await login(page);
    await page.goto('/tracks/beginner-ladder');

    // Add problem 3 (Binary Search) at the end.
    await page.getByLabel(/add problem by id/i).fill('3');
    await page.getByRole('button', { name: /^add$/i }).click();
    await expect(page.getByRole('link', { name: 'Binary Search' })).toBeVisible();
    await expect(page.getByText(/1\/3 solved/)).toBeVisible();

    // Move it up one slot and assert the swap by list order.
    const items = page.locator('ol li');
    await expect(items).toHaveCount(3);
    const binaryRow = items.filter({ hasText: 'Binary Search' });
    await binaryRow.getByRole('button', { name: /move up/i }).click();
    await expect.poll(async () => items.nth(1).textContent()).toContain('Binary Search');

    // Remove it again — back to two items (state ends where it began,
    // so the whole spec is retry-safe against the shared mock server).
    await items
      .filter({ hasText: 'Binary Search' })
      .getByRole('button', { name: /remove from track/i })
      .click();
    await expect(items).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'Binary Search' })).toHaveCount(0);
  });

  test('unknown track slug shows the not-found state', async ({ page }) => {
    await page.goto('/tracks/nope');

    await expect(page.getByText(/track not found/i)).toBeVisible();
  });
});
