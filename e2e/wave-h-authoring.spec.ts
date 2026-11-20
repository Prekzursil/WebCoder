import { test, expect } from '@playwright/test';

// Problem-page wave (items A/B, mock mode): the rich authoring studio —
// live preview with KaTeX/code/constraint box, toolbar inserts,
// structured mode, autosave indicator; and the test manager — archive
// upload with dry-run preview + import, inline test with the example
// flag, per-test points with the live total vs target and even
// distribution.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave H authoring studio (mock api)', () => {
  test('studio: live preview renders math, code and the constraint box while typing', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/problems/5/edit');

    const area = page.getByTestId('studio-markdown-en');
    await expect(area).toBeVisible();
    await area.fill(
      [
        '## Story',
        '',
        'Compute $S = \\sum a_i$ quickly.',
        '',
        '```python',
        'print(sum(a))',
        '```',
        '',
        '## Constraints',
        '',
        '- $1 \\le n \\le 100$',
      ].join('\n'),
    );

    const preview = page.getByTestId('studio-preview');
    // KaTeX math rendered (no raw dollar source left in the preview).
    await expect(preview).toContainText('Compute');
    await expect(preview.locator('.katex').first()).toBeVisible();
    // Highlighted code fence.
    await expect(preview.locator('pre').first()).toBeVisible();
    // The constraint BOX skin (h3.constraints-heading + boxed list).
    await expect(preview.locator('.constraints-heading')).toBeVisible();
  });

  test('studio: toolbar buttons insert constructs', async ({ page }) => {
    await login(page);
    await page.goto('/problems/5/edit');
    await page.getByRole('button', { name: 'Math block' }).click();
    await expect(page.getByTestId('studio-markdown-en')).toContainText('$$');
    await page.getByRole('button', { name: 'Constraint box' }).click();
    await expect(page.getByTestId('studio-markdown-en')).toContainText('1 \\le');
    await page.getByRole('button', { name: 'Example I/O' }).click();
    await expect(page.getByTestId('studio-markdown-en')).toContainText('### Input');
  });

  test('studio: structured mode edits the section fields', async ({ page }) => {
    await login(page);
    await page.goto('/problems/5/edit');
    await page.getByRole('tab', { name: 'Structured' }).click();
    const story = page.getByTestId('studio-field-story');
    await expect(story).toContainText('Sum the array.');
    await story.fill('A brand new story.');
    await page.getByRole('tab', { name: 'Markdown' }).click();
    await expect(page.getByTestId('studio-markdown-en')).toContainText('A brand new story.');
  });

  test('studio: locale tabs switch EN/RO statements', async ({ page }) => {
    await login(page);
    await page.goto('/problems/5/edit');
    await expect(page.getByTestId('studio-markdown-en')).toContainText('Sum the array.');
    await page.getByTestId('studio-locale-ro').click();
    await expect(page.getByTestId('studio-markdown-ro')).toBeVisible();
  });

  test('studio: autosave indicator appears after typing', async ({ page }) => {
    await login(page);
    await page.goto('/problems/5/edit');
    await page.getByTestId('studio-markdown-en').fill('autosaved body');
    await expect(page.getByTestId('studio-autosave')).toHaveText(/Autosaved/, {
      timeout: 8000,
    });
  });

  test('test manager: archive upload previews pairs then imports them', async ({ page }) => {
    await login(page);
    await page.goto('/problems/5/edit');

    // Let the form settle (draft restore + suite load) before uploading.
    await expect(page.getByTestId('test-mgr-total')).toContainText('40 / 50');
    await page
      .getByTestId('test-mgr-archive-input')
      .setInputFiles('e2e/fixtures/wave-h-tests.zip');

    const preview = page.getByTestId('test-mgr-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('2 pairs found');
    await expect(preview.getByTestId('test-mgr-preview-pair').first()).toContainText(
      'data/sample/01',
    );
    await expect(preview).toContainText('notes.txt');

    await page.getByRole('button', { name: 'Import all' }).click();
    await expect(page.getByTestId('test-mgr-preview')).toHaveCount(0);
    // Imported rows land in the suite (4 rows: 2 seeded + 2 imported).
    await expect(page.getByText('Test Case 4')).toBeVisible({ timeout: 8000 });
  });

  test('test manager: example flag, per-test points, live total + distribute', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/problems/5/edit');

    // Live total vs target (20 + 20 = 40 against target 50 -> warning).
    await expect(page.getByTestId('test-mgr-total')).toContainText('40 / 50');
    await expect(page.getByTestId('test-mgr-mismatch')).toBeVisible();

    // Mark the second test as an example (auto-surfaced in the statement).
    const flags = page.getByLabel('Example (public in statement)');
    await flags.nth(1).check();

    // Per-test points editing.
    await page.getByTestId('test-mgr-points-1').fill('30');

    // Distribute evenly resolves the mismatch.
    await page.getByRole('button', { name: 'Distribute evenly' }).click();
    await expect(page.getByTestId('test-mgr-mismatch')).toHaveCount(0, { timeout: 8000 });
    await expect(page.getByTestId('test-mgr-total')).toContainText('50 / 50');
  });

  test('test manager: inline test with points and sample flag via the add form', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/problems/5/edit');

    await page.getByLabel('Input Data').fill('2\n4 6\n');
    await page.getByLabel('Expected Output Data').fill('10\n');
    await page
      .getByTestId('test-manager')
      .getByLabel('Points:')
      .last()
      .fill('10');
    await page.getByTestId('test-manager').getByLabel('Is Sample?').check();
    await page.getByRole('button', { name: 'Add Test Case' }).click();

    await expect(page.getByTestId('test-mgr-status')).toContainText(
      'Test case added successfully!',
      { timeout: 8000 },
    );
    await expect(page.getByText('Test Case 3')).toBeVisible({ timeout: 8000 });
  });
});
