// E2E: responsive viewport suite [Q12] — the three canonical widths the QA
// wave pinned (mobile 390, tablet 768, desktop 1280) across the key public
// pages. The old "Login Issues" chat (SPEC-GAPS G13 evidence) reported
// overlapping login fields; the mobile pass asserts the two inputs' boxes
// never intersect and the page never scrolls horizontally.
//
// Mock API mode (default): leaderboard/forum/problems data comes from
// e2e/mock-api/server.mjs, so every page renders deterministic content.

import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
] as const;

// Key pages: home, catalog, detail, leaderboard, forum index, login.
const PAGES = [
  { path: '/', heading: { level: 1, name: /Welcome to WebCoder/i } },
  { path: '/problems', heading: { level: 1 } },
  { path: '/problems/1', heading: { level: 1 } },
  { path: '/leaderboard', heading: { level: 1 } },
  { path: '/forum', heading: { level: 1 } },
  { path: '/login', heading: { level: 1 } },
] as const;

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const pageDef of PAGES) {
      test(`${pageDef.path} renders with no horizontal overflow and a visible heading`, async ({
        page,
      }) => {
        await page?.goto(pageDef.path);
        await expect(page?.getByRole('heading', pageDef.heading))?.toBeVisible();

        // The single most important responsive invariant: the document must
        // fit the viewport width (1px tolerance for subpixel rounding).
        const overflow = await page?.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow, `${pageDef.path} overflows horizontally at ${vp.width}px`).toBeLessThanOrEqual(1);
      });
    }

    test('login fields never overlap and remain usable', async ({ page }) => {
      await page?.goto('/login');

      const username = page?.locator('#login-username');
      const password = page?.locator('#login-password');
      await expect(username)?.toBeVisible();
      await expect(password)?.toBeVisible();

      const a = (await username?.boundingBox())!;
      const b = (await password?.boundingBox())!;
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      // Boxes must not intersect (the 2025-06 login chat reported overlap).
      const overlaps =
        a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlaps, 'username/password bounding boxes intersect').toBe(false);

      // Both inputs sit fully inside the viewport at this width.
      expect(a.x).toBeGreaterThanOrEqual(0);
      expect(a.x + a.width).toBeLessThanOrEqual(vp.width + 1);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 1);
    });

    test('mobile/tablet expose the drawer toggle; desktop shows nav links', async ({ page }) => {
      await page?.goto('/');

      // The navbar collapses to the hamburger drawer below 900px
      // (Navbar.tsx comment: "below 900px: hamburger opens a drawer").
      if (vp.width < 900) {
        // Narrow widths collapse the navbar behind the hamburger drawer.
        const toggle = page?.getByRole('button', { name: /open navigation menu/i });
        await expect(toggle)?.toBeVisible();
      } else {
        const nav = page?.getByRole('navigation', { name: 'Main' });
        await expect(nav)?.toBeVisible();
        // Scoped to the nav — the footer also links to /problems.
        await expect(nav?.getByRole('link', { name: 'Problems', exact: true }))?.toBeVisible();
      }
    });
  });
}
