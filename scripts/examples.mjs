#!/usr/bin/env node
/* global window */
/**
 * Builds the example notebooks (#414) from their sources in `examples/src`.
 *
 * Each source is Markdown: a ```ts fence is a code cell, everything between
 * fences a Markdown cell. A line `<!-- cell -->` splits Markdown into two
 * cells. A fence written ```ts no-run is kept without outputs (a cell that
 * needs the app, such as one that calls `device`); one written ```ts error
 * is meant to fail, to show an error.
 *
 *   node scripts/examples.mjs           # sources to notebooks, keeping outputs
 *                                       # of cells whose source is unchanged
 *   node scripts/examples.mjs --run     # also run every notebook for outputs
 *   node scripts/examples.mjs --run 03  # only notebooks whose name has "03"
 *   node scripts/examples.mjs --check   # fail if a notebook is out of date
 *
 * Set CHROMIUM to a Chromium binary when Playwright's own isn't installed.
 *
 * `--run` runs each notebook top to bottom on cdp-kernel's browser kernel, the
 * one the apps run, in headless Chromium, with network access, and saves what
 * each cell showed.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = join(root, 'examples/src');
const outDir = join(root, 'examples');

/** The kernelspec the notebooks ask for: the app's in-page kernel. */
const KERNELSPEC = {
  name: 'cdp-browser',
  display_name: 'TypeScript (cdp-kernel)',
  language: 'typescript',
};

/** A source's cells, as `{ cell_type, source, run }`. */
export function parseSource(text) {
  const cells = [];
  let markdown = [];
  const flush = () => {
    const source = markdown.join('\n').trim();
    if (source) cells.push({ cell_type: 'markdown', source });
    markdown = [];
  };
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const open = /^```ts(?: (no-run|error))?\s*$/.exec(lines[i]);
    if (open) {
      flush();
      const code = [];
      for (i++; i < lines.length && lines[i] !== '```'; i++) code.push(lines[i]);
      if (i >= lines.length) throw new Error('A ```ts fence is not closed.');
      cells.push({
        cell_type: 'code',
        source: code.join('\n'),
        run: open[1] !== 'no-run',
        error: open[1] === 'error',
      });
    } else if (lines[i].trim() === '<!-- cell -->') {
      flush();
    } else {
      markdown.push(lines[i]);
    }
  }
  flush();
  return cells;
}

/** nbformat's multiline string: lines, each but the last ending in \n. */
const multiline = s => s.split(/(?<=\n)/);

const cellId = (stem, i) => `${stem.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${i + 1}`;

/** The notebook for `stem`'s cells, with `outputs[i]` for each code cell. */
export function buildNotebook(stem, cells, outputs = [], widgets) {
  let count = 0;
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: KERNELSPEC,
      language_info: { name: 'typescript', file_extension: '.ts', mimetype: 'text/typescript' },
      ...(widgets ? { widgets } : {}),
    },
    cells: cells.map((c, i) => {
      const base = {
        id: cellId(stem, i),
        cell_type: c.cell_type,
        metadata: {},
        source: multiline(c.source),
      };
      if (c.cell_type !== 'code') return base;
      const out = outputs[i];
      return {
        ...base,
        execution_count: out ? ++count : null,
        outputs: out ?? [],
      };
    }),
  };
}

const sourceText = s => (Array.isArray(s) ? s.join('') : s);

/**
 * `stem`'s notebook from its source, keeping the outputs (and counts) of
 * code cells whose source is unchanged since the last run, and the saved
 * widget state.
 */
export function rebuild(stem, cells, path) {
  const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
  const nb = buildNotebook(stem, cells, [], old?.metadata?.widgets);
  // By source, not position, so adding or removing a cell keeps the rest.
  const saved = new Map();
  for (const was of old?.cells ?? []) {
    if (was.cell_type !== 'code') continue;
    const key = sourceText(was.source);
    saved.set(key, [...(saved.get(key) ?? []), was]);
  }
  nb.cells.forEach(cell => {
    if (cell.cell_type !== 'code') return;
    const was = saved.get(sourceText(cell.source))?.shift();
    if (!was) return;
    cell.execution_count = was.execution_count;
    cell.outputs = was.outputs;
  });
  return nb;
}

export const serialize = nb => JSON.stringify(nb, null, 1) + '\n';

/** Sources, as `{ stem, cells }`, in name order. */
export function sources() {
  return readdirSync(srcDir)
    .filter(f => f.endsWith('.md'))
    .sort()
    .map(f => ({
      stem: f.replace(/\.md$/, ''),
      cells: parseSource(readFileSync(join(srcDir, f), 'utf8')),
    }));
}

