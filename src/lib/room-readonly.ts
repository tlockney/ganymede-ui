import type { NotebookChange, YNotebook } from '@jupyter/ydoc';
import type { Contents } from '@jupyterlab/services';

/** Banner text shown while another Ganymede server owns the notebook (#839). */
export const READONLY_BANNER =
  'Read-only · Another Ganymede server on this machine has this notebook open.';

/**
 * How often a read-only notebook checks whether the other server released its
 * lock (#839): the server's room takes the lock within a second of release.
 */
export const READONLY_POLL_MS = 1_000;

/**
 * How often a writable room checks whether another server now owns its file
 * (e.g. after a rename or relock), matching `DISK_CHECK_INTERVAL_MS`.
 */
export const WRITABLE_POLL_MS = 5_000;

const ANOTHER_SERVER = /another server/i;

/**
 * Whether a room's Yjs `state` map explicitly says the room is read-only.
 * Returns `undefined` when the state carries no read-only signal (Ganymede
 * currently reports lock ownership through the contents API's `writable`, and
 * sets `save: "failed"` with `save_error` naming another server if a dirty
 * room turns read-only).
 */
export function roomStateReadOnly(state: Pick<YNotebook, 'getState'>): boolean | undefined {
  const ro = state.getState('read_only') ?? state.getState('readonly');
  if (typeof ro === 'boolean') return ro;
  const writable = state.getState('writable');
  if (typeof writable === 'boolean') return !writable;
  const save = state.getState('save');
  const saveError = state.getState('save_error');
  if (save === 'failed' && typeof saveError === 'string' && ANOTHER_SERVER.test(saveError)) {
    return true;
  }
  return undefined;
}

export type WritableWatcher = {
  /** Check the contents API now, unless paused or hidden. */
  check(): void;
  /** Stop polling and listening. */
  dispose(): void;
};

type WatchOptions = {
  contents: Pick<Contents.IManager, 'get'>;
  /** Current path of the notebook (follows renames). */
  path: () => string;
  /** The notebook's shared model, when it lives in a document room. */
  sharedModel?: Pick<YNotebook, 'getState' | 'changed'>;
  /** Initial read-only state from opening the file or room. */
  initial: boolean;
  /** True while checks should wait (offline machine, rename in flight, file gone). */
  paused?: () => boolean;
  /** Whether to poll while writable (true for rooms; non-room notebooks poll elsewhere). */
  pollWhileWritable: boolean;
  /** Called whenever the read-only state changes. */
  onChange: (readOnly: boolean) => void;
  pollReadOnlyMs?: number;
  pollWritableMs?: number;
};

/**
 * Watch whether the notebook is read-only because another Ganymede server on
 * this machine owns its file (#839): polls the contents API's `writable` flag
 * (quickly while read-only so the notebook unlocks without a reload once the
 * other server lets go) and reacts to room state updates, window focus, and
 * tab visibility.
 */
export function watchWritable({
  contents,
  path,
  sharedModel,
  initial,
  paused,
  pollWhileWritable,
  onChange,
  pollReadOnlyMs = READONLY_POLL_MS,
  pollWritableMs = WRITABLE_POLL_MS,
}: WatchOptions): WritableWatcher {
  let current = initial;
  let stopped = false;
  let checking = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = () => {
    clearTimer();
    if (stopped) return;
    if (!current && !pollWhileWritable) return;
    const delay = current ? pollReadOnlyMs : pollWritableMs;
    timer = setTimeout(() => {
      timer = undefined;
      void check().finally(schedule);
    }, delay);
  };

  const set = (next: boolean) => {
    if (stopped || next === current) return;
    current = next;
    onChange(next);
    schedule();
  };

  const check = async (): Promise<void> => {
    if (stopped || checking || paused?.()) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    checking = true;
    try {
      const model = await contents.get(path(), { content: false });
      if (!stopped && typeof model?.writable === 'boolean') {
        set(!model.writable);
      }
    } catch {
      // Unreachable or transient error: keep the last known state.
    } finally {
      checking = false;
    }
  };

  const onWake = () => {
    if (stopped) return;
    if (!current && !pollWhileWritable) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    void check();
  };

  const onState = (_: unknown, change: NotebookChange) => {
    if (stopped || !sharedModel || !change.stateChange?.length) return;
    const names = new Set(change.stateChange.map(c => c.name));
    if (names.has('read_only') || names.has('readonly') || names.has('writable')) {
      const fromState = roomStateReadOnly(sharedModel);
      if (fromState !== undefined) {
        set(fromState);
        return;
      }
    }
    if (names.has('save') || names.has('save_error')) {
      const save = sharedModel.getState('save');
      const saveError = sharedModel.getState('save_error');
      if (save === 'failed' && typeof saveError === 'string' && ANOTHER_SERVER.test(saveError)) {
        set(true);
      }
    }
    if (names.has('path') || names.has('hash') || names.has('save') || names.has('save_error')) {
      void check();
    }
  };

  sharedModel?.changed.connect(onState);
  if (typeof window !== 'undefined') window.addEventListener('focus', onWake);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onWake);
  schedule();

  return {
    check: () => {
      void check();
    },
    dispose: () => {
      stopped = true;
      clearTimer();
      sharedModel?.changed.disconnect(onState);
      if (typeof window !== 'undefined') window.removeEventListener('focus', onWake);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onWake);
    },
  };
}
