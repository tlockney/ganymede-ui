// Keeps docs/device.md's method table in step with ganymede-device's
// SUPPORT matrix (src/support.ts there): the table and its notes between
// the device-table markers are what `supportTable()` renders, formatted
// with Prettier. `npm run check` fails when they differ; run
// `node scripts/device-table.mjs --write` after bumping ganymede-device.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { supportTable } from '@tlockney/ganymede-device';
import prettier from 'prettier';

const file = new URL('../docs/device.md', import.meta.url);
const start = '<!-- device-table:start (generated: node scripts/device-table.mjs --write) -->';
const end = '<!-- device-table:end -->';

const text = readFileSync(file, 'utf8');
const from = text.indexOf(start);
const to = text.indexOf(end);
if (from < 0 || to < from) {
  console.error(`docs/device.md: missing the ${start} ... ${end} markers`);
  process.exit(1);
}
const options = (await prettier.resolveConfig(fileURLToPath(file))) ?? {};
const table = (await prettier.format(supportTable(), { ...options, parser: 'markdown' })).trimEnd();
const next = `${text.slice(0, from)}${start}\n\n${table}\n\n${text.slice(to)}`;

if (next === text) process.exit(0);
if (process.argv.includes('--write')) {
  writeFileSync(file, next);
  console.log('docs/device.md: method table updated');
} else {
  console.error(
    "docs/device.md: the method table differs from ganymede-device's SUPPORT; run node scripts/device-table.mjs --write",
  );
  process.exit(1);
}
