// E2E [wave E items 29/30/33/34/35]: the learning hub — review queue,
// week plan, mistake profile, skill graph and the theory deck. Mock mode:
// browser-level interception of the /learning/ endpoints.

import { test, expect } from '@playwright/test';

test('the learning hub renders its five surfaces', async ({ page, context }) => {
  await context.addCookies([
    { name: 'wc_access', value: 'e2e-access', domain: 'localhost', path: '/' },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({ id: 2, username: 'e2e', email: 'e2e@e2e.local', role: 'BASIC' }),
    );
  });

  await page.route('**/api/v1/learning/review-queue/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        due: 1,
        results: [
          {
            problem_id: 9,
            title_i18n: { en: 'Binary Search Position' },
            difficulty: 'EASY',
            attempts: 2,
            misses: 2,
            stage: 2,
            interval_days: 3,
            due_at: '2026-11-10T10:00:00Z',
            due: true,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/learning/practice-plan/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        due_reviews: 1,
        days: [
          {
            date: '2026-11-18',
            kind: 'review',
            problem_id: 9,
            title_i18n: { en: 'Binary Search Position' },
            focus_tag: null,
          },
          { date: '2026-11-19', kind: null, problem_id: null, title_i18n: null, focus_tag: null },
        ],
      }),
    });
  });
  await page.route('**/api/v1/learning/mistake-profile/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        total_submissions: 4,
        summary: '4 submissions, 1 accepted (25% AC rate).',
        verdict_counts: { WA: 3, AC: 1 },
        patterns: [
          {
            pattern: 'EDGE_CASES',
            evidence: '2/3 WA submissions pass every sample but fail hidden tests.',
            hint_en: 'Probe the extremes.',
            hint_ro: 'Verifică extreme.',
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/learning/skills/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 2,
        edges: [{ from: 'loops', to: 'arrays' }],
        suggestion: [],
        nodes: [
          {
            slug: 'loops',
            name_i18n: { en: 'Loops' },
            prerequisites: [],
            unlocked: true,
            solved: 2,
            attempted: 3,
            points: 6,
          },
          {
            slug: 'arrays',
            name_i18n: { en: 'Arrays' },
            prerequisites: ['loops'],
            unlocked: false,
            solved: 0,
            attempted: 0,
            points: 0,
          },
        ],
      }),
    });
  });
  await page.route('**/api/v1/learning/theory/', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        count: 1,
        results: [
          {
            id: 9,
            tag: 'binary-search',
            front_en: 'What must hold?',
            back_en: 'Monotonicity.',
            front_ro: 'F?',
            back_ro: 'M.',
          },
        ],
      }),
    });
  });

  await page.goto('/learning');
  await expect(page.getByTestId('review-queue')).toContainText('Binary Search Position');
  await expect(page.getByTestId('review-queue')).toContainText('1 due');
  await expect(page.getByTestId('practice-plan')).toContainText('rest');
  await expect(page.getByTestId('mistake-profile')).toContainText('25% AC rate');
  await expect(page.getByTestId('skill-graph')).toContainText('Arrays');

  const card = page.getByTestId('theory-card-9');
  await expect(card).toContainText('What must hold?');
  await card.click();
  await expect(card).toContainText('Monotonicity.');
});
