// E2E [wave E item 32]: the algorithm visualizers — step through a sort
// and a binary search with highlighting. No backend: pure client page.

import { test, expect } from '@playwright/test';

test('the sorting visualizer steps through frames', async ({ page }) => {
  await page.goto('/visualizers');
  const sorter = page.getByTestId('viz-sorter');
  await expect(sorter).toBeVisible();
  await expect(page.getByTestId('viz-bars')).toBeVisible();
  await expect(sorter).toContainText('start (1/');

  // Step forward: a compare or swap frame with the counter advancing.
  await page.getByTestId('viz-next').click();
  await expect(page.getByTestId('viz-note')).toContainText('(2/');

  // Switching algorithm resets the frames.
  await page.getByTestId('algo-insertion').click();
  await expect(page.getByTestId('viz-note')).toContainText('(1/');
});

test('the binary search visualizer finds the target', async ({ page }) => {
  await page.goto('/visualizers');
  await page.getByTestId('viz-target').fill('9');
  const search = page.getByTestId('viz-search');
  await expect(search).toBeVisible();
  await page.getByTestId('viz-search-next').click();
  // Either probing (note text) or already found.
  const note = await page.getByTestId('viz-search-note').textContent();
  expect(note).toBeTruthy();
  // Step to the end regardless of depth.
  for (let i = 0; i < 5; i += 1) {
    await page.getByTestId('viz-search-next').click();
  }
  await expect(page.getByTestId('viz-search-note')).toContainText(/found|absent|not in/i);
});
