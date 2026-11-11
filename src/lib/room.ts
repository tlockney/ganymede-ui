/**
 * A notebook's document room on a Ganymede server (#183): the notebook held
 * live in the server, which several clients (this pane, a Claude session
 * through `ganymede mcp`, another window) edit at once.
 *
 * The protocol is `jupyter-collaboration`'s: `PUT
 * /api/collaboration/session/{path}` gives the file's id and the server's
 * session id; `/api/collaboration/room/json:notebook:{id}` is a y-websocket
 * (sync and awareness) plus raw messages, of which only `save` is used. The
 * server loads the file, autosaves a second after the last edit, and merges
 * in changes other programs make to the file, so the pane neither polls the
 * file nor locks on a change.
 */
import { YNotebook } from '@jupyter/ydoc';
import { URLExt } from '@jupyterlab/coreutils';
import type * as nbformat from '@jupyterlab/nbformat';
import { type Contents, ServerConnection } from '@jupyterlab/services';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import type { INotebookModel } from '@jupyterlab/notebook';
import { WebsocketProvider } from 'y-websocket';
import type { SaveOptions, Saver } from './saver';

/** `jupyter-collaboration`'s raw message type: a JSON string. */
const MSG_RAW = 2;

/** How long the first sync may take before the pane gives up on the room. */
export const SYNC_TIMEOUT_MS = 15_000;

/** How long a save may take to answer. */
const SAVE_TIMEOUT_MS = 30_000;

/** What a room's `save` answers. */
export type SaveStatus = 'success' | 'failed' | 'skipped';

/** Why a room closed for good. */
export type RoomClosed =
  /** The file was deleted (code 4404). */
  | { kind: 'deleted' }
  /** Anything else the server said reconnecting can't fix. */
  | { kind: 'refused'; reason: string };

export type RoomOptions = {
  settings: ServerConnection.ISettings;
  path: string;
  /** Told once when the server closes the room for good. */
  onClosed?: (why: RoomClosed) => void;
  /** Tests pass a fake socket. */
  WebSocket?: typeof WebSocket;
};

export class NotebookRoom {
  readonly notebook: YNotebook;
  private readonly provider: WebsocketProvider;
  private nextSave = 1;
  private readonly saves = new Map<number, (status: SaveStatus) => void>();
  private disposed = false;

  private constructor(
    private readonly o: RoomOptions,
    roomUrl: string,
    roomId: string,
    sessionId: string,
  ) {
    // As JupyterLab's notebook model does by default: undo per cell.
    this.notebook = new YNotebook({ disableDocumentWideUndoRedo: true });
    const token = o.settings.token;
    this.provider = new WebsocketProvider(roomUrl, roomId, this.notebook.ydoc, {
      params: {
        sessionId,
        // Websockets carry no Authorization header: the token goes in the
        // query, as JupyterLab's kernel sockets send it.
        ...(token && o.settings.appendToken !== false ? { token } : {}),
      },
      awareness: this.notebook.awareness,
      WebSocketPolyfill: (o.WebSocket ?? o.settings.WebSocket) as typeof WebSocket,
      disableBc: true,
    });
    this.provider.messageHandlers[MSG_RAW] = (_enc, decoder) => {
      this.onRaw(decoding.readVarString(decoder));
    };
    this.provider.on('connection-close', event => {
      // The server restarted: its session id changed, and it says so with a
      // reloadable close. Ask for the new one; the provider reconnects.
      if (event?.code === 1003 && /unknown_session/.test(event.reason)) {
        void this.refreshSession();
      }
    });
    this.provider.on('closed', ({ code, reason }) => {
      if (this.disposed) return;
      o.onClosed?.(code === 4404 ? { kind: 'deleted' } : { kind: 'refused', reason });
    });
  }

  /**
   * Join the room for the notebook at `path` and wait for its first sync.
   * Undefined when the server has no rooms (or no file there): the caller
   * goes through the contents API instead. Throws if the room joined but
   * didn't sync in time.
   */
  static async join(o: RoomOptions): Promise<NotebookRoom | undefined> {
    const session = await requestSession(o.settings, o.path);
    if (!session) return undefined;
    const room = new NotebookRoom(
      o,
      URLExt.join(o.settings.wsUrl, 'api/collaboration/room'),
      `${session.format}:${session.type}:${session.fileId}`,
      session.sessionId,
    );
    try {
      await room.synced(SYNC_TIMEOUT_MS);
    } catch (e) {
      room.dispose();
      throw e;
    }
    return room;
  }

  /** Whether the socket is up now. */
  get connected(): boolean {
    return this.provider.wsconnected;
  }

