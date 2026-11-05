// Playwright e2e config (task A7, wave wf_c8e4c79c).
//
// Port strategy: host port 3000 is held by an unrelated Docker-published
// container (com.docker.backend.exe, measured 2026-09-22) — the dev server
// runs on 3311 instead and baseURL points there. Nothing on 3000 is touched.
//
// Mocked API: webServer[0] is a zero-dep mock Django API on :8901; the dev
// server is started with NEXT_PUBLIC_API_BASE=http://localhost:8901 so BOTH
// server-component fetches and browser fetches hit the mock.
//
// Browser: bundled chromium by default (CI installs it via
// `npx playwright install chromium`). On hosts without a matching
// browser build, set PLAYWRIGHT_CHROME_CHANNEL=chrome to use the
// installed Google Chrome instead.

import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3311;
const MOCK_API_PORT = 8901;

// Real-backend e2e mode [Q13]: set E2E_API_BASE to a live Django API (e.g.
// the local compose stack at http://localhost:8010 — RUNBOOK Mode A) and the
// suite runs against it with the mock API DISABLED (no mock server is
// started; NEXT_PUBLIC_API_BASE points at the real backend, so server
// components AND browser fetches hit Django). Unset (CI default) keeps the
// hermetic mock mode byte-for-byte identical to before.
//
// [SP1] Use the SAME hostname as the dev server (localhost, not 127.0.0.1):
// the auth session cookies are SameSite=Lax, and localhost vs 127.0.0.1 are
// DIFFERENT sites — with 127.0.0.1 the browser would silently stop sending
// the cookies on every API fetch and all authenticated specs would fail.
//
// The real stack must allow the dev-server origin in CORS_ALLOWED_ORIGINS
// (see docs/RUNBOOK.md § e2e) and, for the seeded fixtures, expose the
// admin credentials via E2E_ADMIN_USER / E2E_ADMIN_PASS.
const REAL_API_BASE = process.env.E2E_API_BASE || "";
const isRealMode = REAL_API_BASE.length > 0;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  // Host has ~2 GB free RAM: no parallelism, single worker, one browser.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  // Real mode: delete the seeded fixture pair once after all files finish
  // (never per-file — see e2e/lib/realStack.ts).
  globalTeardown: isRealMode ? "./e2e/lib/realStack.teardown.ts" : undefined,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices?.["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHROME_CHANNEL || undefined,
      },
    },
  ],
  webServer: isRealMode
    ? [
        {
          // Real-backend mode: mock API intentionally NOT started — the
          // whole point is that every request hits the live stack.
          command: `npm run dev -- -p ${APP_PORT}`,
          url: `http://localhost:${APP_PORT}`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            NEXT_PUBLIC_API_BASE: REAL_API_BASE,
            E2E_API_BASE: REAL_API_BASE,
          },
        },
      ]
    : [
        {
          command: "node e2e/mock-api/server.mjs",
          url: `http://127.0.0.1:${MOCK_API_PORT}/healthz`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: `npm run dev -- -p ${APP_PORT}`,
          url: `http://localhost:${APP_PORT}`,
          reuseExistingServer: false,
          timeout: 180_000,
          env: {
            ...process.env,
            NEXT_PUBLIC_API_BASE: `http://localhost:${MOCK_API_PORT}`,
          },
        },
      ],
});
