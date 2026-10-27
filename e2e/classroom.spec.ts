import { test, expect } from '@playwright/test';

// Wave B classroom UI (mock mode): the student classes surface — enrolled
// classes with open-teme badges, the homework list with derived states,
// and the self-join form. Teacher CRUD + the EDU-5 grid are covered by
// vitest (page.test.tsx) since the mock user is a student.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('classroom surface (mock api)', () => {
  test('student sees enrolled class, open-teme badge and homework row', async ({ page }) => {
    await login(page);
    await page.goto('/classes');

    await expect(page.getByRole('heading', { name: 'My classes' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Enrolled classes' }).getByText('IX-A')).toBeVisible();
    await expect(page.getByText('1 open teme')).toBeVisible();
    // Homework row links to the temă detail.
    await expect(page.getByRole('link', { name: /Tema 1/ })).toHaveAttribute(
      'href',
      '/classes/assignments/3'
    );
  });

  test('the self-join form is present for students (EDU-1)', async ({ page }) => {
    await login(page);
    await page.goto('/classes');
    await expect(page.getByRole('textbox', { name: 'Class code' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Join' })).toBeVisible();
  });
});
