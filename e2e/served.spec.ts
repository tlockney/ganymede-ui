// The build served by Ganymede itself (`ganymede serve --static-dir dist`),
// on the server's origin: the printed token URL becomes a login cookie, and
// the app connects on it, saving through the `_xsrf` cookie the server sets.
import { copyFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { FIXTURE, GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { openNotebook, outputs, removeFromServer } from './helpers';

const COPY = 'Served by Ganymede.ipynb';

test.beforeEach(() => {
  const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
  copyFileSync(join(fixtures, FIXTURE), join(ROOT_DIR, COPY));
});
test.afterEach(() => removeFromServer(COPY));

test('opens from the URL ganymede serve prints, runs a cell and saves', async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}`);
  // The server took the token; the app connected on the cookie, no sheet.
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByText('Where should kernels run?')).toHaveCount(0);

  await openNotebook(page, COPY);
  // Opening it to read starts no kernel; the first run does.
  await expect(page.getByText(/ · Starts when you run a cell$/)).toBeVisible();
  await page.locator('.jp-CodeCell').first().click();
  await page.keyboard.press('Shift+Enter');
  await expect(
    outputs(page).filter({ hasText: 'Ganymede is the largest moon in the solar system' }),
  ).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');

  await expect
    .poll(() => readFileSync(join(ROOT_DIR, COPY), 'utf8'))
    .toContain('Ganymede is the largest moon in the solar system');
});

// The Apple apps load their hidden kernel page from the server, on the
// origin the notebook page's service worker controls. With a query, the
// precache missed it and the navigation fallback loaded the notebook app
// in its place, so the in-app kernel never started (#518).
test('serves the kernel page, not the app, under the service worker', async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}`);
  await expect
    .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null), {
      timeout: 60_000,
    })
    .toBe(true);
  for (const path of ['/kernel.html', `/kernel.html?token=${TOKEN}`]) {
    await page.goto(`${GANYMEDE_URL}${path}`);
    await expect(page).toHaveTitle('Ganymede kernels');
    await expect
      .poll(() =>
        page.evaluate(() => typeof (window as { ganymedeKernelHost?: unknown }).ganymedeKernelHost),
      )
      .toBe('object');
  }

  // A kernel runs there, its Worker and chunks served through the worker.
  const posted: { op: string; json?: string }[] = [];
  await page.exposeFunction('toSwift', (m: { op: string; json?: string }) => posted.push(m));
  await page.evaluate(() => {
    (window as unknown as { webkit: unknown }).webkit = {
      messageHandlers: {
        kernelHost: {
          postMessage: (m: unknown) =>
            (window as unknown as { toSwift(m: unknown): void }).toSwift(
              JSON.parse(JSON.stringify(m)),
            ),
        },
      },
    };
  });
  const msgId = crypto.randomUUID();
  const execute = {
    header: {
      msg_id: msgId,
      msg_type: 'execute_request',
      session: 'e2e',
      username: '',
      date: new Date().toISOString(),
      version: '5.3',
    },
    parent_header: {},
    metadata: {},
    content: { code: '"Io".toUpperCase()', silent: false, store_history: true },
    buffers: [],
  };
  await page.evaluate(execute => {
    const host = (window as unknown as { ganymedeKernelHost: { deliver(m: unknown): void } })
      .ganymedeKernelHost;
    host.deliver({ kernel: 'k1', op: 'start', run: 1 });
    host.deliver({ kernel: 'k1', op: 'send', channel: 'shell', json: JSON.stringify(execute) });
  }, execute);
  await expect
    .poll(
      () =>
        posted
          .filter(m => m.json)
          .map(
            m =>
              JSON.parse(m.json!) as {
                parent_header: { msg_id?: string };
                content: { data?: Record<string, string> };
              },
          )
          .find(m => m.parent_header.msg_id === msgId && m.content.data)?.content.data?.[
          'text/plain'
        ],
      { timeout: 60_000 },
    )
    .toContain('IO');
});
