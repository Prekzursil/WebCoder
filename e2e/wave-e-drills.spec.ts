// E2E [wave E items 36/37/38/40]: the drills page — daily warmup, the
// deck, and the answer flow with explanation reveal. Mock mode.

import { test, expect } from '@playwright/test';

test('the drills page runs a warmup drill end to end', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });

  const drill = {
    id: 1,
    kind: 'READ_CODE',
    tag: 'loops',
    code: 's = 0\nfor i in range(4):\n    s += i\nprint(s)',
    question_ro: 'Ce afișează?',
    question_en: 'What does this print?',
    options_ro: ['4', '6', '10', '0'],
    options_en: ['4', '6', '10', '0'],
  };
  await page.route(/\/api\/v1\/learning\/drills\/(\?|$)/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: 1, results: [drill] }),
    });
  });
  await page.route('**/api/v1/learning/drills/daily/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: 1, results: [drill] }),
    });
  });
  await page.route('**/api/v1/learning/drills/1/answer/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        correct: true,
        error: null,
        explanation_ro: 'Suma este 6.',
        explanation_en: 'The sum is 6.',
        accepted: null,
      }),
    });
  });

  await page.goto('/drills');
  await expect(page.getByTestId('daily-warmup')).toBeVisible();
  const card = page.getByTestId('drill-1').first();
  await expect(card).toContainText('What does this print?');
  await card.getByRole('button', { name: '6' }).click();
  await card.getByRole('button', { name: /check/i }).click();
  await expect(card).toContainText('Correct!');
  await expect(card).toContainText('The sum is 6.');
});
