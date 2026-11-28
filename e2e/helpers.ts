import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { GANYMEDE_URL, ROOT_DIR, TOKEN } from './env';

/** Selectors and steps the specs share. UI-level only: roles, visible text,
 * and JupyterLab's own `.jp-*` classes, so they survive changes to how the
 * notebook pane is built. */

/**
 * Wait until the server has finished closing rooms for `paths`, because
 * `DELETE /api/contents` triggers `Cmd::Removed` asynchronously on the room
 * actor, which writes any `file_gone` recovery copy right before removing
 * the room from `/api/collaboration/rooms` (#831).
 */
async function waitForRoomsClosed(paths: ReadonlySet<string>) {
  if (paths.size === 0) return;
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${GANYMEDE_URL}/api/collaboration/rooms?token=${TOKEN}`).catch(
      () => undefined,
    );
    if (!res?.ok) return;
    const body = (await res.json()) as { rooms?: Array<{ path?: string }> };
    const open = (body.rooms ?? []).some(r => typeof r.path === 'string' && paths.has(r.path));
    if (!open) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

/**
 * Discard any server-held recovery copies for `path` (#831) so a later test
 * creating a notebook at the same path does not inherit them.
 */
export async function clearRecoveryCopies(path: string) {
  const res = await fetch(
    `${GANYMEDE_URL}/api/collaboration/recovery?path=${encodeURIComponent(path)}&token=${TOKEN}`,
  ).catch(() => undefined);
  if (!res?.ok) return;
  const body = (await res.json()) as { copies?: Array<{ id: string }> };
  for (const copy of body.copies ?? []) {
    await fetch(
      `${GANYMEDE_URL}/api/collaboration/recovery/${encodeURIComponent(copy.id)}?token=${TOKEN}`,
      { method: 'DELETE' },
    ).catch(() => {});
  }
}

/**
 * Delete files the test made in the server's folder through the contents
 * API, so the server closes their rooms (#183). A file deleted behind its
 * back keeps its room, and a later file at the same path joins it. Then
 * remove whatever is left (folders) from disk and clear any recovery copies
 * left behind when the room closed (#831).
 */
export async function removeFromServer(...names: string[]) {
  const files = (path: string): string[] => {
    try {
      if (!statSync(path).isDirectory()) return [path];
    } catch {
      return [];
    }
    return readdirSync(path).flatMap(f => files(join(path, f)));
  };
  const removedPaths = new Set<string>();
  for (const name of names) {
    removedPaths.add(name.split(/[\\/]/).join('/'));
    for (const file of files(join(ROOT_DIR, name))) {
      const rel = relative(ROOT_DIR, file).split(/[\\/]/);
      removedPaths.add(rel.join('/'));
      const parts = rel.map(encodeURIComponent);
      await fetch(`${GANYMEDE_URL}/api/contents/${parts.join('/')}?token=${TOKEN}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
    rmSync(join(ROOT_DIR, name), { recursive: true, force: true });
  }
  await waitForRoomsClosed(removedPaths);
  for (const relPath of removedPaths) {
    await clearRecoveryCopies(relPath);
  }
}

export const notebookName = (file: string) => file.replace(/\.ipynb$/, '');

/** Open the app connected to the test server, as `ganymede serve` prints it. */
export async function openWithToken(page: Page) {
  await page.goto(`/?token=${TOKEN}`);
}

/**
 * The sidebar entry for a notebook (the "Running" list adds the kernel
 * name). In the sidebar: the toolbar's title is a button by that name too.
 */
export const sidebarItem = (page: Page, name: string) =>
  page.locator('.sidebar .folder-list').getByRole('button', { name, exact: true });

/**
 * The toolbar's status line (#801): "<saved> · <runs> · <kernel>", with the
 * kernel's state at the end only while it is not idle. Its dot carries
 * the state: `s-idle`, `s-busy`, `s-none` (no kernel started yet)...
 */
export const statusLine = (page: Page) => page.locator('.toolbar .status-line');

/** The kernel is idle: the status line has no state and its dot is green. */
export async function waitForIdle(page: Page, timeout = 60_000) {
  await expect(statusLine(page).locator('.status-dot')).toHaveClass(/\bs-idle\b/, { timeout });
}

/**
 * The notebook is ready to run: its kernel is idle, or none is running yet
 * and the first run starts one.
 */
export async function waitForReady(page: Page, timeout = 60_000) {
  await expect(statusLine(page).locator('.status-dot')).toHaveClass(/\bs-(idle|none)\b/, {
    timeout,
  });
}

export async function openNotebook(page: Page, file: string) {
  const name = notebookName(file);
  await expect(sidebarItem(page, name)).toBeVisible();
  await sidebarItem(page, name).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await waitForReady(page);
}

export const outputs = (page: Page) => page.locator('.jp-OutputArea-output');

/**
 * Put the notebook in command mode on the cell at `index` (#852 removed the
 * `[n]:` prompts the tests used to click). A code cell's editor takes a
 * click, and Escape leaves it for command mode with the cell still selected.
 * A Markdown cell drawn as text hides its editor (`display: none`), so click
 * the rendered Markdown, which selects the cell where it already is.
 */
export async function selectCell(page: Page, index = 0) {
  const cell = page.locator('.jp-Cell').nth(index);
  const editor = cell.locator('.jp-InputArea-editor:visible');
  if (await editor.count()) {
    await editor.first().click();
    await page.keyboard.press('Escape');
  } else {
    await cell.locator('.jp-MarkdownOutput').first().click();
  }
  await expect(cell).toHaveClass(/jp-mod-active/);
}

/** Save a full-page screenshot under test-results/screenshots and attach it. */
export async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const dir = join(testInfo.project.outputDir, 'screenshots');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.png`);
  // Let the last output finish laying out.
  await page.waitForTimeout(300);
  await page.screenshot({ path });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

/** The first screen with no saved connection (#815): three ways in, no sheet. */
export const tryButton = (page: Page) => page.getByRole('button', { name: 'Try a Notebook' });

/**
 * From the start screen, open the connection sheet ("Where should kernels
 * run?") with Connect to a Server…, as the first screen no longer opens it.
 */
export async function openConnectSheet(page: Page) {
  await page.getByRole('button', { name: 'Connect to a Server…' }).click();
  await expect(page.getByRole('dialog', { name: 'Where should kernels run?' })).toBeVisible();
}

/**
 * From the start screen, pick This browser in the sheet and connect: the
 * browser backend with no sample or notebook opened, for specs that make
 * their own notebooks.
 */
export async function useThisBrowser(page: Page) {
  await openConnectSheet(page);
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}

/**
 * Tab from the top of the page until `target` has focus: the sidebar and
 * toolbar come before the start screen in the tab order. Fails if it isn't
 * reached within `max` presses.
 */
export async function tabTo(page: Page, target: Locator, max = 20) {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate(el => el === document.activeElement)) return;
  }
  await expect(target).toBeFocused({ timeout: 1000 });
}

/** Pick an item from one of the toolbar's menus: "More run actions", "Share" or "More". */
export async function toolbarMenu(page: Page, button: string, item: string | RegExp) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await page.getByRole('menuitem', { name: item, exact: typeof item === 'string' }).click();
}

/** Run All, from the toolbar's run menu. */
export const runAll = (page: Page) => toolbarMenu(page, 'More run actions', 'Run All');
