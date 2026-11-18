import { test, expect } from '@playwright/test';

// Wave F items 49/50/55 (mock mode): team contests (register with a team
// name, roster + team standings), the school-cup badge, the self-prediction
// flow and the calibration card on /ratings.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F teams / cups / prediction (mock api)', () => {
  test('team contest: register with a team name, roster + team standings', async ({ page }) => {
    await login(page);
    await page.goto('/contests/1');
    // The register block asks for a team name on team contests.
    await expect(page.getByTestId('register-team-input')).toBeVisible();
    await page.getByTestId('register-team-input').fill('Echipa Albastra');
    await page.getByTestId('register-team-button').click();
    // The Teams tab lists the roster.
    await page.getByRole('button', { name: 'Teams' }).click();
    await expect(page.getByTestId('team-row-Echipa Albastra')).toContainText('e2e_tester');
    // The team standings board aggregates member rows.
    await expect(page.getByTestId('team-standing-Echipa Albastra')).toContainText('150');
  });

  test('school cup: badge names the school', async ({ page }) => {
    await page.goto('/contests/90');
    await expect(page.getByText(/🏫/)).toBeVisible();
    await expect(page.getByText('Colegiul National Emil Racovita')).toBeVisible();
  });

  test('prediction: commit a final rank, then see the calibration card', async ({ page }) => {
    await login(page);
    await page.goto('/contests/90');
    await page.getByTestId('prediction-input').fill('12');
    await page.getByTestId('prediction-submit').click();
    await expect(page.getByText(/Prediction saved/i)).toBeVisible();
    // The calibration profile renders on the ratings page.
    await page.goto('/ratings');
    await expect(page.getByTestId('calibration-card')).toContainText('optimistic');
    await expect(page.getByTestId('calibration-row-3')).toContainText('#1 → #3');
  });
});
