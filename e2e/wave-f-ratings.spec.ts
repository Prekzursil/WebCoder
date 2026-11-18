import { test, expect } from '@playwright/test';

// Wave F items 51/52/53 (mock mode): the public rating profile carries
// graph annotations (career highs, medals, division crossings), the
// division chip + promotion history, and cohort percentiles.

test.describe('wave F ratings depth (mock api)', () => {
  test('rating profile: annotations, division chip, promotions, percentiles', async ({ page }) => {
    await page.goto('/profile/e2e_tester');

    // Division chip + percentile line in the header.
    await expect(page.getByTestId('rating-profile-division')).toHaveText('Div 2');
    const percentiles = page.getByTestId('rating-profile-percentiles');
    await expect(percentiles).toContainText('Top 10% overall');
    await expect(percentiles).toContainText('CNERV');

    // The chart renders annotation markers (medal + promotion glyphs).
    await expect(page.getByTestId('rating-profile-chart')).toBeVisible();
    const svg = page.getByTestId('rating-profile-chart').locator('svg');
    await expect(svg.locator('text', { hasText: '⇧' })).toHaveCount(1);

    // The promotion history under the curve.
    const change = page.getByTestId('division-change-2');
    await expect(change).toContainText('Div 3');
    await expect(change).toContainText('Div 2');
  });

  test('divisions table endpoint serves the cutoff ladder', async ({ request }) => {
    // The mock API runs on its own port (playwright.config webServer[0]).
    const response = await request.get('http://localhost:8901/api/v1/ratings/divisions/');
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.divisions).toHaveLength(4);
    expect(body.divisions[3]).toMatchObject({ name: 'Div 1', min_rating: 1900 });
  });
});
