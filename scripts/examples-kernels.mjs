#!/usr/bin/env node
/**
 * Runs each example notebook's cells on cdp-kernel's local kernels, the
 * ones Ganymede starts outside the apps (#558). `examples.mjs --run` covers
 * the apps' browser kernel; this covers the others.
 *
 *   node scripts/examples-kernels.mjs                    # every example, every kernel
 *   node scripts/examples-kernels.mjs -k cdp-node 04     # one kernel, examples with "04"
 *
 * It needs `ganymede` on PATH (or GANYMEDE set to it) and the kernelspecs
 * installed (`cdp-kernel install --runtime node`, ...). Each example runs
 * top to bottom on a fresh kernel with `ganymede run`, as the source's
 * cells: ```ts no-run cells are skipped, and a ```ts error cell must fail
 * while every other cell must not. Exits 1 on any other result.
 *
 * The notebooks are not changed: their saved outputs come from the
 * browser kernel.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sources } from './examples.mjs';

const KERNELS = ['cdp-node', 'cdp-deno', 'cdp-bun'];

const args = process.argv.slice(2);
const kernels = [];
let filter;
const usage = 'usage: node scripts/examples-kernels.mjs [-k KERNEL]... [FILTER]';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-k' || args[i] === '--kernel') {
    if (!args[i + 1]) throw new Error(usage);
    kernels.push(args[++i]);
  } else if (args[i].startsWith('-') || filter !== undefined) {
    throw new Error(usage);
  } else {
    filter = args[i];
  }
}
const ganymede = process.env.GANYMEDE || 'ganymede';

/** Per cell `{ status, ename, evalue }`, from `ganymede run --json`'s lines. */
function run(kernel, codes) {
  const dir = mkdtempSync(join(tmpdir(), 'examples-'));
  try {
    const files = codes.map((code, i) => {
      const path = join(dir, `cell-${i + 1}.ts`);
      writeFileSync(path, code);
      return path;
    });
    const res = spawnSync(
      ganymede,
      [
        '-q',
        'run',
        '-k',
        kernel,
        '--cwd',
        dir,
        '--json',
        '--keep-going',
        '--timeout',
        '180',
        ...files.flatMap(f => ['-f', f]),
      ],
      { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
    );
    if (res.error) throw res.error;
    const results = [];
    for (const line of res.stdout.split('\n')) {
      if (!line.startsWith('{')) continue;
      const r = JSON.parse(line);
      results[r.cell] = r;
    }
    if (!results.length)
      console.log(`    ${res.stderr.trim().split('\n').slice(-3).join('\n    ')}`);
    return results;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** What went wrong in each cell whose result isn't the one its fence asks for. */
function check(code, results) {
  const bad = [];
  code.forEach((c, i) => {
    const r = results[i];
    // An error cell must raise its error, not time out or lose its kernel.
    if (c.error ? r?.status === 'error' : r?.status === 'ok') return;
    const errored = r?.status !== 'ok';
    const what = !r
      ? 'did not run'
      : errored
        ? `${r.ename ?? r.status}: ${r.evalue ?? r.error ?? ''}`
        : 'should fail but did not';
    bad.push(`    cell ${i + 1} (${c.source.split('\n')[0]})\n      ${what}`);
  });
  return bad;
}

const selected = sources().filter(s => !filter || s.stem.includes(filter));
if (!selected.length) throw new Error(`No example matches "${filter}".`);

let failed = 0;
for (const kernel of kernels.length ? kernels : KERNELS) {
  console.log(kernel);
  for (const { stem, cells } of selected) {
    const code = cells.filter(c => c.cell_type === 'code' && c.run);
    if (!code.length) {
      console.log(`  - ${stem}: no cells to run`);
      continue;
    }
    // The examples fetch from public APIs, which sometimes refuse a
    // shared CI address (429): an example whose cells all finished but
    // failed gets one more run. One that timed out or lost its kernel
    // doesn't, so a hang can't double the job's time.
    const sourcesOf = code.map(c => c.source);
    const results = run(kernel, sourcesOf);
    let bad = check(code, results);
    const finished =
      results.length === code.length && results.every(r => r?.status !== 'incomplete');
    if (bad.length && finished) {
      console.log(`  … ${stem} failed; running it again`);
      bad = check(code, run(kernel, sourcesOf));
    }
    console.log(`  ${bad.length ? '✗' : '✓'} ${stem}${bad.length ? `\n${bad.join('\n')}` : ''}`);
    failed += bad.length ? 1 : 0;
  }
}
if (failed) {
  console.error(`${failed} example run(s) failed.`);
  process.exitCode = 1;
}
