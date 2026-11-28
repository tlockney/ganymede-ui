import type * as nbformat from '@jupyterlab/nbformat';
import { within } from './file-actions';
import {
  type SaveAttentionDescription,
  diffRecoveryNotebook,
  formatRecoveryTimestamp,
} from './room-recovery';

/**
 * Bounded per-origin IndexedDB store for local unsaved notebook snapshots
 * (#808). Works in the browser PWA and in the Apple apps' WKWebView so
 * unsaved edits survive offline reloads, failed saves, and WebKit
 * content-process termination.
 */

export const LOCAL_RECOVERY_DB_NAME = 'ganymede-ui:local-recovery';
export const LOCAL_RECOVERY_STORE_NAME = 'snapshots';
export const LOCAL_RECOVERY_DB_VERSION = 1;

/** Maximum serialized UTF-8 byte size for a single notebook snapshot (10 MiB). */
export const LOCAL_RECOVERY_MAX_NOTEBOOK_BYTES = 10 * 1024 * 1024;

/** Maximum combined serialized UTF-8 byte size across the origin (50 MiB). */
export const LOCAL_RECOVERY_MAX_TOTAL_BYTES = 50 * 1024 * 1024;

/** Debounce interval for capturing dirty edits while editing. */
export const LOCAL_RECOVERY_DEBOUNCE_MS = 1_500;

/** Short trailing debounce used when typing while offline. */
export const LOCAL_RECOVERY_OFFLINE_DEBOUNCE_MS = 300;

/** Synthetic copy ID used by RecoverySheet to represent the local copy. */
export const LOCAL_RECOVERY_COPY_ID = '__local__';

export type LocalRecoveryReason = 'unsaved_edits' | 'save_failed' | 'offline';

export type LocalRecoverySnapshot = {
  key: string;
  scope: string;
  path: string;
  at: string;
  updatedAtMs: number;
  reason: LocalRecoveryReason;
  detail?: string;
  sizeBytes: number;
  content: nbformat.INotebookContent;
};

export type StoredLocalRecoveryRecord = {
  key: string;
  scope: string;
  path: string;
  at: string;
  updatedAtMs: number;
  reason: LocalRecoveryReason;
  detail?: string;
  sizeBytes: number;
  contentJson: string;
};

export type SaveLocalRecoveryInput = {
  scope: string;
  path: string;
  content: nbformat.INotebookContent;
  reason: LocalRecoveryReason;
  detail?: string;
  now?: number;
};

export type SaveLocalRecoveryResult =
  | { ok: true; sizeBytes: number; evictedKeys: string[] }
  | {
      ok: false;
      reason: 'too_large' | 'quota_exceeded' | 'unavailable';
      sizeBytes?: number;
    };

export interface LocalRecoveryStore {
  get(scope: string, path: string): Promise<LocalRecoverySnapshot | undefined>;
  save(input: SaveLocalRecoveryInput): Promise<SaveLocalRecoveryResult>;
  remove(scope: string, path: string): Promise<void>;
  removeUnder(scope: string, path: string): Promise<void>;
  moveUnder(scope: string, from: string, to: string): Promise<void>;
  listAll(): Promise<StoredLocalRecoveryRecord[]>;
  clearAll(): Promise<void>;
}

const utf8Encoder = new TextEncoder();

export function utf8ByteLength(text: string): number {
  return utf8Encoder.encode(text).byteLength;
}

export function localRecoveryKey(scope: string, path: string): string {
  return `${scope}\n${path}`;
}

export function localRecoveryReasonLabel(reason: LocalRecoveryReason): string {
  switch (reason) {
    case 'save_failed':
      return 'Local copy (save failed)';
    case 'offline':
      return 'Local copy (saved offline)';
    case 'unsaved_edits':
    default:
      return 'Local unsaved copy';
  }
}

/**
 * Build the banner description combining any server save attention (#831) with
 * an optional local IndexedDB recovery copy (#808).
 */
