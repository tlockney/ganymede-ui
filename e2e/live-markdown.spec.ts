// Live Markdown preview (#672) and multi-line selection (#273) on WebKit.
import { expect, test } from '@playwright/test';
import { openNotebook, openWithToken, removeFromServer } from './helpers';
import { openNewServerNotebook, readServerContents, runPaletteCommand } from './webkit-helpers';

const MARKDOWN_SAMPLE = [
  '# Galilean Moons',
  'See **Europa** and *Io* with `ice()`',
  '- Callisto',
  '---',
  'Anchor line',
].join('\n');

test.afterEach(async () => {
  await removeFromServer('Untitled.ipynb');
});

test('toggles via palette, supports undo/redo while rendered, copies raw Markdown, reveals on multi-line select, and saves unchanged (#672, #273)', async ({
  page,
  request,
  browserName,
}) => {
  await openNewServerNotebook(page);

  // Insert a Markdown cell below cell 0 and populate it.
  await page.locator('.jp-Cell .cm-content').first().click();
  await runPaletteCommand(page, 'Insert Markdown Cell');
  const mdCell = page.locator('.jp-MarkdownCell');
  await expect(mdCell).toHaveCount(1);
  const mdEditor = mdCell.locator('.cm-content');
  await mdEditor.click();

  // Ensure live preview starts enabled, then test toggling OFF and back ON via palette.
  const hasLiveInitially = await mdEditor.evaluate(el => el.classList.contains('cm-md-live'));
  if (!hasLiveInitially) {
    await runPaletteCommand(page, 'Show or Hide Live Markdown Preview');
  }
  await expect(mdEditor).toHaveClass(/cm-md-live/);

  await mdEditor.click();
  await page.keyboard.insertText(MARKDOWN_SAMPLE);

  // Cursor sits on line 4 ("Anchor line"), so lines 0..3 render live decorations.
  await expect(mdCell.locator('.cm-md-h1')).toHaveText('Galilean Moons');
  await expect(mdCell.locator('.cm-md-strong')).toHaveText('Europa');
  await expect(mdCell.locator('.cm-md-em')).toHaveText('Io');
  await expect(mdCell.locator('.cm-md-code')).toHaveText('ice()');
  await expect(mdCell.locator('.cm-md-bullet')).toHaveCount(1);
  await expect(mdCell.locator('.cm-md-rule')).toHaveCount(1);

  // Undo/redo while rendered: append on the bottom anchor line while lines above render.
  await mdCell.locator('.cm-line').last().click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.type(' extra');
  await expect(mdEditor).toContainText('Anchor line extra');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(async () => (await mdEditor.innerText()).includes('extra')).toBe(false);
  await mdCell.locator('.cm-line').last().click();
  await expect(mdCell.locator('.cm-md-bullet')).toHaveCount(1);
  if (browserName !== 'webkit') {
    // WebKit native contenteditable historyRedo duplicates decorated live-Markdown lines
    // when Edit mode lacks an editor Mod-Shift-z keybinding (#940).
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect.poll(async () => (await mdEditor.innerText()).includes('extra')).toBe(true);
    await mdCell.locator('.cm-line').last().click();
    await expect(mdCell.locator('.cm-md-bullet')).toHaveCount(1);
    await page.keyboard.press('ControlOrMeta+z');
    await expect.poll(async () => (await mdEditor.innerText()).includes('extra')).toBe(false);
  }

  // Inactive rendered lines hide raw Markdown syntax delimiters.
  const renderedLineTexts = await mdCell
    .locator('.cm-line')
    .evaluateAll(lines => lines.map(l => l.textContent ?? ''));
  expect(renderedLineTexts[0]).toBe('Galilean Moons');
  expect(renderedLineTexts[1]).toBe('See Europa and Io with ice()');

  // Toggle OFF via Command Palette -> reveals raw Markdown markers everywhere.
  await runPaletteCommand(page, 'Show or Hide Live Markdown Preview');
  await expect(mdEditor).not.toHaveClass(/cm-md-live/);
  await expect(mdCell.locator('.cm-md-h1')).toHaveCount(0);
  const rawOffTexts = await mdCell
    .locator('.cm-line')
    .evaluateAll(lines => lines.map(l => l.textContent ?? ''));
  expect(rawOffTexts[0]).toBe('# Galilean Moons');

  // Toggle back ON via Command Palette.
  await runPaletteCommand(page, 'Show or Hide Live Markdown Preview');
  await expect(mdEditor).toHaveClass(/cm-md-live/);
  await mdCell.locator('.cm-line').last().click();
  await expect(mdCell.locator('.cm-md-h1')).toHaveText('Galilean Moons');

  // Multi-line selection across rendered lines reveals raw Markdown (#273).
  await mdCell.locator('.cm-line').nth(1).click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
  await page.keyboard.press(
    process.platform === 'darwin' ? 'Shift+Meta+ArrowUp' : 'Shift+Control+Home',
  );
  const selectedRawTexts = await mdCell
    .locator('.cm-line')
    .evaluateAll(lines => lines.map(l => l.textContent ?? ''));
  expect(selectedRawTexts[0]).toBe('# Galilean Moons');
  expect(selectedRawTexts[1]).toBe('See **Europa** and *Io* with `ice()`');
  // Unselected line below stays rendered while selection reveals lines 0..1.
  await expect(mdCell.locator('.cm-md-bullet')).toHaveCount(1);

  // Copying rendered/selected Markdown puts raw Markdown on the clipboard.
  await page.keyboard.press('ControlOrMeta+c');
  const firstCodeEditor = page.locator('.jp-CodeCell .cm-content').first();
  await firstCodeEditor.click();
  await page.keyboard.press('ControlOrMeta+v');
  await expect(firstCodeEditor).toContainText('# Galilean Moons');
  await expect(firstCodeEditor).toContainText('See **Europa** and *Io* with `ice()`');

  // Also copy a single line directly and verify raw Markdown is copied.
  await mdCell.locator('.cm-line').nth(1).click();
  const lineStartKey = process.platform === 'darwin' ? 'Meta+ArrowLeft' : 'Home';
  const selectLineEndKey = process.platform === 'darwin' ? 'Shift+Meta+ArrowRight' : 'Shift+End';
  await page.keyboard.press(lineStartKey);
  await page.keyboard.press(selectLineEndKey);
  await page.keyboard.press('ControlOrMeta+c');

  await firstCodeEditor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('ControlOrMeta+v');
  await expect
    .poll(async () => (await firstCodeEditor.innerText()).trim())
    .toBe('See **Europa** and *Io* with `ice()`');

  // Save and reload -> file text on server and in reopened editor stays exact raw Markdown.
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(async () => {
      const content = await readServerContents(request, 'Untitled.ipynb');
      if (typeof content !== 'object' || content === null || !('cells' in content)) return '';
      const cells = (content as { cells: Array<{ cell_type?: string; source?: unknown }> }).cells;
      const md = cells.find(c => c.cell_type === 'markdown');
      if (!md) return '';
      return Array.isArray(md.source) ? md.source.join('') : String(md.source ?? '');
    })
    .toBe(MARKDOWN_SAMPLE);

  await page.reload();
  await openWithToken(page);
  await openNotebook(page, 'Untitled.ipynb');
  await expect(page.locator('.jp-MarkdownCell .cm-content')).toHaveClass(/cm-md-live/);
  await runPaletteCommand(page, 'Show or Hide Live Markdown Preview');
  const afterReloadLines = await page
    .locator('.jp-MarkdownCell .cm-line')
    .evaluateAll(lines => lines.map(l => l.textContent ?? ''));
  expect(afterReloadLines.join('\n')).toBe(MARKDOWN_SAMPLE);
});

