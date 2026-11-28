import { defineConfig, devices, type Project } from '@playwright/test';
import { APP_URL, GANYMEDE_URL, PREVIEW_PORT } from './e2e/env';

// Default `npm run e2e` runs ONLY Chromium so Linux PR CI (which installs only
// Chromium) never attempts to launch WebKit. `npm run e2e:webkit` sets
// `E2E_WEBKIT=1` (or pass `--project=webkit-*`) to run the WebKit projects.
const webkitProjectArg = process.argv.some(
  (arg, index, args) =>
    arg.startsWith('--project=webkit') ||
    (arg === '--project' && (args[index + 1]?.startsWith('webkit') ?? false)),
);
const useWebkit = Boolean(process.env.E2E_WEBKIT) || webkitProjectArg;

const RESPONSIVE_WEBKIT_SPECS = ['**/webkit-eyebrow.spec.ts'];

const WEBKIT_DESKTOP_IGNORE = [
  // Chromium CDP (`newCDPSession`) and Chromium launch-flag specs:
  '**/safe-area.spec.ts',
  '**/tall-output-scrollbars.spec.ts',
  // Playwright WebKit bypasses context.route() once sw.js claims the page, while
  // blocking sw.js drops non-persistent Cache Storage across page.goto('/') reloads;
  // offline DuckDB Cache Storage on WebKit is covered in webkit-data-views & webkit-duckdb-console.
  '**/offline-sql.spec.ts',
  // Touches test-results/screenshots and uses toolbarMenu (#927):
  '**/screenshots.spec.ts',
  // Blocked on WebKit by `.toolbar` backdrop-filter clipping ContextMenu (#927):
  '**/clear-outputs.spec.ts',
  '**/download.spec.ts',
  '**/duckdb-console.spec.ts',
  '**/export.spec.ts',
  '**/publish.spec.ts',
  '**/run-params.spec.ts',
  '**/shortcuts.spec.ts',
  '**/variables.spec.ts',
  // Routed across the 4 responsive touch WebKit projects instead:
  '**/webkit-eyebrow.spec.ts',
];

const projects: Project[] = useWebkit
  ? [
      {
        name: 'webkit-desktop',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 1280, height: 820 },
        },
        testIgnore: WEBKIT_DESKTOP_IGNORE,
      },
      {
        name: 'webkit-ipad',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 820, height: 1180 },
          hasTouch: true,
        },
        testMatch: RESPONSIVE_WEBKIT_SPECS,
      },
      {
        name: 'webkit-ipad-split',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 500, height: 1180 },
          hasTouch: true,
        },
        testMatch: RESPONSIVE_WEBKIT_SPECS,
      },
      {
        name: 'webkit-iphone-portrait',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 390, height: 844 },
          hasTouch: true,
        },
        testMatch: RESPONSIVE_WEBKIT_SPECS,
      },
      {
        name: 'webkit-iphone-landscape',
        use: {
          ...devices['Desktop Safari'],
          viewport: { width: 844, height: 390 },
          hasTouch: true,
        },
        testMatch: RESPONSIVE_WEBKIT_SPECS,
      },
    ]
  : [
      {
        name: 'chromium',
        use: {
          ...devices['Desktop Chrome'],
          viewport: { width: 1280, height: 820 },
          launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
            ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
            : {},
        },
      },
    ];

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
  projects,
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PREVIEW_PORT} --strictPort`,
    url: APP_URL,
    env: { GANYMEDE_URL },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
