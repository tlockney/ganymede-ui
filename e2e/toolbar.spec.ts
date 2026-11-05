// The toolbar at every width (#201): what doesn't fit moves into "…",
// nothing spills past the window's edge, and the title never runs under
// the buttons.
import { expect, type Page, test } from '@playwright/test';

async function newBrowserNotebook(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

for (const width of [393, 507, 820, 1280]) {
  test(`fits at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await newBrowserNotebook(page);
    const trailing = (await page.locator('.toolbar-trailing').boundingBox())!;
    const title = (await page.locator('.toolbar .title-block').boundingBox())!;
    expect(trailing.x + trailing.width).toBeLessThanOrEqual(width);
    expect(title.x + title.width).toBeLessThanOrEqual(trailing.x);
    // Every button shown is inside the window.
    for (const box of await page
      .locator('.toolbar-trailing button')
      .evaluateAll(bs => bs.map(b => b.getBoundingClientRect().right))) {
      expect(box).toBeLessThanOrEqual(width);
    }
    await expect(page.getByTitle('Run Cell (⇧↩)')).toBeVisible();
    const more = page.getByTitle('More', { exact: true });
    if (width < 1000) {
      await more.click();
      // What moved is in the menu by name.
      await expect(page.getByRole('menuitem', { name: 'Download Notebook' })).toBeVisible();
      await page.keyboard.press('Escape');
    } else {
      await expect(more).toHaveCount(0);
    }
  });
}
