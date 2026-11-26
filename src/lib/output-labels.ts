/**
 * Output hierarchy (#813): what an output is, before its text.
 *
 * - An error output gets an "Execution failed" label and its exception
 *   summary (`ename: evalue`) above the traceback, which is long and ends
 *   with that line. An interrupt says "Execution stopped": Jupyter's
 *   `KeyboardInterrupt`, or cdp-kernel's `Interrupted`.
 * - A `stderr` stream gets a "Warning" label.
 * - A long stream (a loop's prints, a training log) shows its last lines,
 *   with a "Log, N lines" label and a "View full log" button that opens
 *   all of it and "Show last lines" to go back.
 * - Under each cell's outputs, below a hairline, a meta line says what they
 *   are and how long the run took ("SVG · 38 ms"), or "saved output" for
 *   outputs that came from the file and that this page hasn't run (#852).
 * - A chart or table wider than the prose column goes wide: the class
 *   `gn-mod-wide` has jupyter.css span the pane with it, past the column
 *   on both sides, capped inside the pane. A stream never does (its text
 *   has no image or table to measure; it scrolls in its own box, #133).
 *
 * JupyterLab renders each output into a widget it replaces when a stream
 * grows, so the labels are plain DOM added to the rendered output and put
 * back whenever the cell's DOM changes: only the cell whose subtree changed
 * is looked at again. Each pass changes nothing when the labels are already
 * right, so it ends.
 */
import { type Cell, CodeCell } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { PartialJSONValue } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';
import type { RunStatus } from './run-status';

/** A stream longer than this many lines shows only its tail until opened. */
export const LOG_LINES = 20;

/** The class of an output wider than the prose column: jupyter.css spans
 * the pane with it, past the column on both sides (#814). */
export const WIDE = 'gn-mod-wide';

/** The gutter a wide output leaves around the pane it spans: the column's
 * own side padding (jupyter.css). `--gn-pane`, set on the notebook's scroll
 * area, is the pane's client width less this on each side. */
export const PANE_GUTTER = 32;

/** Slack (px) around the prose column, so a window resized onto the line
 * doesn't flip an output's class back and forth. */
export const WIDE_SLACK = 8;

const BAR = 'gn-output-bar';
const META = 'gn-output-meta';

type Options = {
  /**
   * The run queue: the time a run took is counted from it, and whether the
   * cell has run here says if its outputs are only what the file held.
   */
  runs: RunStatus;
};

export type OutputLabels = IDisposable & {
  /** Look again, for a change the notebook's DOM doesn't show (a kernel came or went). */
  refresh(): void;
};

/**
 * An error output from an interrupt: Jupyter's `KeyboardInterrupt`, or
 * cdp-kernel's `Interrupted` (`Execution interrupted`), as this app's own
 * kernels say it. Shared by the output label and the cell's run state.
 * The name's type is loose: an unrecognized output's fields are JSON.
 */
export function isInterrupt(ename: string | PartialJSONValue | undefined): boolean {
  return ename === 'KeyboardInterrupt' || ename === 'Interrupted';
}

/**
 * A stream's text, however it was saved: a string or a list of lines. The
 * output's type is loose: an unrecognized output's fields are JSON.
 */
export function streamText(output: nbformat.IStream | nbformat.IUnrecognizedOutput): string {
  return Array.isArray(output.text) ? output.text.join('') : String(output.text ?? '');
}

/**
 * The width of the column a cell's outputs sit in, past the prompt: the
 * output row's width, less a prompt beside it. Measured on the row rather
 * than the output, so it is the same however `gn-mod-wide` has the output
 * laid out. A prompt stacked above the output (JupyterLab's own narrow
 * layout) or hidden (the compact one) gives the output the row's whole
 * width: its width is the row's, or nothing.
 */
function columnOf(out: HTMLElement): number {
  const child = out.closest<HTMLElement>('.jp-OutputArea-child');
  const row = child?.clientWidth ?? out.clientWidth;
  const prompt = child?.querySelector<HTMLElement>('.jp-OutputPrompt');
  const side =
    prompt && prompt.clientWidth > 0 && prompt.clientWidth < row ? prompt.clientWidth : 0;
  return row - side;
}

