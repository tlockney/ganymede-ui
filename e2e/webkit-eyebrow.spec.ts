// Responsive native-chrome page eyebrow (#865, #867) across iPad and iPhone WebKit viewports.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { TOKEN } from './env';
import { removeFromServer } from './helpers';
import { expectNoHorizontalOverflow, writeServerFile } from './webkit-helpers';

const FILE = 'WebKit Eyebrow Journal.ipynb';

test.afterEach(async () => {
  await removeFromServer(FILE);
});

test('shows the page eyebrow on regular iPad (820x1180) and hides it on Split View and iPhone (#865, #867)', async ({
  page,
  request,
}) => {
  const fixture = readFileSync(
    join(process.cwd(), 'e2e/fixtures/journal/Fremont Bridge.ipynb'),
    'utf8',
  );
  await writeServerFile(request, FILE, fixture);

  const viewport = test.info().project.use.viewport ?? { width: 1280, height: 820 };
  const expectVisible = viewport.width >= 720 && viewport.height > 520;

  await page.goto(
    `/?token=${encodeURIComponent(TOKEN)}&kernels=server&chrome=native&open=${encodeURIComponent(FILE)}`,
  );

  const journal = page.getByRole('region', { name: `Journal of ${FILE}` });
  await expect(journal).toBeVisible();
  await expect(page.locator('.page-eyebrow')).toHaveCount(0);

  await journal.getByRole('button', { name: 'Open as Notebook' }).click();
  await expect(page.locator('.jp-Cell').first()).toBeVisible();
  await expect(page.locator('.toolbar')).toHaveCount(0);

  const eyebrow = page.locator('.page-eyebrow');
  if (expectVisible) {
    await expect(eyebrow).toBeVisible();
    await expect(eyebrow).toHaveText(/^typescript · /);

    const [line, notebook, firstCell] = await Promise.all([
      eyebrow.boundingBox(),
      page.locator('.notebook-page').boundingBox(),
      page.locator('.jp-Cell').first().boundingBox(),
    ]);
    expect(line).not.toBeNull();
    expect(notebook).not.toBeNull();
    expect(firstCell).not.toBeNull();
    expect(line!.y + line!.height).toBeLessThanOrEqual(notebook!.y + 1);
    const textLeft = await eyebrow.evaluate(
      el => el.getBoundingClientRect().x + parseFloat(getComputedStyle(el).paddingLeft),
    );
    expect(textLeft).toBeCloseTo(firstCell!.x, 0);
  } else {
    await expect(eyebrow).toBeHidden();
    const [content, notebook] = await Promise.all([
      page.locator('.main > .content').boundingBox(),
      page.locator('.notebook-page').boundingBox(),
    ]);
    expect(content).not.toBeNull();
    expect(notebook).not.toBeNull();
    expect(Math.abs(notebook!.y - content!.y)).toBeLessThanOrEqual(1);
  }

  await expectNoHorizontalOverflow(page);
});
