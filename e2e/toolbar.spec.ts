// The toolbar at every width (#201, #801): Run Cell, Interrupt, Share and
// "⋯" stay in view in the same order, nothing spills past the window's edge,
// the title and status line never run under the buttons, and the status
// line says where the notebook is saved and runs.
import { expect, type Page, test } from '@playwright/test';
import { statusLine } from './helpers';

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
    // Every button shown is inside the window, and none overlaps the next.
    const boxes = await page
      .locator('.toolbar-trailing button')
      .evaluateAll(bs => bs.map(b => b.getBoundingClientRect()).map(r => [r.left, r.right]));
    for (const [, right] of boxes) expect(right).toBeLessThanOrEqual(width);
    boxes.sort((a, b) => a[0]! - b[0]!);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i]![0]).toBeGreaterThanOrEqual(boxes[i - 1]![1]! - 0.5);
    }

    const bar = page.locator('.toolbar');
    const run = bar.getByRole('button', { name: 'Run Cell', exact: true });
    const interrupt = bar.getByRole('button', { name: 'Interrupt', exact: true });
    await expect(run).toBeVisible();
    await expect(interrupt).toBeVisible();
    await expect(interrupt).toBeDisabled();
    // The words go below a width; the names stay.
    await expect(run.locator('.tb-label')).toBeVisible({ visible: width >= 1000 });
    await expect(page.getByRole('button', { name: 'Share', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();

    await expect(statusLine(page)).toHaveAccessibleName(/^Saved in this browser · Runs here · /);
    // What shows of the line: the phone's short form keeps where it runs;
    // with room, nothing is clipped (the line's box allows for its margins).
    const shown = await statusLine(page).evaluate(b => (b as HTMLElement).innerText);
    if (width < 720) {
      expect(shown).toContain('Runs here');
      expect(shown).not.toContain('Python');
    } else {
      expect(shown).toMatch(/^Saved in this browser · Runs here · /);
    }
    if (width >= 1280) {
      const text = statusLine(page).locator('.status-text');
      const [scroll, client] = await text.evaluate(e => [e.scrollWidth, e.clientWidth]);
      expect(scroll).toBeLessThanOrEqual(client!);
    }
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(page.getByRole('menuitem', { name: 'Download Notebook' })).toBeVisible();
    await page.keyboard.press('Escape');
  });
}

test('keeps Interrupt where it is while a cell runs', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await newBrowserNotebook(page);
  const interrupt = page
    .locator('.toolbar')
    .getByRole('button', { name: 'Interrupt', exact: true });
  const before = (await interrupt.boundingBox())!;
  await page.locator('.jp-Cell .cm-content').first().click();
  await page.keyboard.type('await new Promise(r => setTimeout(r, 4000))');
  await page.keyboard.press('Shift+Enter');
  await expect(interrupt).toBeEnabled({ timeout: 30_000 });
  const during = (await interrupt.boundingBox())!;
  expect(during.x).toBe(before.x);
  expect(during.y).toBe(before.y);
  await interrupt.click();
  await expect(interrupt).toBeDisabled({ timeout: 30_000 });
  const after = (await interrupt.boundingBox())!;
  expect(after.x).toBe(before.x);
});
