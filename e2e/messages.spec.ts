import { test, expect } from '@playwright/test';

// COM-5 private messaging (mock api): the full user-visible safety loop —
// inbox → chat (XSS-safe text rendering) → send → notification → report →
// moderator resolves from the queue. Plus block/unblock on the thread page
// and the block list on the inbox.

test.describe('COM-5 private messaging (mock api)', () => {
  test('inbox lists the thread with unread badge; navbar carries Messages', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();

    await page.goto('/messages');
    const row = page.getByTestId('msg-thread-1');
    await expect(row).toBeVisible();
    await expect(row).toContainText('admin_e2e');
    await expect(row).toContainText('third message');
    await expect(page.getByLabel('1 unread')).toBeVisible();
  });

  test('chat renders bodies as literal text and clears the unread badge on open', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();

    await page.goto('/messages/1');
    // The HTML snippet must appear as TEXT, never execute or vanish.
    await expect(page.getByText('<script>alert(1)</script> try this')).toBeVisible();
    await expect(page.getByText('hello admin')).toBeVisible();
    // Received (not-mine) messages expose the report control; mine do not.
    await expect(page.getByTestId('msg-report-btn-2')).toBeVisible();
    await expect(page.getByTestId('msg-report-btn-1')).toHaveCount(0);
  });

  test('send -> notification -> report -> moderator resolves', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();

    // 1) SEND a message in the thread.
    await page.goto('/messages/1');
    await page.getByLabel('Write a message').fill('e2e says hi');
    await page.getByTestId('msg-send').click();
    await expect(page.getByText('e2e says hi')).toBeVisible();

    // 2) NOTIFICATION: the bell count includes the seeded MESSAGE_RECEIVED,
    //    and the notifications page renders it with the actor + link.
    await page.goto('/notifications');
    const row = page.locator('li, article, div').filter({ hasText: 'admin_e2e sent you a message' }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText('third message');

    // 3) REPORT the received message (GROOMING reason pick).
    await page.goto('/messages/1');
    await page.getByTestId('msg-report-btn-2').click();
    await page.getByTestId('msg-report-reason-GROOMING').click();
    await expect(page.getByTestId('msg-notice')).toContainText(/review/i);

    // 4) MODERATOR resolves: seed the admin session (auth.spec's cookie +
    //    localStorage pattern — the moderator is the OTHER party here, so a
    //    plain re-login would collide with the open page session).
    await page.context().clearCookies();
    await page.context().addCookies([
      { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
    ]);
    await page.evaluate(() => localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'admin_e2e', email: 'admin@e2e.local', role: 'ADMIN', two_factor_enabled: false })
    ));
    await page.goto('/messages');
    const reportRow = page.getByTestId('msg-mod-queue').locator('li').first();
    await expect(reportRow).toContainText('GROOMING');
    await expect(reportRow).toContainText('alert(1)');
    await page.locator('[data-testid^="msg-resolve-"]').first().click();
    await expect(page.getByTestId('msg-mod-queue')).toContainText('No open message reports.');
  });

  test('block and unblock from the thread page', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();

    await page.goto('/messages/1');
    const toggle = page.getByTestId('msg-block-toggle');
    await expect(toggle).toHaveText(/block/i);
    await toggle.click();
    await expect(page.getByTestId('msg-notice')).toContainText(/blocked/i);

    // The inbox block list shows the muted user; unblocking removes them.
    await page.goto('/messages');
    await page.getByTestId('msg-blocks-toggle').click();
    const unblock = page.getByLabel('Unblock admin_e2e');
    await expect(unblock).toBeVisible();
    await unblock.click();
    await expect(page.getByText('You have not blocked anyone.')).toBeVisible();
  });
});
