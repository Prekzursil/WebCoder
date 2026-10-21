// E2E: public problems catalog + detail (server components fetching through
// the mock API via NEXT_PUBLIC_API_BASE — proves the server-side data path,
// which browser-level page.route interception could never cover).
//
// Selectors match the shipped DOM (pinned by the unit tests in
// src/app/problems/page.test.tsx and [problemId]/page.test.tsx):
// - the catalog renders a <table> (rows), not <li> items;
// - difficulty/status badges show the raw backend enums;
// - the detail title is an <h1>; limits render as label + value pairs
//   ("Time Limit" / "1000 ms"); sample cases are headed "Example N".

import { test, expect } from '@playwright/test';
import { isRealStack, ensureRealStackFixtures } from './lib/realStack';

// Real-backend mode: seed Two Sum / Reverse String on the live stack (see
// e2e/lib/realStack.ts) so the same assertions hold against Django.
let seeded = { twoSumId: 1, reverseId: 2 };

test.beforeAll(async () => {
  if (isRealStack) seeded = await ensureRealStackFixtures();
});


test('catalog lists mocked problems with difficulty and status', async ({
  page,
}) => {
  await page?.goto('/problems');

  const twoSumRow = page?.getByRole('row').filter({ hasText: 'Two Sum' });
  await expect(twoSumRow)?.toBeVisible();
  await expect(twoSumRow)?.toContainText('EASY');

  const reverseRow = page?.getByRole('row').filter({ hasText: 'Reverse String' });
  await expect(reverseRow)?.toBeVisible();
  await expect(reverseRow)?.toContainText('MEDIUM');

  // F7: anonymous visitors only ever see APPROVED problems, so the status
  // column/facet is hidden from the public catalog entirely.
  await expect(twoSumRow)?.not.toContainText('APPROVED');
});

test('catalog items link to the problem detail page', async ({ page }) => {
  await page?.goto('/problems');
  page?.getByRole('link', { name: 'Two Sum' })?.click();
  // Mock mode pins id 1; real mode uses the seeded id (e2e/lib/realStack.ts).
  await expect(page)?.toHaveURL(new RegExp(`/problems/${seeded.twoSumId}$`));
});

test('problem detail renders statement, limits and sample test cases', async ({
  page,
}) => {
  await page?.goto(`/problems/${seeded.twoSumId}`);

  await expect(page?.getByRole('heading', { level: 1 }))?.toHaveText('Two Sum');
  await expect(page?.getByText('Time Limit'))?.toBeVisible();
  await expect(page?.getByText('1000 ms'))?.toBeVisible();
  await expect(page?.getByText('Memory Limit'))?.toBeVisible();
  await expect(page?.getByText('65536 KB'))?.toBeVisible();
  await expect(
    page?.getByText(/Given an array of integers nums/)
  )?.toBeVisible();
  await expect(
    page?.getByRole('heading', { name: 'Sample Test Cases' })
  )?.toBeVisible();
  await expect(page?.getByText('Example 1'))?.toBeVisible();
});
