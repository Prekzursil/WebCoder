import { test, expect } from '@playwright/test';

// Wave F items 61-65 (mock mode): blogs, the wiki, the WA-help queue, the
// solutions license chips and the following-filtered activity feed.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave F publishing (mock api)', () => {
  test('blogs hub lists posts and publishes through the editor', async ({ page }) => {
    await login(page);
    await page.goto('/blogs');
    await expect(page.getByTestId('blog-post-how-we-seeded-the-starter-pack')).toBeVisible();
    await page.getByTestId('blog-title-input').fill('My first post');
    await page.getByTestId('blog-body-input').fill('Hello world');
    await page.getByTestId('blog-submit').click();
    await expect(page.getByTestId('blog-title-input')).toHaveValue('');
  });

  test('wiki hub lists articles; article page edits and shows history', async ({ page }) => {
    await login(page);
    await page.goto('/wiki');
    await expect(page.getByTestId('wiki-hub-cautare-binara')).toContainText('Căutare binară');
    await page.getByTestId('wiki-hub-cautare-binara').getByRole('link').click();
    await expect(page.getByTestId('wiki-body')).toContainText('O(log n)');
    // Edit flow: open the editor, change the RO body, save.
    await page.getByTestId('wiki-edit-button').click();
    await page.getByTestId('wiki-body-ro').fill('Căutarea binară — jumătățește intervalul.');
    await page.getByTestId('wiki-save').click();
    await expect(page.getByTestId('wiki-body')).toContainText('jumătățește');
    await expect(page.getByTestId('wiki-revision-1')).toBeVisible();
  });

  test('wa-help queue renders and the asker accepts an answer', async ({ page }) => {
    await login(page);
    await page.goto('/wa-help');
    const row = page.getByTestId('wa-help-row-30');
    await expect(row).toContainText('Why WA on test 4?');
    await expect(page.getByTestId('wa-help-answer-31')).toContainText('sort the array');
    await page.getByTestId('wa-help-accept-30').click();
    // Asking a new question from a failed submission.
    await page.getByTestId('wa-help-submission-input').fill('42');
    await page.getByTestId('wa-help-question-input').fill('Why TLE?');
    await page.getByTestId('wa-help-submit').click();
    await expect(page.getByTestId('wa-help-submission-input')).toHaveValue('');
  });

  test('activity feed toggles the following filter', async ({ page }) => {
    await login(page);
    await page.goto('/');
    const toggle = page.getByTestId('feed-following-toggle');
    await toggle.click();
    await expect(page.getByTestId('activity-feed')).toContainText('rival');
    await toggle.click();
    await expect(page.getByTestId('activity-feed').getByTestId('feed-row-601')).toHaveCount(0);
  });
});
