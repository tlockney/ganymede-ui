import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { serverGet } from './server-request';

/**
 * Exporting a notebook as Markdown or a script (#582), as JupyterLab's
 * Save and Export Notebook As does: the server's
 * `GET /nbconvert/{format}/{path}`. Markdown with images comes back as a
 * zip of the text and the images. Like Download Notebook, the export is
 * the notebook's own text, not redacted.
 */
export type ExportFormat = 'markdown' | 'script';

export const EXPORT_FORMATS: readonly ExportFormat[] = ['markdown', 'script'];

/** The menu's name for each format. */
export const EXPORT_LABELS: Record<ExportFormat, string> = {
  markdown: 'Export as Markdown',
  script: 'Export as Script',
};

/** The export's URL under `baseUrl`, as a download. */
export function exportUrl(baseUrl: string, path: string, format: ExportFormat): string {
  return `${URLExt.join(baseUrl, 'nbconvert', format, URLExt.encodeParts(path))}?download=true`;
}

/**
 * The file name a `Content-Disposition` header gives: `filename*=utf-8''…`
 * (Ganymede) or `filename="…"` (jupyter_server); `fallback` without one.
 */
export function attachmentName(header: string | null, fallback: string): string {
  let raw: string | undefined;
  const star = header?.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
  if (star) {
    try {
      raw = decodeURIComponent(star[1]!.trim());
    } catch {
      // Not percent-encoded as it says: try the plain one.
    }
  }
  if (raw === undefined) {
    const plain = header?.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
    raw = plain?.[1] ?? plain?.[2];
  }
  // Only a name, never a path.
  const name = raw?.split(/[\\/]/).pop()?.trim();
  return name && name !== '.' && name !== '..' ? name : fallback;
}

/** The exported file: its name and contents, from the server. */
export async function fetchExport(
  settings: ServerConnection.ISettings,
  path: string,
  format: ExportFormat,
): Promise<{ name: string; data: Blob }> {
  const base = (path.split('/').pop() ?? path).replace(/\.ipynb$/i, '');
  const fallback = `${base}${format === 'markdown' ? '.md' : '.txt'}`;
  // The menu waits on it: the request times out.
  return serverGet(settings, exportUrl(settings.baseUrl, path, format), async res => ({
    name: attachmentName(res.headers.get('content-disposition'), fallback),
    data: await res.blob(),
  }));
}
