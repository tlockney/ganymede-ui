// The Variables view (#242) on cdp-kernel's Node kernel: after Run All it
// lists the notebook's variables, and an array expands one level.
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken, outputs, waitForIdle } from './helpers';

test('lists the variables after a run and expands an object', async ({ page }) => {
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await page.getByTitle('Run All').click();
  await expect(outputs(page).first()).toBeVisible({ timeout: 60_000 });
  await waitForIdle(page);

  await page.getByTitle('Show Variables').click();
  const view = page.getByRole('complementary', { name: 'Variables' });
  const moons = view.getByRole('row').filter({ hasText: /^moons/ });
  await expect(moons).toBeVisible({ timeout: 30_000 });
  await expect(view.getByRole('row').filter({ hasText: /^rows/ })).toBeVisible();

  await view.getByRole('button', { name: 'Expand moons' }).click();
  // The array's first element, one level down.
  await expect(view.getByRole('row').filter({ hasText: /^▸?0/ })).toBeVisible();

  await view.getByTitle('Close Variables').click();
  await expect(view).toHaveCount(0);
});
