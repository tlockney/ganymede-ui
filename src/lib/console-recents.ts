/**
 * Recent DuckDB consoles (#735): each console has a name and, once a
 * statement has run in it, a record of what ran, so it can be opened again
 * from the command palette, the console's own Recent menu and the Mac's
 * File > Open Recent Console. Kept in this browser's local storage, per
 * backend (`recentsKey`, as the notebooks' Recents), most recently used
 * first. Results aren't kept, only the statements.
 */
import { useEffect, useState } from 'react';
import type { Backend } from './backends';
import { within } from './file-actions';
import { recentsKey } from './recents';

const KEY = 'ganymede-ui:console-recents';
/** Listed consoles kept for each backend; the unlisted reservations (`listedConsoles`) are kept to as many again. */
export const MAX_CONSOLES = 20;
/** Statements kept for each console; the oldest go first. */
export const MAX_STATEMENTS = 200;
/** Backends kept; the one used longest ago goes first. */
export const MAX_BACKENDS = 10;
/** A record with no statements, left alone this long, is dropped: its console was never used. */
const EMPTY_KEPT_MS = 24 * 60 * 60 * 1000;

export type ConsoleRecord = {
  /** A UUID: on the Mac it is also the console tab's own id. */
  id: string;
  name: string;
  /** The console's folder, a contents path; '' for the root. */
  folder: string;
  /** What ran without an error, as written, in order. */
  statements: string[];
  /** When it was last used, in milliseconds. */
  used: number;
  /** It was renamed: it is listed, and kept, though nothing has run in it. */
  named?: boolean;
};

type Store = Record<string, ConsoleRecord[]>;

/** A new console's id: a UUID, as the Mac app's tabs read it. */
export function newConsoleId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (id) return id;
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, hex);
}

function record(value: unknown): ConsoleRecord | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { id, name, folder, statements, used, named } = value as Record<string, unknown>;
  if (typeof id !== 'string' || !id || typeof name !== 'string' || typeof folder !== 'string') {
    return undefined;
  }
  return {
    id,
    name,
    folder,
    statements: Array.isArray(statements)
      ? statements.filter((s): s is string => typeof s === 'string')
      : [],
    used: typeof used === 'number' && Number.isFinite(used) ? used : 0,
    ...(named === true ? { named: true } : {}),
  };
}

/** What storage holds, with anything malformed left out. */
function read(): Store {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const store: Store = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (!Array.isArray(v)) continue;
      const seen = new Set<string>();
      store[k] = v.flatMap(item => {
        const r = record(item);
        if (!r || seen.has(r.id)) return [];
        seen.add(r.id);
        return [r];
      });
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
    // Storage full or blocked (a private window): the console works, and
    // is only not remembered.
  }
  listeners.forEach(l => l());
}

