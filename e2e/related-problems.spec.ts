import { test, expect } from '@playwright/test';

// Matrix row 6 (similar problems) + the DMOJ "has editorial" catalog
// facet, mock api.

test.describe('related problems + editorial facet (mock api)', () => {
  test('problem page shows the similar-problems strip with links', async ({ page }) => {
    await page.goto('/problems/1');

    const strip = page.getByTestId('related-problems');
    await expect(strip).toBeVisible();
    await expect(strip.getByRole('link', { name: 'Reverse String' })).toHaveAttribute(
      'href',
      '/problems/2',
    );
    await expect(strip.getByRole('link', { name: 'Pair Sum' })).toHaveAttribute(
      'href',
      '/problems/3',
    );
  });

  test('catalog "has editorial" chip filters the loaded rows', async ({ page }) => {
    await page.goto('/problems');

    // Both fixture rows visible by default.
    await expect(page.getByRole('link', { name: 'Two Sum' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Reverse String' })).toBeVisible();

    const chip = page.getByRole('button', { name: /has editorial/i });
    await chip.click();

    // ?editorial=1 keeps only the editorial-carrying row.
    await expect(page).toHaveURL(/editorial=1/);
    await expect(page.getByRole('link', { name: 'Reverse String' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Two Sum' })).toHaveCount(0);
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
  });
});
