import type { ICodeCellModel } from '@jupyterlab/cells';
import type * as nbformat from '@jupyterlab/nbformat';
import type { INotebookModel } from '@jupyterlab/notebook';
import { rejoinOutput } from './rejoin-lines';

/**
 * Whether any code cell has outputs that render as untrusted (sanitized
 * HTML, no JavaScript): loaded from a file that wasn't signed, and not run
 * since. Cells without outputs have nothing to hide.
 */
export function hasUntrustedOutputs(model: INotebookModel): boolean {
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    if (cell.type === 'code' && !cell.trusted && (cell as ICodeCellModel).outputs.length > 0) {
      return true;
    }
  }
  return false;
}

/** JSON with each object's keys sorted, so key order doesn't matter. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter(k => o[k] !== undefined)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** An output as a notebook file holds it: lines joined, `transient` dropped. */
function asSaved(output: nbformat.IOutput): string {
  // `transient` (a display id) is never saved: nbformat strips it on read.
  const { transient: _, ...rest } = structuredClone(output) as nbformat.IOutput & {
    transient?: unknown;
  };
  return canonical(rejoinOutput(rest as nbformat.IOutput));
}

/**
 * Whether a cell's live outputs are the ones a file holds for it (#793):
 * the same outputs in the same order, with the same values, whatever the
 * key order or the split of multi-line strings into lines. Trust read from
 * a file belongs to the outputs it was signed with, not to the cell.
 */
export function sameOutputs(live: nbformat.IOutput[], saved: nbformat.IOutput[]): boolean {
  return live.length === saved.length && live.every((o, i) => asSaved(o) === asSaved(saved[i]));
}
