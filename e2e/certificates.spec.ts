import { test, expect } from '@playwright/test';

// E2E: Wave D certifications/attestats — the honest variant. The holder
// list (/certificates, authed), the ANONYMOUS public verification page
// (/certificates/<uuid>) with its printable atestat sheet, the honest
// REVOKED answer, and the not-found path.

const VALID_UUID = 'e2e-cert-0001-valid-000000000001';
const REVOKED_UUID = 'e2e-cert-0002-revoked-0000000002';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('certifications / atestats (mock api)', () => {
  test('the holder list renders both certificates with honest badges', async ({ page }) => {
    await login(page);
    await page.goto('/certificates');

    const list = page.getByTestId('certificates-list');
    await expect(list).toBeVisible();
    await expect(list).toContainText('WC-2026-000042');
    await expect(list).toContainText('Winter Cup');
    await expect(list).toContainText('WC-2026-000043');
    // One Valid badge, one Revoked badge — revoked rows stay listed.
    await expect(list.getByText('Valid', { exact: true })).toBeVisible();
    await expect(list.getByText('Revoked', { exact: true })).toBeVisible();
  });

  test('anonymous verification page answers VALID with the printable sheet', async ({ page }) => {
    await page.goto(`/certificates/${VALID_UUID}`);

    const card = page.getByTestId('certificate-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('WC-2026-000042');
    await expect(card).toContainText('Winter Cup');
    await expect(card).toContainText('e2e_tester');
    await expect(page.getByTestId('certificate-verdict')).toContainText(
      'This certificate is valid.',
    );
    // The print affordance (UXP-3 print stylesheet hides it on paper).
    await expect(page.getByTestId('print-certificate')).toBeVisible();
  });

  test('a revoked certificate keeps answering, with its reason', async ({ page }) => {
    await page.goto(`/certificates/${REVOKED_UUID}`);

    await expect(page.getByTestId('certificate-card')).toBeVisible();
    const verdict = page.getByTestId('certificate-verdict');
    await expect(verdict).toContainText('This certificate has been revoked.');
    await expect(page.getByText(/ratings discarded by organizer/)).toBeVisible();
  });

  test('unknown verification ids get the not-found copy', async ({ page }) => {
    await page.goto('/certificates/00000000-dead-beef-0000-000000000000');
    await expect(page.getByRole('heading', { name: 'Certificate not found' })).toBeVisible();
    await expect(page.getByText(/does not match any certificate/i)).toBeVisible();
  });

  test('the account menu links to /certificates', async ({ page }) => {
    await login(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Account menu' }).click();
    await expect(page.getByRole('menuitem', { name: 'Certificates', exact: true })).toHaveAttribute(
      'href',
      '/certificates',
    );
  });
});
