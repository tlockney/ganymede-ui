import { URLExt } from '@jupyterlab/coreutils';
import { ServerConnection } from '@jupyterlab/services';
import type { Backend } from './backends';

/**
 * Run with Parameters (#582): Ganymede's `POST /api/notebooks/run`, the
 * run contract over HTTP (`ganymede execute -p --results`). The server
 * runs the notebook top to bottom in a new kernel of its own, with the
 * parameters in `GANYMEDE_PARAMS` (`jupyter.params`), and answers with
 * its named results. It reads the notebook from its room, so unsaved
 * edits run, and writes neither the notebook nor the room.
 */
export type RunAnswer = {
  status: 'ok' | 'error';
  /** The named results the run published, by name. */
  results: Record<string, unknown>;
  error?: string;
  /** Where `save: "copy"` put the executed notebook, as an API path. */
  copy?: string;
};

/**
 * The parameters the user typed, as the JSON object the run takes:
 * empty is `{}`. Throws with what is wrong.
 */
export function parseParams(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    throw new Error(`The parameters aren’t JSON: ${e instanceof Error ? e.message : e}`, {
      cause: e,
    });
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('The parameters must be a JSON object, such as {"day": "mon"}.');
  }
  return value as Record<string, unknown>;
}

/**
 * What to start the parameters field with when the sheet hasn't run this
 * notebook yet: the parameters `ganymede execute -p` last recorded in it
 * (`metadata.ganymede.params`), or `{}`.
 */
export function initialParams(ganymedeMetadata: unknown): string {
  const params = (ganymedeMetadata as { params?: unknown } | undefined)?.params;
  if (typeof params === 'object' && params !== null && !Array.isArray(params)) {
    return JSON.stringify(params, null, 2);
  }
  return '{}';
}

/** Runs `path` on the server and answers when the run ends. */
export async function runWithParams(
  settings: ServerConnection.ISettings,
  path: string,
  params: Record<string, unknown>,
  opts: { save: boolean; signal?: AbortSignal },
): Promise<RunAnswer> {
  const body: Record<string, unknown> = { path, params };
  if (opts.save) body.save = 'copy';
  const res = await ServerConnection.makeRequest(
    URLExt.join(settings.baseUrl, 'api/notebooks/run'),
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
    },
    settings,
  );
  let answer: (Partial<RunAnswer> & { message?: string }) | undefined;
  try {
    answer = (await res.json()) as Partial<RunAnswer> & { message?: string };
  } catch {
    // Not JSON: a server without the route, or a proxy's page.
  }
  if (!res.ok) {
    // Ganymede 0.8 and 0.9 run but keep no copies ("save must be false").
    if (opts.save && res.status === 400 && /save must be false/.test(answer?.message ?? '')) {
      throw new Error('Saving the executed notebook needs Ganymede 0.10 or later.');
    }
    // jupyter_server answers an unknown route with a bare "Not Found".
    if (answer?.message && answer.message !== 'Not Found') throw new Error(answer.message);
    throw new Error(
      res.status === 404 || res.status === 405
        ? 'This server can’t run notebooks with parameters. It needs Ganymede 0.8 or later.'
        : `The server answered ${res.status}.`,
    );
  }
  if (answer?.status !== 'ok' && answer?.status !== 'error') {
    throw new Error(
      'This server can’t run notebooks with parameters. It needs Ganymede 0.8 or later.',
    );
  }
  return {
    status: answer.status,
    results: answer.results ?? {},
    ...(answer.error ? { error: answer.error } : {}),
    ...(answer.copy ? { copy: answer.copy } : {}),
  };
}

/**
 * Whether `backend` can run a notebook with parameters: a Ganymede server
 * that runs the kernels. With `kernels` set, the notebook's kernel may be
 * one in this page, which the server can't start for the run.
 */
export function runAvailable(backend: Backend | undefined): boolean {
  return backend?.config.kind === 'ganymede' && !backend.config.kernels;
}
