// The server's kernels and the page's in one list: what the Mac app does
// (`kernels=both`, #185), so cells can run in the app's own kernel and reach
// its bridges. A notebook starts on the server's cdp-node kernel, then moves
// to the in-page TypeScript kernel and back, keeping one notebook open.
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { GANYMEDE_URL, KERNEL, ROOT_DIR, TOKEN } from './env';
import { outputs, waitForIdle, waitForReady } from './helpers';

const notebooks = () => new Set(readdirSync(ROOT_DIR).filter(f => f.endsWith('.ipynb')));
let before: Set<string>;

test.beforeEach(() => {
  before = notebooks();
});
test.afterEach(() => {
  for (const f of notebooks()) if (!before.has(f)) rmSync(join(ROOT_DIR, f), { force: true });
});

async function run(page: Page, code: string) {
  const cell = page.locator('.jp-Cell').last();
  await cell.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(code);
  await page.keyboard.press('Shift+Enter');
}

test("lists the server's kernels and the page's, and moves between them", async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}&kernels=both`);
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await expect(page.getByText('and kernels in this page')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  const picker = page.getByLabel('Kernel');
  await expect(picker.locator('option', { hasText: 'in app' })).toHaveCount(2);
  await expect(picker.locator(`option[value="${KERNEL}"]`)).toHaveCount(1);

  // The server's kernel: Node has `process`.
  await picker.selectOption(KERNEL);
  await run(page, 'typeof process');
  await expect(outputs(page).filter({ hasText: 'object' })).toBeVisible({ timeout: 60_000 });

  // The page's TypeScript kernel runs in a browser Worker: no `process`.
  await picker.selectOption('cdp-browser');
  await waitForIdle(page);
  await run(page, 'const where: string = typeof process; where');
  await expect(outputs(page).filter({ hasText: 'undefined' })).toBeVisible({ timeout: 60_000 });

  // And back to the server.
  await picker.selectOption(KERNEL);
  await waitForIdle(page);
  await run(page, '"on " + typeof process');
  await expect(outputs(page).filter({ hasText: 'on object' })).toBeVisible({ timeout: 60_000 });
});
