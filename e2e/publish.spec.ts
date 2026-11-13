// Publish as Web Page (#563): the toolbar opens the sheet, and the page
// comes from the server's HTML export with its redactions. A server that
// ignores the options (Ganymede 0.10.0 and older) is refused, so asking
// for hidden code never shares it.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { FIXTURE, GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';
import { openNotebook, openWithToken } from './helpers';

test('publishes the open notebook as one web page', async ({ page }) => {
  // Whether the server under test takes the options: its page names the mode.
  const probe = await fetch(
    `${GANYMEDE_URL}/nbconvert/html/${encodeURIComponent(FIXTURE)}?code=hidden&token=${TOKEN}`,
  );
  const takesOptions = (await probe.text()).includes(
    '<meta name="ganymede-code" content="hidden">',
  );

  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await page.getByRole('button', { name: 'Publish as Web Page' }).click();
  const sheet = page.getByRole('dialog', { name: `Publish ${FIXTURE}` });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('combobox').selectOption('hidden');
  await sheet.getByRole('textbox', { name: /Byline/ }).fill('For the e2e run');

  if (!takesOptions) {
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await sheet.getByRole('button', { name: 'Publish' }).click();
    await expect(sheet.getByText(/needs a newer Ganymede/)).toBeVisible();
    expect(downloaded).toBe(false);
    return;
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    sheet.getByRole('button', { name: 'Publish' }).click(),
  ]);
  await expect(sheet).toBeHidden();
  expect(download.suggestedFilename()).toBe(FIXTURE.replace(/\.ipynb$/, '.html'));
  const html = readFileSync(await download.path(), 'utf8');
  expect(html).toContain('<meta name="ganymede-code" content="hidden">');
  expect(html).toContain('For the e2e run');
  expect(html).not.toContain('<details class="code"');
  expect(html).not.toContain('id="notebook"');
  expect(html).not.toContain(TOKEN);
  expect(html).not.toContain(ROOT_DIR);
});