/**
 * Whether an image or table `measure` px wide is past the `column` px prose
 * column (#814): past it with `WIDE_SLACK` it goes wide, back under it with
 * slack it stops, and in between it keeps the class it has, so a resize
 * that lands it on the line doesn't flip it back and forth. Nothing
 * measured — an image that hasn't loaded, or no image or table at all,
 * a stream — is never wide.
 */
export function pastColumn(measure: number, column: number, wide: boolean): boolean {
  if (measure <= 0) return false;
  return measure > column + WIDE_SLACK ? true : measure < column - WIDE_SLACK ? false : wide;
}

/**
 * What the label above one output says, or undefined for an output with none.
 * `counted` is the stream's line count when it was already taken, so a long
 * log isn't counted again on every pass.
 */
export function labelFor(
  output: nbformat.IOutput,
  counted?: number,
): { label: string; kind: string; summary?: string; lines?: number } | undefined {
  if (output.output_type === 'error') {
    const summary = `${output.ename}: ${output.evalue}`.replace(/\s+/g, ' ').trim();
    return isInterrupt(output.ename)
      ? { label: 'Execution stopped', kind: 'stopped', summary }
      : { label: 'Execution failed', kind: 'error', summary };
  }
  if (output.output_type === 'stream') {
    const lines = counted ?? streamText(output).replace(/\n$/, '').split('\n').length;
    return output.name === 'stderr'
      ? { label: 'Warning', kind: 'warning', lines }
      : // The bar of a collapsed log says what it holds, not just "…".
        { label: lines > LOG_LINES ? `Log, ${lines} lines` : '', kind: 'stream', lines };
  }
  return undefined;
}

/** One output's kind, as the meta line names it. */
function kindOf(output: nbformat.IOutput): string | undefined {
  if (output.output_type === 'stream') return output.name === 'stderr' ? 'Warning' : 'Text';
  if (output.output_type === 'error') return 'Error';
  const data = (output as nbformat.IDisplayData).data;
  if (!data) return undefined;
  if (data['image/svg+xml'] !== undefined) return 'SVG';
  if (data['image/png'] !== undefined || data['image/jpeg'] !== undefined) return 'Image';
  if (typeof data['text/html'] === 'string' && /<table[\s>]/i.test(data['text/html']))
    return 'Table';
  for (const [mime, kind] of [
    ['text/html', 'HTML'],
    ['text/markdown', 'Markdown'],
    ['application/json', 'JSON'],
    ['text/plain', 'Text'],
  ] as const)
    if (data[mime] !== undefined) return kind;
  return undefined;
}

/**
 * What a cell's outputs are made of, in the order they first appear:
 * "Text", "Image", "Text and table".
 */
export function outputKinds(outputs: readonly nbformat.IOutput[]): string[] {
  const kinds: string[] = [];
  for (const output of outputs) {
    const kind = kindOf(output);
    if (kind && !kinds.includes(kind)) kinds.push(kind);
  }
  return kinds;
}

/** How a run's time is written: "38 ms", "1.2 s", "18 s". */
export function formatOutputTime(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const rounded = Math.round(ms);
  if (rounded < 1000) return `${rounded} ms`;
  const seconds = rounded / 1000;
  return seconds < 10 ? `${Math.round(seconds * 10) / 10} s` : `${Math.round(seconds)} s`;
}

/**
 * What a cell's meta line says, or undefined for no line: "saved output" for
 * outputs that came from the file, else what they are and how long the run
 * took ("SVG · 38 ms"). The journal's cards list the kinds only, with no time.
 */
