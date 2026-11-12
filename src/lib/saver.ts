import type { NotebookModel } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';

/** How often a dirty notebook saves itself, as JupyterLab's default. */
export const AUTOSAVE_INTERVAL_MS = 120_000;

/**
 * How often an open notebook asks whether its file changed on disk (#367),
 * as the Apple apps' editor does for other files.
 */
export const DISK_CHECK_INTERVAL_MS = 5_000;

/**
 * How much newer than our copy the file may be before a save is a conflict:
 * Ganymede's window, and JupyterLab's, for servers that round mtimes.
 */
const CONFLICT_WINDOW_MS = 500;

/**
 * The file changed on disk since it was loaded or last saved here.
 * `lastModified` is the file's time on disk, when the check read it (a
 * server's 409 doesn't say).
 */
export class SaveConflict extends Error {
  constructor(
    readonly path: string,
    readonly lastModified?: string,
  ) {
    super(`${path} changed on disk since it was opened or last saved`);
    this.name = 'SaveConflict';
  }
}

type Options = {
  contents: Contents.IManager;
  path: string;
  model: NotebookModel;
  /** The file's `last_modified` as loaded. */
  lastModified?: string;
  /** Runs just before each write: widget state goes into the model. */
  beforeSave?(): void;
};

export type SaveOptions = {
  /** Write even if the file changed on disk. */
  overwrite?: boolean;
  /** Skip the write when there is nothing unsaved (autosave). */
  ifDirty?: boolean;
};

/**
 * What the notebook pane saves through: {@link NotebookSaver} over the
 * contents API, or a room's (`RoomSaver`, #183).
 */
export interface Saver {
  /** True when the server holds the notebook live (a room). */
  readonly live: boolean;
  readonly path: string;
  save(options?: SaveOptions): Promise<void>;
  move(move: () => Promise<{ path: string; lastModified?: string }>): Promise<void>;
  changedOnDisk(): Promise<string | undefined>;
  accept(lastModified?: string): Promise<void>;
  pull(apply: (content: Contents.IModel) => void, canApply?: () => boolean): Promise<boolean>;
  dispose(): void;
}

/**
 * Saves one notebook model to its file, as JupyterLab's document context
 * does: one save at a time, a conflict when the file changed on disk, and
 * the dirty flag cleared only when no edit arrived during the round trip.
 */
export class NotebookSaver implements Saver {
  readonly live = false;
  private o: Options;
  private lastModified?: string;
  /** Bumped on every change to the model, to spot edits during a save. */
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;

  constructor(options: Options) {
    this.o = options;
    this.lastModified = options.lastModified;
    options.model.contentChanged.connect(this.bump, this);
  }

  /**
   * Save after any save in flight. A save that had to wait skips the write
   * when the one before it left nothing unsaved. Rejects with
   * {@link SaveConflict} when the file changed on disk, unless `overwrite`.
   */
  save(options: SaveOptions = {}): Promise<void> {
    const queued = this.pending > 0;
    this.pending++;
    const run = this.queue
      .then(() => this.write({ ...options, ifDirty: options.ifDirty || queued }))
      .finally(() => this.pending--);
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * Move the file with `move`, which resolves with its new path and, if
   * the backend says, its `last_modified` there (a rename may bump it).
   * Saves wait for it and then go to the new path, so none lands at the
   * old one mid-move (and recreates it there).
   */
  move(move: () => Promise<{ path: string; lastModified?: string }>): Promise<void> {
    const run = this.queue.then(async () => {
      const moved = await move();
      this.o.path = moved.path;
      this.lastModified = moved.lastModified || this.lastModified;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  /**
   * The file's newer `last_modified` if it changed on disk since it was
   * loaded or last saved here (#367), else undefined. Waits for any save
   * or move in flight, so our own write isn't taken for someone else's.
   * Undefined when the file is gone or the server can't be reached: a
   * save says why.
   */
  changedOnDisk(): Promise<string | undefined> {
    const run = this.queue.then(() =>
      this.checkDisk().then(
        () => undefined,
        (e: unknown) => {
          if (e instanceof SaveConflict) return e.lastModified;
          throw e;
        },
      ),
    );
    this.queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /**
   * Take the file on disk as of `lastModified` for our copy's base, so
   * saves write over that version but still stop at a newer one (Unlock,
   * #367). Without it, the file's time is read now.
   */
  accept(lastModified?: string): Promise<void> {
    const run = this.queue.then(async () => {
      const { contents, path } = this.o;
      this.lastModified =
        lastModified ?? (await contents.get(path, { content: false })).last_modified;
    });
    this.queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /**
   * Load the file's newer version into the model in place, when nothing
   * here would be lost: no unsaved edit, and `canApply` agrees (#508). The
   * model takes the file's content through `apply`, ends up not dirty, and
   * saves go on from the file's new time. False, with the model untouched,
   * when there is an edit here (also one typed during the fetch) or the
   * file can't be read; the caller locks instead.
   */
  pull(apply: (content: Contents.IModel) => void, canApply = () => true): Promise<boolean> {
    const run = this.queue.then(async () => {
      const { contents, path, model } = this.o;
      if (model.dirty || !canApply()) return false;
      let file: Contents.IModel;
      try {
        file = await contents.get(path, { type: 'notebook', content: true });
      } catch {
        return false;
      }
      if (model.dirty || !canApply() || !file.content) return false;
      apply(file);
      model.dirty = false;
      this.lastModified = file.last_modified || this.lastModified;
      return true;
    });
    this.queue = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  /** The file it saves to: after a move, the new path. */
  get path(): string {
    return this.o.path;
  }

  dispose() {
    this.o.model.contentChanged.disconnect(this.bump, this);
  }

  private bump() {
    this.generation++;
  }

  private async write({ overwrite, ifDirty }: SaveOptions) {
    const { contents, path, model } = this.o;
    if (ifDirty && !model.dirty) return;
    if (!overwrite) await this.checkDisk();
    this.o.beforeSave?.();
    const generation = this.generation;
    let saved: Contents.IModel;
    try {
      saved = await contents.save(path, {
        type: 'notebook',
        format: 'json',
        content: model.toJSON(),
        // Ganymede refuses (409) a save over a file newer than this, which
        // closes the gap between the check above and the write. Servers
        // without the check ignore it.
        ...(!overwrite && this.lastModified ? { last_modified: this.lastModified } : {}),
      });
    } catch (e) {
      if (status(e) === 409) throw new SaveConflict(path);
      throw e;
    }
    this.lastModified = saved.last_modified || this.lastModified;
    // An edit made while the save was in flight is not in the file.
    if (this.generation === generation) model.dirty = false;
  }

  /** Throw {@link SaveConflict} if the file is newer than our copy. */
  private async checkDisk() {
    const { contents, path } = this.o;
    const ours = Date.parse(this.lastModified ?? '');
    if (Number.isNaN(ours)) return;
    let disk: Contents.IModel;
    try {
      disk = await contents.get(path, { content: false });
    } catch {
      // Gone, or unreachable: the save itself recreates it or says why.
      return;
    }
    if (Date.parse(disk.last_modified) - ours > CONFLICT_WINDOW_MS) {
      throw new SaveConflict(path, disk.last_modified);
    }
  }
}

/** The HTTP status of a contents API error, if it has one. */
export function status(e: unknown): number | undefined {
  const response = (e as { response?: { status?: unknown } } | undefined)?.response;
  return typeof response?.status === 'number' ? response.status : undefined;
}
