import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import { PUBLISH_TIMEOUT_MS } from './publish';

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
  const star = header?.match(/filename\*\s*=\s*[^']*'[^']*'([^;]+)/i);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim());
    } catch {
      // Not percent-encoded as it says: try the plain one.
    }
  }
  const plain = header?.match(/filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/i);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  // Only a name, never a path.
  return name ? (name.split(/[\\/]/).pop() ?? fallback) : fallback;
}

/** The exported file: its name and contents, from the server. */
export async function fetchExport(
  settings: ServerConnection.ISettings,
  path: string,
  format: ExportFormat,
): Promise<{ name: string; data: Blob }> {
  // The menu waits on it, so a server that never answers mustn't hang it.
  // makeRequest rewraps a fetch rejection, so the signal tells a timeout.
  const signal = AbortSignal.timeout(PUBLISH_TIMEOUT_MS);
  try {
    const res = await ServerConnection.makeRequest(
      exportUrl(settings.baseUrl, path, format),
      { method: 'GET', signal },
      settings,
    );
    if (!res.ok) {
      let message = `The server answered ${res.status}.`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) message = body.message;
      } catch {
        // Not JSON: keep the status.
      }
      throw new Error(message);
    }
    const base = (path.split('/').pop() ?? path).replace(/\.ipynb$/i, '');
    const fallback = `${base}${format === 'markdown' ? '.md' : '.txt'}`;
    const name = attachmentName(res.headers.get('content-disposition'), fallback);
    return { name, data: await res.blob() };
  } catch (e) {
    if (signal.aborted && (signal.reason as Error | undefined)?.name === 'TimeoutError') {
      throw new Error('The server didn’t answer in time.', { cause: e });
    }
    throw e;
  }
}
