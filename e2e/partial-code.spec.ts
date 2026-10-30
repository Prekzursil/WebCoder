// E2E [judge-fairness wave E]: partial-code problems — the editor renders
// the FULL skeleton with locked regions, completing the function submits
// the assembled file, and a tampered scaffold gets the clear 400.
//
// Mock mode: the submit POSTs are intercepted at the browser level; the
// live judged round-trip runs in this wave's live-stack acceptance pass.

import { test, expect } from '@playwright/test';

const TAMEPERED_SCENARIO = false; // kept for clarity of the two flows

async function seedAuth(context: import('@playwright/test').BrowserContext | undefined, page: import('@playwright/test').Page | undefined) {
  await context?.addCookies([
    { name: 'wc_access', value: 'e2e-admin-access', domain: 'localhost', path: '/' },
  ]);
  await page?.addInitScript(() => {
    localStorage.setItem(
      'user',
      JSON.stringify({
        id: 2,
        username: 'admin_e2e',
        email: 'admin@e2e.local',
        role: 'ADMIN',
      })
    );
  });
}

test('the partial-code editor shows the skeleton and the badge', async ({
  page,
  context,
}) => {
  await seedAuth(context, page);
  await page?.goto('/problems/8');
  await expect(page?.getByText('Partial code').first()).toBeVisible();
  // The full file renders — includes and main are visible...
  await expect(page?.getByText(/#include <cstdio>/).first()).toBeVisible();
  await expect(page?.getByText(/int main\(\)/).first()).toBeVisible();
  // ...and the locked-region styling is applied to the scaffolding.
  await expect(page?.locator('.cm-wc-locked').first()).toBeVisible();
});

test('completing the function submits the full assembled file', async ({
  page,
  context,
}) => {
  await seedAuth(context, page);

  let seenCode = '';
  await page?.route('**/api/v1/submissions/submit/', async (route) => {
    const body = route.request().postDataJSON() as { code: string };
    seenCode = body.code;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 601, verdict: 'PENDING' }),
    });
  });

  await page?.goto('/problems/8');

  // Type the completion into the editable region: the hole carries a
  // TODO hint line (HackerRank-style) — an obvious, unlocked target.
  const hintLine = page?.locator(
    '[data-testid="partial-code-editor"] .cm-line',
    { hasText: 'TODO: your code here' }
  );
  // Triple-click selects the hint line (an editable hole), typing replaces
  // it in one transaction.
  await hintLine?.click({ clickCount: 3 });
  await page?.keyboard.type('int total = 0;');

  await page?.getByRole('button', { name: /submit/i }).first().click();
  await page?.getByRole('button', { name: /^confirm$/i }).click();

  // The submission keeps the locked scaffolding around the edit.
  await expect
    .poll(() => Promise.resolve(seenCode.includes('#include <cstdio>')))
    .toBe(true);
  await expect
    .poll(() => Promise.resolve(seenCode.includes('int total = 0;')))
    .toBe(true);
  await expect
    .poll(() => Promise.resolve(seenCode.includes('scanf')))
    .toBe(true);
});

test('a scaffold-tampering submit surfaces the clear server rejection', async ({
  page,
  context,
}) => {
  if (TAMEPERED_SCENARIO) return; // covered by the backend suite + live pass
  await seedAuth(context, page);

  await page?.route('**/api/v1/submissions/submit/', async (route) => {
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({
        code: [
          'Locked region modified: line ~10 of the template (\'    return 0;\' is missing or changed in your submission. Locked regions must stay exactly as given.',
        ],
      }),
    });
  });

  await page?.goto('/problems/8');
  // Complete the function (the mock rejects ANY submit with the tamper
  // message — the editor itself stays locked, which is the point).
  const hintLine = page?.locator(
    '[data-testid="partial-code-editor"] .cm-line',
    { hasText: 'TODO: your code here' }
  );
  await hintLine?.click({ clickCount: 3 });
  await page?.keyboard.type('return 0;');
  await page?.getByRole('button', { name: 'Submit', exact: true }).click();
  await page?.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page?.getByText(/Locked region modified/i)).toBeVisible();
});
