import { test, expect } from '@playwright/test';

// Wave C community depth (mock api): COM-3 feed on home, COM-7 solutions on
// the problem page, RAT-9 weekly board on /leaderboard.

test.describe('community depth (Wave C, mock api)', () => {
  test('home shows the live activity feed with verdict rows', async ({ page }) => {
    await page.goto('/');

    const feed = page.getByTestId('activity-feed');
    await expect(feed).toBeVisible();
    await expect(page.getByTestId('feed-row-9')).toContainText('alice_e2e');
    await expect(page.getByTestId('feed-row-9')).toContainText('AC');
  });

  test('leaderboard carries the weekly board above the all-time table', async ({
    page,
  }) => {
    await page.goto('/leaderboard');

    const weekly = page.getByTestId('weekly-board');
    await expect(weekly).toBeVisible();
    await expect(page.getByTestId('weekly-row-alice_e2e')).toContainText('300');
  });

  test('problem page: solutions panel opens a solution after login', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();

    await page.goto('/problems/1');
    await page.getByTestId('solution-toggle-5').click();
    await expect(page.getByTestId('solution-code-5')).toContainText('print(2)');
    await expect(page.getByTestId('solutions-panel')).toContainText(
      /platform displays it/i
    );
  });
});
