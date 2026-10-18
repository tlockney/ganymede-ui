import type { ICodeCellModel } from '@jupyterlab/cells';
import type { INotebookModel } from '@jupyterlab/notebook';

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
