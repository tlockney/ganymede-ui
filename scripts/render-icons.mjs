// Render public/icons/icon.svg to the PNG sizes the manifest, iOS web
// clips, and the iPad and iPhone app need.
// Usage: node scripts/render-icons.mjs  (needs Playwright's Chromium)
/* global Image, document -- page.evaluate runs in the browser */
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';

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

// The iPad and iPhone app's icon, full bleed like apple-touch-icon.png.
// App Store Connect rejects an icon with an alpha channel, and Chromium's
// screenshots always have one, so the pixels are drawn on a canvas and
// written here as an RGB PNG.
const size = 1024;
const rgba = await page.evaluate(
  async ({ svg, size }) => {
    const img = new Image();
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1a2244';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, -size * 0.12, -size * 0.12, size * 1.24, size * 1.24);
    return Array.from(ctx.getImageData(0, 0, size, size).data);
  },
  { svg, size },
);
await browser.close();
const rows = Buffer.alloc(size * (1 + size * 3));
for (let y = 0; y < size; y++) {
  const row = y * (1 + size * 3); // filter byte 0, then RGB
  for (let x = 0; x < size; x++) {
    for (let c = 0; c < 3; c++) rows[row + 1 + x * 3 + c] = rgba[(y * size + x) * 4 + c];
  }
}
const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // RGB, no alpha
await writeFile(
  new URL(
    '../apple/Resources/iOS/Assets.xcassets/AppIcon.appiconset/icon-1024.png',
    import.meta.url,
  ),
  Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]),
);
