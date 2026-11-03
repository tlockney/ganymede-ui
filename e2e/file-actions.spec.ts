// The sidebar's file menu (#203), on the in-browser backend: rename,
// duplicate, delete with confirmation, and new folder; deleting the open
// notebook closes it, renaming it keeps it open.
import { expect, type Page, test } from '@playwright/test';
import { waitForReady } from './helpers';

async function connect(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
}

const files = (page: Page) => page.locator('.sidebar .source-list').first().locator('.item-name');
const menuItem = (page: Page, name: string) => page.getByRole('menuitem', { name });

test('renames, duplicates, deletes and makes folders from the sidebar', async ({ page }) => {
  await connect(page);
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);
  await expect(files(page)).toHaveText(['Untitled']);

  // Rename the open notebook: it stays open at the new path.
  await page.getByRole('button', { name: 'Actions for Untitled' }).click();
  await menuItem(page, 'Rename').click();
  await page.getByRole('textbox', { name: 'New name for Untitled' }).fill('Io');
  await page.keyboard.press('Enter');
  await expect(files(page)).toHaveText(['Io']);
  await expect(page).toHaveTitle('Io');
  await expect(page.locator('.jp-Cell').first()).toBeVisible();

  // Duplicate it, by right-click.
  await page.locator('.sidebar').getByRole('button', { name: 'Io', exact: true }).first().click({
    button: 'right',
  });
  await menuItem(page, 'Duplicate').click();
  // Named by the backend: "Io-Copy1" on a Jupyter server, "Io (copy)" here.
  await expect(files(page)).toHaveCount(2);
  const copy = (await files(page).allTextContents()).find(n => n !== 'Io')!;
  expect(copy).toMatch(/^Io.*copy/i);

  // A folder, named as it is made.
  await page.getByRole('button', { name: `Actions for ${copy}` }).click();
  await menuItem(page, 'New Folder').click();
  const field = page.getByRole('textbox', { name: /^New name for Untitled Folder/ });
  await field.fill('moons');
  await page.keyboard.press('Enter');
  await expect(files(page)).toHaveCount(3);
  await expect(files(page).first()).toHaveText('moons');

  // Delete asks first; deleting the open notebook closes it.
  page.once('dialog', d => void d.dismiss());
  await page.getByRole('button', { name: 'Actions for Io', exact: true }).click();
  await menuItem(page, 'Delete…').click();
  await expect(files(page)).toHaveCount(3);
  await expect(files(page).first()).toHaveText('moons');
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'Actions for Io', exact: true }).click();
  await menuItem(page, 'Delete…').click();
  await expect(files(page)).toHaveText(['moons', copy]);
  await expect(page.locator('.jp-Cell')).toHaveCount(0);
  await expect(page).toHaveTitle('Ganymede');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true });

  test('a long press opens the menu without opening the item', async ({ page }) => {
    await connect(page);
    await page.getByRole('button', { name: 'New Notebook' }).last().click();
    await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
    await page.getByRole('button', { name: 'Show Sidebar' }).tap();
    const row = page.locator('.sidebar').getByRole('button', { name: 'Untitled', exact: true });
    // The "…" button is there on touch, 36px wide.
    const more = page.getByRole('button', { name: 'Actions for Untitled' });
    await expect(more).toBeVisible();
    expect((await more.boundingBox())!.width).toBeGreaterThanOrEqual(36);

    const box = (await row.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const point = { x: box.x + 30, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(700);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByRole('menu')).toBeVisible();
    await expect(menuItem(page, 'Rename')).toBeVisible();
    expect((await menuItem(page, 'Rename').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
