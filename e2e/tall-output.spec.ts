// Framed HTML taller than the frame's 20,000 px cap scrolls inside the
// frame, so its end can be reached; shorter outputs keep no inner
// scrollbar (#795).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, waitForIdle } from './helpers';

const FILE = 'Tall output.ipynb';
const CAP = 20_000;

test.afterEach(() => removeFromServer(FILE));

const code = (id: string, source: string) => ({
  cell_type: 'code',
  id,
  metadata: {},
  execution_count: null,
  outputs: [],
  source,
});

/** The frame document's vertical overflow and how far it can scroll. */
const frameScroll = (frame: Locator) =>
  frame
    .contentFrame()
    .locator('html')
    .evaluate(html => ({
      overflowY: getComputedStyle(html).overflowY,
      scrollTop: html.scrollTop,
      scrollable: html.scrollHeight - html.clientHeight,
    }));

test('a framed output past the height cap scrolls to its last line', async ({ page }) => {
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {
        kernelspec: {
          display_name: 'TypeScript (cdp-kernel, node)',
          language: 'typescript',
          name: 'cdp-node',
        },
        language_info: { name: 'typescript' },
      },
      cells: [
        code('short', 'await jupyter.display(jupyter.html`<p id="short">Short output</p>`);'),
        code(
          'tall',
          'await jupyter.display(jupyter.html`<div style="height:25000px">Top</div><p id="last">Last line</p>`);',
        ),
      ],
    }),
  );
  await openWithToken(page);
  await openNotebook(page, FILE);
  await page.getByRole('button', { name: 'Run All' }).click();
  await waitForIdle(page);

  const frames = page.locator('[data-mime-type="text/html"] iframe');
  const short = frames.nth(0);
  const tall = frames.nth(1);
  await expect(short.contentFrame().locator('#short')).toHaveText('Short output');
  await expect(tall.contentFrame().locator('#last')).toHaveText('Last line');

  // Under the cap: sized to fit, overflow hidden, nothing to scroll.
  await expect.poll(async () => (await short.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  expect((await short.boundingBox())!.height).toBeLessThan(200);
  expect(await frameScroll(short)).toEqual({ overflowY: 'hidden', scrollTop: 0, scrollable: 0 });

  // Over the cap: the frame stops at the cap and its document scrolls.
  await expect.poll(async () => (await tall.boundingBox())?.height ?? 0).toBe(CAP);
  await expect.poll(async () => (await frameScroll(tall)).overflowY).toBe('auto');
  expect((await frameScroll(tall)).scrollable).toBeGreaterThan(5_000);

  // Bring the frame's bottom edge on screen by scrolling the notebook,
  // then wheel over the frame, as a person would, until its end shows.
  await tall.evaluate(el => el.scrollIntoView({ block: 'end' }));
  const box = (await tall.boundingBox())!;
  const viewport = page.viewportSize()!;
  await page.mouse.move(box.x + box.width / 2, Math.min(box.y + box.height, viewport.height) - 40);
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, 2_000);
      const { scrollTop, scrollable } = await frameScroll(tall);
      return scrollTop >= scrollable;
    })
    .toBe(true);
  const last = tall.contentFrame().locator('#last');
  const inView = await last.evaluate(el => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight;
  });
  expect(inView).toBe(true);
  // And on the page's screen, not just in the frame's viewport.
  const lastBox = (await last.boundingBox())!;
  expect(lastBox.y).toBeGreaterThanOrEqual(0);
  expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(viewport.height);
});
