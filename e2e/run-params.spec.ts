// Run with Parameters (#582): the server runs the notebook in a kernel of
// its own with the parameters, and the sheet shows the named results.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, screenshot } from './helpers';

const FILE = 'Greeting.ipynb';

test.afterEach(() => removeFromServer(FILE));

test('runs the notebook with parameters and shows its results', async ({ page }, testInfo) => {
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: {
          name: 'cdp-node',
          display_name: 'TypeScript (cdp-kernel, node)',
          language: 'typescript',
        },
      },
      cells: [
        {
          cell_type: 'code',
          id: 'a',
          metadata: {},
          outputs: [],
          execution_count: null,
          source:
            'const { name = "world" } = jupyter.params as { name?: string };\n' +
            'jupyter.result("greeting", `hello, ${name}`);',
        },
      ],
    }),
  );
  await openWithToken(page);
  await openNotebook(page, FILE);
  await page.getByTitle('Command Palette').click();
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByRole('combobox', { name: 'Command' }).fill('run with');
  await palette.getByRole('option', { name: /Run with Parameters/ }).click();

  const sheet = page.getByRole('dialog', { name: `Run ${FILE} with Parameters` });
  await sheet.getByRole('textbox', { name: /Parameters/ }).fill('{"name": "Io"}');
  await sheet.getByRole('button', { name: 'Run' }).click();
  await expect(sheet.getByText('The run finished.')).toBeVisible({ timeout: 60_000 });
  await expect(sheet.locator('.run-results')).toContainText('greeting');
  await expect(sheet.locator('.run-results')).toContainText('"hello, Io"');
  await screenshot(page, testInfo, 'run-params');
  // The open notebook didn't run.
  await expect(page.locator('.jp-OutputArea-output')).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
});
