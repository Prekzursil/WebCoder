// E2E: public home page (server component, src/app/page.tsx).

import { test, expect } from '@playwright/test';

test('home page renders the welcome hero and catalog CTA', async ({ page }) => {
  await page?.goto('/');
  await expect(page?.getByRole('heading', { level: 1 }))?.toHaveText(
    'Welcome to WebCoder'
  );
  await expect(page?.getByRole('link', { name: 'View Problems' }))?.toBeVisible();
});

test('View Problems CTA navigates to the public catalog', async ({ page }) => {
  await page?.goto('/');
  await page?.getByRole('link', { name: 'View Problems' })?.click();
  await expect(page)?.toHaveURL(/\/problems$/);
  await expect(page?.getByRole('heading', { level: 2 }))?.toHaveText('Problems');
});
