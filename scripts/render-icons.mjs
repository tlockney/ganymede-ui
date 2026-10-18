// Render public/icons/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/render-icons.mjs  (needs Playwright's Chromium)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const svg = await readFile(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  // iOS masks its own corners and wants a full-bleed square.
  ['apple-touch-icon.png', 180, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  const body = pad
    ? `<div style="width:${size}px;height:${size}px;background:#1a2244;overflow:hidden"><div style="width:${size * 1.24}px;height:${size * 1.24}px;margin:${-size * 0.12}px">${svg}</div></div>`
    : svg;
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{width:100%;height:100%;display:block}</style>${body}`,
  );
  await page.screenshot({
    path: new URL(`../public/icons/${name}`, import.meta.url).pathname,
    omitBackground: true,
  });
}
await browser.close();
