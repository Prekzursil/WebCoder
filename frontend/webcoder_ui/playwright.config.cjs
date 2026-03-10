const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/visual',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start',
    url: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      BROWSER: 'none',
      CI: process.env.CI || 'true',
      HOST: '127.0.0.1',
      PORT: '3000',
    },
  },
});
