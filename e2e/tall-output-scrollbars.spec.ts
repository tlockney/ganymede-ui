// With classic scrollbars, which take width from the content, a framed
// output whose height follows its width can be over the 20,000 px cap
// without a scrollbar and under it with one. Once the frame scrolls it
// keeps scrolling, so the scrollbar doesn't flip on and off (#795).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ROOT_DIR } from './env';
import { openNotebook, openWithToken, removeFromServer, runAll, waitForIdle } from './helpers';

// Chromium for tests hides scrollbars unless told not to. launchOptions
// replaces the config's, so the executable comes along again.
test.use({
  launchOptions: {
    ignoreDefaultArgs: ['--hide-scrollbars'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  },
});

const FILE = 'Tall aspect output.ipynb';
const CAP = 20_000;

test.afterEach(() => removeFromServer(FILE));

const SOURCE =
  'await jupyter.display(jupyter.html`<div id="box" style="width:100%;height:100px;background:teal"></div>`);';

const LONG = Array.from({ length: 80 }, (_, i) => `Line ${i + 1}`).join('\n\n');

/** The frame document's scroll state. */
const frameState = (frame: Locator) =>
  frame
    .contentFrame()
    .locator('html')
    .evaluate(html => ({
      overflowY: getComputedStyle(html).overflowY,
      scrollbar: window.innerWidth - html.clientWidth,
      scrollTop: html.scrollTop,
      scrollable: html.scrollHeight - html.clientHeight,
    }));

/** Heights the page has received from frames since the last call. */
const takePosts = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { e2ePosts: number[] };
    return w.e2ePosts.splice(0);
  });

test('a framed output just over the cap keeps a steady scrollbar', async ({ page }) => {
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
        // The notebook already scrolls, so its own scrollbar doesn't
        // narrow the frame after the box has taken its width.
        { cell_type: 'markdown', id: 'long', metadata: {}, source: LONG },
        {
          cell_type: 'code',
          id: 'box',
          metadata: {},
          execution_count: null,
          outputs: [],
          source: SOURCE,
        },
      ],
    }),
  );
  await openWithToken(page);
  await page.evaluate(() => {
    const w = window as unknown as { e2ePosts: number[] };
    w.e2ePosts = [];
    addEventListener('message', e => {
      const data = e.data as { ganymedeFrame?: string; height?: number } | null;
      if (data?.ganymedeFrame === 'height') w.e2ePosts.push(data.height!);
    });
  });
  await openNotebook(page, FILE);
  await runAll(page);
  await waitForIdle(page);

  const frame = page.locator('[data-mime-type="text/html"] iframe');
  const box = frame.contentFrame().locator('#box');
  await expect(box).toBeAttached();
  // Once the page has settled, make the box full width and 5 px over the
  // cap at the frame's width without a scrollbar, so a scrollbar's width
  // takes it back under.
  await expect.poll(async () => (await frame.boundingBox())?.height).toBe(100);
  await box.evaluate((el, cap) => {
    el.style.height = '';
    el.style.aspectRatio = `${window.innerWidth} / ${cap + 5}`;
  }, CAP);
  await expect.poll(async () => (await frameState(frame)).overflowY).toBe('auto');

  // Over about a second, once settled: no more heights posted, the frame
  // keeps its height, and the scrollbar stays.
  await page.waitForTimeout(500);
  await takePosts(page);
  const height = await frame.evaluate(el => el.style.height);
  const before = await frameState(frame);
  await page.waitForTimeout(1_000);
  expect(await takePosts(page)).toEqual([]);
  expect(await frame.evaluate(el => el.style.height)).toBe(height);
  expect(await frameState(frame)).toEqual(before);
  expect(before.overflowY).toBe('auto');
  // Classic scrollbars really are on: one takes width from the content,
  // and with it the box is back under the cap.
  expect(before.scrollbar).toBeGreaterThan(0);
  expect(parseFloat(height)).toBeLessThan(CAP);

  // Content that shrinks back under the cap fits: nothing to scroll and
  // no scrollbar, though the document may still scroll.
  await box.evaluate(el => {
    document.documentElement.scrollTop = 1e6;
    el.style.aspectRatio = '1 / 5';
  });
  await expect.poll(async () => (await frameState(frame)).scrollbar).toBe(0);
  const fit = await frameState(frame);
  expect(fit).toEqual({ overflowY: 'auto', scrollbar: 0, scrollTop: 0, scrollable: 0 });
  expect((await frame.boundingBox())!.height).toBeLessThan(CAP / 2);
});
