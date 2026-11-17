// E2E [wave E items 8/9/10]: pre-submit assistance on the problem page —
// the lint panel (constraint-aware warnings) and the sample dress-rehearsal
// run. Mock mode: both POSTs are intercepted at the browser level.

import { test, expect } from '@playwright/test';

test('the pre-submit panel runs the lint and the sample rehearsal', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });

  await page.route('**/api/v1/problems/7/lint/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        warnings: [
          {
            rule: 'int_overflow_64',
            line: 4,
            severity: 'warning',
            message_en:
              'Values can reach 10,000,000,000 which overflows 32-bit int — use long long.',
            message_ro:
              'Valorile pot ajunge la 10.000.000.000 și depășesc int pe 32 de biți — folosește long long.',
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/problems/7/run-samples/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        compile_error: null,
        samples: [
          {
            test_id: 1,
            order: 1,
            verdict: 'AC',
            time_ms: 12,
            output: '42',
            expected: '42',
            mismatch_hint: null,
          },
          {
            test_id: 2,
            order: 2,
            verdict: 'WA',
            time_ms: 9,
            output: '41',
            expected: '42',
            mismatch_hint: 'differs at line 1',
          },
        ],
      }),
    });
  });

  await page.goto('/problems/7');

  // The panel rides the submit form; buttons exist once the editor mounts.
  const lintButton = page.getByTestId('presubmit-lint-button');
  await expect(lintButton).toBeVisible();
  await lintButton.click();
  await expect(page.getByTestId('presubmit-warnings')).toBeVisible();
  await expect(page.getByTestId('presubmit-warnings')).toContainText(/overflows 32-bit int/);

  const samplesButton = page.getByTestId('presubmit-samples-button');
  await samplesButton.click();
  await expect(page.getByTestId('presubmit-samples')).toBeVisible();
  await expect(page.getByTestId('presubmit-sample-1')).toContainText('AC');
  await expect(page.getByTestId('presubmit-sample-2')).toContainText('WA');
});
