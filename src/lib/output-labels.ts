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
 * - Outputs with no kernel to have made them say "Saved output".
 *
 * JupyterLab renders each output into a widget it replaces when a stream
 * grows, so the labels are plain DOM added to the rendered output and put
 * back whenever the notebook's DOM changes. Each pass changes nothing when
 * the labels are already right, so it ends.
 */
import { type Cell, CodeCell } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { PartialJSONValue } from '@lumino/coreutils';
import type { IDisposable } from '@lumino/disposable';

/** A stream longer than this many lines shows only its tail until opened. */
export const LOG_LINES = 20;

const BAR = 'gn-output-bar';
const SAVED = 'gn-saved-output';

type Options = {
  /** Whether a kernel is attached: without one, outputs are only what was saved. */
  hasKernel(): boolean;
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

/** What the label above one output says, or undefined for an output with none. */
export function labelFor(
  output: nbformat.IOutput,
): { label: string; kind: string; summary?: string; lines?: number } | undefined {
  if (output.output_type === 'error') {
    const summary = `${output.ename}: ${output.evalue}`.replace(/\s+/g, ' ').trim();
    return isInterrupt(output.ename)
      ? { label: 'Execution stopped', kind: 'stopped', summary }
      : { label: 'Execution failed', kind: 'error', summary };
  }
  if (output.output_type === 'stream') {
    const lines = streamText(output).replace(/\n$/, '').split('\n').length;
    return output.name === 'stderr'
      ? { label: 'Warning', kind: 'warning', lines }
      : // The bar of a collapsed log says what it holds, not just "…".
        { label: lines > LOG_LINES ? `Log, ${lines} lines` : '', kind: 'stream', lines };
  }
  return undefined;
}

export function attachOutputLabels(notebook: Notebook, { hasKernel }: Options): OutputLabels {
  let disposed = false;
  let scheduled = false;
  /** Output indexes a person opened to the full log, by cell model. */
  const opened = new WeakMap<object, Set<number>>();
  /** Outputs lists already wired to forget `opened` when they are cleared. */
  const wired = new WeakSet<object>();

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
    // Saved output: shown once above the cell's outputs.
    let saved = area.node.querySelector<HTMLElement>(`:scope > .${SAVED}`);
    if (!hasKernel() && model.length > 0) {
      if (!saved) {
        saved = document.createElement('div');
        saved.className = SAVED;
        saved.textContent = 'Saved output';
        saved.title = 'Saved with the notebook. Run the cell to replace it.';
        area.node.prepend(saved);
      }
    } else saved?.remove();

    for (let i = 0; i < model.length; i++) {
      const out = area.widgets[i]?.node.querySelector<HTMLElement>('.jp-OutputArea-output');
      if (!out) continue;
      const info = labelFor(model.get(i).toJSON());
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

  const scan = () => {
    scheduled = false;
    if (disposed || notebook.isDisposed) return;
    notebook.widgets.forEach((cell: Cell) => {
      if (cell instanceof CodeCell && !cell.isDisposed) decorateCell(cell);
    });
  };
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(scan);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(notebook.node, { childList: true, subtree: true });

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
    scan();
  };
  // The notebook takes a press in a cell to select it or focus its editor.
  const onDown = (e: Event) => {
    if ((e.target as Element | null)?.closest('[data-gn-output]')) e.stopPropagation();
  };
  notebook.node.addEventListener('click', onClick);
  notebook.node.addEventListener('mousedown', onDown, true);
  notebook.node.addEventListener('pointerdown', onDown, true);
  scan();

  return {
    get isDisposed() {
      return disposed;
    },
    refresh: scan,
    dispose() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      notebook.node.removeEventListener('click', onClick);
      notebook.node.removeEventListener('mousedown', onDown, true);
      notebook.node.removeEventListener('pointerdown', onDown, true);
    },
  };
}
