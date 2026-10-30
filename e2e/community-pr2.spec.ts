import { test, expect } from '@playwright/test';

// Parity-audit community wiring (mock api): COM-1 problem-page discussions
// + the spoiler contract on the thread page, COM-6 the home announcements
// panel, EDT-4 the forum language filter, EDT-5 the editorial etiquette
// banner.

test.describe('community wiring (parity audit)', () => {
  test('home shows the announcements panel (COM-6)', async ({ page }) => {
    await page.goto('/');
    const panel = page.getByTestId('announcements-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Site news: interactive problems are live');
  });

  test('problem page lists problem-scoped discussions (COM-1)', async ({
    page,
  }) => {
    await page.goto('/problems/1');
    const panel = page.getByTestId('discussions-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Two Sum approaches discussion');
  });

  test('thread page blurs spoiler posts until revealed (COM-1)', async ({
    page,
  }) => {
    await page.goto('/forum/2');
    const spoiler = page.getByTestId('spoiler-post-2');
    await expect(spoiler).toBeVisible();
    await expect(spoiler.getByText(/hash map/)).toBeVisible();
    await spoiler.getByRole('button', { name: /spoiler/i }).click();
    await expect(spoiler.getByRole('button', { name: /hide spoiler/i })).toBeVisible();
  });

  test('forum language filter narrows to Romanian threads (EDT-4)', async ({
    page,
  }) => {
    await page.goto('/forum');
    await page.getByTestId('lang-chip-ro').click();
    await expect(page.getByRole('link', { name: 'Discuție editorial Two Sum' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Welcome to the WebCoder forum' })).toHaveCount(0);
  });

  test('problem page carries the editorial etiquette banner (EDT-5)', async ({
    page,
  }) => {
    await page.goto('/problems/1');
    await expect(page.getByTestId('editorial-etiquette')).toContainText(
      /only when stuck/i
    );
  });
});