test('renders dark/light color schemes and Markdown font choices (system, serif, mono) alongside code font (#672)', async ({
  page,
}) => {
  await openNewServerNotebook(page);
  await page.locator('.jp-Cell .cm-content').first().click();
  await runPaletteCommand(page, 'Insert Markdown Cell');

  const mdCell = page.locator('.jp-MarkdownCell');
  const mdEditor = mdCell.locator('.cm-content');
  await mdEditor.click();
  if (!(await mdEditor.evaluate(el => el.classList.contains('cm-md-live')))) {
    await runPaletteCommand(page, 'Show or Hide Live Markdown Preview');
  }
  await page.keyboard.insertText('# Orbit\nInline `codeSpan()` text\nAnchor');
  await expect(mdCell.locator('.cm-md-code')).toHaveText('codeSpan()');

  // Switch Markdown font across system, serif, mono and inspect computed font families.
  const readFonts = () =>
    mdCell.evaluate(cell => {
      const editor = cell.querySelector('.cm-content.cm-md-live');
      const code = cell.querySelector('.cm-md-live .cm-md-code');
      return {
        cssVar: document.documentElement.style.getPropertyValue('--markdown-font').trim(),
        proseFont: editor ? getComputedStyle(editor).fontFamily : '',
        codeFont: code ? getComputedStyle(code).fontFamily : '',
      };
    });

  const setMarkdownFont = async (choice: 'system' | 'serif' | 'mono') => {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByLabel('Markdown font').selectOption(choice);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
  };

  await setMarkdownFont('serif');
  const serifFonts = await readFonts();
  expect(serifFonts.cssVar).toContain('Iowan Old Style');
  expect(serifFonts.proseFont).toMatch(/Iowan Old Style|Georgia|serif/i);
  expect(serifFonts.codeFont).not.toBe(serifFonts.proseFont);

  await setMarkdownFont('mono');
  const monoFonts = await readFonts();
  expect(monoFonts.cssVar).toContain('--code-font');
  expect(monoFonts.proseFont).toBe(monoFonts.codeFont);

  await setMarkdownFont('system');
  const systemFonts = await readFonts();
  expect(systemFonts.cssVar).toBe('');
  expect(systemFonts.proseFont).not.toBe(systemFonts.codeFont);

  // Dark & light theme rendering checks.
  const readThemeColors = () =>
    page.evaluate(() => {
      const surface = document.querySelector('.main') ?? document.body;
      const prose = document.querySelector('.cm-content.cm-md-live');
      const parseRgb = (css: string): [number, number, number] => {
        const m = css.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
        return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
      };
      const luminance = (rgb: [number, number, number]) =>
        (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      return {
        themeName: document.body.dataset.jpThemeName ?? '',
        bgLum: luminance(parseRgb(getComputedStyle(surface).backgroundColor)),
        fgLum: prose ? luminance(parseRgb(getComputedStyle(prose).color)) : -1,
      };
    });

  await page.emulateMedia({ colorScheme: 'dark' });
  await expect.poll(async () => (await readThemeColors()).themeName).toBe('JupyterLab Dark');
  const darkColors = await readThemeColors();
  expect(darkColors.bgLum).toBeLessThan(0.25);
  expect(darkColors.fgLum).toBeGreaterThan(0.6);

  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(async () => (await readThemeColors()).themeName).toBe('JupyterLab Light');
  const lightColors = await readThemeColors();
  expect(lightColors.bgLum).toBeGreaterThan(0.75);
  expect(lightColors.fgLum).toBeLessThan(0.35);
});