/** Calls `listener` when any list changes, here or in another tab; returns an unsubscribe. */
export function onConsolesChange(listener: () => void): () => void {
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

/** A backend's recent consoles, most recently used first. */
export function loadConsoles(key: string): ConsoleRecord[] {
  return [...(read()[key] ?? [])].sort((a, b) => b.used - a.used);
}

const isListed = (r: ConsoleRecord) => r.statements.length > 0 || !!r.named;

function update(key: string, change: (records: ConsoleRecord[]) => ConsoleRecord[]): void {
  const store = read();
  // A console shown makes a record at once, to hold its name; one that never
  // ran anything doesn't stay.
  const stale = Date.now() - EMPTY_KEPT_MS;
  let listed = 0;
  let reserved = 0;
  const after = change(store[key] ?? [])
    .filter(r => isListed(r) || r.used >= stale)
    // Each kind has its own cap: reservations can't push listed consoles out.
    .filter(r => (isListed(r) ? ++listed : ++reserved) <= MAX_CONSOLES);
  delete store[key];
  if (after.length) store[key] = after;
  // The backend used last goes last, so the oldest is dropped first.
  for (const k of Object.keys(store).slice(0, -MAX_BACKENDS)) delete store[k];
  write(store);
}

/** Puts `saved` at the top, replacing the one of its id. */
export function saveConsole(key: string, saved: ConsoleRecord): void {
  update(key, records => {
    // A save of what ran keeps the name's being chosen.
    const named = saved.named ?? records.find(r => r.id === saved.id)?.named;
    const next = {
      ...saved,
      statements: saved.statements.slice(-MAX_STATEMENTS),
      ...(named ? { named } : {}),
    };
    return [next, ...records.filter(r => r.id !== saved.id)];
  });
}

/** Names console `id`, making its record if it has none yet (nothing has run in it). */
export function renameConsole(key: string, id: string, name: string, folder: string): void {
  const found = read()[key]?.find(r => r.id === id);
  saveConsole(key, { statements: [], ...found, id, name, folder, used: Date.now(), named: true });
}

/**
 * A move of the folder `from` (or one a console is in) to `to`: the
 * consoles in it follow, or go when it was deleted (`to` null).
 */
export function moveConsoleFolders(key: string, from: string, to: string | null): void {
  const store = read()[key] ?? [];
  if (!store.some(r => within(r.folder, from))) return;
  update(key, records =>
    records.flatMap(r =>
      !within(r.folder, from)
        ? [r]
        : to === null
          ? []
          : [{ ...r, folder: to + r.folder.slice(from.length) }],
    ),
  );
}

export function clearConsoles(key: string): void {
  update(key, () => []);
}

/** The records worth listing: those a statement ran in, or that were renamed. Any other is only its console's reservation of a name. */
export const listedConsoles = (records: readonly ConsoleRecord[]) => records.filter(isListed);

/** A console closed: its record goes if it was never used or named, so its name is free again. */
export function releaseConsole(key: string, id: string): void {
  const found = read()[key]?.find(r => r.id === id);
  if (found && !isListed(found)) update(key, records => records.filter(r => r.id !== id));
}

/** "Console 1", "Console 2", …: the lowest number no console of the backend has. */
export function defaultConsoleName(records: readonly ConsoleRecord[]): string {
  const taken = new Set(records.map(r => r.name));
  let n = 1;
  while (taken.has(`Console ${n}`)) n++;
  return `Console ${n}`;
}

/**
 * The console to show for `id`: its record's name and folder, or a new one
 * (the next default name, on `folder`) when there is no such record.
 */
export function consoleFor(
  key: string,
  id: string | undefined,
  folder: string,
): { id: string; name: string; folder: string } {
  const records = loadConsoles(key);
  const found = id ? records.find(r => r.id === id) : undefined;
  if (found) return { id: found.id, name: found.name, folder: found.folder };
  return { id: id ?? newConsoleId(), name: defaultConsoleName(records), folder };
}

/**
 * Shows a console: `consoleFor`, and a record for it when it has none, so
 * the next console shown doesn't take its name before a statement has run
 * in it. The record isn't listed until one has (`listedConsoles`).
 */
export function startConsole(
  key: string,
  id: string | undefined,
  folder: string,
): { id: string; name: string; folder: string } {
  const c = consoleFor(key, id, folder);
  if (!loadConsoles(key).some(r => r.id === c.id)) {
    saveConsole(key, { ...c, statements: [], used: Date.now() });
  }
  return c;
}

/** All the backend's console records, listed or not, kept up to date as they change. */
export function useConsoles(backend: Backend | undefined): ConsoleRecord[] {
  const key = backend && recentsKey(backend.config);
  const [records, setRecords] = useState<ConsoleRecord[]>(() => (key ? loadConsoles(key) : []));
  useEffect(() => {
    if (!key) return setRecords([]);
    const reload = () => setRecords(loadConsoles(key));
    reload();
    return onConsolesChange(reload);
  }, [key]);
  return records;
}
