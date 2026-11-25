// E2E [wave E item 31]: /start renders the seeded first-solve ladder with
// per-viewer progress. Mock mode: the track GET is intercepted.

import { test, expect } from '@playwright/test';

test('the /start page shows the guided first-solve ladder', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });
  await page.route('**/api/v1/problems/tracks/first-solve-ladder/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        slug: 'first-solve-ladder',
        title_i18n: { en: 'Guided first-solve ladder', ro: 'Scara ghidată' },
        description_i18n: {
          en: 'Six rungs from reading input to binary search.',
          ro: 'Șase trepte.',
        },
        items: [
          {
            problem_id: 1,
            title_i18n: { en: 'Hello, Judge!' },
            difficulty: 'VERY_EASY',
            position: 1,
            is_solved: true,
          },
          {
            problem_id: 6,
            title_i18n: { en: 'Sum of Two Numbers' },
            difficulty: 'VERY_EASY',
            position: 2,
            is_solved: false,
          },
          {
            problem_id: 9,
            title_i18n: { en: 'Binary Search Position' },
            difficulty: 'EASY',
            position: 6,
            is_solved: false,
          },
        ],
      }),
    });
  });

  await page.goto('/start');
  const ladder = page.getByTestId('start-ladder');
  await expect(ladder).toBeVisible();
  await expect(ladder).toContainText('Guided first-solve ladder');
  await expect(ladder).toContainText('1/3 solved');
  await expect(ladder).toContainText('Hello, Judge!');
  await expect(ladder).toContainText('Binary Search Position');
});
