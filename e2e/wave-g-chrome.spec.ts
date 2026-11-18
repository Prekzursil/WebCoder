// E2E [wave G items 75/79/80/81/89/94]: the site-chrome PR — theme
// toggle (dark/light), the Ctrl-K command palette, the "?" keyboard map,
// the split-view problem layout, the guest try-it page and the
// first-visit feature tour (mock mode; the guest run hits the mock
// /api/v1/scratch/guest/ route).

import { test, expect } from '@playwright/test';

test('the theme toggle flips the site to light and persists', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).not.toHaveAttribute('data-theme', 'light');
  await page.getByTestId('theme-toggle').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  // Persistence across a reload (the pre-paint script applies it).
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'light');
  // And back to dark.
  await page.getByTestId('theme-toggle').click();
  await expect(html).not.toHaveAttribute('data-theme', 'light');
});

test('Ctrl-K opens the palette, filters and navigates', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const palette = page.getByTestId('command-palette');
  await expect(palette).toBeVisible();
  await page.getByPlaceholder(/type a command/i).fill('contest');
  await expect(palette.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/contests/);
});

test('? opens the keyboard map and Esc closes it', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Shift+Slash');
  const help = page.getByTestId('shortcut-help');
  await expect(help).toBeVisible();
  await expect(help.getByText(/command palette/i)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
});

test('the problem page toggles the split view', async ({ page }) => {
  await page.goto('/problems/1');
  const toggle = page.getByTestId('split-view-toggle');
  await expect(toggle).toBeVisible();
  const grid = page.locator('[data-detail-grid]');
  await expect(grid).toHaveAttribute('data-split', 'off');
  await toggle.click();
  await expect(grid).toHaveAttribute('data-split', 'on');
});

test('a guest runs code on /try without an account', async ({ page }) => {
  await page.goto('/try');
  await expect(page.getByTestId('try-page')).toBeVisible();
  await page.getByTestId('try-run').click();
  await expect(page.getByTestId('try-verdict')).toHaveText(/ran successfully/i);
  await expect(page.getByTestId('try-result')).toContainText('Salut, world!');
  // The natural next step is one click away.
  await expect(page.getByRole('link', { name: /create a free account/i })).toBeVisible();
});

test('the first-visit feature tour walks the anchors and finishes', async ({ page }) => {
  await page.goto('/');
  const tour = page.getByTestId('feature-tour');
  await expect(tour).toBeVisible();
  await expect(tour).toContainText(/Step 1 of 5/i);
  await tour.getByRole('button', { name: /^next$/i }).click();
  await expect(tour).toContainText(/Step 2 of 5/i);
  await tour.getByRole('button', { name: /skip tour/i }).click();
  await expect(tour).toHaveCount(0);
  // Dismissed: no re-show on reload.
  await page.reload();
  await expect(page.getByTestId('feature-tour')).toHaveCount(0);
});
