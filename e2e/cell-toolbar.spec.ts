// The active cell's toolbar stays off a long first line (#551). The
// toolbar hides itself when the first line runs under it, checking in an
// idle callback; WebKit (the Mac and iPad apps) runs those sooner than
// Chromium, before the Markdown has rendered. The init script makes idle
// callbacks run as soon as WebKit's can, so Chromium shows the same race.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { ROOT_DIR } from './env';
import { notebookName, openWithToken, removeFromServer, sidebarItem } from './helpers';

const FILE = 'Long heading.ipynb';

test.afterEach(() => removeFromServer(FILE));

test('hides the cell toolbar over a long first heading', async ({ page }) => {
  const markdown = (id: string, source: string) => ({
    cell_type: 'markdown',
    id,
    metadata: {},
    source,
  });
  writeFileSync(
    join(ROOT_DIR, FILE),
    JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        markdown(
          'a',
          '# What is the shape and scope of the read API 5xx problem, and who does it reach?\n\nText.',
        ),
        markdown('b', '## Short\n\nText.'),
      ],
    }),
  );
  await page.setViewportSize({ width: 1100, height: 700 });
  // Idle callbacks run on the next task, and the page counts the ones
  // still to run, so the test can tell when the tracker's checks are done.
  await page.addInitScript(() => {
    const w = window as unknown as { idlePending: number };
    w.idlePending = 0;
    window.requestIdleCallback = (cb: IdleRequestCallback) => {
      w.idlePending++;
      return window.setTimeout(() => {
        w.idlePending--;
        cb({ didTimeout: false, timeRemaining: () => 0 });
      }, 0);
    };
  });
  await openWithToken(page);
  await sidebarItem(page, notebookName(FILE)).click();

  const first = page.locator('.jp-Cell').first();
  await expect(first).toHaveClass(/jp-mod-active/);
  await expect(first.locator('.jp-RenderedMarkdown h1')).toBeVisible();
  // The tracker attaches the toolbar hidden and shows it if its check finds
  // room, so wait for it to be attached and for every check to have run:
  // two frames for the resize observer, then no idle callbacks pending.
  const toolbar = first.locator('.jp-cell-toolbar');
  await expect(toolbar).toHaveCount(1);
  await page.waitForFunction(
    () =>
      new Promise<boolean>(resolve =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            setTimeout(
              () => resolve((window as unknown as { idlePending: number }).idlePending === 0),
              50,
            ),
          ),
        ),
      ),
  );
  await expect(toolbar).toBeHidden({ timeout: 1 });

  // A short heading leaves room for it.
  const second = page.locator('.jp-Cell').nth(1);
  await second.click();
  await expect(second.locator('.jp-cell-toolbar')).toBeVisible();
});
