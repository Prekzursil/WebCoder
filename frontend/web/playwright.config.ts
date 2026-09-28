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
// Browser: channel 'chrome' uses the installed Google Chrome — no browser
// download needed (host RAM is tight; cached ms-playwright builds did not
// match playwright 1.63).

import { defineConfig, devices } from '@playwright/test';

const APP_PORT = 3311;
const MOCK_API_PORT = 8901;

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  // Host has ~2 GB free RAM: no parallelism, single worker, one browser.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'node e2e/mock-api/server.mjs',
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
