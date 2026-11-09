/**
 * nbformat's multiline strings, joined. A notebook file may store a
 * source, a stream's text or an output's value as an array of lines; the
 * server's contents API joins them (nbformat's `rejoin_lines`), but the
 * browser's storage hands the file over as it is.
 */
import type * as nbformat from '@jupyterlab/nbformat';

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
 * `rejoin_lines`). Rendered as they are, an SVG's or HTML output's lines
 * come out joined by commas, and an SVG with an XML prolog doesn't parse.
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
