// E2E: public problems catalog + detail (server components fetching through
// the mock API via NEXT_PUBLIC_API_BASE — proves the server-side data path,
// which browser-level page.route interception could never cover).

import { test, expect } from '@playwright/test';

test('catalog lists mocked problems with difficulty and status', async ({
  page,
}) => {
  await page?.goto('/problems');

  const twoSum = page?.locator('li', { hasText: 'Two Sum' });
  await expect(twoSum)?.toBeVisible();
  await expect(twoSum)?.toHaveText(/Two Sum\s*-\s*EASY\s*\(APPROVED\)/);

  const reverse = page?.locator('li', { hasText: 'Reverse String' });
  await expect(reverse)?.toBeVisible();
  await expect(reverse)?.toHaveText(/Reverse String\s*-\s*MEDIUM\s*\(APPROVED\)/);
});

test('catalog items link to the problem detail page', async ({ page }) => {
  await page?.goto('/problems');
  await page?.getByRole('link', { name: 'Two Sum' })?.click();
  await expect(page)?.toHaveURL(/\/problems\/1$/);
});

test('problem detail renders statement, limits and sample test cases', async ({
  page,
}) => {
  await page?.goto('/problems/1');

  await expect(page?.getByRole('heading', { level: 2 }))?.toHaveText('Two Sum');
  await expect(page?.getByText('Time Limit:'))?.toBeVisible();
  await expect(page?.getByText('1000 ms'))?.toBeVisible();
  await expect(page?.getByText('Memory Limit:'))?.toBeVisible();
  await expect(page?.getByText('65536 KB'))?.toBeVisible();
  await expect(
    page?.getByText(/Given an array of integers nums/)
  )?.toBeVisible();
  await expect(page?.getByText('Sample Input 1:'))?.toBeVisible();
  await expect(page?.getByText('Sample Output 1:'))?.toBeVisible();
});