export function outputMetaText(
  outputs: readonly nbformat.IOutput[],
  { saved = false, ms }: { saved?: boolean; ms?: number } = {},
): string | undefined {
  if (outputs.length === 0) return undefined;
  const parts = saved
    ? ['saved output']
    : [...outputKinds(outputs), ...(ms === undefined ? [] : [formatOutputTime(ms)])];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function attachOutputLabels(notebook: Notebook, { runs }: Options): OutputLabels {
  let disposed = false;
  let scheduled = false;
  /** Output indexes a person opened to the full log, by cell model. */
  const opened = new WeakMap<object, Set<number>>();
  /** Stream line counts, by output model until its text's length changes. */
  const lineCounts = new WeakMap<object, { len: number; lines: number }>();
  /** Outputs lists already wired to forget `opened` when they are cleared. */
  const wired = new WeakSet<object>();
  /**
   * What each cell's meta line depends on (`phase|ran|time`), so a queue tick
   * looks at only the cells whose line would change (#852): a run starting,
   * a run finished, the first run of a cell whose outputs the file held.
   */
  const metaKeys = new Map<object, string>();
  /** Images already given a load listener, so it is given only once. */
  const loads = new WeakSet<HTMLImageElement>();
  /** Cells whose DOM changed, for the next pass to look at; `all` is all of them. */
  const dirty = new Set<CodeCell>();
  let all = false;

  /** A stream's line count, counted only when its text's length changed. */
  const countedLines = (item: object, output: nbformat.IStream | nbformat.IUnrecognizedOutput) => {
    const len = streamText(output).length;
    const hit = lineCounts.get(item);
    if (hit && hit.len === len) return hit.lines;
    const lines = streamText(output).replace(/\n$/, '').split('\n').length;
    lineCounts.set(item, { len, lines });
    return lines;
  };

  const decorateCell = (cell: CodeCell) => {
    const area = cell.outputArea;
    const model = cell.model.outputs;
    // A cleared output area is a re-run: what a person opened to the full
    // log belonged to the outputs that are gone, so a re-run opens at the
    // tail again. The signal, not the DOM, says it: the DOM may not change
    // between the clear and the first new output.
    if (!wired.has(model)) {
      wired.add(model);
      model.changed.connect(sender => {
        if (sender.length === 0) opened.delete(cell.model);
      });
    }
    // The run's time comes from the run queue (below), so it covers every
    // output the run made, and stops when the cell is idle again.
    // A cell's meta line: below its outputs, under a hairline, what they are
    // and how long the run took (#852). The time comes from the run queue,
    // so it covers every output the run made, not just one; a cell whose
    // outputs came from the file, and that this page hasn't run, says
    // "saved output" instead, with or without a kernel attached.
    const outputs = model.toJSON() as nbformat.IOutput[];
    let meta = area.node.querySelector<HTMLElement>(`:scope > .${META}`);
    const state = runs.stateOf(cell.model);
    const text = outputMetaText(outputs, {
      saved: !runs.hasRun(cell.model),
      // While the cell runs, the gutter counts the seconds; the meta line
      // has them once the run is done.
      ms: state ? undefined : runs.lastRun(cell.model),
    });
    if (text === undefined) meta?.remove();
    else {
      if (!meta) {
        meta = document.createElement('div');
        meta.className = META;
        area.node.append(meta);
      }
      if (meta.textContent !== text) meta.textContent = text;
      // Set or removed on every pass: the line says the same thing whatever
      // ran before (#852).
      const title = runs.hasRun(cell.model)
        ? ''
        : 'Saved with the notebook. Run the cell to replace it.';
      if (title) meta.title = title;
      else meta.removeAttribute('title');
    }

    for (let i = 0; i < model.length; i++) {
      const out = area.widgets[i]?.node.querySelector<HTMLElement>('.jp-OutputArea-output');
      if (!out) continue;
      const item = model.get(i);
      const json = item.toJSON();
      // Wide charts and tables (#814): an image's own width, or a table's
      // content, past the column the cell's outputs sit in, has jupyter.css
      // span the pane with the output, past the column on both sides, capped
      // inside the pane. An image that hasn't loaded yet is listened for
      // once, and decides then; a stream has no image or table to measure,
      // so it never goes wide. The class is kept within WIDE_SLACK of the
      // column, so a resize onto the line doesn't flip it back and forth.
      const images = [...out.querySelectorAll<HTMLImageElement>('img')];
      for (const image of images) {
        if (image.naturalWidth > 0 || loads.has(image)) continue;
        loads.add(image);
        image.addEventListener('load', rescan, { once: true });
      }
      out.classList.toggle(
        WIDE,
        pastColumn(
          Math.max(
            -1,
            ...images.map(image => image.naturalWidth),
            ...[...out.querySelectorAll<HTMLElement>('.gm-table-scroll table')].map(
              table => table.scrollWidth,
            ),
          ),
          columnOf(out),
          out.classList.contains(WIDE),
        ),
      );
      if (out.classList.contains(WIDE)) {
        // Where the span starts (#852): the card's left padding holds the run
        // gutter, so its row starts right of the pane's gutter, and a span
        // centred on the pane has to start left of the row. Measured, not
        // assumed: the pane's gutter (jupyter.css's 32px) is at the column's
        // left edge, wherever the card's padding has put the row.
        const row = out.parentElement?.getBoundingClientRect().left;
        if (row !== undefined && paneEl) {
          const left = `${Math.round(paneEl.getBoundingClientRect().left + PANE_GUTTER - row)}px`;
          if (out.style.getPropertyValue('--gn-wide-left') !== left) {
            out.style.setProperty('--gn-wide-left', left);
          }
        }
      }
      const info = labelFor(
        json,
        json.output_type === 'stream' ? countedLines(item, json) : undefined,
      );
      const open = opened.get(cell.model)?.has(i) ?? false;
      const long = (info?.lines ?? 0) > LOG_LINES;
      const key = info ? [info.kind, info.label, info.summary, long, open].join('|') : '';
      let bar = out.querySelector<HTMLElement>(`:scope > .${BAR}`);
      if (!info || (!info.label && !long)) {
        bar?.remove();
        out.classList.remove('gn-log-tail', 'gn-log-full');
        continue;
      }
      out.classList.toggle('gn-log-tail', long && !open);
      out.classList.toggle('gn-log-full', long && open);
      if (bar?.dataset.key !== key) {
        bar?.remove();
        bar = document.createElement('div');
        bar.className = BAR;
        bar.dataset.key = key;
        bar.dataset.kind = info.kind;
        bar.dataset.index = String(i);
        if (info.label) {
          const label = document.createElement('span');
          label.className = 'gn-output-label';
          label.textContent = info.label;
          bar.append(label);
        }
        if (info.summary) {
          const summary = document.createElement('span');
          summary.className = 'gn-output-summary';
          summary.textContent = info.summary;
          bar.append(summary);
        }
        if (long) {
          const toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.className = 'gn-output-toggle';
          toggle.dataset.gnOutput = 'log';
          toggle.textContent = open ? 'Show last lines' : 'View full log';
          toggle.setAttribute('aria-expanded', String(open));
          bar.append(toggle);
        }
        out.prepend(bar);
      }
      // The tail: a long log opens at its end, and follows it as it grows.
      if (long && !open) {
        const pre = out.querySelector<HTMLElement>('pre');
        const text = model.get(i).toJSON().text;
        const len = String(Array.isArray(text) ? text.join('').length : String(text ?? '').length);
        if (pre && pre.dataset.gnTail !== len) {
          pre.dataset.gnTail = len;
          pre.scrollTop = pre.scrollHeight;
        }
      }
    }
  };

  /** Look again at `everything`, at the cells whose DOM changed, or at all of them. */
  const scan = (everything = false) => {
    scheduled = false;
    const every = everything || all;
    all = false;
    if (disposed || notebook.isDisposed) {
      dirty.clear();
      return;
    }
    setPane();
    if (every) {
      dirty.clear();
      notebook.widgets.forEach((cell: Cell) => {
        if (cell instanceof CodeCell && !cell.isDisposed) decorateCell(cell);
      });
    } else {
      dirty.forEach(cell => {
        if (!cell.isDisposed) decorateCell(cell);
      });
      dirty.clear();
    }
  };
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => scan());
  };
  /** Look at every output again: an image loaded, or the window was resized
   *  and the column with it. */
  const rescan = () => {
    all = true;
    schedule();
  };

  // A change inside one cell puts only that cell back on the list; a change
  // at the notebook's own level (a cell added, removed or moved) puts them
  // all on it.
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const node = (
        record.target instanceof Element ? record.target : record.target.parentElement
      )?.closest('.jp-Cell');
      const cell = notebook.widgets.find(w => w.node === node);
      if (cell instanceof CodeCell && !cell.isDisposed) dirty.add(cell);
      else all = true;
    }
    schedule();
  });
  observer.observe(notebook.node, { childList: true, subtree: true });

  /**
   * A run starting or ending changes what a cell's meta line says, and a
   * cell's first run here takes "saved output" away: look again at those
   * cells, and only them (#852).
   */
  const onRuns = () => {
    for (const cell of notebook.widgets) {
      if (!(cell instanceof CodeCell) || cell.isDisposed) continue;
      const state = runs.stateOf(cell.model);
      const ran = runs.hasRun(cell.model);
      const key = `${state?.phase ?? ''}|${ran}|${ran && !state ? (runs.lastRun(cell.model) ?? '') : ''}`;
      if (metaKeys.get(cell.model) === key) continue;
      metaKeys.set(cell.model, key);
      dirty.add(cell);
      schedule();
    }
  };
  runs.changed.connect(onRuns);

  const onClick = (e: MouseEvent) => {
    const target = (e.target as Element | null)?.closest<HTMLElement>('[data-gn-output]');
    if (!target) return;
    const cellNode = target.closest('.jp-Cell');
    const cell = notebook.widgets.find(w => w.node === cellNode);
    const index = Number(target.closest<HTMLElement>(`.${BAR}`)?.dataset.index);
    if (!cell || Number.isNaN(index)) return;
    e.preventDefault();
    e.stopPropagation();
    const set = opened.get(cell.model) ?? new Set<number>();
    if (!set.delete(index)) set.add(index);
    opened.set(cell.model, set);
    scan(true);
  };
  // The notebook takes a press in a cell to select it or focus its editor.
  const onDown = (e: Event) => {
    if ((e.target as Element | null)?.closest('[data-gn-output]')) e.stopPropagation();
  };
  // A tap on the toggle focuses it, and the notebook takes that focus as a
  // tap on the cell: it makes the cell the active one while the tap is
  // still going, and the meta line the active cell then grows on a phone
  // (#813) moves the toggle under the finger, so the tap's click never
  // comes. The focus itself is wanted — it takes the editor's — so only
  // the notebook is kept from hearing of it.
  const onFocus = (e: Event) => {
    if ((e.target as Element | null)?.closest('[data-gn-output]')) e.stopPropagation();
  };
  notebook.node.addEventListener('click', onClick);
  notebook.node.addEventListener('mousedown', onDown, true);
  notebook.node.addEventListener('focusin', onFocus, true);
  // The pane a wide output spans (#814): the notebook's scroll area, whose
  // client width less `PANE_GUTTER` on each side is the span jupyter.css
  // gives it, as `--gn-pane`, kept by every scan. The window resizes it,
  // and so does the sidebar opening and closing over the notebook —
  // neither of which the notebook's own DOM shows — so the scroll area is
  // watched, not only the window's resize.
  const paneEl = notebook.node.querySelector<HTMLElement>('.jp-WindowedPanel-outer');
  const setPane = () => {
    if (!paneEl) return;
    paneEl.style.setProperty('--gn-pane', `${Math.max(paneEl.clientWidth - 2 * PANE_GUTTER, 0)}px`);
  };
  const paneMoved = new ResizeObserver(rescan);
  if (paneEl) paneMoved.observe(paneEl);

  // The column an output is measured against moves with the window.
  window.addEventListener('resize', rescan);
  scan(true);

  return {
    get isDisposed() {
      return disposed;
    },
    refresh: () => scan(true),
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      paneMoved.disconnect();
      runs.changed.disconnect(onRuns);
      window.removeEventListener('resize', rescan);
      notebook.node.removeEventListener('click', onClick);
      notebook.node.removeEventListener('mousedown', onDown, true);
      notebook.node.removeEventListener('focusin', onFocus, true);
    },
  };
}
