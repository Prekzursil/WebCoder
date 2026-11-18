import { test, expect } from '@playwright/test';

// Wave F contest depth (mock mode): open hacks (48), commentary feed (56),
// per-user replay (57), frozen-board drama (58), and the long-challenge
// catalog axis (54). Backed by the mock-api Wave F routes.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F contest depth (mock api)', () => {
  test('long challenges: catalog chip filters and cards carry the badge', async ({ page }) => {
    await page.goto('/contests');
    await page.getByTestId('contests-kind-long').click();
    await expect(page.getByRole('link', { name: 'Spring Replay 2025' })).toBeVisible();
    // The long axis drops the sprint contests from the list.
    await expect(page.getByRole('link', { name: 'Autumn Open 2026' })).toHaveCount(0);
    // The finished long contest shows the long-challenge chip and day counter.
    await page.getByTestId('contests-kind-long').click();
    await expect(page.getByTestId('contest-long-3')).toBeVisible();
  });

  test('contest detail: commentary tab lists the organizer feed', async ({ page }) => {
    await page.goto('/contests/1');
    await page.getByRole('button', { name: 'Commentary' }).click();
    await expect(page.getByTestId('contest-commentary')).toContainText(
      'Problem A hides a two-pointer trick.',
    );
    await expect(page.getByTestId('contest-commentary')).toContainText('+5m');
  });

  test('hacks tab: window state, targets, submit and the public feed', async ({ page }) => {
    await login(page);
    await page.goto('/contests/1');
    await page.getByRole('button', { name: 'Hacks' }).click();

    await expect(page.getByTestId('hacks-window-state')).toContainText('OPEN');
    // Lock-gated target listing with readable code.
    await page.getByTestId('hack-target-9').click();
    await expect(page.getByTestId('hack-code-9')).toContainText('int(input())');
    // Counter-test submission flows through the judge and lands in the feed.
    await page.getByTestId('hack-input').fill('99');
    await page.getByTestId('hack-submit').click();
    await expect(page.getByTestId('hack-message')).toContainText('SUCCESSFUL');
    await expect(page.getByTestId('hack-row-5')).toContainText('SUCCESSFUL');
  });

  test('drama page: frozen board with hidden-submission suspense', async ({ page }) => {
    await page.goto('/contests/1/drama');
    await expect(page.getByTestId('drama-state')).toContainText('Frozen');
    await expect(page.getByTestId('drama-row-rival')).toContainText('2');
    await expect(page.getByTestId('drama-row-e2e_tester')).toContainText('—');
  });

  test('replay page: timeline, scrubber and final rank', async ({ page }) => {
    await page.goto('/contests/1/replay/e2e_tester');
    await expect(page.getByTestId('replay-summary')).toContainText('#2');
    await expect(page.getByTestId('replay-event-51')).toContainText('WA');
    await expect(page.getByTestId('replay-event-52')).toContainText('AC');
    await expect(page.getByTestId('replay-running-total')).toHaveText('100');
  });

  test('standings rows link to each participant replay on finished contests', async ({ page }) => {
    await page.goto('/contests/3');
    await page.getByRole('button', { name: 'Standings' }).click();
    const link = page.getByTestId('replay-link-e2e_tester');
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByTestId('replay-summary')).toBeVisible();
  });
});
