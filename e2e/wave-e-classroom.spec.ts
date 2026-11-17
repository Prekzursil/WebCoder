// E2E [wave E items 22/43/44]: the class page's teacher insights — the
// effort board with report-card links, the failure heatmap, and the batch
// member import. Mock mode.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ context, page }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-teacher-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 3, username: 'teach_e2e', email: 't@e2e.local', role: 'TEACHER' }),
    );
  });
});

async function mockClassShell(page: import('@playwright/test').Page) {
  // The auth hydration replaces the optimistic localStorage user with
  // GET /users/me/ — pin the teacher identity there too.
  await page.route(/\/api\/v1\/users\/me\/?(\?.*)?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 3,
        username: 'teach_e2e',
        email: 't@e2e.local',
        role: 'TEACHER',
        two_factor_enabled: false,
        two_factor_required: false,
      }),
    });
  });
  await page.route(/\/api\/v1\/classroom\/classes\/3\/?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        id: 3,
        name: 'IX-C',
        teacher_username: 'teach_e2e',
        join_code: 'JOIN3',
        member_count: 2,
        assignment_count: 1,
      }),
    });
  });
  await page.route(/\/api\/v1\/classroom\/classes\/3\/members\/?$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 1, student: 7, student_username: 'grinder', joined_at: '2026-11-01T10:00:00Z' },
      ]),
    });
  });
  await page.route(/\/api\/v1\/classroom\/assignments\//, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, next: null, previous: null, results: [] }),
    });
  });
}

test('the class page shows the effort board and heatmap', async ({ page }) => {
  await mockClassShell(page);
  await page.route(/\/api\/v1\/classroom\/classes\/3\/effort\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        results: [
          {
            rank: 1,
            user_id: 7,
            username: 'grinder',
            attempts: 9,
            active_days: 3,
            problems_solved: 1,
          },
        ],
      }),
    });
  });
  await page.route(/\/api\/v1\/classroom\/classes\/3\/heatmap\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        assignments: [
          {
            assignment_id: 9,
            title_i18n: { en: 'HW1' },
            problems: [
              { problem_id: 1, label: 'A', points: 100 },
              { problem_id: 2, label: 'B', points: 100 },
            ],
            students: [
              {
                user_id: 7,
                username: 'grinder',
                cells: [
                  { intensity: 0.5, attempts: 4 },
                  { intensity: 0, attempts: 2 },
                ],
              },
            ],
            failure_rates: [
              { label: 'A', failure_rate: 0.5 },
              { label: 'B', failure_rate: 0 },
            ],
          },
        ],
      }),
    });
  });

  await page.goto('/classes/3');
  const board = page.getByTestId('effort-board');
  await expect(board).toBeVisible();
  await expect(board).toContainText('grinder');
  const card = page.getByTestId('report-card-grinder');
  await expect(card).toHaveAttribute('href', /\/report-card\/7\/$/);

  await page.getByRole('button', { name: /heatmap/i }).click();
  const heat = page.getByTestId('failure-heatmap');
  await expect(heat).toBeVisible();
  await expect(heat).toContainText('HW1');
  await expect(page.getByTestId('failrate-A')).toContainText('50');
});

test('the batch import enrolls and reports missing names', async ({ page }) => {
  await mockClassShell(page);
  await page.route(/\/api\/v1\/classroom\/classes\/3\/effort\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, results: [] }),
    });
  });
  await page.route(/\/api\/v1\/classroom\/classes\/3\/heatmap\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ count: 0, assignments: [] }),
    });
  });
  await page.route(/\/api\/v1\/classroom\/classes\/3\/members\/bulk\/?/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ added: 2, already_members: 1, missing: ['ghost'] }),
    });
  });

  await page.goto('/classes/3');
  await page.getByRole('button', { name: /import/i }).click();
  const box = page.getByLabel(/usernames/i);
  await box.fill('ana, dan, ghost');
  await page.getByRole('button', { name: /enroll/i }).click();
  await expect(page.getByTestId('import-result')).toContainText('ghost');
});