  /**
   * Ask the server to save the room now. Its autosave does this a second
   * after the last edit; ⌘S and the pane's teardown want it at once.
   */
  save(): Promise<SaveStatus> {
    const id = this.nextSave++;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MSG_RAW);
    encoding.writeVarString(enc, 'save');
    encoding.writeVarUint(enc, id);
    const ws = this.provider.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('Not connected to the notebook’s room'));
    }
    return new Promise<SaveStatus>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.saves.delete(id);
        reject(new Error('The server didn’t answer the save'));
      }, SAVE_TIMEOUT_MS);
      this.saves.set(id, status => {
        clearTimeout(timer);
        resolve(status);
      });
      ws.send(encoding.toUint8Array(enc));
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const done of this.saves.values()) done('skipped');
    this.saves.clear();
    this.provider.destroy();
    this.notebook.dispose();
  }

  private synced(timeout: number): Promise<void> {
    if (this.provider.synced) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.provider.off('sync', onSync);
        reject(new Error('The notebook’s room didn’t sync in time'));
      }, timeout);
      const onSync = (synced: boolean) => {
        if (!synced) return;
        clearTimeout(timer);
        this.provider.off('sync', onSync);
        resolve();
      };
      this.provider.on('sync', onSync);
    });
  }

  private onRaw(text: string) {
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    const m = message as { type?: unknown; responseTo?: unknown; status?: unknown };
    if (m.type !== 'save' || typeof m.responseTo !== 'number') return;
    const done = this.saves.get(m.responseTo);
    if (!done) return;
    this.saves.delete(m.responseTo);
    done(m.status === 'success' || m.status === 'failed' ? m.status : 'skipped');
  }

  private async refreshSession() {
    try {
      const session = await requestSession(this.o.settings, this.o.path);
      if (session && !this.disposed) this.provider.params.sessionId = session.sessionId;
    } catch {
      // Unreachable: the provider keeps trying with the old id.
    }
  }
}

type Session = { format: string; type: string; fileId: string; sessionId: string };

/** The room's session for `path`, or undefined when the server has no rooms. */
async function requestSession(
  settings: ServerConnection.ISettings,
  path: string,
): Promise<Session | undefined> {
  const url = URLExt.join(settings.baseUrl, 'api/collaboration/session', URLExt.encodeParts(path));
  let response: Response;
  try {
    response = await ServerConnection.makeRequest(
      url,
      { method: 'PUT', body: JSON.stringify({ format: 'json', type: 'notebook' }) },
      settings,
    );
  } catch {
    return undefined;
  }
  if (!response.ok) return undefined;
  const body = (await response.json().catch(() => undefined)) as Partial<Session> | undefined;
  if (!body?.fileId || !body.sessionId) return undefined;
  return {
    format: body.format ?? 'json',
    type: body.type ?? 'notebook',
    fileId: body.fileId,
    sessionId: body.sessionId,
  };
}

/**
 * Saves a notebook that lives in a room, with the same calls as
 * {@link NotebookSaver}, so the pane drives either. The server owns the
 * file: it autosaves, and merges in changes other programs make, so there
 * is never a change on disk to lock on, and a save just asks the room to
 * write now.
 */
export class RoomSaver implements Saver {
  readonly live = true;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly o: {
      room: NotebookRoom;
      path: string;
      model: INotebookModel;
      /** Runs just before each save: widget state goes into the model. */
      beforeSave?: () => void;
    },
  ) {}

  get path(): string {
    return this.o.path;
  }

  /**
   * Ask the room to save. Rejects when the server says the save failed:
   * the file changed on disk too and won some part both changed, so the
   * room's version of that part isn't in the file.
   */
  save(options: SaveOptions = {}): Promise<void> {
    const run = this.queue.then(async () => {
      const { room, model, beforeSave } = this.o;
      if (options.ifDirty && !model.dirty) return;
      beforeSave?.();
      const status = await room.save();
      if (status === 'failed') {
        throw new Error(
          'the file changed on disk at the same time; its version of the cells you both changed was kept',
        );
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  /** The room follows a rename through the contents API by itself. */
  move(move: () => Promise<{ path: string }>): Promise<void> {
    const run = this.queue.then(async () => {
      this.o.path = (await move()).path;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  /** The room takes in changes on disk itself. */
  changedOnDisk(): Promise<string | undefined> {
    return Promise.resolve(undefined);
  }

  accept(): Promise<void> {
    return Promise.resolve();
  }

  pull(): Promise<boolean> {
    return Promise.resolve(false);
  }

  dispose(): void {}
}

/**
 * Trust the code cells the server trusts (#183). A room doesn't share
 * trust: its cells carry no `trusted` mark, since the server decides it
 * when it saves (a cell is trusted when its outputs came from a run on the
 * server, or the file was signed). So read the file as the contents API
 * marks it, and trust each code cell, by id, that it marks trusted. Never
 * takes trust away: a cell trusted here (this page ran it) stays so.
 */
export async function trustFromFile(
  contents: Contents.IManager,
  path: string,
  model: INotebookModel,
): Promise<void> {
  const file = await contents.get(path, { type: 'notebook', content: true });
  const cells = (file.content as nbformat.INotebookContent | null)?.cells ?? [];
  const trusted = new Set(
    cells
      .filter(c => c.cell_type === 'code' && c.metadata?.trusted === true && c.id)
      .map(c => c.id as string),
  );
  if (model.isDisposed) return;
  for (let i = 0; i < model.cells.length; i++) {
    const cell = model.cells.get(i);
    if (cell.type === 'code' && !cell.trusted && trusted.has(cell.id)) cell.trusted = true;
  }
}