/**
 * The notebook's file name: the source's number and its first heading, as
 * `01 Start Here.ipynb`, so the folder lists them in order.
 */
export function notebookName(stem, cells) {
  const heading = /^# (.+)$/m.exec(cells[0]?.source ?? '');
  if (!heading) throw new Error(`${stem}: the first cell needs a "# Title" heading.`);
  return `${stem.slice(0, 2)} ${heading[1].replace(/[/:\\]/g, '-').trim()}.ipynb`;
}

// ---- Running ---------------------------------------------------------------

const PAGE = `<!doctype html><meta charset="utf-8"><script type="module">
import { startBrowserKernel } from "/kernel.js";
let kernel;
const header = (msg_type) => ({ msg_id: crypto.randomUUID(), msg_type, session: "examples", username: "", date: new Date().toISOString(), version: "5.3" });
window.start = () => { kernel = startBrowserKernel({ createWorker: () => new Worker("/worker.js", { type: "module" }) }); };
window.stop = () => kernel?.send("control", { header: header("shutdown_request"), parent_header: {}, metadata: {}, content: { restart: false } });
/** Runs code; resolves to its iopub messages, in order, once the kernel is idle again. */
window.run = (code, timeoutMs) => new Promise((done) => {
  const msg = { header: header("execute_request"), parent_header: {}, metadata: {}, content: { code, silent: false, store_history: true, allow_stdin: false, stop_on_error: true } };
  const id = msg.header.msg_id;
  const seen = [];
  let replied = false, idle = false;
  const finish = () => { stop(); clearTimeout(timer); done(seen); };
  const timer = setTimeout(() => { seen.push({ msg_type: "timeout", content: {} }); finish(); }, timeoutMs);
  const stop = kernel.onMessage((channel, m) => {
    if (m.parent_header?.msg_id !== id) {
      // Widget views send nothing here; updates to an earlier display still count.
      if (channel === "iopub" && m.header.msg_type === "update_display_data") seen.push({ msg_type: m.header.msg_type, content: m.content });
      return;
    }
    if (channel === "shell") replied = true;
    if (channel === "iopub") {
      if (m.header.msg_type === "status") { idle = m.content.execution_state === "idle"; }
      else seen.push({ msg_type: m.header.msg_type, content: m.content, buffers: (m.buffers ?? []).length });
    }
    if (replied && idle) finish();
  });
  kernel.send("shell", msg);
});
</script>`;

