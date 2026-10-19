// Notebooks on the server, kernels in the page: what the iPad app does,
// since its server has no kernels. The app opens the token URL with
// `kernels=page`; the TypeScript cell runs in cdp-kernel's browser kernel
// and the notebook saves to the server's folder.
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { outputs, waitForIdle } from './helpers';

const notebooks = () => new Set(readdirSync(ROOT_DIR).filter(f => f.endsWith('.ipynb')));
let before: Set<string>;

test.beforeEach(() => {
  before = notebooks();
});
test.afterEach(() => {
  for (const f of notebooks()) if (!before.has(f)) rmSync(join(ROOT_DIR, f), { force: true });
});

test('keeps notebooks on the server and runs kernels in the page', async ({ page }) => {
  await page.goto(`${GANYMEDE_URL}/?token=${TOKEN}&kernels=page`);
  expect(new URL(page.url()).search).toBe('');
  await expect(page.getByText('Where should kernels run?')).toHaveCount(0);
  await expect(page.getByText('kernels in this page')).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForIdle(page);

  await page.locator('.jp-Cell .cm-content').first().click();
  await page.keyboard.type('const moon: string = "Ganymede";\nmoon.toUpperCase()');
  await page.keyboard.press('Shift+Enter');
  await expect(outputs(page).filter({ hasText: 'GANYMEDE' })).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press('ControlOrMeta+s');

  const saved = () => {
    const added = [...notebooks()].filter(f => !before.has(f));
    return added.length === 1 ? readFileSync(join(ROOT_DIR, added[0]!), 'utf8') : '';
  };
  await expect.poll(saved).toContain('GANYMEDE');
  expect(JSON.parse(saved()).metadata.kernelspec.name).toBe('cdp-browser');
});
