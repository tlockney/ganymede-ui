import { defineConfig, devices } from '@playwright/test';
import { APP_URL, GANYMEDE_URL, PREVIEW_PORT } from './e2e/env';

// End-to-end tests: the production build (`vite preview`, which proxies
// /api to GANYMEDE_URL) against a real `ganymede serve` that global-setup
// starts. Build first: `npm run build && npm run e2e`.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  globalSetup: './e2e/global-setup.ts',
  // One Ganymede and one folder for the whole run; the tests share them.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: APP_URL,
    viewport: { width: 1280, height: 820 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {},
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: APP_URL,
    env: { GANYMEDE_URL },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
