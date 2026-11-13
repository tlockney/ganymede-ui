// Export as Markdown or Script (#590): the server's nbconvert export,
// downloaded under the name the server gives it.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken, screenshot } from './helpers';

for (const [label, extension, text] of [
  ['Export as Script', /\.(ts|js|txt)$/, 'const moons'],
  ['Export as Markdown', /\.(md|zip)$/, 'Galilean moons'],
] as const) {
  test(`${label} from the command palette`, async ({ page }, testInfo) => {
    await openWithToken(page);
    await openNotebook(page, FIXTURE);
    await page.getByTitle('Command Palette').click();
    const palette = page.getByRole('dialog', { name: 'Command palette' });
    await palette.getByRole('combobox', { name: 'Command' }).fill('export');
    await expect(palette.getByRole('option', { name: new RegExp(label) })).toBeVisible();
    await screenshot(page, testInfo, 'export-palette');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      palette.getByRole('option', { name: new RegExp(label) }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(extension);
    expect(download.suggestedFilename()).toContain('Galilean moons');
    if (!download.suggestedFilename().endsWith('.zip')) {
      expect(readFileSync(await download.path(), 'utf8')).toContain(text);
    }
  });
}
