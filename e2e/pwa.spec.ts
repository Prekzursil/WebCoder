// E2E: OPS-6 (Wave D) PWA surface — manifest, service worker, offline
// fallback and installability wiring, asserted as served artifacts +
// document head links (the SW itself stays dormant in the dev server by
// design; its behavior is covered by the registrar unit tests + the
// production build).

import { test, expect } from "@playwright/test";

test.describe("PWA surface [OPS-6]", () => {
  test("the web app manifest is served and well-formed", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown>;

    expect(manifest["name"]).toMatch(/WebCoder/);
    expect(manifest["start_url"]).toBe("/");
    expect(manifest["display"]).toBe("standalone");
    expect(manifest["theme_color"]).toBe("#0f172a");
    // Icons: one any + one maskable, both SVG.
    const icons = manifest["icons"] as { src: string; purpose: string }[];
    expect(icons.some((i) => i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    // App shortcuts expose the three core destinations.
    const shortcuts = manifest["shortcuts"] as { url: string }[];
    expect(shortcuts.map((s) => s.url)).toEqual(
      expect.arrayContaining(["/problems", "/leaderboard"]),
    );
  });

  test("the service worker and offline fallback are served", async ({ request }) => {
    const sw = await request.get("/sw.js");
    expect(sw.status()).toBe(200);
    const body = await sw.text();
    // The contract the registrar relies on: registration at /sw.js with
    // the offline fallback precached and notification deep links wired.
    // Quote-agnostic: biome formats the service worker with double
    // quotes ("/offline.html"); the contract is the precached offline
    // fallback, not the literal quote style.
    expect(body).toMatch(/["']\/offline\.html["']/);
    expect(body).toContain("notificationclick");
    expect(body).toContain("self.clients.openWindow");

    const offline = await request.get("/offline.html");
    expect(offline.status()).toBe(200);
    const offlineBody = await offline.text();
    // Bilingual fallback (RO/EN parity discipline extends offline).
    expect(offlineBody).toMatch(/You are offline/);
    expect(offlineBody).toMatch(/Ești offline/);
  });

  test("the document head links the manifest and theme color", async ({ page }) => {
    await page.goto("/");

    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute("href", /manifest\.webmanifest$/);

    const themeMeta = page.locator('meta[name="theme-color"]');
    await expect(themeMeta).toHaveAttribute("content", "#0f172a");

    // iOS standalone wiring. Next 16 emits Apple's current meta name
    // (mobile-web-app-capable) plus the apple-* companions.
    const appleMeta = page.locator('meta[name="mobile-web-app-capable"]');
    await expect(appleMeta).toHaveAttribute("content", "yes");
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
      "content",
      "WebCoder",
    );
  });

  test("PWA icons resolve", async ({ request }) => {
    for (const icon of ["/icons/icon.svg", "/icons/icon-maskable.svg"]) {
      const response = await request.get(icon);
      expect(response.status(), icon).toBe(200);
    }
  });
});
