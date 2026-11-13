// E2E: OPS-6 (Wave D) PWA surface — manifest, service worker, offline
// fallback and installability wiring, asserted as served artifacts +
// document head links (the SW itself stays dormant in the dev server by
// design; its behavior is covered by the registrar unit tests + the
// production build).

import { test, expect } from '@playwright/test';

test.describe('PWA surface [OPS-6]', () => {
  test('the web app manifest is served and well-formed', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown>;

    expect(manifest['name']).toMatch(/WebCoder/);
    expect(manifest['start_url']).toBe('/');
    expect(manifest['display']).toBe('standalone');
    expect(manifest['theme_color']).toBe('#0f172a');
    // Icons: one any + one maskable, both SVG.
    const icons = manifest['icons'] as { src: string; purpose: string }[];
    expect(icons.some((i) => i.purpose === 'any')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable')).toBe(true);
    // App shortcuts expose the three core destinations.
    const shortcuts = manifest['shortcuts'] as { url: string }[];
    expect(shortcuts.map((s) => s.url)).toEqual(
      expect.arrayContaining(['/problems', '/leaderboard']),
    );
  });

  test('the service worker and offline fallback are served', async ({ request }) => {
    const sw = await request.get('/sw.js');
    expect(sw.status()).toBe(200);
    const body = await sw.text();
    // The contract the registrar relies on: registration at /sw.js with
    // the offline fallback precached and notification deep links wired.
    expect(body).toContain("'/offline.html'");
    expect(body).toContain('notificationclick');
    expect(body).toContain('self.clients.openWindow');

    const offline = await request.get('/offline.html');
    expect(offline.status()).toBe(200);
    const offlineBody = await offline.text();
    // Bilingual fallback (RO/EN parity discipline extends offline).
    expect(offlineBody).toMatch(/You are offline/);
    expect(offlineBody).toMatch(/Ești offline/);
  });

  test('the document head links the manifest and theme color', async ({ page }) => {
    await page.goto('/');

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', /manifest\.webmanifest$/);

    const themeMeta = page.locator('meta[name="theme-color"]');
    await expect(themeMeta).toHaveAttribute('content', '#0f172a');

    // iOS standalone wiring. Next 16 emits Apple's current meta name
    // (mobile-web-app-capable) plus the apple-* companions.
    const appleMeta = page.locator('meta[name="mobile-web-app-capable"]');
    await expect(appleMeta).toHaveAttribute('content', 'yes');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      'content',
      'WebCoder',
    );
  });

  test('PWA icons resolve', async ({ request }) => {
    for (const icon of ['/icons/icon.svg', '/icons/icon-maskable.svg']) {
      const response = await request.get(icon);
      expect(response.status(), icon).toBe(200);
    }
  });

  // [mobile wave] PNG icon set: richer Android install sheets + Safari
  // home-screen installs — the manifest must carry PNG entries (any +
  // maskable, 192/512) and every referenced file must actually serve.
  test('PNG manifest icons are declared and served (install-from-browser)', async ({ request }) => {
    const response = await request.get('/manifest.webmanifest');
    const manifest = (await response.json()) as {
      icons: { src: string; sizes: string; type: string; purpose: string }[];
    };
    const pngIcons = manifest.icons.filter((i) => i.type === 'image/png');
    expect(pngIcons.length).toBeGreaterThanOrEqual(4);
    expect(pngIcons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', purpose: 'any' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'any' }),
        expect.objectContaining({ sizes: '192x192', purpose: 'maskable' }),
        expect.objectContaining({ sizes: '512x512', purpose: 'maskable' }),
      ]),
    );
    for (const icon of pngIcons) {
      const res = await request.get(icon.src);
      expect(res.status(), icon.src).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    }
    // Safari home-screen icon (apple-touch-icon) is linked in the head.
    const apple = await request.get('/icons/apple-touch-icon.png');
    expect(apple.status()).toBe(200);
  });

  // [mobile wave] The store-facing privacy policy covers the mobile apps
  // (Play/App Store policy prerequisite: a public privacy URL whose text
  // addresses the app clients).
  test('the privacy policy covers the mobile apps', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Mobile apps' })).toBeVisible();
    const body = page.locator('body');
    await expect(body).toContainText('keychain');
    await expect(body).toContainText('Google Play');
  });
});
