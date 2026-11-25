// E2E [wave E items 6/7/19/21/25]: the submission detail page shows the
// judge-feedback depth panels — the "Am I close?" band, used-vs-bar time
// and memory meters, and the expected-vs-actual diff with the first
// mismatch highlighted. Mock mode: the submission detail GET is
// intercepted at the browser level (the page's own polling stays inert
// because the verdict is terminal).

import { test, expect } from '@playwright/test';

test('submission detail renders closeness band, limit bars and the WA diff', async ({
  page,
  context,
}) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });

  // The submissions router mounts at /api/v1/submissions/ and the viewset
  // adds its own prefix — the detail path is /submissions/submissions/<id>/.
  await page.route('**/api/v1/submissions/submissions/42/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 42,
        user: { username: 'e2e', id: 2 },
        problem: { id: 7, title_i18n: { en: 'Diff Problem' } },
        language: 'python3',
        code: 'print(41)',
        submission_time: '2026-11-17T10:00:00Z',
        verdict: 'WA',
        execution_time_ms: 950,
        memory_used_kb: 2048,
        score: 80,
        max_score: 100,
        runtime_percentile: null,
        closeness: { band: 'SO_CLOSE', ratio: 0.8 },
        detailed_feedback: 'Overall Verdict: Wrong Answer. Score: 80/100.',
        contest: null,
        test_results: [
          {
            id: 1,
            test_case_details: {
              id: 11,
              order: 1,
              is_sample: true,
              points: 10,
              input_data: '2',
              expected_output_data: '42',
            },
            verdict: 'WA',
            execution_time_ms: 950,
            memory_used_kb: 2048,
            limit_time_ms: 1000,
            limit_memory_kb: 262144,
            actual_output: '41',
            error_output: 'differs at line 1',
          },
          {
            id: 2,
            test_case_details: { id: 12, order: 2, is_sample: false, points: 10 },
            verdict: 'AC',
            execution_time_ms: 300,
            memory_used_kb: 1024,
            limit_time_ms: 1000,
            limit_memory_kb: 262144,
            actual_output: null,
            error_output: null,
          },
        ],
      }),
    });
  });

  await page.goto('/submissions/42');

  // item 21: the "Am I close?" band chip with its percentage
  const badge = page.getByTestId('closeness-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('80%');

  // items 19/25: used-vs-bar meters on every judged test
  await expect(page.getByRole('progressbar', { name: 'Time vs bar' }).first()).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Memory vs bar' }).first()).toBeVisible();

  // item 7: the diff viewer with the first-mismatch marker
  await expect(page.getByTestId('sample-diff')).toBeVisible();
  await expect(page.getByText('first mismatch at line 1')).toBeVisible();

  // item 6's bar value is echoed on the meter
  await expect(page.getByText('950 / 1000 ms').first()).toBeVisible();
});
