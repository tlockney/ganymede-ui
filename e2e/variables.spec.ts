// The Variables view (#242) on cdp-kernel's Node kernel: after Run All it
// lists the notebook's variables, and an array expands one level.
// A row with children starts with its ▸ toggle, so names match after it.
import { expect, test } from '@playwright/test';
import { FIXTURE } from './env';
import { openNotebook, openWithToken, outputs, waitForIdle } from './helpers';

test('lists the variables after a run and expands an object', async ({ page }) => {
  // The debug requests the view sends (#485): each read of the variables.
  let debugRequests = 0;
  page.on('websocket', ws =>
    ws.on('framesent', frame => {
      if (String(frame.payload).includes('"debug_request"')) debugRequests++;
    }),
  );
  await openWithToken(page);
  await openNotebook(page, FIXTURE);
  await page.getByTitle('Run All').click();
  await expect(outputs(page).first()).toBeVisible({ timeout: 60_000 });
  await waitForIdle(page);

  await page.getByTitle('Show Variables').click();
  const view = page.getByRole('complementary', { name: 'Variables' });
  const moons = view.getByRole('row').filter({ hasText: /^▸?moons/ });
  await expect(moons).toBeVisible({ timeout: 30_000 });
  await expect(view.getByRole('row').filter({ hasText: /^▸?rows/ })).toBeVisible();

  // Reading them doesn't make the kernel busy and idle again, which would
  // read them again, without end (#485).
  const read = debugRequests;
  expect(read).toBeGreaterThan(0);
  await page.waitForTimeout(3_000);
  expect(debugRequests - read).toBeLessThanOrEqual(2);

  await view.getByRole('button', { name: 'Expand moons' }).click();
  // The array's first element, one level down.
  await expect(view.getByRole('row').filter({ hasText: /^▸?0/ })).toBeVisible();

  await view.getByTitle('Close Variables').click();
  await expect(view).toHaveCount(0);
});
