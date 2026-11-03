// Safe-area insets on a phone (#204): the toolbar sits below the status bar,
// the sidebar clears the notch in landscape, and nothing moves where every
// inset is zero (the Mac). Chromium emulates the insets over CDP.
import { expect, type Page, test } from '@playwright/test';

type Insets = { top: number; right: number; bottom: number; left: number };

async function openBrowserNotebook(page: Page, insets: Insets) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
  await page.goto('/');
  await page.getByRole('radio', { name: /This browser/ }).click();
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await expect(page.getByRole('button', { name: /This browser/ })).toBeAttached({
    timeout: 60_000,
  });
  // The empty state's button: on a phone the sidebar starts closed.
  await page.getByRole('button', { name: 'New Notebook' }).last().click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible({ timeout: 60_000 });
}

const box = async (page: Page, selector: string) => (await page.locator(selector).boundingBox())!;

test.describe('portrait phone', () => {
  test.use({ viewport: { width: 393, height: 852 }, hasTouch: true });

  test('the toolbar sits below the status bar', async ({ page }) => {
    await openBrowserNotebook(page, { top: 59, right: 0, bottom: 34, left: 0 });
    const toolbar = await box(page, '.toolbar');
    expect(toolbar.y).toBe(0);
    expect(toolbar.height).toBe(52 + 59);
    // The title is in the part below the inset.
    const title = await box(page, '.toolbar .title');
    expect(title.y).toBeGreaterThanOrEqual(59);
    const outer = page.locator('.jp-WindowedPanel-outer');
    await expect(outer).toHaveCSS('padding-top', `${52 + 59 + 28}px`);
    // 30vh (255.6px), plus the home indicator.
    await expect(outer).toHaveCSS('padding-bottom', '289.6px');
  });
});

test.describe('landscape phone', () => {
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });

  test('the sidebar and notebook clear the notch and home indicator', async ({ page }) => {
    await openBrowserNotebook(page, { top: 0, right: 59, bottom: 21, left: 59 });
    await expect(page.locator('.sidebar')).toHaveCSS('padding-left', '59px');
    await expect(page.locator('.sidebar')).toHaveCSS('padding-bottom', '21px');
    expect((await box(page, '.sidebar')).width).toBe(248 + 59);
    await expect(page.locator('.toolbar')).toHaveCSS('padding-right', `${12 + 59}px`);
    await expect(page.locator('.jp-WindowedPanel-inner')).toHaveCSS('padding-right', '59px');
    await expect(page.locator('.jp-WindowedPanel-outer')).toHaveCSS('padding-bottom', '138.9px');

    // With the sidebar hidden, the toolbar and cells start past the notch.
    await page.getByRole('button', { name: 'Hide Sidebar' }).click();
    await expect(page.locator('.toolbar')).toHaveCSS('padding-left', '80px');
    await expect(page.locator('.jp-WindowedPanel-inner')).toHaveCSS('padding-left', '59px');
  });
});

test('no insets, no change', async ({ page }) => {
  await openBrowserNotebook(page, { top: 0, right: 0, bottom: 0, left: 0 });
  expect((await box(page, '.toolbar')).height).toBe(52);
  expect((await box(page, '.sidebar')).width).toBe(248);
  await expect(page.locator('.jp-WindowedPanel-inner')).toHaveCSS('padding', '0px 32px');
});

test('no insets in a narrow window, no change', async ({ page }) => {
  // The Mac app's minimum width is 720px.
  await page.setViewportSize({ width: 700, height: 500 });
  await openBrowserNotebook(page, { top: 0, right: 0, bottom: 0, left: 0 });
  // The sidebar starts closed at this width: room for the traffic lights.
  await expect(page.locator('.window')).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator('.toolbar')).toHaveCSS('padding-left', '80px');
  await expect(page.locator('.jp-WindowedPanel-inner')).toHaveCSS('padding', '0px 32px');
  await expect(page.locator('.jp-WindowedPanel-outer')).toHaveCSS('padding-bottom', '150px');
});