function serve() {
  const require = createRequire(import.meta.url);
  const dist = dirname(require.resolve('@tlockney/cdp-kernel/browser'));
  const files = {
    '/': ['text/html', () => PAGE],
    '/kernel.js': ['text/javascript', () => readFileSync(join(dist, 'kernel.js'))],
    '/worker.js': ['text/javascript', () => readFileSync(join(dist, 'worker.js'))],
  };
  const server = createServer((req, res) => {
    const file = files[new URL(req.url, 'http://x').pathname];
    if (!file) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': file[0] }).end(file[1]());
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

const WIDGET_STATE = 'application/vnd.jupyter.widget-state+json';

/**
 * Widget models the cells opened (ipywidgets' comm protocol), kept as
 * `metadata.widgets` keeps them, so the saved notebook shows its widgets
 * before a kernel runs.
 */
export function widgetCollector() {
  const models = new Map();
  return {
    message(msgType, content) {
      if (msgType === 'comm_open' && content.target_name === 'jupyter.widget') {
        const state = content.data?.state ?? {};
        models.set(content.comm_id, state);
      } else if (msgType === 'comm_msg' && content.data?.method === 'update') {
        const state = models.get(content.comm_id);
        if (state) Object.assign(state, content.data.state);
      }
    },
    metadata() {
      if (!models.size) return undefined;
      const state = {};
      for (const [id, s] of models) {
        // anywidget models (jupyter.widget) carry their view as code; leave
        // them out, as nothing in the app draws them.
        if (s._model_module === 'anywidget') continue;
        state[id] = {
          model_name: s._model_name,
          model_module: s._model_module,
          model_module_version: s._model_module_version,
          state: s,
        };
      }
      return Object.keys(state).length
        ? { [WIDGET_STATE]: { version_major: 2, version_minor: 0, state } }
        : undefined;
    },
  };
}

/** iopub messages to nbformat outputs, as a frontend would keep them. */
export function toOutputs(messages, displays, widgetMessage = () => {}) {
  const outputs = [];
  let clearPending = false;
  const add = o => {
    if (clearPending) {
      outputs.length = 0;
      clearPending = false;
    }
    const last = outputs[outputs.length - 1];
    if (o.output_type === 'stream' && last?.output_type === 'stream' && last.name === o.name) {
      last.text += o.text;
    } else {
      outputs.push(o);
    }
  };
  for (const { msg_type, content } of messages) {
    switch (msg_type) {
      case 'stream':
        add({ output_type: 'stream', name: content.name, text: content.text });
        break;
      case 'display_data':
      case 'execute_result': {
        const o =
          msg_type === 'display_data'
            ? { output_type: 'display_data', data: content.data, metadata: content.metadata ?? {} }
            : {
                output_type: 'execute_result',
                execution_count: null,
                data: content.data,
                metadata: content.metadata ?? {},
              };
        add(o);
        const id = content.transient?.display_id;
        if (id) (displays.get(id) ?? displays.set(id, []).get(id)).push(o);
        break;
      }
      case 'update_display_data':
        for (const o of displays.get(content.transient?.display_id) ?? []) {
          o.data = content.data;
          o.metadata = content.metadata ?? {};
        }
        break;
      case 'clear_output':
        if (content.wait) clearPending = true;
        else outputs.length = 0;
        break;
      case 'error':
        add({
          output_type: 'error',
          ename: content.ename,
          evalue: content.evalue,
          // Not the build's own server: http://127.0.0.1:PORT/worker.js -> worker.js.
          traceback: content.traceback.map(line =>
            line.replace(/https?:\/\/(127\.0\.0\.1|localhost):\d+\//g, ''),
          ),
        });
        break;
      case 'comm_open':
      case 'comm_msg':
        widgetMessage(msg_type, content);
        break;
      case 'timeout':
        throw new Error('The cell did not finish in time.');
    }
  }
  for (const o of outputs) {
    if (o.output_type === 'stream') o.text = multiline(o.text);
    if (o.data) {
      for (const [mime, v] of Object.entries(o.data)) {
        if (typeof v === 'string' && (mime.startsWith('text/') || mime === 'image/svg+xml'))
          o.data[mime] = multiline(v);
      }
    }
  }
  return outputs;
}

async function runAll(selected) {
  const { chromium } = await import('@playwright/test');
  const server = await serve();
  const url = `http://127.0.0.1:${server.address().port}/`;
  const proxy = process.env.HTTPS_PROXY
    ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1' }
    : undefined;
  // CHROMIUM: a Chromium other than the one this Playwright downloads.
  const browser = await chromium.launch({
    proxy,
    executablePath: process.env.CHROMIUM || undefined,
  });
  try {
    for (const { stem, cells } of selected) {
      const page = await browser.newPage();
      page.on('console', m => process.env.EXAMPLES_DEBUG && console.log(`  [page] ${m.text()}`));
      await page.goto(url);
      await page.waitForFunction(() => typeof window.start === 'function');
      await page.evaluate(() => window.start());
      console.log(`${stem}`);
      const displays = new Map();
      const widgets = widgetCollector();
      const outputs = [];
      for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (c.cell_type !== 'code' || !c.run) continue;
        const messages = await page.evaluate(
          ([code, t]) => window.run(code, t),
          [c.source, 120_000],
        );
        outputs[i] = toOutputs(messages, displays, widgets.message);
        const err = outputs[i].find(o => o.output_type === 'error');
        const first = c.source.split('\n')[0];
        console.log(
          `  ${!err === !c.error ? '✓' : '✗'} ${first}${err ? `\n    ${err.ename}: ${err.evalue}` : ''}`,
        );
        if (!err !== !c.error) process.exitCode = 1;
      }
      // execute_result counts follow the cells that ran.
      const nb = buildNotebook(stem, cells, outputs, widgets.metadata());
      for (const cell of nb.cells) {
        for (const o of cell.outputs ?? [])
          if (o.output_type === 'execute_result') o.execution_count = cell.execution_count;
      }
      writeFileSync(join(outDir, notebookName(stem, cells)), serialize(nb));
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const all = sources();
  if (args[0] === '--run') {
    const filter = args[1];
    await runAll(all.filter(s => !filter || s.stem.includes(filter)));
  } else {
    let stale = 0;
    for (const { stem, cells } of all) {
      const path = join(outDir, notebookName(stem, cells));
      const text = serialize(rebuild(stem, cells, path));
      const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
      if (text === current) continue;
      if (args[0] === '--check') {
        console.error(
          `${notebookName(stem, cells)} is out of date: run node scripts/examples.mjs --run ${stem.slice(0, 2)}`,
        );
        stale++;
      } else {
        writeFileSync(path, text);
        console.log(`wrote ${notebookName(stem, cells)}`);
      }
    }
    if (stale) process.exitCode = 1;
  }
}
