// E2E [judge-fairness wave D]: Scratch on site — the /blocks playground
// and a block problem whose generated Python is submitted through the
// NORMAL judge pipeline (mock mode: the submit POST is intercepted at the
// browser level; the real-stack judged round-trip runs in the live
// acceptance pass and real-stack specs).

import { test, expect } from '@playwright/test';

test('the block playground mounts Blockly and previews generated Python', async ({
  page,
}) => {
  await page?.goto('/blocks');

  // Blockly injects its workspace SVG.
  await expect(page?.getByTestId('blockly-editor')).toBeVisible();
  await expect(page?.locator('.blocklySvg').first()).toBeVisible();

  // The starter blocks generate judge-runnable Python.
  await page?.getByRole('button', { name: /show generated code/i }).click();
  const code = page?.getByTestId('generated-code');
  await expect(code).toContainText('int(input())');
});

test('the playground generates JavaScript with the stdin preamble', async ({
  page,
}) => {
  await page?.goto('/blocks');
  await page?.getByLabel(/generates/i).selectOption('nodejs20');
  await page?.getByRole('button', { name: /show generated code/i }).click();
  await expect(page?.getByTestId('generated-code')).toContainText(
    'readFileSync(0'
  );
});

test('the playground runs generated code through the scratch endpoint', async ({
  page,
  context,
}) => {
  // Scratch runs need a session (the endpoint is authenticated).
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
  await page?.goto('/blocks');
  // The generated code arrives asynchronously after Blockly mounts —
  // wait for it before running (the run button guards on non-empty code).
  await page?.getByRole('button', { name: /show generated code/i }).click();
  await expect(page?.getByTestId('generated-code')).toContainText('int(input())');
  await page?.getByLabel(/input \(stdin\)/i).fill('42');
  await page?.getByRole('button', { name: /run on the judge/i }).click();
  await expect(page?.getByTestId('blocks-output')).toBeVisible();
});

test('a block problem renders the block editor and submits generated code', async ({
  page,
  context,
}) => {
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

  // Intercept the submit POST at the browser level: assert the payload is
  // the GENERATED python (blocks -> int(input()) ...), then fake the API.
  let seenLanguage = '';
  let seenCode = '';
  await page?.route('**/api/v1/submissions/submit/', async (route) => {
    const body = route.request().postDataJSON() as {
      language: string;
      code: string;
    };
    seenLanguage = body.language;
    seenCode = body.code;
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 501, verdict: 'PENDING' }),
    });
  });

  await page?.goto('/problems/7');

  // Block mode: the code editor is replaced by the block editor and the
  // language selector is gone (the generator is the language).
  await expect(page?.getByTestId('blockly-editor')).toBeVisible();
  await expect(page?.locator('#language-select')).toHaveCount(0);
  await expect(page?.getByText(/solve with blocks/i)).toBeVisible();

  // Submit the starter blocks (confirmation modal -> confirm).
  await page?.getByRole('button', { name: /submit/i }).first().click();
  await page?.getByRole('button', { name: /^confirm$/i }).click();

  await expect
    .poll(() => Promise.resolve(seenLanguage))
    .toBe('python3');
  await expect
    .poll(() => Promise.resolve(seenCode.includes('int(input())')))
    .toBe(true);
});
