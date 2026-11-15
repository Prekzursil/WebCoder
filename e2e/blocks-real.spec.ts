// E2E [judge-fairness caveat-2 closure]: REAL-STACK Blockly judged
// round-trip with a POLLED VERDICT. The checked-in mock-mode blocks.spec.ts
// asserts the generated submission PAYLOAD (the interception point); this
// spec drives the same block-problem flow against E2E_API_BASE and waits
// for the submission page to poll the judge to a terminal verdict — the
// piece the judge-fairness report flagged as proven only via the API.
//
// Real mode only (E2E_API_BASE=http://localhost:8010 — same hostname as
// the dev server, cookies are SameSite=Lax). In mock mode the file skips.
import { test, expect } from '@playwright/test';
import {
  E2E_ADMIN_PASS,
  E2E_ADMIN_USER,
  E2E_USER,
  E2E_USER_PASS,
  REAL_API_BASE,
  api,
  ensureRealStackFixtures,
  isRealStack,
  login,
} from './lib/realStack';

test.skip(!isRealStack, 'real-stack mode only — set E2E_API_BASE');

/** The blockly proof problem this spec owns on the live stack. */
const BLOCKLY_TITLE = 'E2E Blockly Real Last Digit';

async function seedBlocklyProblem(): Promise<number> {
  const admin = await login(E2E_ADMIN_USER, E2E_ADMIN_PASS);
  // Idempotent: reuse a previous run's row. The catalog's server-side
  // ?search= (#320) finds it regardless of the list's default ordering.
  const list = await api(`/problems/problems/?search=${encodeURIComponent(BLOCKLY_TITLE)}`, {
    token: admin.access,
  });
  if (list.status !== 200) throw new Error(`list -> ${list.status}`);
  const rows: { id: number; title_i18n?: { en?: string } }[] = list.body.results ?? [];
  const existing = rows.find((r) => r.title_i18n?.en === BLOCKLY_TITLE)?.id;
  if (existing) return existing;

  const created = await api('/problems/problems/', {
    method: 'POST',
    token: admin.access,
    body: JSON.stringify({
      title_i18n: { en: BLOCKLY_TITLE, ro: BLOCKLY_TITLE },
      statement_i18n: {
        en: 'Read an integer n and print its last digit (n mod 10).',
        ro: 'Read an integer n and print its last digit (n mod 10).',
      },
      difficulty: 'EASY',
      status: 'APPROVED',
      default_time_limit_ms: 1000,
      default_memory_limit_kb: 65536,
      allowed_languages: ['python3'],
      tags: [],
      // The block lane: the submit form mounts the Blockly editor with the
      // DEFAULT toolbox/starter (reads n, prints n % 10) — the generated
      // Python is exactly the solution, so the judge must resolve AC.
      block_config: { engine: 'blockly', generator: 'python3' },
    }),
  });
  if (created.status !== 201)
    throw new Error(`seed blockly -> ${created.status}: ${JSON.stringify(created.body)}`);
  const problemId = created.body.id as number;

  for (const [input, output] of [
    ['123', '3'],
    ['1000', '0'],
    ['7', '7'],
  ] as const) {
    const tc = await api('/problems/testcases/', {
      method: 'POST',
      token: admin.access,
      body: JSON.stringify({
        problem: problemId,
        input_data: input,
        expected_output_data: output,
        is_sample: true,
        points: 10,
      }),
    });
    if (tc.status !== 201)
      throw new Error(`seed testcase -> ${tc.status}: ${JSON.stringify(tc.body)}`);
  }
  return problemId;
}

test('block problem: generated code submits and the UI polls the judge to AC', async ({ page }) => {
  test.setTimeout(120_000); // judge round-trip incl. container cold start

  // Register + login via the UI (the shared fixture user).
  await ensureRealStackFixtures();
  const problemId = await seedBlocklyProblem();

  await page?.goto('/login');
  await page?.fill('#login-username', E2E_USER);
  await page?.fill('#login-password', E2E_USER_PASS);
  await page?.getByRole('button', { name: 'Login', exact: true })?.click();
  await expect(page)?.toHaveURL(/\/$/);

  // The block lane: the problem detail page's submit form mounts the
  // Blockly editor (NOT the language picker) with the default starter
  // that already solves the seeded problem.
  await page?.goto(`/problems/${problemId}`);
  await expect(page?.getByRole('heading', { level: 1 }))?.toHaveText(BLOCKLY_TITLE);
  await expect(page?.getByTestId('blockly-editor')).toBeVisible({ timeout: 30_000 });
  await expect(page?.locator('.blocklySvg').first()).toBeVisible();

  // Submit the GENERATED code (language = the generator, python3).
  await page
    ?.getByRole('button', { name: /submit/i })
    .first()
    .click();
  await page?.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

  // The polled verdict — the piece the mock-mode spec cannot reach.
  const verdictLine = page?.getByText(/Verdict:\s*(AC|WA|TLE|MLE|CE|RE)/);
  await expect(verdictLine)?.toBeVisible({ timeout: 60_000 });
  await expect(verdictLine)?.toHaveText(/Verdict:\s*AC/);

  // Cross-check the API: the newest submission for this problem is the
  // block-generated python3 source with verdict AC. The list serializer
  // omits `code` — the detail row carries it.
  const admin = await login(E2E_ADMIN_USER, E2E_ADMIN_PASS);
  const feed = await api(`/submissions/submissions/?problem=${problemId}&page_size=1`, {
    token: admin.access,
  });
  expect(feed.status).toBe(200);
  const row = (feed.body.results ?? [])[0];
  expect(row?.language).toBe('python3');
  expect(row?.verdict).toBe('AC');
  const detail = await api(`/submissions/submissions/${row.id}/`, { token: admin.access });
  expect(detail.status).toBe(200);
  // The generated source is the default starter: read n, print n % 10.
  expect(String(detail.body.code ?? '')).toContain('input()');
  expect(`${REAL_API_BASE}`).toContain('http'); // liveness of the configured base
});
