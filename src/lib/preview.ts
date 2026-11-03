/**
 * The Mac app's Quick Look preview of a notebook (#135): the app's own
 * notebook view, read-only, with no server and no kernel. The Quick Look
 * extension loads `preview.html` and calls `window.ganymedePreview.render`
 * with the file's text.
 *
 * Every code cell is untrusted, as the app shows a notebook from a file
 * nobody signed: HTML outputs sanitized, no JavaScript, SVG as an image.
 */
import type * as nbformat from '@jupyterlab/nbformat';
import { NotebookModel, type Notebook } from '@jupyterlab/notebook';
import { Widget } from '@lumino/widgets';
import { createNotebook, createStaticRendermime } from './jupyterlab';

export interface Preview {
  notebook: Notebook;
  /** How many cells the notebook has. */
  cells: number;
  dispose(): void;
}

/** Parses a notebook file, or throws with a message fit to show. */
export function parseNotebook(text: string): nbformat.INotebookContent {
  let content: unknown;
  try {
    content = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  const notebook = content as Partial<nbformat.INotebookContent> | null;
  if (!notebook || typeof notebook !== 'object' || !Array.isArray(notebook.cells)) {
    // nbformat 3 keeps its cells in worksheets; the server upgrades those
    // when the app opens them, the preview doesn't.
    throw new Error(
      typeof notebook?.nbformat === 'number' && notebook.nbformat < 4
        ? `Quick Look shows nbformat 4 notebooks; this one is nbformat ${notebook.nbformat}. Open it in Ganymede.`
        : 'This file is not a Jupyter notebook.',
    );
  }
  return rejoinLines(notebook as nbformat.INotebookContent);
}

/** Whether a MIME type's value is JSON, which is never split into lines. */
function isJSON(mime: string): boolean {
  return mime === 'application/json' || mime.endsWith('+json');
}

function joined(value: unknown): unknown {
  return Array.isArray(value) && value.every(v => typeof v === 'string') ? value.join('') : value;
}

function rejoinBundle(bundle: unknown): void {
  if (!bundle || typeof bundle !== 'object') return;
  const data = bundle as Record<string, unknown>;
  for (const mime of Object.keys(data)) if (!isJSON(mime)) data[mime] = joined(data[mime]);
}

/**
 * Joins the multiline strings nbformat stores as arrays of lines, as the
 * server's contents API does before the app sees a notebook (nbformat's
 * `rejoin_lines`). Rendered as they are, an SVG's lines come out joined by
 * commas and don't parse.
 */
export function rejoinLines(content: nbformat.INotebookContent): nbformat.INotebookContent {
  for (const cell of content.cells) {
    cell.source = joined(cell.source) as nbformat.MultilineString;
    if ('attachments' in cell && cell.attachments) {
      for (const bundle of Object.values(cell.attachments)) rejoinBundle(bundle);
    }
    if (cell.cell_type !== 'code' || !Array.isArray(cell.outputs)) continue;
    for (const output of cell.outputs as unknown as Record<string, unknown>[]) {
      if ('text' in output) output.text = joined(output.text);
      rejoinBundle(output.data);
    }
  }
  return content;
}

/** Renders the notebook in `text` into `host`, read-only and untrusted. */
export function renderPreview(host: HTMLElement, text: string): Preview {
  const content = parseNotebook(text);
  // A cell's trust is its `trusted` metadata (JupyterLab's notebook
  // trust writes it); without it the cell is untrusted. Set on the model
  // instead, before the cells are in the notebook, Yjs complains.
  for (const cell of content.cells) delete cell.metadata?.trusted;
  const model = new NotebookModel({ disableDocumentWideUndoRedo: true });
  model.fromJSON(content);

  const notebook = createNotebook(createStaticRendermime());
  notebook.model = model;
  Widget.attach(notebook, host);
  for (const cell of notebook.widgets) cell.readOnly = true;

  return {
    notebook,
    cells: model.cells.length,
    dispose() {
      notebook.dispose();
      model.dispose();
    },
  };
}