export function describeRecoveryBanner({
  serverAttention,
  localCopy,
}: {
  serverAttention?: SaveAttentionDescription;
  localCopy?: LocalRecoverySnapshot;
}): SaveAttentionDescription | undefined {
  if (serverAttention && localCopy) {
    const suffix = 'Local unsaved copy available';
    return {
      ...serverAttention,
      detail: serverAttention.detail ? `${serverAttention.detail} · ${suffix}` : suffix,
      copiesCount: serverAttention.copiesCount + 1,
    };
  }
  if (serverAttention) return serverAttention;
  if (!localCopy) return undefined;
  const savedAt = `Saved in this browser · ${formatRecoveryTimestamp(localCopy.at)}`;
  return {
    headline: 'Local unsaved copy',
    detail: localCopy.detail ? `${localCopy.detail} · ${savedAt}` : savedAt,
    copiesCount: 1,
  };
}

function isNotebookContent(raw: unknown): raw is nbformat.INotebookContent {
  if (!raw || typeof raw !== 'object') return false;
  const n = raw as { cells?: unknown };
  return Array.isArray(n.cells);
}

function isValidReason(raw: unknown): raw is LocalRecoveryReason {
  return raw === 'unsaved_edits' || raw === 'save_failed' || raw === 'offline';
}

function parseStoredRecord(raw: unknown): StoredLocalRecoveryRecord | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.key !== 'string' ||
    !r.key ||
    typeof r.scope !== 'string' ||
    typeof r.path !== 'string' ||
    !r.path ||
    typeof r.at !== 'string' ||
    typeof r.updatedAtMs !== 'number' ||
    !Number.isFinite(r.updatedAtMs) ||
    typeof r.sizeBytes !== 'number' ||
    !Number.isFinite(r.sizeBytes) ||
    r.sizeBytes < 0 ||
    typeof r.contentJson !== 'string'
  ) {
    return undefined;
  }
  return {
    key: r.key,
    scope: r.scope,
    path: r.path,
    at: r.at,
    updatedAtMs: r.updatedAtMs,
    reason: isValidReason(r.reason) ? r.reason : 'unsaved_edits',
    ...(typeof r.detail === 'string' && r.detail ? { detail: r.detail } : {}),
    sizeBytes: r.sizeBytes,
    contentJson: r.contentJson,
  };
}

function hydrateRecord(record: StoredLocalRecoveryRecord): LocalRecoverySnapshot | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(record.contentJson);
  } catch {
    return undefined;
  }
  if (!isNotebookContent(parsed)) return undefined;
  return {
    key: record.key,
    scope: record.scope,
    path: record.path,
    at: record.at,
    updatedAtMs: record.updatedAtMs,
    reason: record.reason,
    ...(record.detail ? { detail: record.detail } : {}),
    sizeBytes: record.sizeBytes,
    content: parsed,
  };
}

/**
 * Pick oldest entries to evict so inserting `incomingBytes` for `incomingKey`
 * stays within `maxTotalBytes`. Replacing `incomingKey` does not count its
 * previous bytes against the total cap.
 */
export function selectEvictions(
  existing: readonly Pick<StoredLocalRecoveryRecord, 'key' | 'sizeBytes' | 'updatedAtMs'>[],
  incomingKey: string,
  incomingBytes: number,
  maxTotalBytes: number,
): string[] {
  const others = existing.filter(entry => entry.key !== incomingKey);
  let total = others.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (total + incomingBytes <= maxTotalBytes) return [];

  others.sort((a, b) => a.updatedAtMs - b.updatedAtMs || a.key.localeCompare(b.key));
  const evicted: string[] = [];
  for (const entry of others) {
    if (total + incomingBytes <= maxTotalBytes) break;
    evicted.push(entry.key);
    total -= entry.sizeBytes;
  }
  return evicted;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = canonicalValue(obj[key]);
    }
    return out;
  }
  return value;
}

function userNotebookMetadata(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const copy = { ...(metadata as Record<string, unknown>) };
  // `language_info` is seeded on open and synced from the kernel without
  // marking the notebook dirty, so it is not a user edit to recover.
  delete copy.language_info;
  return copy;
}

/**
 * Returns true when `copyContent` differs from `currentContent` in any cell
 * source, type, outputs, order, cell list, or user notebook metadata.
 */
