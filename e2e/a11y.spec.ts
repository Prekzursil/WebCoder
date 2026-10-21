// E2E: accessibility scan [Q7/Q12] — @axe-core/playwright over the key
// public pages, failing on any critical or serious violation. This encodes
// the Q7 checklist (landmarks, names, contrast…) as a permanent CI gate
// instead of a one-off manual sweep.

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Key public pages (login included — the highest-friction form page).
const PAGES = ['/', '/problems', '/problems/1', '/leaderboard', '/forum', '/login'];

test.describe('axe accessibility scan', () => {
  for (const path of PAGES) {
    test(`${path} has no critical or serious axe violations`, async ({ page }) => {
      await page?.goto(path);

      const results = await new AxeBuilder({ page })
        // WCAG 2.1 AA rules + best practices for the Q7/Q8 surface.
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter((v) =>
        v.impact === 'critical' || v.impact === 'serious'
      );
      const details = serious
        .map(
          (v) =>
            `${v.id} (${v.impact}) on ${v.nodes.length} node(s): ` +
            v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')
        )
        .join('\n');
      expect(serious, `${path} axe violations:\n${details}`).toEqual([]);
    });
  }

  test('app shell exposes a skip link and exactly one main landmark', async ({ page }) => {
    await page?.goto('/problems');

    // [Q11] skip link is the first focusable element and targets #main-content.
    const skip = page?.getByRole('link', { name: /skip to content/i });
    await expect(skip)?.toBeVisible();
    await expect(page?.locator('#main-content'))?.toBeVisible();
    const mainCount = await page?.locator('main').count();
    expect(mainCount).toBe(1);
  });

  test('keyboard focus is visible on primary nav links', async ({ page }) => {
    await page?.goto('/problems');

    // [Q8] focus-visible outline — tab to the first link and read back the
    // computed outline style (globals.css :focus-visible rule).
    await page?.keyboard.press('Tab');
    const outline = await page?.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      return getComputedStyle(el).outlineStyle + '/' + getComputedStyle(el).outlineWidth;
    });
    expect(outline).toContain('solid');
  });
});
