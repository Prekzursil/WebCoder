import { test, expect } from '@playwright/test';

// Wave F items 66-69 (mock mode): the community hub — the reputation card,
// the medalist AMA sessions (ask + upvote + host answer) and the
// problem-request board (open + vote).

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F recognition (mock api)', () => {
  test('hub: reputation card, AMA list, request board', async ({ page }) => {
    await login(page);
    await page.goto('/amas');
    // Item 66 — the caller's tier + privileges.
    const reputation = page.getByTestId('reputation-card');
    await expect(reputation).toContainText('Contributor');
    await expect(reputation).toContainText('70 honor to Trusted');
    // Item 68 — the session list with the LIVE badge.
    const row = page.getByTestId('ama-row-1');
    await expect(row).toContainText('Ask me about ONI');
    await expect(row).toContainText('LIVE');
    // Item 69 — the request board with votes.
    const request = page.getByTestId('request-row-5');
    await expect(request).toContainText('More graph problems');
    await expect(request).toContainText('▲ 5');
  });

  test('AMA session: ask, upvote; host view shows answers', async ({ page }) => {
    await login(page);
    await page.goto('/amas/1');
    await expect(page.getByTestId('ama-description')).toContainText('Three medals');
    // The seeded question carries the host answer + upvote count.
    const question = page.getByTestId('ama-question-11');
    await expect(question).toContainText('How did you train?');
    await expect(page.getByTestId('ama-answer-11')).toContainText('Daily drills');
    await page.getByTestId('ama-upvote-11').click();
    // Asking a new question lands in the window.
    await page.getByTestId('ama-question-input').fill('What editor do you use?');
    await page.getByTestId('ama-question-submit').click();
    await expect(page.getByTestId('ama-question-input')).toHaveValue('');
  });

  test('request board: open a request and vote', async ({ page }) => {
    await login(page);
    await page.goto('/amas');
    await page.getByTestId('request-title-input').fill('DP on trees');
    await page.getByTestId('request-description-input').fill('A full chapter please');
    await page.getByTestId('request-submit').click();
    await expect(page.getByTestId('request-title-input')).toHaveValue('');
    await page.getByTestId('request-vote-5').click();
  });
});
