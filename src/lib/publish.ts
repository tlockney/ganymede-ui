import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend } from './backends';

/**
 * Publishing a notebook as one self-contained web page (#563): the page
 * `ganymede nb publish` writes, from the server's
 * `/nbconvert/html/{path}` with the same options (ganymede#754). The
 * server makes the page, so it applies its own redactions (server
 * folder, home folder, token) and the app adds none of its own.
 */

/** How code shows in the page, as `nb publish --code`. */
export type CodeMode = 'folded' | 'shown' | 'hidden';

export type PublishOptions = {
  code: CodeMode;
  /** The line under the title; empty for none. */
  byline: string;
  /** The redacted notebook copy and its Download notebook button. */
  copy: boolean;
};

/**
 * Whether `backend` can publish: only a Ganymede server makes the page
 * with its redactions. A Jupyter server's `/nbconvert/html` is
 * nbconvert's page, which redacts nothing, and the in-browser server has
 * none.
 */
export function publishAvailable(backend: Backend | undefined): boolean {
  return backend?.config.kind === 'ganymede';
}

/** The date as the MCP tool's default byline writes it: `13 November 2026`. */
export function defaultByline(date = new Date()): string {
  const month = date.toLocaleString('en', { month: 'long' });
  return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

/**
 * The CLI's defaults: code folded, today's date, and the notebook copy
 * unless the code is hidden (the copy holds the code).
 */
export function defaultOptions(date = new Date()): PublishOptions {
  return { code: 'folded', byline: defaultByline(date), copy: true };
}

/** The page's URL under `baseUrl`, with every option spelled out. */
export function publishUrl(baseUrl: string, path: string, opts: PublishOptions): string {
  const query = new URLSearchParams({ code: opts.code, copy: String(opts.copy) });
  const byline = opts.byline.trim();
  if (byline) query.set('byline', byline);
  return `${URLExt.join(baseUrl, 'nbconvert/html', URLExt.encodeParts(path))}?${query}`;
}

/** `dir/My notebook.ipynb` → `My notebook.html`. */
export function pageName(path: string): string {
  const base = path.split('/').pop() ?? path;
  return `${base.replace(/\.ipynb$/i, '')}.html`;
}

/** The published page's HTML, from the server. */
export async function fetchPublished(
  backend: Backend,
  path: string,
  opts: PublishOptions,
): Promise<string> {
  const settings = backend.services.contents.serverSettings;
  // The sheet can't be cancelled while it waits, so a server that never
  // answers mustn't hold it open.
  let res: Response;
  try {
    res = await ServerConnection.makeRequest(
      publishUrl(settings.baseUrl, path, opts),
      { method: 'GET', signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS) },
      settings,
    );
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('The server didn’t answer in time.', { cause: e });
    }
    throw e;
  }
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
  const type = res.headers.get('content-type') ?? '';
  const page = type.startsWith('text/html') ? await res.text() : '';
  const head = page.slice(0, page.indexOf('</head>') + 1 || 2048);
  // Only Ganymede's page: not an app shell a static server answered with,
  // and not another exporter's, which redacts nothing.
  if (!head.includes(GENERATOR)) {
    throw new Error('This server can’t publish notebooks. It needs a newer Ganymede.');
  }
  // A server that ignored the options (Ganymede 0.10.0 and older) sends
  // the default page: code folded, so asking for hidden code would share
  // it. Only a page that names the mode asked for, and has the copy when
  // it was asked for, goes out.
  if (!head.includes(`<meta name="ganymede-code" content="${opts.code}">`)) {
    throw new Error(
      'This server publishes only with its default options. It needs a newer Ganymede.',
    );
  }
  if (opts.copy && !page.includes('<script type="application/json" id="notebook">')) {
    throw new Error('This server left out the notebook copy. It needs a newer Ganymede.');
  }
  return page;
}

/** How long the server gets to make the page. */
export const PUBLISH_TIMEOUT_MS = 120_000;

/** What Ganymede's page says made it, in its `<head>`. */
const GENERATOR = '<meta name="generator" content="Ganymede ';
