import { test, expect } from '@playwright/test';

// OPS-1 public API (mock) + OPS-3 Microsoft SSO button.

test.describe('public api + microsoft sso (Wave C, mock api)', () => {
  test('the public API directory and problem list answer unauthenticated', async ({
    request,
  }) => {
    const root = await request.get('http://localhost:8901/api/v1/public/');
    expect(root.ok()).toBeTruthy();
    const body = await root.json();
    expect(body.endpoints).toContain('/api/v1/public/problems/');

    const problems = await request.get('http://localhost:8901/api/v1/public/problems/');
    expect(problems.ok()).toBeTruthy();
    const list = await problems.json();
    expect(list.results[0].title_i18n.en).toBe('Two Sum');
    expect(list.results[0]).not.toHaveProperty('statement_i18n');
  });

  test('login and register offer the Microsoft (school) lane', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByTestId('microsoft-login-button')).toHaveAttribute(
      'href',
      /\/accounts\/microsoft\/login\/$/
    );
  });
});
