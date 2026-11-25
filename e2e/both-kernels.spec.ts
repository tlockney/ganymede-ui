// The server's kernels and the page's in one list: what the Mac app does
// (`kernels=both`, #185), so cells can run in the app's own kernel and reach
// its bridges. A notebook starts on the server's cdp-node kernel, then moves
// to the in-page TypeScript kernel and back, keeping one notebook open.
import { readdirSync } from 'node:fs';
import { expect, type Page, test } from '@playwright/test';
import { GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { outputs, removeFromServer, statusLine, waitForReady } from './helpers';

const notebooks = () => new Set(readdirSync(ROOT_DIR).filter(f => f.endsWith('.ipynb')));
let before: Set<string>;

test.beforeEach(() => {
  before = notebooks();
});
test.afterEach(async () => {
  await removeFromServer(...[...notebooks()].filter(f => !before.has(f)));
});

/** Waits until `name` is the notebook's kernel and it is idle (no state after the name). */
async function idleOn(page: Page, name: string) {
  await expect(statusLine(page)).toHaveAccessibleName(new RegExp(` · ${escapeRegExp(name)}$`), {
    timeout: 60_000,
  });
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The kernels the status line's menu offers, with the menu open. */
async function openKernels(page: Page) {
  await statusLine(page).click();
  return page.getByRole('menu', { name: 'Notebook and Kernel' }).getByRole('menuitemradio');
}

/** Picks a kernel from the status line's menu; returns its name there, without the ◆ mark. */
async function chooseKernel(page: Page, which: 'server' | 'page'): Promise<string> {
  const items = await openKernels(page);
  const item =
    which === 'page' ? items.filter({ hasText: 'in app' }) : items.filter({ hasNotText: 'in app' });
  await expect(item).toHaveCount(1);
  const name = (await item.innerText()).replace(/^✓/, '').replace(/◆$/, '').trim();
  await item.click();
  return name;
}

async function run(page: Page, code: string) {
  const cell = page.locator('.jp-Cell').last();
  await cell.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(code);
  // Typing can land elsewhere if the notebook re-renders mid-switch.
  await expect(cell.locator('.cm-content')).toHaveText(code);
  await page.keyboard.press('Shift+Enter');
}

test("lists the server's kernels and the page's, and moves between them", async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}&kernels=both`);
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect(page.getByText('and kernels in this page')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  // One of each in the list; the notebook's kernel is checked.
  const items = await openKernels(page);
  await expect(items.filter({ hasText: 'in app' })).toHaveCount(1);
  await expect(items.filter({ hasNotText: 'in app' })).toHaveCount(1);
  await page.keyboard.press('Escape');

  // The server's kernel: Node has `process`.
  const serverKernel = await chooseKernel(page, 'server');
  await idleOn(page, serverKernel);
  await expect(statusLine(page)).toHaveAccessibleName(/ · Runs on /);
  await run(page, 'typeof process');
  await expect(outputs(page).filter({ hasText: 'object' })).toBeVisible({ timeout: 60_000 });

  // The page's TypeScript kernel runs in a browser Worker: no `process`.
  const pageKernel = await chooseKernel(page, 'page');
  // The old kernel shows as idle until the switch is done, so wait for the new one.
  await idleOn(page, pageKernel);
  await expect(statusLine(page)).toHaveAccessibleName(/ · Runs here · /);
  await run(page, 'const where: string = typeof process; where');
  await expect(outputs(page).filter({ hasText: 'undefined' })).toBeVisible({ timeout: 60_000 });

  // And back to the server.
  await chooseKernel(page, 'server');
  await idleOn(page, serverKernel);
  await run(page, '"on " + typeof process');
  await expect(outputs(page).filter({ hasText: 'on object' })).toBeVisible({ timeout: 60_000 });
});
