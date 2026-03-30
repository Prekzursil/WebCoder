import type { Page, Route } from "@playwright/test";

const sampleProblems = [
  {
    id: 101,
    title_i18n: {
      en: "Two Sum Warmup",
    },
    difficulty: "EASY",
    status: "PUBLISHED",
  },
];

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

export async function preparePublicVisualState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
  });

  await page.route("http://127.0.0.1:8000/api/v1/**", async (route) => {
    if (route.request().url().includes("/problems/problems/")) {
      await fulfillJson(route, { data: sampleProblems });
      return;
    }
    if (route.request().method() === "GET") {
      await fulfillJson(route, []);
      return;
    }
    await fulfillJson(route, { detail: "Visual test request was mocked." });
  });
}

export async function stabilizeRoute(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });
  await page.waitForTimeout(250);
}
