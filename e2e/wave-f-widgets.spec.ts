import { test, expect } from '@playwright/test';

// Wave F items 70-72 (mock mode): the setter CV page (view + owner edit),
// the shareable solve card on AC submissions, and the embeddable problem
// widget page.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F profile widgets (mock api)', () => {
  test('setter CV: portfolio, edit flow for the owner', async ({ page }) => {
    await login(page);
    await page.goto('/setters/e2e_tester');
    const summary = page.getByTestId('setter-cv-summary');
    await expect(summary).toContainText('12');
    await expect(page.getByTestId('setter-difficulty-HARD')).toContainText('2');
    await expect(page.getByTestId('setter-blurb')).toContainText('2019');
    // Owner edit: change the blurb and save.
    await page.getByTestId('setter-edit-button').click();
    await page.getByTestId('setter-blurb-input').fill('New blurb');
    await page.getByTestId('setter-save').click();
    await expect(page.getByTestId('setter-cv-summary')).toBeVisible();
  });

  test('setter CV: strangers get no edit button', async ({ page }) => {
    await login(page);
    await page.goto('/setters/admin_e2e');
    await expect(page.getByTestId('setter-cv-summary')).toBeVisible();
    await expect(page.getByTestId('setter-edit-button')).toHaveCount(0);
  });

  test('embed widget page renders title, samples and CTA', async ({ page }) => {
    await page.goto('/embed/problems/1');
    const widget = page.getByTestId('problem-embed');
    await expect(widget).toContainText('Two Sum');
    await expect(widget).toContainText('42');
    await expect(page.getByTestId('embed-samples')).toContainText('[0,1]');
    await expect(page.getByTestId('embed-cta')).toHaveAttribute('href', '/problems/1');
  });

  test('solve card image loads and the copy button works', async ({ page }) => {
    await login(page);
    await page.goto('/submissions/1');
    // The mocked submission #1 is an AC row -> the share card renders.
    const image = page.getByTestId('solve-card-image');
    await expect(image).toBeVisible();
    const src = await image.getAttribute('src');
    expect(src).toContain('/cards/solve/e2e_tester/1/svg/');
    await page.getByTestId('solve-card-copy').click();
    await expect(page.getByTestId('solve-card-copy')).toContainText(/Copied|link/i);
  });
});
