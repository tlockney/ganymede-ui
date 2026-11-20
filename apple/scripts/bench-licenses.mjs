// Prints the license notices of the npm packages esbuild bundles into the
// engine benchmark's dist/strip-bundle.js (#698), for
// Resources/Bench/dist/LICENSES.txt. update-bench.sh runs it after the
// spike's `npm ci`; it reads the packages from the spike's node_modules.
//   node apple/scripts/bench-licenses.mjs <ganymede>/spikes/v8-engine/bench
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const spike = process.argv[2];
if (!spike) {
  console.error('usage: bench-licenses.mjs <spike bench folder>');
  process.exit(1);
}
const require = createRequire(join(spike, 'package.json'));
const { build } = require('esbuild');

// The same options as the spike's build.mjs, with a metafile instead of
// output, so the list is what the bundle was built from.
const result = await build({
  absWorkingDir: spike,
  entryPoints: ['src/strip-entry.js'],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2022',
  metafile: true,
  logLevel: 'error',
});

const packages = new Set();
for (const input of Object.keys(result.metafile.inputs)) {
  const match = input.match(/node_modules\/((?:@[^/]+\/)?[^/]+)\//);
  if (match) packages.add(match[1]);
}

const parts = [
  'Third-party code in strip-bundle.js (sucrase and acorn, with their',
  "dependencies), bundled by esbuild from ganymede's spikes/v8-engine/bench.",
  '',
];
for (const name of [...packages].sort()) {
  const dir = join(spike, 'node_modules', name);
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find(f => /^(licen[cs]e|copying)/i.test(f));
  if (!file) throw new Error(`${name} has no license file`);
  parts.push('='.repeat(72), `${name} ${pkg.version} (${pkg.license})`, '='.repeat(72), '');
  parts.push(readFileSync(join(dir, file), 'utf8').trimEnd(), '');
}
process.stdout.write(parts.join('\n'));
