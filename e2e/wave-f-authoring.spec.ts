import { test, expect } from '@playwright/test';

// Wave F items 121/123/124/134 (mock mode): the authoring wizard page —
// step checklist, lint warnings, readability bands, translation gaps.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F authoring quality (mock api)', () => {
  test('wizard: steps checklist with completion ticks', async ({ page }) => {
    await login(page);
    await page.goto('/author/wizard');
    await expect(page.getByTestId('wizard-step-basics')).toBeVisible();
    await expect(page.getByTestId('wizard-step-check-basics')).toHaveText('✓');
    await expect(page.getByTestId('wizard-step-check-samples')).toHaveText('○');
    // Seven steps render in order.
    const keys = ['basics', 'limits', 'samples', 'tests', 'reference', 'translation', 'review'];
    for (const key of keys) {
      await expect(page.getByTestId(`wizard-step-${key}`)).toBeVisible();
    }
  });

  test('wizard: entering a draft id loads lint, readability and translation', async ({ page }) => {
    await login(page);
    await page.goto('/author/wizard');
    await page.getByTestId('wizard-problem-input').fill('9');
    await expect(page.getByTestId('wizard-lint-missing_constraints_en')).toBeVisible();
    await expect(page.getByTestId('wizard-readability-en')).toContainText('71.2');
    await expect(page.getByTestId('wizard-readability-en')).toContainText('plain');
    await expect(page.getByTestId('wizard-translation')).toContainText('hints ✗');
  });
});
