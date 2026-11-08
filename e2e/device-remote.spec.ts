// `device` from a server kernel (ganymede-device#26): a cell on the real
// cdp-node kernel behind `ganymede serve` calls connectDevice(jupyter.comm),
// and the page answers it through a stand-in for the app's `deviceRemote`
// handler, or, with no handler, with web APIs behind a click
// (ganymede-ui#384). Checks the whole comm path: the announce, the session
// match, the calls comm the page opens back, and comm messages read while
// the cell awaits them (kernel subshells, cdp-kernel 0.8.0).
import { readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { APP_URL, GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { openWithToken, outputs, waitForReady } from './helpers';

const notebooks = () => new Set(readdirSync(ROOT_DIR).filter(f => f.endsWith('.ipynb')));
let before: Set<string>;
test.beforeEach(() => {
  before = notebooks();
});
// The new notebooks' kernels go too: the next test's notebook takes the
// same name, and would rejoin a kernel that already linked to a page.
test.afterEach(async () => {
  const added = [...notebooks()].filter(f => !before.has(f));
  const api = (path: string) => `${GANYMEDE_URL}${path}?token=${TOKEN}`;
  const sessions: { id: string; path: string }[] = await (await fetch(api('/api/sessions'))).json();
  for (const s of sessions) {
    if (added.includes(s.path)) await fetch(api(`/api/sessions/${s.id}`), { method: 'DELETE' });
  }
  for (const f of added) rmSync(join(ROOT_DIR, f), { force: true });
});

// The kernel imports the package's built remote module from this checkout.
const REMOTE = pathToFileURL(resolve('node_modules/@tlockney/ganymede-device/dist/remote.js')).href;

/** The app's remote handler, as DeviceBridge answers: records each message. */
function fakeApp() {
  const sent: unknown[] = [];
  (window as unknown as { deviceSent: unknown[] }).deviceSent = sent;
  (window as unknown as { webkit: unknown }).webkit = {
    messageHandlers: {
      deviceRemote: {
        async postMessage(m: Record<string, unknown>) {
          sent.push(m);
          if (m.method === 'hello') {
            return {
              result: {
                platform: 'ipados',
                appVersion: 'e2e',
                capabilities: ['clipboard.readText', 'sound.player'],
              },
            };
          }
          if (m.method === 'clipboard.readText') return { result: 'from the app' };
          return { result: null };
        },
      },
    },
  };
}

async function newNotebook(page: Page) {
  await openWithToken(page);
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
}

async function run(page: Page, code: string) {
  const cell = page.locator('.jp-Cell').last();
  await cell.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
  await expect(cell.locator('.cm-content')).toHaveText(code);
  await page.keyboard.press('Shift+Enter');
}

const cell = (tail: string) =>
  `const { connectDevice } = await import(${JSON.stringify(REMOTE)}); ` +
  `const device = await connectDevice(jupyter.comm); ${tail}`;

test('a server kernel reaches the app through the page', async ({ page }) => {
  await page.addInitScript(fakeApp);
  await newNotebook(page);
  await run(
    page,
    cell('[await device.clipboard.readText(), device.has("sound.player")].join(" ")'),
  );
  await expect(outputs(page).filter({ hasText: 'from the app false' })).toBeVisible({
    timeout: 60_000,
  });
  const methods = await page.evaluate(() =>
    (window as unknown as { deviceSent: { method?: string }[] }).deviceSent.map(m => m.method),
  );
  expect(methods).toEqual(['hello', 'clipboard.readText']);
});

test('in a browser the page answers with web APIs, after a click', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: APP_URL });
  await newNotebook(page);
  await run(
    page,
    cell(
      'await device.clipboard.writeText("from the browser"); ' +
        '[await device.clipboard.readText(), (await device.files.pick()).length].join(" ")',
    ),
  );
  const prompt = page.locator('.device-prompt');
  // The prompt previews the text it would copy (#389).
  await expect(prompt.locator('.device-prompt-preview')).toHaveText('“from the browser”', {
    timeout: 60_000,
  });
  await prompt.getByRole('button', { name: 'Copy to clipboard' }).click();
  await prompt.getByRole('button', { name: 'Paste from clipboard' }).click();
  // Dismissed: the picker answers [] as on the device.
  await expect(prompt.getByRole('button', { name: 'Choose a file' })).toBeVisible();
  await prompt.getByRole('button', { name: 'Dismiss' }).click();
  await expect(outputs(page).filter({ hasText: 'from the browser 0' })).toBeVisible({
    timeout: 60_000,
  });
  await expect(prompt).toHaveCount(0);
});
