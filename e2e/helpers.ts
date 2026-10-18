import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { TOKEN } from './env';

/** Selectors and steps the specs share. UI-level only: roles, visible text,
 * and JupyterLab's own `.jp-*` classes, so they survive changes to how the
 * notebook pane is built. */

export const notebookName = (file: string) => file.replace(/\.ipynb$/, '');

/** Open the app connected to the test server, as `ganymede serve` prints it. */
export async function openWithToken(page: Page) {
  await page.goto(`/?token=${TOKEN}`);
}

/** The sidebar entry for a notebook (the "Running" list adds the kernel name). */
export const sidebarItem = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

/** The toolbar subtitle: "<kernel> · Idle". */
export async function waitForIdle(page: Page, timeout = 60_000) {
  await expect(page.getByText(/ · Idle$/)).toBeVisible({ timeout });
}

export async function openNotebook(page: Page, file: string) {
  const name = notebookName(file);
  await expect(sidebarItem(page, name)).toBeVisible();
  await sidebarItem(page, name).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await waitForIdle(page);
}

export const outputs = (page: Page) => page.locator('.jp-OutputArea-output');

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
