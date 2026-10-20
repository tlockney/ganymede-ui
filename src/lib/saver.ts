import type { NotebookModel } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';

/** How often a dirty notebook saves itself, as JupyterLab's default. */
export const AUTOSAVE_INTERVAL_MS = 120_000;

/**
 * How much newer than our copy the file may be before a save is a conflict:
 * Ganymede's window, and JupyterLab's, for servers that round mtimes.
 */
const CONFLICT_WINDOW_MS = 500;

/** The file changed on disk since it was loaded or last saved here. */
export class SaveConflict extends Error {
  constructor(readonly path: string) {
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
 * Saves one notebook model to its file, as JupyterLab's document context
 * does: one save at a time, a conflict when the file changed on disk, and
 * the dirty flag cleared only when no edit arrived during the round trip.
 */
export class NotebookSaver {
  private readonly o: Options;
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
      throw new SaveConflict(path);
    }
  }
}

function status(e: unknown): number | undefined {
  const response = (e as { response?: { status?: unknown } } | undefined)?.response;
  return typeof response?.status === 'number' ? response.status : undefined;
}