export function hasLocalRecoveryChanges(
  copyContent: nbformat.INotebookContent,
  currentContent: nbformat.INotebookContent | undefined,
): boolean {
  if (!currentContent) return true;
  const diff = diffRecoveryNotebook(copyContent, currentContent);
  if (
    diff.changedCount > 0 ||
    diff.addedCount > 0 ||
    diff.removedCount > 0 ||
    diff.reorderedCount > 0
  ) {
    return true;
  }
  return (
    JSON.stringify(canonicalValue(userNotebookMetadata(copyContent.metadata))) !==
    JSON.stringify(canonicalValue(userNotebookMetadata(currentContent.metadata)))
  );
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { name?: unknown; code?: unknown };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

export type LocalRecoveryStoreOptions = {
  maxNotebookBytes?: number;
  maxTotalBytes?: number;
};

/**
 * In-memory implementation of {@link LocalRecoveryStore} with identical cap
 * and eviction semantics, for fast deterministic tests.
 */
export function createMemoryLocalRecoveryStore(
  options: LocalRecoveryStoreOptions = {},
): LocalRecoveryStore {
  const maxNotebookBytes = options.maxNotebookBytes ?? LOCAL_RECOVERY_MAX_NOTEBOOK_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? LOCAL_RECOVERY_MAX_TOTAL_BYTES;
  const records = new Map<string, StoredLocalRecoveryRecord>();
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = <T>(fn: () => T | Promise<T>): Promise<T> => {
    const next = queue.then(fn, fn);
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  return {
    get(scope, path) {
      return enqueue(() => {
        const record = records.get(localRecoveryKey(scope, path));
        return record ? hydrateRecord(record) : undefined;
      });
    },

    save({ scope, path, content, reason, detail, now = Date.now() }) {
      return enqueue(() => {
        const contentJson = JSON.stringify(content);
        const sizeBytes = utf8ByteLength(contentJson);
        if (sizeBytes > maxNotebookBytes) {
          return { ok: false, reason: 'too_large', sizeBytes } as const;
        }
        const key = localRecoveryKey(scope, path);
        const evictedKeys = selectEvictions([...records.values()], key, sizeBytes, maxTotalBytes);
        for (const k of evictedKeys) records.delete(k);
        records.set(key, {
          key,
          scope,
          path,
          at: new Date(now).toISOString(),
          updatedAtMs: now,
          reason,
          ...(detail ? { detail } : {}),
          sizeBytes,
          contentJson,
        });
        return { ok: true, sizeBytes, evictedKeys } as const;
      });
    },

    remove(scope, path) {
      return enqueue(() => {
        records.delete(localRecoveryKey(scope, path));
      });
    },

    removeUnder(scope, path) {
      return enqueue(() => {
        for (const [k, record] of records) {
          if (record.scope === scope && within(record.path, path)) {
            records.delete(k);
          }
        }
      });
    },

    moveUnder(scope, from, to) {
      return enqueue(() => {
        const moved: StoredLocalRecoveryRecord[] = [];
        for (const [k, record] of records) {
          if (record.scope === scope && within(record.path, from)) {
            records.delete(k);
            const nextPath = to + record.path.slice(from.length);
            moved.push({
              ...record,
              key: localRecoveryKey(scope, nextPath),
              path: nextPath,
            });
          }
        }
        for (const record of moved) records.set(record.key, record);
      });
    },

    listAll() {
      return enqueue(() => [...records.values()]);
    },

    clearAll() {
      return enqueue(() => {
        records.clear();
      });
    },
  };
}

export type IndexedDbLocalRecoveryOptions = LocalRecoveryStoreOptions & {
  idb?: IDBFactory | null;
  dbName?: string;
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Native IndexedDB implementation of {@link LocalRecoveryStore}. Degrades
 * cleanly when IndexedDB is unavailable, blocked, or out of quota.
 */
export function createIndexedDbLocalRecoveryStore(
  options: IndexedDbLocalRecoveryOptions = {},
): LocalRecoveryStore {
  const maxNotebookBytes = options.maxNotebookBytes ?? LOCAL_RECOVERY_MAX_NOTEBOOK_BYTES;
  const maxTotalBytes = options.maxTotalBytes ?? LOCAL_RECOVERY_MAX_TOTAL_BYTES;
  const dbName = options.dbName ?? LOCAL_RECOVERY_DB_NAME;

  let cachedDb: IDBDatabase | undefined;
  let openPromise: Promise<IDBDatabase | undefined> | undefined;
  let queue: Promise<unknown> = Promise.resolve();
  let inFlight = 0;

  const resolveIdb = (): IDBFactory | undefined => {
    if ('idb' in options) return options.idb ?? undefined;
    try {
      return typeof indexedDB === 'undefined' ? undefined : indexedDB;
    } catch {
      return undefined;
    }
  };

  const openDb = (): Promise<IDBDatabase | undefined> => {
    if (cachedDb) return Promise.resolve(cachedDb);
    if (openPromise) return openPromise;
    const idb = resolveIdb();
    if (!idb) return Promise.resolve(undefined);

    openPromise = new Promise<IDBDatabase | undefined>(resolve => {
      let req: IDBOpenDBRequest;
      try {
        req = idb.open(dbName, LOCAL_RECOVERY_DB_VERSION);
      } catch {
        openPromise = undefined;
        resolve(undefined);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(LOCAL_RECOVERY_STORE_NAME)) {
          db.createObjectStore(LOCAL_RECOVERY_STORE_NAME, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        cachedDb = db;
        db.onclose = () => {
          if (cachedDb === db) cachedDb = undefined;
          openPromise = undefined;
        };
        db.onversionchange = () => {
          db.close();
          if (cachedDb === db) cachedDb = undefined;
          openPromise = undefined;
        };
        resolve(db);
      };
      req.onerror = () => {
        openPromise = undefined;
        resolve(undefined);
      };
      req.onblocked = () => {
        openPromise = undefined;
        resolve(undefined);
      };
    });
    return openPromise;
  };

  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    // When idle, invoke `fn` synchronously so callers on `pagehide` /
    // `visibilitychange` open their IDB transaction before any microtask tick.
    const startNow = inFlight === 0;
    inFlight++;
    const run = () => fn();
    const next = (startNow ? run() : queue.then(run, run)).finally(() => {
      inFlight--;
    });
    queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  const writeRecord = (
    db: IDBDatabase,
    record: StoredLocalRecoveryRecord,
    evictAllOthers: boolean,
  ): Promise<string[]> => {
    const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readwrite');
    const store = tx.objectStore(LOCAL_RECOVERY_STORE_NAME);
    const done = transactionDone(tx);
    return requestToPromise(store.getAll()).then(async rawAll => {
      const existing: StoredLocalRecoveryRecord[] = [];
      for (const item of rawAll) {
        const parsed = parseStoredRecord(item);
        if (parsed) existing.push(parsed);
      }
      const evictedKeys = evictAllOthers
        ? existing.filter(e => e.key !== record.key).map(e => e.key)
        : selectEvictions(existing, record.key, record.sizeBytes, maxTotalBytes);
      for (const k of evictedKeys) store.delete(k);
      store.put(record);
      await done;
      return evictedKeys;
    });
  };

  return {
    get(scope, path) {
      return enqueue(async () => {
        const db = await openDb();
        if (!db) return undefined;
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readonly');
          const raw = await requestToPromise(
            tx.objectStore(LOCAL_RECOVERY_STORE_NAME).get(localRecoveryKey(scope, path)),
          );
          const parsed = parseStoredRecord(raw);
          return parsed ? hydrateRecord(parsed) : undefined;
        } catch {
          return undefined;
        }
      });
    },

    save({ scope, path, content, reason, detail, now = Date.now() }) {
      const contentJson = JSON.stringify(content);
      const sizeBytes = utf8ByteLength(contentJson);
      if (sizeBytes > maxNotebookBytes) {
        return Promise.resolve({ ok: false, reason: 'too_large', sizeBytes });
      }
      const key = localRecoveryKey(scope, path);
      const record: StoredLocalRecoveryRecord = {
        key,
        scope,
        path,
        at: new Date(now).toISOString(),
        updatedAtMs: now,
        reason,
        ...(detail ? { detail } : {}),
        sizeBytes,
        contentJson,
      };

      // Fast path when DB is already open and queue is idle: start the IDB
      // transaction before any microtask tick so pagehide / visibilitychange
      // flushes complete reliably in WebKit and Chromium.
      const runSave = async (): Promise<SaveLocalRecoveryResult> => {
        const db = cachedDb ?? (await openDb());
        if (!db) return { ok: false, reason: 'unavailable', sizeBytes };
        try {
          const evictedKeys = await writeRecord(db, record, false);
          return { ok: true, sizeBytes, evictedKeys };
        } catch (err) {
          if (isQuotaError(err)) {
            // Retry once after evicting all other entries to reclaim space.
            try {
              const evictedKeys = await writeRecord(db, record, true);
              return { ok: true, sizeBytes, evictedKeys };
            } catch (retryErr) {
              return {
                ok: false,
                reason: isQuotaError(retryErr) ? 'quota_exceeded' : 'unavailable',
                sizeBytes,
              };
            }
          }
          return { ok: false, reason: 'unavailable', sizeBytes };
        }
      };

      return enqueue(runSave);
    },

    remove(scope, path) {
      return enqueue(async () => {
        const db = cachedDb ?? (await openDb());
        if (!db) return;
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readwrite');
          const done = transactionDone(tx);
          tx.objectStore(LOCAL_RECOVERY_STORE_NAME).delete(localRecoveryKey(scope, path));
          await done;
        } catch {
          // Ignore unavailable/closed storage during cleanup.
        }
      });
    },

    removeUnder(scope, path) {
      return enqueue(async () => {
        const db = cachedDb ?? (await openDb());
        if (!db) return;
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readwrite');
          const store = tx.objectStore(LOCAL_RECOVERY_STORE_NAME);
          const done = transactionDone(tx);
          const rawAll = await requestToPromise(store.getAll());
          for (const item of rawAll) {
            const parsed = parseStoredRecord(item);
            if (parsed && parsed.scope === scope && within(parsed.path, path)) {
              store.delete(parsed.key);
            }
          }
          await done;
        } catch {
          // Ignore unavailable/closed storage during cleanup.
        }
      });
    },

    moveUnder(scope, from, to) {
      return enqueue(async () => {
        const db = cachedDb ?? (await openDb());
        if (!db) return;
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readwrite');
          const store = tx.objectStore(LOCAL_RECOVERY_STORE_NAME);
          const done = transactionDone(tx);
          const rawAll = await requestToPromise(store.getAll());
          const moved: StoredLocalRecoveryRecord[] = [];
          for (const item of rawAll) {
            const parsed = parseStoredRecord(item);
            if (parsed && parsed.scope === scope && within(parsed.path, from)) {
              store.delete(parsed.key);
              const nextPath = to + parsed.path.slice(from.length);
              moved.push({
                ...parsed,
                key: localRecoveryKey(scope, nextPath),
                path: nextPath,
              });
            }
          }
          for (const record of moved) store.put(record);
          await done;
        } catch {
          // Ignore unavailable/closed storage during move.
        }
      });
    },

    listAll() {
      return enqueue(async () => {
        const db = cachedDb ?? (await openDb());
        if (!db) return [];
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readonly');
          const rawAll = await requestToPromise(tx.objectStore(LOCAL_RECOVERY_STORE_NAME).getAll());
          const out: StoredLocalRecoveryRecord[] = [];
          for (const item of rawAll) {
            const parsed = parseStoredRecord(item);
            if (parsed) out.push(parsed);
          }
          return out;
        } catch {
          return [];
        }
      });
    },

    clearAll() {
      return enqueue(async () => {
        const db = cachedDb ?? (await openDb());
        if (!db) return;
        try {
          const tx = db.transaction(LOCAL_RECOVERY_STORE_NAME, 'readwrite');
          const done = transactionDone(tx);
          tx.objectStore(LOCAL_RECOVERY_STORE_NAME).clear();
          await done;
        } catch {
          // Ignore unavailable/closed storage.
        }
      });
    },
  };
}

let activeStore: LocalRecoveryStore = createIndexedDbLocalRecoveryStore();

export function getLocalRecoveryStore(): LocalRecoveryStore {
  return activeStore;
}

export function setLocalRecoveryStoreForTests(store: LocalRecoveryStore): void {
  activeStore = store;
}

export function resetLocalRecoveryStoreForTests(): void {
  activeStore = createIndexedDbLocalRecoveryStore();
}
