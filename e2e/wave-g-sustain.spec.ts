// E2E [wave G items 146-150]: the partnerships page + apply flow, the
// public transparency report, the teacher-certification exam, and the
// supporter badge. Mock mode.

import { test, expect } from '@playwright/test';

const AUTH_COOKIE = [
  { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
];

test('the schools page explains the program and accepts an application', async ({ page }) => {
  await page.goto('/schools');
  await expect(page.getByTestId('schools-page')).toBeVisible();
  await expect(page.getByTestId('schools-includes')).toContainText(/DPA/i);

  await page.getByTestId('schools-school').fill('Liceul Teoretic E2E');
  await page.getByTestId('schools-city').fill('Brașov');
  await page.getByTestId('schools-contact').fill('Prof. Pop');
  await page.getByTestId('schools-email').fill('pop@liceul.example');
  await page.getByTestId('schools-students').fill('90');
  await page.getByTestId('schools-submit').click();
  await expect(page.getByTestId('schools-applied')).toBeVisible();
});

test('the transparency page shows aggregate sections without usernames', async ({ page }) => {
  await page.goto('/transparency');
  await expect(page.getByTestId('transparency-page')).toBeVisible();
  const activity = page.getByTestId('transparency-activity');
  await expect(activity).toContainText('512');
  await expect(activity).toContainText('4');
  const moderation = page.getByTestId('transparency-moderation');
  await expect(moderation).toContainText('CONTENT_HIDDEN');
  // Aggregates only — none of the seeded usernames appear.
  await expect(page.getByTestId('transparency-page')).not.toContainText('alice_e2e');
});

test('a teacher can take the certification exam and pass', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 3,
        username: 'teacher_e2e',
        email: 'teacher@e2e.local',
        role: 'TEACHER',
      }),
    );
  });
  await page.goto('/teach/certification');
  const questions = page.getByTestId('tcert-questions');
  await expect(questions).toBeVisible();
  await page.getByTestId('tcert-q-1').locator('input[type="radio"]').first().check();
  await page.getByTestId('tcert-submit').click();
  await expect(page.getByTestId('tcert-result')).toContainText(/passed/i);
});

test('the profile shows the cosmetic supporter badge when granted', async ({ page, context }) => {
  await context.addCookies(AUTH_COOKIE);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
        supporter_since: '2026-01-15',
      }),
    );
  });
  await page.goto('/profile');
  // The identity card (and its badge) lives on the settings tab.
  await page.getByRole('button', { name: 'settings' }).click();
  const badge = page.getByTestId('supporter-badge');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText(/supporter/i);
});
