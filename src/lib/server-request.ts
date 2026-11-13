import { ServerConnection } from '@jupyterlab/services';

/** How long the server gets to make a page or an export. */
export const SERVER_TIMEOUT_MS = 120_000;

/**
 * A GET of something the server makes from a notebook (a published page,
 * an export), for a sheet or menu that waits on it: a server that never
 * answers mustn't hang it, so the request times out. A failed answer
 * throws the server's message, or its status; reading the body after
 * this returns is under the same timeout, through `read`.
 */
export async function serverGet<T>(
  settings: ServerConnection.ISettings,
  url: string,
  read: (res: Response) => Promise<T>,
): Promise<T> {
  // makeRequest rewraps a fetch rejection as a NetworkError, so the signal
  // tells a timeout.
  const signal = AbortSignal.timeout(SERVER_TIMEOUT_MS);
  try {
    const res = await ServerConnection.makeRequest(url, { method: 'GET', signal }, settings);
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
    return await read(res);
  } catch (e) {
    if (signal.aborted && (signal.reason as Error | undefined)?.name === 'TimeoutError') {
      throw new Error('The server didn’t answer in time.', { cause: e });
    }
    throw e;
  }
}
