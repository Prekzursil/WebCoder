import { test, expect, type Page } from '@playwright/test';

// Parity polish pack (mock api): the DMOJ/campion hidden scoreboard
// (notice while running, empty board) and the C++20 language row on the
// judge help page.

async function login(page: Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('hidden scoreboard (DMOJ/campion, mock api)', () => {
  test('running hidden-board contest shows the notice instead of rows', async ({ page }) => {
    await page.goto('/contests/77');

    await expect(page.getByRole('heading', { name: /Selection Exam/i })).toBeVisible();
    await page.getByRole('button', { name: /standings/i }).click();

    await expect(page.getByTestId('standings-hidden-note')).toBeVisible();
    await expect(page.getByTestId('standings-hidden-note')).toContainText(
      /hidden until the contest ends/i,
    );
  });

  test('contest create form carries the hide-scoreboard option', async ({ page }) => {
    await login(page);
    await page.goto('/contests/create');

    const checkbox = page.getByLabel(/hide the scoreboard until the contest ends/i);
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(checkbox).toBeChecked();
  });
});

test.describe('C++20 toolchain (matrix row 20, mock api)', () => {
  test('judge help lists C++20 beside C++17', async ({ page }) => {
    await page.goto('/help/judge');

    await expect(page.getByRole('cell', { name: /C\+\+20/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: /C\+\+17/ })).toBeVisible();
  });
});
