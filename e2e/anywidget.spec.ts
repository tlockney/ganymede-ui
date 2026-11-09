// anywidget views (#417): cdp-kernel's `jupyter.widget` draws in a sandboxed
// frame and syncs both ways with the kernel, from the saved state too.
import { expect, type Page, test } from '@playwright/test';
import { outputs, waitForReady } from './helpers';

async function connectBrowser(page: Page) {
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeVisible({
    timeout: 60_000,
  });
}

const widgetFrames = (page: Page) => page.locator('.gn-AnyWidget iframe');

async function runCell(page: Page, code: string) {
  const cells = page.locator('.jp-CodeCell');
  const last = cells.last();
  await last.locator('.cm-content').click();
  await page.keyboard.insertText(code);
  await page.keyboard.press('Shift+Enter');
}

test('a widget syncs with the kernel both ways, in a sandboxed frame', async ({ page }) => {
  await connectBrowser(page);
  await page.getByRole('button', { name: 'New Notebook' }).first().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await waitForReady(page);

  await runCell(
    page,
    `const counter = jupyter.widget({
  esm: \`export default {
    render({ model, el }) {
      const b = document.createElement("button");
      const update = () => { b.textContent = "count is " + model.get("count"); };
      b.onclick = () => { model.set("count", model.get("count") + 1); model.save_changes(); };
      model.on("change:count", update);
      update();
      el.append(b);
      model.on("msg:custom", (m, buffers) => {
        b.dataset.got = m.hello + ":" + new Uint8Array(buffers[0].buffer ?? buffers[0])[2];
      });
    },
  };\`,
  state: { count: 0 },
});
counter;`,
  );
  const frame = widgetFrames(page).first();
  await expect(frame).toHaveAttribute('sandbox', /allow-scripts/);
  await expect(frame).not.toHaveAttribute('sandbox', /allow-same-origin/);
  const button = frame.contentFrame().getByRole('button', { name: 'count is 0' });
  await expect(button).toBeVisible({ timeout: 60_000 });

  // The view to the kernel.
  await button.click();
  await frame.contentFrame().getByRole('button', { name: 'count is 1' }).click();
  await expect(frame.contentFrame().getByRole('button', { name: 'count is 2' })).toBeVisible();
  await runCell(page, 'counter.get("count") * 100');
  await expect(outputs(page).filter({ hasText: /^200$/ })).toBeVisible({ timeout: 30_000 });

  // The kernel to the view, with a custom message and a binary buffer.
  await runCell(
    page,
    'counter.set("count", 7); counter.send({ hello: "hi" }, [new Uint8Array([1, 2, 3])]);',
  );
  const updated = frame.contentFrame().getByRole('button', { name: 'count is 7' });
  await expect(updated).toBeVisible();
  await expect(updated).toHaveAttribute('data-got', 'hi:3');

  // Its code runs in the frame, not the page.
  expect(
    await frame
      .contentFrame()
      .locator('body')
      .evaluate(() => {
        try {
          return String(window.parent.document);
        } catch {
          return 'blocked';
        }
      }),
  ).toBe('blocked');
});

test('the example widgets render from their saved state', async ({ page }) => {
  await connectBrowser(page);
  await page.getByRole('button', { name: 'Open Example Notebooks' }).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  await page.goto(`/?open=${encodeURIComponent('Examples/06 Widgets.ipynb')}`);
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
  // The counter as the kernel left it when the notebook was saved.
  await expect(
    widgetFrames(page).first().contentFrame().getByRole('button', { name: 'Clicked 10 times' }),
  ).toBeVisible({ timeout: 60_000 });
});
