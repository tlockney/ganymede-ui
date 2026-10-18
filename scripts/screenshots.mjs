// Drive the built app against a running Ganymede and save screenshots.
// Usage: node scripts/screenshots.mjs <base-url> <token> <out-dir> [light|dark]
import { chromium } from 'playwright';

const [base = 'http://localhost:4173', token = 'test', out = '.', scheme = 'light'] =
  process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1280, height: 820 },
  deviceScaleFactor: 2,
  colorScheme: scheme,
});
page.on('console', m => ['error','warning'].includes(m.type()) && console.log('console:', m.text().slice(0,300)));
page.on('pageerror', e => console.log('pageerror:', e.message));

await page.goto(`${base}/?token=${token}`);
await page.getByText('Galilean moons').first().waitFor({ timeout: 30000 });
await page.screenshot({ path: `${out}/empty-${scheme}.png` });

await page.getByText('Galilean moons').first().click();
await page.locator('.jp-Cell').first().waitFor({ timeout: 30000 });
await page.locator('.subtitle', { hasText: 'Idle' }).waitFor({ timeout: 30000 });
await page.getByTitle('Run All').click();
await page.locator('.jp-OutputArea-output', { hasText: 'largest moon' }).waitFor({ timeout: 30000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/notebook-${scheme}.png` });

// Save, and check the title drops "Edited".
await page.keyboard.press('ControlOrMeta+s');
await page.locator('.title .edited').waitFor({ state: 'detached', timeout: 10000 });

// Switch to the in-browser backend and run JavaScript in a Web Worker.
await page.locator('.backend-chip').click();
await page.getByRole('radio', { name: /This browser/ }).click();
await page.getByRole('button', { name: 'Connect', exact: true }).click();
await page.locator('.chip-title', { hasText: 'This browser' }).waitFor({ timeout: 60000 });
await page.getByRole('button', { name: 'New Notebook' }).first().click();
await page.locator('.jp-Cell').first().waitFor({ timeout: 60000 });
await page.locator('.subtitle', { hasText: 'Idle' }).waitFor({ timeout: 60000 });
await page.locator('.jp-Cell .cm-content').first().click();
await page.keyboard.type('const moons = ["Io", "Europa", "Ganymede", "Callisto"];\nmoons.map(m => m.toUpperCase()).join(" · ")');
await page.keyboard.press('Shift+Enter');
await page.locator('.jp-OutputArea-output', { hasText: 'GANYMEDE' }).waitFor({ timeout: 60000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/browser-kernel-${scheme}.png` });
await browser.close();
