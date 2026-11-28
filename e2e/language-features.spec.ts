// Signature help, go to definition (F12) and rename (F2) across cells
// (#676, #680) against cdp-kernel's `cdp-kernel.language.v1` comm on the
// server's `cdp-node` kernel.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, waitForIdle } from './helpers';

const NOTEBOOK = 'language-features.ipynb';

const EMPTY_NOTEBOOK = JSON.stringify(
  {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: {
        name: 'cdp-node',
        display_name: 'TypeScript (cdp-kernel, node)',
        language: 'typescript',
      },
      language_info: { name: 'typescript' },
    },
    cells: [
      {
        cell_type: 'code',
        id: 'cell-decl',
        metadata: {},
        source: [],
        outputs: [],
        execution_count: null,
      },
      {
        cell_type: 'code',
        id: 'cell-call',
        metadata: {},
        source: [],
        outputs: [],
        execution_count: null,
      },
    ],
  },
  null,
  2,
);

test.beforeEach(() => {
  writeFileSync(join(ROOT_DIR, NOTEBOOK), EMPTY_NOTEBOOK);
});

test.afterEach(async () => {
  await removeFromServer(NOTEBOOK);
});

test('signature help, Escape keeping edit mode, F12 definition and F2 rename across cells', async ({
  page,
}) => {
  await openWithToken(page);
  await openNotebook(page, NOTEBOOK);

  const cells = page.locator('.jp-CodeCell');
  const first = cells.nth(0);
  const second = cells.nth(1);

  // Declare a typed function in the first cell and run it so the language service knows it.
  await first.locator('.cm-content').click();
  await page.keyboard.type('function add(a: number, b: number) { return a + b; }');
  await page.keyboard.press('Shift+Enter');
  await waitForIdle(page);

  // Type a call in the second cell; retry once TS finishes cold-starting if the first `(` arrives early.
  await second.locator('.cm-content').click();
  const tooltip = page.locator('.cm-signature-help');
  await expect(async () => {
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('add(1');
    await expect(tooltip).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });

  await expect(tooltip.locator('.cm-signature-label')).toContainText(
    'add(a: number, b: number): number',
  );
  await expect(tooltip.locator('.cm-signature-active')).toHaveText('a: number');

  // Typing `, ` advances the active parameter to the second argument.
  await page.keyboard.type(', ');
  await expect(tooltip.locator('.cm-signature-active')).toHaveText('b: number');

  // Escape dismisses signature help without leaving edit mode.
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await expect(page.locator('.jp-Notebook')).toHaveClass(/jp-mod-editMode/);
  await page.keyboard.type('2)');
  await expect(second.locator('.cm-content')).toContainText('add(1, 2)');

  // F12 on `add` in the second cell jumps to and selects its declaration in the first cell.
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('F12');
  await expect(first).toHaveClass(/jp-mod-active/);
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('add');

  // F2 renames the symbol across both cells.
  await page.keyboard.press('F2');
  const input = page.locator('.rename-prompt input');
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue('add');
  await page.keyboard.type('sum');
  await page.keyboard.press('Enter');

  await expect(page.locator('.rename-prompt')).toHaveCount(0);
  await expect(first.locator('.cm-content')).toContainText(
    'function sum(a: number, b: number) { return a + b; }',
  );
  await expect(second.locator('.cm-content')).toContainText('sum(1, 2)');
});
