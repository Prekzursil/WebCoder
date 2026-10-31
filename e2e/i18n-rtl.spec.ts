// E2E: RTL locales smoke [i18n wave, owner RTL requirement] — Arabic and
// Persian render right-to-left: <html dir="rtl"> comes from SSR via the
// cookie (layout.tsx derives it from the locale registry), the localized
// hero renders real Arabic/Persian (no raw keys, no English fallback on
// the localized surface), and the mirrored layout never overflows
// horizontally (the classic broken-RTL symptom).

import { test, expect } from '@playwright/test';

const rtlCases: Array<{ code: string; hero: RegExp; problems: RegExp }> = [
  {
    code: 'ar',
    hero: /مرحبًا بك في WebCoder/,
    problems: /عرض المسائل/,
  },
  {
    code: 'fa',
    hero: /به WebCoder خوش آمدی/,
    problems: /دیدن مسئله‌ها/,
  },
];

for (const { code, hero, problems } of rtlCases) {
  test.describe(`RTL locale ${code}`, () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies([
        { name: 'i18nextLng', value: code, url: 'http://localhost:3311' },
      ]);
    });

    test('SSR renders the localized hero with dir=rtl on <html>', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(hero);
      await expect(page.getByRole('link', { name: problems })).toBeVisible();
    });

    test('mirrored layout does not overflow horizontally', async ({ page }) => {
      await page.goto('/problems');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(1); // 1px tolerance for subpixel rounding
    });

    test('switching back to English restores dir=ltr', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      // The client i18next initializes pinned to 'en' (SSR/hydration
      // safety) and providers re-apply the cookie locale AFTER hydration —
      // until then the controlled <select> transiently shows 'en' and a
      // selectOption('en') would be a silent no-op. Wait for the picker to
      // settle on the RTL locale first.
      // NOTE: the picker's accessible name is itself localized (اللغة /
      // زبان), so match by role only — it is the sole combobox in the nav
      // (the search box exposes role searchbox).
      const picker = page
        .getByRole('navigation', { name: 'Main' })
        .getByRole('combobox');
      await expect(picker).toHaveValue(code);
      await picker.selectOption('en');
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      // The home H1 is a SERVER component — it re-renders from the cookie
      // on the next request, not on the in-session switch (the switcher
      // persists i18nextLng for exactly that). Reload and assert SSR now
      // renders the English original server-side.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Welcome to WebCoder');
    });
  });
}

test('grouped picker exposes the RTL group in every locale', async ({ page }) => {
  // The picker groups by script/region; the right-to-left group must be
  // reachable from the default (English) surface so Arabic/Persian are
  // discoverable, not buried.
  await page.goto('/');
  const select = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('combobox', { name: 'Language' });
  await expect(select).toBeVisible();
  // <optgroup> renders no box of its own, so visibility assertions are
  // meaningless on it — assert presence and its child option instead.
  // Scoped to the nav picker: the footer renders a second switcher.
  const navGroup = page.locator(
    'nav select optgroup[label="Right-to-left (Arabic script)"]'
  );
  await expect(navGroup).toHaveCount(1);
  await expect(navGroup.locator('option', { hasText: 'العربية' })).toHaveCount(1);
});
