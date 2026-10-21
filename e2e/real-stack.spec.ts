// E2E: REAL-BACKEND specs [Q13] — run only when E2E_API_BASE points at the
// live compose stack (RUNBOOK Mode A: backend + celery-worker + judge-runner
// + postgres + redis). Default CI runs skip this file entirely; the suite
// stays hermetic.
//
// Proven end-to-end here (nothing mocked, no page.route):
//   1. login against real dj-rest-auth JWTs,
//   2. the public catalog listing API-seeded problems,
//   3. submit a solution through the UI → Celery judges it in the
//      judge-runner container → the UI polls to a real verdict (AC).

import { test, expect } from '@playwright/test';
import {
  REAL_API_BASE,
  isRealStack,
  login,
  ensureRealStackFixtures,
  E2E_USER,
  E2E_USER_PASS,
} from './lib/realStack';

test.skip(!isRealStack, `real-stack mode only — set E2E_API_BASE (live stack expected at ${REAL_API_BASE || 'http://127.0.0.1:8010'})`);

let seeded: { twoSumId: number; reverseId: number };

test.beforeAll(async () => {
  seeded = await ensureRealStackFixtures();
});


test('real login issues JWTs and shows the authenticated navbar', async ({ page }) => {
  await page?.goto('/login');

  await page?.fill('#login-username', E2E_USER);
  await page?.fill('#login-password', E2E_USER_PASS);
  await page?.getByRole('button', { name: 'Login', exact: true })?.click();

  await expect(page)?.toHaveURL(/\/$/);
  await expect(page?.getByText(E2E_USER, { exact: true }))?.toBeVisible();

  // Real access/refresh JWTs (header.payload.signature) persisted by
  // AuthContext — not the mock constants.
  const accessToken = await page?.evaluate(() => localStorage.getItem('accessToken'));
  const refreshToken = await page?.evaluate(() => localStorage.getItem('refreshToken'));
  expect(accessToken).toMatch(/^ey[^.]+\.[^.]+\./);
  expect(refreshToken).toMatch(/^ey[^.]+\.[^.]+\./);
});

test('real catalog lists the API-seeded problems with difficulty and status', async ({ page }) => {
  await page?.goto('/problems');

  // [F7] the public catalog hides the status column from anonymous
  // visitors (they only ever see APPROVED problems) — same contract as the
  // mock-mode spec.
  const twoSumRow = page?.getByRole('row').filter({ hasText: 'Two Sum' });
  await expect(twoSumRow)?.toBeVisible();
  await expect(twoSumRow)?.toContainText('EASY');
  await expect(twoSumRow)?.not.toContainText('APPROVED');

  const reverseRow = page?.getByRole('row').filter({ hasText: 'Reverse String' });
  await expect(reverseRow)?.toBeVisible();
  await expect(reverseRow)?.toContainText('MEDIUM');

  // Live-stack honesty: the catalog also shows the stack's own problems
  // (e.g. 'A Plus B' seeded by the RUNBOOK quickstart) — assert one real
  // row to prove this is not the mock server.
  await expect(page?.getByRole('row').filter({ hasText: 'A Plus B' }))?.toBeVisible();
});

test('API-seeded problem: submit through the UI → Celery judges → verdict AC', async ({ page }) => {
  test.setTimeout(90_000); // judge round-trip includes container cold start

  // Login via the UI so the submit form is authorized.
  await page?.goto('/login');
  await page?.fill('#login-username', E2E_USER);
  await page?.fill('#login-password', E2E_USER_PASS);
  await page?.getByRole('button', { name: 'Login', exact: true })?.click();
  await expect(page)?.toHaveURL(/\/$/);

  await page?.goto(`/problems/${seeded.twoSumId}`);
  await expect(page?.getByRole('heading', { level: 1 }))?.toHaveText('Two Sum');

  // Fill the submit form: language + code, then confirm in the modal.
  await page?.locator('select').selectOption('python3');
  await page?.fill('#code-editor', 'print("[0,1]")');
  await page?.getByRole('button', { name: /submit/i }).first().click();
  await page?.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

  // [F14] success block: the submit form clears its transient status (the
  // code editor reset wipes it) and instead renders "Verdict: <code>",
  // polling /submissions/{id}/ every 3s until the Celery worker resolves a
  // terminal verdict through the judge-runner container.
  const verdictLine = page?.getByText(/Verdict:\s*(AC|WA|TLE|MLE|CE|RE)/);
  await expect(verdictLine)?.toBeVisible({ timeout: 60_000 });
  await expect(verdictLine)?.toHaveText(/Verdict:\s*AC/);

  // Cross-check against the API directly: the caller's newest submission
  // (cursor list is newest-first, no server-side problem filter yet — B3)
  // is judged AC; the slim list shape lacks test_results, so retrieve it.
  const auth = await login(E2E_USER, E2E_USER_PASS);
  const list = await fetch(`${REAL_API_BASE}/api/v1/submissions/submissions/`, {
    headers: { Authorization: `Bearer ${auth.access}` },
  }).then((r) => r.json());
  const latestId = list.results?.[0]?.id;
  expect(latestId).toBeTruthy();
  const detail = await fetch(`${REAL_API_BASE}/api/v1/submissions/submissions/${latestId}/`, {
    headers: { Authorization: `Bearer ${auth.access}` },
  }).then((r) => r.json());
  expect(detail.problem?.id).toBe(seeded.twoSumId);
  expect(detail.verdict).toBe('AC');
  expect(detail.test_results?.length).toBeGreaterThan(0);
});
