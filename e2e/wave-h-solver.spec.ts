import { test, expect } from '@playwright/test';

// Problem-page wave (items C/D/E/F/H, mock mode): solver-facing flows —
// the tiered hints reveal, the unlock board after a partial pass, the
// editorial gate with early unlock, the source-unlock forfeit modal with
// the VERBATIM warning and permanent state, and the catalog facets.

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.fill('#login-username', 'e2e_tester');
  await page.fill('#login-password', 'correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByText('e2e_tester', { exact: true })).toBeVisible();
}

test.describe('wave H solver surfaces (mock api)', () => {
  test('hints: tiered reveal via the API, free note, separate from editorial', async ({ page }) => {
    await login(page);
    await page.goto('/problems/2');

    const panel = page.getByTestId('hints-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('hints-free-note')).toContainText(/free/i);
    await expect(page.getByTestId('hint-tier-1')).toBeVisible();
    // Content hidden until revealed.
    await expect(page.getByTestId('hints-panel')).not.toContainText('slicing');

    await page.getByTestId('hint-reveal-1').click();
    await expect(page.getByTestId('hint-revealed-1')).toBeVisible();
    await expect(page.getByTestId('hints-panel')).toContainText('slicing');
    await expect(page.getByTestId('hint-revealed-2')).toHaveCount(0);
  });

  test('unlock board: partial pass shows exactly the next test', async ({ page }) => {
    await login(page);
    await page.goto('/problems/2');

    const board = page.getByTestId('test-unlock-board');
    await expect(board).toBeVisible();
    await expect(page.getByTestId('unlock-board-progress')).toContainText('1 / 3');
    // Position 2 is the unlocked boundary — data visible; 3 stays locked.
    await expect(page.getByTestId('unlock-status-1')).toHaveText('Solved');
    await expect(page.getByTestId('unlock-status-2')).toHaveText('Unlocked');
    await expect(page.getByTestId('unlock-input-2')).toHaveText('xyz');
    await expect(page.getByTestId('unlock-expected-2')).toHaveText('zyx');
    await expect(page.getByTestId('unlock-status-3')).toHaveText('Locked');
    await expect(page.getByTestId('unlock-input-3')).toHaveCount(0);
  });

  test('editorial: locked until AC, early unlock goes through the forfeit modal', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/problems/2');

    await expect(page.getByTestId('editorial-locked')).toBeVisible();
    await expect(page.getByTestId('editorial-locked')).toContainText(/locked until you solve/i);

    // Early unlock opens the source modal (item F).
    await page.getByTestId('editorial-unlock-early').click();
    const modal = page.getByTestId('source-unlock-modal');
    await expect(modal).toBeVisible();
    // The VERBATIM warning + the exact buttons.
    await expect(page.getByTestId('forfeit-warning-text')).toContainText(
      'unlocking the source code before the problem is solved means the problem will NOT award points to this account',
    );
    await expect(page.getByTestId('forfeit-confirm')).toHaveText(
      'I understand — unlock source code',
    );
    await expect(page.getByTestId('forfeit-cancel')).toHaveText('Cancel — go back to solving');

    // Cancel first — nothing forfeits.
    await page.getByTestId('forfeit-cancel').click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByTestId('forfeited-banner')).toHaveCount(0);

    // Confirm — permanent forfeiture: banner + reference source + the
    // editorial unlocks with both reference implementations.
    await page.getByTestId('unlock-source-button').click();
    await expect(modal).toBeVisible();
    await page.getByTestId('forfeit-confirm').click();
    await expect(page.getByTestId('forfeited-banner')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('reference-source')).toBeVisible();
    await expect(page.getByTestId('editorial-open')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('editorial-solution-python')).toBeVisible();
    await expect(page.getByTestId('editorial-solution-cpp')).toBeVisible();
  });

  test('catalog: facets — difficulty multi-select, points range, solve status, sort, tag cloud', async ({
    page,
  }) => {
    await login(page);
    await page.goto('/problems');

    // Difficulty chips multi-select (two active at once).
    await page.getByRole('button', { name: 'easy', exact: true }).click();
    await page.getByRole('button', { name: 'medium', exact: true }).click();
    await expect(page.getByRole('button', { name: 'easy', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'medium', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page).toHaveURL(/difficulty=easy%2Cmedium|difficulty=easy,medium/);

    // Points range.
    await page.getByTestId('points-min-input').fill('50');
    await page.getByTestId('points-max-input').fill('200');
    await expect(page).toHaveURL(/points_min=50/);

    // Solve-status facet (authenticated).
    await page.getByTestId('solve-status-solved').click();
    await expect(page).toHaveURL(/solve_status=solved/);

    // Sort dropdown persists in the URL.
    await page.getByTestId('sort-select').selectOption('points');
    await expect(page).toHaveURL(/sort=points/);

    // Tag cloud carries counts.
    const tag = page.getByTestId('tag-cloud-arrays');
    if (await tag.count()) {
      await expect(tag).toContainText(/Arrays/);
    }

    // Reset: All difficulty clears the set.
    await page.getByRole('button', { name: 'All', exact: true }).first().click();
    await expect(page).not.toHaveURL(/difficulty=/);
  });
});
