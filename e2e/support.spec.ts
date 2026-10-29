// E2E: OPS-7 (Wave D) monetization groundwork — the /support page
// (donations + sponsorship, NO payment processing) and the contest
// sponsor attribution rail.

import { test, expect } from '@playwright/test';

test.describe('monetization groundwork [OPS-7]', () => {
  test('/support renders the donate/sponsor/host cards and the no-payments note', async ({
    page,
  }) => {
    await page.goto('/support');

    await expect(page.getByRole('heading', { name: 'Support WebCoder' })).toBeVisible();
    for (const card of ['Donate', 'Sponsor a contest', 'Hosted school contests']) {
      await expect(page.getByRole('heading', { name: card, exact: true })).toBeVisible();
    }
    // Groundwork honesty: mailto CTAs, not checkout flows.
    const ctas = page.getByRole('link', { name: /email|sponsor|hosting|donating/i });
    expect(await ctas.count()).toBeGreaterThanOrEqual(3);
    for (const href of await ctas.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))) {
      expect(href.startsWith('mailto:')).toBe(true);
    }
    await expect(page.getByText(/this page processes no payments/i)).toBeVisible();
  });

  test('contest detail shows the sponsor attribution rail', async ({ page }) => {
    await page.goto('/contests/1');
    const rail = page.getByTestId('contest-sponsor');
    await expect(rail).toBeVisible();
    await expect(rail.getByText('Sponsored by')).toBeVisible();
    await expect(rail.getByText('CJ Cluj Tech')).toBeVisible();
    await expect(rail.locator('img')).toHaveAttribute(
      'src',
      'https://example.com/cj-cluj.png'
    );
  });

  test('the footer links to /support', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Support us' })).toHaveAttribute(
      'href',
      '/support'
    );
  });
});
