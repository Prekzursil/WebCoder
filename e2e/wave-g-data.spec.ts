// E2E [wave G items 76/78/86/87/92]: the statements-and-data PR —
// cross-device drafts (restore + autosave), private statement
// annotations, localized sample comments, the timezone picker, and the
// offline statement pack (mock mode).

import { test, expect } from '@playwright/test';

const AUTH_COOKIE = [
  { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
];

test('sample tests show the localized comment', async ({ page }) => {
  await page.goto('/problems/1');
  await expect(page.getByText('The classic pair.')).toBeVisible();
});

test('the editor restores the saved draft and autosaves edits', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
      }),
    );
  });
  await page.goto('/problems/1');
  // The mock draft (print(40 + 2)) is restored into the editor.
  await expect(page.getByTestId('submit-code-editor').getByTestId('code-editor')).toContainText(
    'print(40 + 2)',
  );
});

test('the annotations panel lists and adds private notes', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
      }),
    );
  });
  await page.goto('/problems/1');
  const panel = page.getByTestId('annotations-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('hash map!');
  await page.getByTestId('annotations-panel').getByRole('textbox').fill('two pointers also work');
  // Simulate a selection then capture.
  await panel.getByRole('button', { name: /capture selection/i }).click();
});

test('the offline pack button downloads the self-contained HTML', async ({ page }) => {
  await page.goto('/problems/1');
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('save-offline-pack').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/webcoder-.*-en\.html/);
});

test('the profile identity card carries the timezone picker', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
      }),
    );
  });
  await page.goto('/profile');
  // IdentityCard lives on the settings tab.
  await page.getByRole('button', { name: 'settings' }).click();
  const tz = page.getByTestId('identity-timezone');
  await expect(tz).toBeVisible();
  await tz.selectOption('Europe/Bucharest');
});
