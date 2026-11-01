import { test, expect, type Page } from '@playwright/test';

// E2E: community translations (i18n wave, owner rules (b)+(c)+(d)) — the
// propose → curate → visible round-trip against the stateful mock API
// (approving a proposal writes the language into the mock problem, exactly
// like the backend's atomic promotion), plus the EN-fallback display rule:
// a locale without a translation shows the English original with a visible
// "not yet in your language — help translate" affordance.

const BASE = 'http://localhost:3311';
// The mock Django API (playwright.config webServer[0]) — identity switches
// post straight to it; its cookies land in the shared context cookie jar.
const MOCK_API = 'http://localhost:8901';

/** The mock login form (EN chrome) + the signed-in confirmation. */
async function login(page: Page, username: string) {
  await page.goto('/login');
  await page.fill('#login-username', username);
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText(username, { exact: true })).toBeVisible();
}

test.describe('community translations (mock api)', () => {
  test('EN fallback: RO locale on an EN-only problem shows the banner, EN statement and the translate affordance', async ({ page, context }) => {
    await context.addCookies([{ name: 'i18nextLng', value: 'ro', url: BASE }]);
    await page.goto('/problems/1');

    // Owner rule (d): EN is the universal fallback, and the fallback is VISIBLE.
    await expect(page.getByTestId('i18n-fallback-banner')).toBeVisible();
    await expect(page.getByTestId('i18n-fallback-banner')).toContainText(
      'Această problemă nu există încă în limba ta'
    );
    // The English original statement renders (not a blank, not a key).
    await expect(page.getByText('Given an array of integers nums', { exact: false })).toBeVisible();
    // The affordance links to the propose form.
    const help = page.getByTestId('help-translate-link');
    await expect(help).toBeVisible();
    await expect(help).toHaveText('Ajută la traducere →');
    await expect(help).toHaveAttribute('href', '/problems/1/translate');
  });

  test('propose → curate → visible: contributor proposes, verifier approves, problem page shows the RO translation with attribution', async ({ page, context }) => {
    // Log in with the EN chrome first, then switch the UI to Romanian.
    await login(page, 'e2e_tester');
    await context.addCookies([{ name: 'i18nextLng', value: 'ro', url: BASE }]);

    // The propose form pre-fills from the EN source.
    await page.goto('/problems/1/translate');
    await expect(page.getByRole('heading', { name: 'Tradu această problemă' })).toBeVisible();
    await expect(page.getByText('Originalul în engleză')).toBeVisible();
    await expect(page.getByText('Two Sum', { exact: true })).toBeVisible();

    // The viewer's UI locale (ro) is preselected in the picker.
    await expect(page.locator('#translate-language')).toHaveValue('ro');
    await page.fill('#translate-title', 'Suma a două numere');
    await page.fill('#translate-statement', 'Returnează indicii celor două numere care adună la țintă.');
    await page.getByRole('button', { name: 'Trimite traducerea' }).click();
    await expect(page.getByTestId('translate-submitted')).toBeVisible();

    // Verifier: switch identity in the same context (the mock login is
    // cookie-based, so an API login swaps the session cookies).
    const loginResponse = await page.request.post(`${MOCK_API}/api/v1/auth/login/`, {
      data: { username: 'admin_e2e', password: 'correct-horse-battery-staple' },
    });
    expect(loginResponse.ok()).toBeTruthy();

    // Curation queue: the proposal is pending with the contributor named.
    await page.goto('/translations');
    const row = page.locator('article', { hasText: 'Suma a două numere' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Two Sum');
    await expect(row).toContainText('e2e_tester');
    await expect(row).toContainText('În așteptare');

    // Approve → atomic promotion (the mock writes ro into the problem).
    await row.getByTestId('approve-btn').click();
    await expect(page.getByTestId('decided-ok')).toBeVisible();

    // Visible: the problem page now renders the RO translation, credits the
    // contributor, and the EN-fallback banner is gone.
    await page.goto('/problems/1');
    await expect(page.getByTestId('translation-attribution')).toContainText('tradus de @e2e_tester');
    await expect(page.getByText('Returnează indicii celor două numere care adună la țintă.', { exact: false })).toBeVisible();
    await expect(page.getByTestId('i18n-fallback-banner')).toHaveCount(0);
  });

  test('reject path: the reviewer note reaches the contributor', async ({ page }) => {
    // Problem 2 already ships ro — target Hungarian instead.
    await login(page, 'e2e_tester');
    await page.goto('/problems/2/translate');
    await page.locator('#translate-language').selectOption('hu');
    await page.fill('#translate-title', 'Két szám összege');
    await page.fill('#translate-statement', 'Add meg a két szám összegét.');
    await page.getByRole('button', { name: 'Submit translation' }).click();
    await expect(page.getByTestId('translate-submitted')).toBeVisible();

    // Verifier rejects with a note.
    await page.request.post(`${MOCK_API}/api/v1/auth/login/`, {
      data: { username: 'admin_e2e', password: 'correct-horse-battery-staple' },
    });
    await page.goto('/translations');
    const row = page.locator('article', { hasText: 'Két szám összege' });
    await expect(row).toBeVisible();
    await row.getByTestId('reject-note-input').fill('Please keep the math notation.');
    await row.getByTestId('reject-btn').click();
    await expect(page.getByTestId('decided-ok')).toBeVisible();

    // The contributor sees the decision + note in "My translations".
    await page.request.post(`${MOCK_API}/api/v1/auth/login/`, {
      data: { username: 'e2e_tester', password: 'correct-horse-battery-staple' },
    });
    await page.goto('/translations');
    await page.getByRole('button', { name: 'My translations' }).click();
    const mineRow = page.locator('article', { hasText: 'Két szám összege' });
    await expect(mineRow).toBeVisible();
    await expect(mineRow).toContainText('Rejected');
    await expect(mineRow).toContainText('Please keep the math notation.');
  });

  test('unauthenticated visitors get the login hint instead of the form', async ({ page }) => {
    await page.goto('/problems/1/translate');
    await expect(page.getByText('Log in to propose a translation.')).toBeVisible();
    await expect(page.locator('#translate-title')).toHaveCount(0);
  });
});
