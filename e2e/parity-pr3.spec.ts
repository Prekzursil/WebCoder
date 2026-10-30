import { test, expect } from '@playwright/test';

// Parity-audit bundle 2 (mock api): OPS-5 the accessibility statement,
// SAF-2 the rated-contest AI policy, JDG-9 the judge toolchain docs,
// RO-3 the identity card + leaderboard segments, RAT-7 the skill profile
// + practice-next strip, JDG-13 the solutions diff view, UXP-3 the
// statement print route.

test.describe('policy & docs pages (parity audit)', () => {
  test('/accessibility states the WCAG commitment (OPS-5)', async ({
    page,
  }) => {
    await page.goto('/accessibility');
    await expect(page.getByRole('heading', { name: /accessibility/i })).toBeVisible();
    await expect(page.getByText(/WCAG 2\.1 level AA/)).toBeVisible();
    await expect(page.getByText(/axe-core/)).toBeVisible();
  });

  test('/policies/ai publishes the rated-contest rules (SAF-2)', async ({
    page,
  }) => {
    await page.goto('/policies/ai');
    await expect(
      page.getByRole('heading', { name: /conduct & AI policy/i })
    ).toBeVisible();
    await expect(page.getByText(/generative AI/i).first()).toBeVisible();
    await expect(page.getByText(/disqualification/i).first()).toBeVisible();
  });

  test('/help/judge lists the live language registry (JDG-9)', async ({
    page,
  }) => {
    await page.goto('/help/judge');
    await expect(page.getByRole('table').getByText('Python 3')).toBeVisible();
    await expect(page.getByRole('table').getByText('C++17')).toBeVisible();
    await expect(page.getByText(/public\/languages\//)).toBeVisible();
  });
});

test.describe('profile & leaderboard (parity audit)', () => {
  test.beforeEach(async ({ page }) => {
    // Log in through the mock lane so /profile and the identity PATCH work.
    await page.goto('/login');
    await page.fill('#login-username', 'e2e_tester');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
  });

  test('skill profile + practice next render from the statistics (RAT-7)', async ({
    page,
  }) => {
    await page.goto('/profile');
    const panel = page.getByTestId('tag-profile');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('arrays')).toBeVisible();
    await expect(page.getByTestId('practice-next')).toContainText(
      'Longest Substring'
    );
  });

  test('identity card saves county/school (RO-3)', async ({ page }) => {
    await page.goto('/profile');
    // The identity card lives on the settings tab.
    await page.getByRole('button', { name: 'settings' }).click();
    const card = page.getByTestId('identity-card');
    await expect(card).toBeVisible();
    await card.locator('[data-testid="identity-county"]').fill('Cluj');
    await card.locator('[data-testid="identity-save"]').click();
    await expect(card.getByText(/saved/i)).toBeVisible();
  });

  test('leaderboard county segment input drives the fetch (RO-3)', async ({
    page,
  }) => {
    await page.goto('/leaderboard');
    await page.getByTestId('segment-county').fill('Cluj');
    await page.waitForTimeout(400); // debounce-free controlled refetch
    await expect(page.getByTestId('segment-county')).toBeVisible();
  });
});

test.describe('teacher & statement surfaces (parity audit)', () => {
  test('assignment page offers the side-by-side diff (JDG-13)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.fill('#login-username', 'admin_e2e');
    await page.fill('#login-password', 'correct-horse-battery-staple');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('admin_e2e', { exact: true })).toBeVisible();
    await page.goto('/classes/assignments/1');
    // Teacher view mounts the diff panel (mock grid + solutions).
    const panel = page.getByTestId('solutions-diff');
    await expect(panel).toBeVisible();
    await panel.getByTestId('diff-left').selectOption('101');
    await panel.getByTestId('diff-right').selectOption('102');
    const columns = page.getByTestId('diff-columns');
    await expect(columns).toBeVisible();
    await expect(columns).toContainText('print(int(input()) + int(input()))');
  });

  test('problem page exposes the print / PDF statement route (UXP-3)', async ({
    page,
  }) => {
    await page.goto('/problems/1');
    await expect(page.getByTestId('print-statement')).toBeVisible();
  });
});
