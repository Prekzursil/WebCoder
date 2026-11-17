// E2E [wave E items 13/20/24]: submission-UX surfaces — the random-problem
// die on the catalog, the diff-vs-previous view on the submission detail,
// and the sandbox receipts page. Mock mode: browser-level interception.

import { test, expect } from '@playwright/test';

test('the random-problem die navigates to a problem', async ({ page }) => {
  await page.route(/\/api\/v1\/problems\/random\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ id: 7, title_i18n: { en: 'Lucky Pick' } }),
    });
  });
  // The catalog must load enough to render the toolbar; the mock server
  // already serves /problems/problems/ in mock mode.
  await page.goto('/problems');
  const die = page.getByTestId('random-problem-button');
  await expect(die).toBeVisible();
  await die.click();
  await page.waitForURL('**/problems/7');
});

test('submission detail shows the diff vs the previous attempt', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });

  await page.route('**/api/v1/submissions/submissions/42/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        user: { username: 'e2e', id: 2 },
        problem: { id: 7, title_i18n: { en: 'Diff Problem' } },
        language: 'python3',
        code: 'print(2)',
        submission_time: '2026-11-17T10:00:00Z',
        verdict: 'WA',
        score: 50,
        max_score: 100,
        previous_submission_id: 41,
        closeness: { band: 'HALFWAY', ratio: 0.5 },
        compile_hints: [],
        runtime_percentile: null,
        detailed_feedback: 'verdict',
        contest: null,
        test_results: [],
      }),
    });
  });
  await page.route('**/api/v1/submissions/submissions/41/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 41,
        problem: { id: 7, title_i18n: { en: 'Diff Problem' } },
        language: 'python3',
        code: 'print(1)',
        verdict: 'WA',
        previous_submission_id: null,
        compile_hints: [],
        test_results: [],
      }),
    });
  });

  await page.goto('/submissions/42');
  const toggle = page.getByTestId('diff-previous-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();
  const diff = page.getByTestId('line-diff');
  await expect(diff).toBeVisible();
  await expect(diff).toContainText('print(1)');
  await expect(diff).toContainText('print(2)');
});

test('the sandbox receipts page lists own runs', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });
  await page.route('**/api/v1/scratch/mine/**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            kind: 'scratch',
            id: 5,
            language: 'python3',
            status: 'OK',
            time_ms: 42,
            memory_kb: 2048,
            created_at: '2026-11-17T10:00:00Z',
          },
          {
            kind: 'stress',
            id: 1,
            language: '',
            status: 'FOUND',
            time_ms: null,
            memory_kb: null,
            created_at: '2026-11-17T09:00:00Z',
          },
        ],
      }),
    });
  });

  await page.goto('/sandbox-receipts');
  await expect(page.getByTestId('receipts-table')).toBeVisible();
  await expect(page.getByTestId('receipt-scratch-5')).toContainText('python3');
  await expect(page.getByTestId('receipt-stress-1')).toContainText('FOUND');
});
