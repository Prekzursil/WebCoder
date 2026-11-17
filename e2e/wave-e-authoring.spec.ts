// E2E [wave E items 16/17]: the verification queue's tests-preview row —
// hidden tests with input/expected pairs plus the per-test catch rates.
// Mock mode: both GETs intercepted at the browser level.

import { test, expect } from '@playwright/test';

test('the verification queue previews hidden tests with strength data', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'admin_e2e', email: 'a@e2e.local', role: 'ADMIN' }),
    );
  });

  // The queue fetches every page and filters PENDING_APPROVAL client-side.
  // (Regex route: in Playwright globs '?' is a single-char wildcard.)
  await page.route(/\/api\/v1\/problems\/problems\/?\?.*/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 42,
            title_i18n: { en: 'Queue Problem', ro: 'Problemă' },
            author: { username: 'author_e2e' },
            difficulty: 'MEDIUM',
            status: 'PENDING_APPROVAL',
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/problems/testcases/*', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 2,
        next: null,
        previous: null,
        results: [
          {
            id: 11,
            input_data: '2',
            expected_output_data: '4',
            is_sample: true,
            points: 10,
            order: 1,
            subtask: '',
            time_limit_ms: null,
          },
          {
            id: 12,
            input_data: '1000000000',
            expected_output_data: '999999999',
            is_sample: false,
            points: 30,
            order: 2,
            subtask: 'A',
            time_limit_ms: 4000,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/problems/42/test-strength/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        problem_id: 42,
        calibrated: true,
        wrong_solutions: 4,
        suite_strength: 0.875,
        tests: [
          {
            test_id: 11,
            order: 1,
            is_sample: true,
            subtask: '',
            points: 10,
            time_limit_ms: null,
            wrong_solutions: 4,
            caught: 1,
            catch_rate: 0.25,
          },
          {
            test_id: 12,
            order: 2,
            is_sample: false,
            subtask: 'A',
            points: 30,
            time_limit_ms: 4000,
            wrong_solutions: 4,
            caught: 4,
            catch_rate: 1,
          },
        ],
      }),
    });
  });

  await page.goto('/admin/problem-queue');
  await expect(page.getByText('Queue Problem')).toBeVisible();

  await page.getByTestId('preview-toggle-42').click();
  await expect(page.getByTestId('tests-preview-42')).toBeVisible();
  // Item 17: the hidden test's pair is visible to the verifier.
  await expect(page.getByTestId('preview-test-12')).toContainText('hidden');
  await expect(page.getByTestId('preview-test-12')).toContainText('1000000000');
  // Item 16: catch rates + suite strength.
  await expect(page.getByTestId('preview-test-12')).toContainText('100%');
  await expect(page.getByTestId('suite-strength-42')).toContainText('88%');
});
