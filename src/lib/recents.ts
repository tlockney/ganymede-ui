/**
 * Recently opened notebooks (#215), for the sidebar's Recents list: the
 * iPad and iPhone apps have no File > Open Recent, as the Mac app does.
 * Kept in this browser's local storage, per backend (the same path on
 * another server is another file), newest first.
 */
import { useEffect, useState } from 'react';
import type { Contents } from '@jupyterlab/services';
import type { Backend, BackendConfig } from './backends';
import { within } from './file-actions';
import { notFound } from './rename';

const KEY = 'ganymede-ui:recents';
/** Notebooks kept for each backend. */
export const MAX_RECENTS = 8;
/** Backends kept; the one used longest ago goes first. */
const MAX_BACKENDS = 10;

type Store = Record<string, string[]>;

/** Which list a backend's notebooks go in: its notebooks' location, not its kernels'. */
export function recentsKey(config: BackendConfig): string {
  return config.kind === 'browser' ? 'browser' : `ganymede:${config.url.replace(/\/+$/, '')}`;
}

function read(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: Store = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (Array.isArray(v)) store[k] = v.filter((p): p is string => typeof p === 'string');
    }
    return store;
  } catch {
    return {};
  }
}

const listeners = new Set<() => void>();

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or blocked (a private window): Recents lasts this page.
  }
  listeners.forEach(l => l());
}

/** Calls `listener` when any list changes, here or in another tab; returns an unsubscribe. */
export function onRecentsChange(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** A backend's recent notebooks, newest first. */
export function loadRecents(key: string): string[] {
  return read()[key] ?? [];
}

function update(key: string, change: (paths: string[]) => string[]): void {
  const store = read();
  const before = store[key] ?? [];
  const after = change(before)
    .filter((p, i, all) => all.indexOf(p) === i)
    .slice(0, MAX_RECENTS);
  if (after.length === before.length && after.every((p, i) => p === before[i])) return;
  delete store[key];
  if (after.length) store[key] = after;
  // The backend used last goes last, so the oldest is dropped first.
  for (const k of Object.keys(store).slice(0, -MAX_BACKENDS)) delete store[k];
  write(store);
}

/** Puts `path` at the top of the list. */
export function addRecent(key: string, path: string): void {
  update(key, paths => [path, ...paths]);
}

/** Drops `path`, and anything in it if it is a folder. */
export function forgetRecent(key: string, path: string): void {
  update(key, paths => paths.filter(p => !within(p, path)));
}

/** Follows a rename of `from` (a notebook or a folder) to `to`. */
export function moveRecent(key: string, from: string, to: string): void {
  update(key, paths => paths.map(p => (within(p, from) ? to + p.slice(from.length) : p)));
}

export function clearRecents(key: string): void {
  update(key, () => []);
}

/**
 * The backend's recent notebooks. Records `openPath` when it changes,
 * follows renames and deletes (any made through the contents manager,
 * which is how the sidebar and the title rename), and drops a notebook
 * that turns out to be gone, checked once per page load.
 */
export function useRecents(backend: Backend | undefined, openPath: string | undefined): string[] {
  const key = backend && recentsKey(backend.config);
  const contents = backend?.services.contents;
  const [paths, setPaths] = useState<string[]>(() => (key ? loadRecents(key) : []));

  useEffect(() => {
    if (!key) return setPaths([]);
    const reload = () => setPaths(loadRecents(key));
    reload();
    return onRecentsChange(reload);
  }, [key]);

  useEffect(() => {
    if (key && openPath) addRecent(key, openPath);
  }, [key, openPath]);

  useEffect(() => {
    if (!key || !contents) return;
    const onChange = (_: unknown, change: Contents.IChangedArgs) => {
      const from = change.oldValue?.path;
      if (!from) return;
      if (change.type === 'delete') forgetRecent(key, from);
      else if (change.type === 'rename' && change.newValue?.path) {
        moveRecent(key, from, change.newValue.path);
      }
    };
    contents.fileChanged.connect(onChange);
    return () => void contents.fileChanged.disconnect(onChange);
  }, [key, contents]);

  useEffect(() => {
    if (!key || !contents) return;
    for (const path of paths) {
      const id = `${key}\n${path}`;
      if (checked.has(id)) continue;
      checked.add(id);
      contents.get(path, { content: false }).catch(e => {
        if (notFound(e)) forgetRecent(key, path);
        // Anything else (offline, a server error) keeps it, to check again later.
        else checked.delete(id);
      });
    }
  }, [key, contents, paths]);

  return paths;
}

/** The notebooks checked this page load, as `<backend>\n<path>`. */
const checked = new Set<string>();

/** For tests: check every notebook again. */
export function resetChecked(): void {
  checked.clear();
}
