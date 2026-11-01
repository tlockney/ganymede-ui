// The Apple apps' kernel web view (#99), with Swift's relay played by the
// test: one page is the app, another is kernel.html, and messages pass
// between them through fake `webkit.messageHandlers`, in order. The cell
// runs in the kernel page's Worker; the app page starts no Worker.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { outputs, waitForReady } from './helpers';

// The notebook the test makes is removed afterwards, as in page-kernels.spec.ts.
const notebooks = () => new Set(readdirSync(ROOT_DIR).filter(f => f.endsWith('.ipynb')));
let before: Set<string>;
test.beforeEach(() => {
  before = notebooks();
});
test.afterEach(() => {
  for (const f of notebooks()) if (!before.has(f)) rmSync(join(ROOT_DIR, f), { force: true });
});

/** `webkit.messageHandlers[name].postMessage` calling `binding`. */
const fakeHandler = (name: string, binding: string, extra = '') => `
  window.webkit = { messageHandlers: { ${name}: {
    postMessage: m => window.${binding}(JSON.parse(JSON.stringify(m))),
  }, ${extra} } };`;

/** A stand-in for the Swift DeviceBridge: answers `hello` and the clipboard. */
const fakeDevice = `device: { postMessage: async ({ method }) =>
  method === 'hello'
    ? { result: { platform: 'macos', appVersion: 'e2e', capabilities: ['clipboard.readText'] } }
    : method === 'clipboard.readText'
      ? { result: 'Europa' }
      : { error: { code: 'unsupported', message: method } } }`;

/** Delivers to `deliver` on `page`, one message after another, as Swift does. */
function relayTo(page: Page, deliver: string) {
  let last = Promise.resolve();
  return (m: unknown) => {
    last = last.then(() =>
      page.evaluate(
        ([fn, msg]) =>
          (window as unknown as Record<string, { deliver(m: unknown): void }>)[fn]!.deliver(msg),
        [deliver, m] as const,
      ),
    );
    return last;
  };
}

test('runs page kernels in the kernel web view, relayed', async ({ context }) => {
  const app = await context.newPage();
  const kernelPage = await context.newPage();
  const appWorkers: string[] = [];
  app.on('worker', w => appWorkers.push(w.url()));

  let ready!: () => void;
  const kernelReady = new Promise<void>(r => (ready = r));
  const toApp = relayTo(app, 'ganymedeKernelRelay');
  await kernelPage.exposeFunction('toSwift', (m: { op: string }) =>
    m.op === 'ready' ? ready() : toApp(m),
  );
  await kernelPage.addInitScript(fakeHandler('kernelHost', 'toSwift', fakeDevice));
  const toKernel = relayTo(kernelPage, 'ganymedeKernelHost');
  await app.exposeFunction('toSwift', (m: unknown) => kernelReady.then(() => toKernel(m)));
  await app.addInitScript(fakeHandler('kernelRelay', 'toSwift'));

  await app.goto(`${GANYMEDE_URL}/?token=${TOKEN}&kernels=page`);
  await expect(app.getByText('kernels in this page')).toBeVisible({ timeout: 60_000 });
  await kernelPage.goto(`${GANYMEDE_URL}/kernel.html`);
  await kernelReady;

  await app.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(app.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(app);
  await app.locator('.jp-Cell .cm-content').first().click();
  await app.keyboard.type('const moon: string = "Callisto";\nmoon.toUpperCase()');
  await app.keyboard.press('Shift+Enter');
  await expect(outputs(app).filter({ hasText: 'CALLISTO' })).toBeVisible({ timeout: 60_000 });

  // The device preload ran in the kernel's Worker and reaches the bridge.
  await app.locator('.jp-Cell .cm-content').last().click();
  await app.keyboard.type('(await device.clipboard.readText()).toUpperCase()');
  await app.keyboard.press('Shift+Enter');
  await expect(outputs(app).filter({ hasText: 'EUROPA' })).toBeVisible({ timeout: 60_000 });

  expect(kernelPage.workers().length).toBeGreaterThan(0);
  expect(appWorkers.filter(u => !u.includes('service-worker'))).toEqual([]);
});
