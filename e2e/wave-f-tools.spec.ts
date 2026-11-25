import { test, expect } from '@playwright/test';

// Wave F items 122/126/128 (mock mode): the author tools page — DSL
// generator run, variant spawn + family list, attachment upload.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F author tools (mock api)', () => {
  test('generator: DSL run reports created count + first input', async ({ page }) => {
    await login(page);
    await page.goto('/author/tools');
    await page.getByTestId('tools-problem-input').fill('9');
    await page.getByTestId('tools-generate').click();
    await expect(page.getByTestId('tools-message')).toContainText('42 7');
  });

  test('variants: spawn then family list renders both rows', async ({ page }) => {
    await login(page);
    await page.goto('/author/tools');
    await page.getByTestId('tools-problem-input').fill('9');
    await page.getByTestId('tools-spawn-variant').click();
    await expect(page.getByTestId('tools-message')).toContainText('#12');
    await expect(page.getByTestId('variant-row-9')).toContainText('Two Sum');
    await expect(page.getByTestId('variant-row-12')).toContainText('variant 1');
  });

  test('attachments: upload then the list shows the file', async ({ page }) => {
    await login(page);
    await page.goto('/author/tools');
    await page.getByTestId('tools-problem-input').fill('9');
    await expect(page.getByTestId('attachment-row-1')).toContainText('figure.png');
    await page.getByTestId('tools-attachment-name').fill('chart.png');
    await page.getByTestId('tools-attachment-upload').click();
    await expect(page.getByTestId('tools-message')).toContainText('chart.png');
  });
});
