import type * as nbformat from '@jupyterlab/nbformat';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_RECOVERY_MAX_NOTEBOOK_BYTES,
  LOCAL_RECOVERY_MAX_TOTAL_BYTES,
  createIndexedDbLocalRecoveryStore,
  createMemoryLocalRecoveryStore,
  hasLocalRecoveryChanges,
  localRecoveryKey,
  localRecoveryReasonLabel,
  selectEvictions,
  utf8ByteLength,
} from './local-recovery';

function makeNotebook(source: string, id = 'c1'): nbformat.INotebookContent {
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      {
        id,
        cell_type: 'code',
        source,
        metadata: {},
        execution_count: null,
        outputs: [],
      },
    ],
  };
}

/**
 * Lightweight mock IDBFactory implementing the IndexedDB subset used by
 * `createIndexedDbLocalRecoveryStore`, with optional error injection for
 * QuotaExceededError and SecurityError testing.
 */
function createMockIdbFactory(opts?: {
  failOpen?: Error;
  failPut?: (record: unknown, storeSize: number) => Error | undefined;
}) {
  const stores = new Map<string, Map<string, unknown>>();

  const makeRequest = <T>(run: () => T) => {
    const req: {
      result?: T;
      error?: Error;
      onsuccess?: () => void;
      onerror?: () => void;
    } = {};
    queueMicrotask(() => {
      try {
        req.result = run();
        req.onsuccess?.();
      } catch (e) {
        req.error = e instanceof Error ? e : new Error(String(e));
        req.onerror?.();
      }
    });
    return req as unknown as IDBRequest<T>;
  };

  const factory = {
    open(_name: string) {
      const openReq: {
        result?: IDBDatabase;
        error?: Error;
        onupgradeneeded?: () => void;
        onsuccess?: () => void;
        onerror?: () => void;
        onblocked?: () => void;
      } = {};
      queueMicrotask(() => {
        if (opts?.failOpen) {
          openReq.error = opts.failOpen;
          openReq.onerror?.();
          return;
        }
        const db = {
          objectStoreNames: {
            contains: (name: string) => stores.has(name),
          },
          createObjectStore: (name: string) => {
            if (!stores.has(name)) stores.set(name, new Map());
          },
          close: () => {},
          transaction(storeName: string) {
            const map = stores.get(storeName) ?? new Map<string, unknown>();
            stores.set(storeName, map);
            let settled = false;
            let completeTimer: ReturnType<typeof setTimeout> | undefined;
            const scheduleComplete = () => {
              if (completeTimer !== undefined) clearTimeout(completeTimer);
              completeTimer = setTimeout(() => {
                completeTimer = undefined;
                if (!settled && !tx.error) {
                  settled = true;
                  tx.oncomplete?.();
                }
              }, 0);
            };
            const tx: {
              error?: Error;
              oncomplete?: () => void;
              onerror?: () => void;
              onabort?: () => void;
              objectStore: (n: string) => unknown;
            } = {
              objectStore: () => ({
                get: (key: string) => {
                  scheduleComplete();
                  return makeRequest(() => map.get(key));
                },
                getAll: () => {
                  scheduleComplete();
                  return makeRequest(() => [...map.values()]);
                },
                delete: (key: string) => {
                  scheduleComplete();
                  map.delete(key);
                },
                clear: () => {
                  scheduleComplete();
                  map.clear();
                },
                put: (value: { key: string }) => {
                  const err = opts?.failPut?.(value, map.size);
                  if (err) {
                    if (completeTimer !== undefined) {
                      clearTimeout(completeTimer);
                      completeTimer = undefined;
                    }
                    settled = true;
                    tx.error = err;
                    queueMicrotask(() => tx.onabort?.());
                    return;
                  }
                  scheduleComplete();
                  map.set(value.key, value);
                },
              }),
            };
            scheduleComplete();
            return tx as unknown as IDBTransaction;
          },
        } as unknown as IDBDatabase;
        openReq.result = db;
        openReq.onupgradeneeded?.();
        openReq.onsuccess?.();
      });
      return openReq as unknown as IDBOpenDBRequest;
    },
  };

  return { idb: factory as unknown as IDBFactory, stores };
}

describe('local-recovery helpers (#808)', () => {
  it('exposes the approved 10 MiB per-notebook and 50 MiB total caps', () => {
    expect(LOCAL_RECOVERY_MAX_NOTEBOOK_BYTES).toBe(10 * 1024 * 1024);
    expect(LOCAL_RECOVERY_MAX_TOTAL_BYTES).toBe(50 * 1024 * 1024);
  });

  it('selects oldest entries first for eviction and excludes replacing the same key', () => {
    const existing = [
      { key: 's\nc.ipynb', sizeBytes: 20, updatedAtMs: 300 },
      { key: 's\na.ipynb', sizeBytes: 20, updatedAtMs: 100 },
      { key: 's\nb.ipynb', sizeBytes: 20, updatedAtMs: 200 },
    ];
    // Total is 60, incoming d needs 25 -> must evict a (100) and b (200) to fit in 50.
    expect(selectEvictions(existing, 's\nd.ipynb', 25, 50)).toEqual(['s\na.ipynb', 's\nb.ipynb']);
    // Replacing b.ipynb with 10 bytes: others total 40, 40 + 10 <= 50 -> no evictions.
    expect(selectEvictions(existing, 's\nb.ipynb', 10, 50)).toEqual([]);
  });

  it('detects whether a recovery snapshot actually differs from the loaded notebook', () => {
    const a = makeNotebook('const x = 1;');
    const aLines: nbformat.INotebookContent = {
      ...a,
      cells: [{ ...a.cells[0]!, source: ['const x = 1;'] }],
    };
    const b = makeNotebook('const x = 2;');
    expect(hasLocalRecoveryChanges(a, a)).toBe(false);
    expect(hasLocalRecoveryChanges(a, aLines)).toBe(false);
    expect(hasLocalRecoveryChanges(a, b)).toBe(true);
    expect(hasLocalRecoveryChanges(a, undefined)).toBe(true);
  });

  it('provides plain-language labels for local recovery reasons', () => {
    expect(localRecoveryReasonLabel('unsaved_edits')).toBe('Local unsaved copy');
    expect(localRecoveryReasonLabel('save_failed')).toBe('Local copy (save failed)');
    expect(localRecoveryReasonLabel('offline')).toBe('Local copy (saved offline)');
  });
});

describe('createMemoryLocalRecoveryStore (#808)', () => {
  it('saves, overwrites (latest copy wins per scope+path), and removes snapshots', async () => {
    const store = createMemoryLocalRecoveryStore();
    const first = makeNotebook('v1');
    const second = makeNotebook('v2');

    const r1 = await store.save({
      scope: 'ganymede:',
      path: 'work/a.ipynb',
      content: first,
      reason: 'unsaved_edits',
      now: 1_000,
    });
    expect(r1.ok).toBe(true);

    const r2 = await store.save({
      scope: 'ganymede:',
      path: 'work/a.ipynb',
      content: second,
      reason: 'save_failed',
      detail: 'Disk full',
      now: 2_000,
    });
    expect(r2.ok).toBe(true);

    const loaded = await store.get('ganymede:', 'work/a.ipynb');
    expect(loaded?.content).toEqual(second);
    expect(loaded?.reason).toBe('save_failed');
    expect(loaded?.detail).toBe('Disk full');
    expect(loaded?.updatedAtMs).toBe(2_000);

    // Same path in another backend scope is isolated.
    expect(await store.get('machine:m1', 'work/a.ipynb')).toBeUndefined();

    await store.remove('ganymede:', 'work/a.ipynb');
    expect(await store.get('ganymede:', 'work/a.ipynb')).toBeUndefined();
  });

  it('refuses a single notebook exceeding the per-notebook byte cap without throwing', async () => {
    const store = createMemoryLocalRecoveryStore({ maxNotebookBytes: 500, maxTotalBytes: 2_000 });
    const huge = makeNotebook('x'.repeat(600));
    const res = await store.save({
      scope: 'browser',
      path: 'huge.ipynb',
      content: huge,
      reason: 'unsaved_edits',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.reason).toBe('too_large');
      expect(res.sizeBytes).toBeGreaterThan(500);
    }
    expect(await store.get('browser', 'huge.ipynb')).toBeUndefined();
  });

  it('evicts oldest entries first when exceeding the total cap across scopes', async () => {
    const sample = makeNotebook('a'.repeat(120));
    const oneSize = utf8ByteLength(JSON.stringify(sample));
    const store = createMemoryLocalRecoveryStore({
      maxNotebookBytes: oneSize + 100,
      maxTotalBytes: oneSize * 2 + 50,
    });

    await store.save({
      scope: 'ganymede:',
      path: 'one.ipynb',
      content: sample,
      reason: 'unsaved_edits',
      now: 100,
    });
    await store.save({
      scope: 'browser',
      path: 'two.ipynb',
      content: sample,
      reason: 'unsaved_edits',
      now: 200,
    });
    const r3 = await store.save({
      scope: 'machine:m1',
      path: 'three.ipynb',
      content: sample,
      reason: 'unsaved_edits',
      now: 300,
    });
    expect(r3).toEqual({
      ok: true,
      sizeBytes: oneSize,
      evictedKeys: [localRecoveryKey('ganymede:', 'one.ipynb')],
    });
    expect(await store.get('ganymede:', 'one.ipynb')).toBeUndefined();
    expect(await store.get('browser', 'two.ipynb')).toBeDefined();
    expect(await store.get('machine:m1', 'three.ipynb')).toBeDefined();
  });

  it('moves and removes entries under a renamed or deleted folder', async () => {
    const store = createMemoryLocalRecoveryStore();
    await store.save({
      scope: 'ganymede:',
      path: 'dir/sub/a.ipynb',
      content: makeNotebook('a'),
      reason: 'unsaved_edits',
    });
    await store.save({
      scope: 'ganymede:',
      path: 'other/b.ipynb',
      content: makeNotebook('b'),
      reason: 'unsaved_edits',
    });

    await store.moveUnder('ganymede:', 'dir', 'renamed');
    expect(await store.get('ganymede:', 'dir/sub/a.ipynb')).toBeUndefined();
    expect((await store.get('ganymede:', 'renamed/sub/a.ipynb'))?.path).toBe('renamed/sub/a.ipynb');
    expect(await store.get('ganymede:', 'other/b.ipynb')).toBeDefined();

    await store.removeUnder('ganymede:', 'renamed');
    expect(await store.get('ganymede:', 'renamed/sub/a.ipynb')).toBeUndefined();
    expect(await store.get('ganymede:', 'other/b.ipynb')).toBeDefined();
  });
});

describe('createIndexedDbLocalRecoveryStore (#808)', () => {
  it('persists, evicts oldest entries first, moves, and removes via IndexedDB', async () => {
    const { idb } = createMockIdbFactory();
    const nb = makeNotebook('hello world');
    const oneSize = utf8ByteLength(JSON.stringify(nb));
    const store = createIndexedDbLocalRecoveryStore({
      idb,
      maxNotebookBytes: oneSize + 100,
      maxTotalBytes: oneSize * 2 + 20,
    });

    await store.save({ scope: 's', path: '1.ipynb', content: nb, reason: 'offline', now: 10 });
    await store.save({ scope: 's', path: '2.ipynb', content: nb, reason: 'offline', now: 20 });
    const third = await store.save({
      scope: 's',
      path: '3.ipynb',
      content: nb,
      reason: 'save_failed',
      detail: 'Network error',
      now: 30,
    });
    expect(third.ok).toBe(true);
    if (third.ok) {
      expect(third.evictedKeys).toEqual([localRecoveryKey('s', '1.ipynb')]);
    }
    expect(await store.get('s', '1.ipynb')).toBeUndefined();
    const loaded = await store.get('s', '3.ipynb');
    expect(loaded?.content).toEqual(nb);
    expect(loaded?.detail).toBe('Network error');

    await store.moveUnder('s', '3.ipynb', '3-moved.ipynb');
    expect(await store.get('s', '3.ipynb')).toBeUndefined();
    expect((await store.get('s', '3-moved.ipynb'))?.path).toBe('3-moved.ipynb');

    await store.remove('s', '3-moved.ipynb');
    expect(await store.get('s', '3-moved.ipynb')).toBeUndefined();
  });

  it('retries after evicting other entries on QuotaExceededError and returns quota_exceeded if still full', async () => {
    let attempts = 0;
    const quotaError = Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
    const { idb } = createMockIdbFactory({
      failPut: (_rec, size) => {
        attempts++;
        // Fail while another record still occupies space; succeed once cleared.
        if (size > 0) return quotaError;
        return undefined;
      },
    });
    const store = createIndexedDbLocalRecoveryStore({ idb });
    await store.save({
      scope: 's',
      path: 'old.ipynb',
      content: makeNotebook('old'),
      reason: 'unsaved_edits',
      now: 1,
    });
    const res = await store.save({
      scope: 's',
      path: 'new.ipynb',
      content: makeNotebook('new'),
      reason: 'unsaved_edits',
      now: 2,
    });
    expect(res.ok).toBe(true);
    expect(attempts).toBe(3); // 1 for old, 1 failed for new, 1 retry after eviction
    expect(await store.get('s', 'old.ipynb')).toBeUndefined();
    expect(await store.get('s', 'new.ipynb')).toBeDefined();

    // Always-failing QuotaExceededError returns quota_exceeded without throwing.
    const alwaysFull = createMockIdbFactory({ failPut: () => quotaError });
    const fullStore = createIndexedDbLocalRecoveryStore({ idb: alwaysFull.idb });
    const failed = await fullStore.save({
      scope: 's',
      path: 'x.ipynb',
      content: makeNotebook('x'),
      reason: 'unsaved_edits',
    });
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.reason).toBe('quota_exceeded');
  });

  it('degrades gracefully when IndexedDB is missing or throws SecurityError', async () => {
    const noIdb = createIndexedDbLocalRecoveryStore({ idb: null });
    expect(await noIdb.get('s', 'a.ipynb')).toBeUndefined();
    const res1 = await noIdb.save({
      scope: 's',
      path: 'a.ipynb',
      content: makeNotebook('x'),
      reason: 'unsaved_edits',
    });
    expect(res1.ok).toBe(false);
    if (!res1.ok) expect(res1.reason).toBe('unavailable');

    const blocked = createMockIdbFactory({
      failOpen: Object.assign(new Error('Blocked'), { name: 'SecurityError' }),
    });
    const blockedStore = createIndexedDbLocalRecoveryStore({ idb: blocked.idb });
    expect(await blockedStore.get('s', 'a.ipynb')).toBeUndefined();
    const res2 = await blockedStore.save({
      scope: 's',
      path: 'a.ipynb',
      content: makeNotebook('x'),
      reason: 'unsaved_edits',
    });
    expect(res2.ok).toBe(false);
    if (!res2.ok) expect(res2.reason).toBe('unavailable');
    await expect(blockedStore.remove('s', 'a.ipynb')).resolves.toBeUndefined();
  });

  it('ignores corrupted JSON records cleanly', async () => {
    const { idb, stores } = createMockIdbFactory();
    const store = createIndexedDbLocalRecoveryStore({ idb });
    // Initialize store via a save, then corrupt the stored JSON.
    await store.save({
      scope: 's',
      path: 'bad.ipynb',
      content: makeNotebook('ok'),
      reason: 'unsaved_edits',
    });
    const map = stores.get('snapshots')!;
    const key = localRecoveryKey('s', 'bad.ipynb');
    const rec = map.get(key) as Record<string, unknown>;
    map.set(key, { ...rec, contentJson: '{not valid json' });
    expect(await store.get('s', 'bad.ipynb')).toBeUndefined();
  });

  it('opens the IndexedDB transaction synchronously when already connected and idle (pagehide flush)', async () => {
    let txOpened = 0;
    const { idb } = createMockIdbFactory();
    const wrappedIdb = {
      open(name: string, version?: number) {
        const req = idb.open(name, version);
        const orig = Object.getOwnPropertyDescriptor(req, 'onsuccess');
        void orig;
        const origOnSuccessSetter = () => {
          const db = req.result;
          const origTx = db.transaction.bind(db);
          db.transaction = ((...args: Parameters<IDBDatabase['transaction']>) => {
            txOpened++;
            return origTx(...args);
          }) as IDBDatabase['transaction'];
        };
        let userOnSuccess: ((ev: Event) => void) | null = null;
        Object.defineProperty(req, 'onsuccess', {
          configurable: true,
          get: () => userOnSuccess,
          set: (fn: ((ev: Event) => void) | null) => {
            userOnSuccess = ev => {
              origOnSuccessSetter();
              fn?.(ev);
            };
          },
        });
        return req;
      },
    } as unknown as IDBFactory;

    const store = createIndexedDbLocalRecoveryStore({ idb: wrappedIdb });
    // Warm up the connection (as opening a notebook does via get()).
    await store.get('s', 'warm.ipynb');
    const before = txOpened;
    const pending = store.save({
      scope: 's',
      path: 'flush.ipynb',
      content: makeNotebook('flush'),
      reason: 'unsaved_edits',
    });
    // Transaction must have been opened synchronously before awaiting `pending`.
    expect(txOpened).toBe(before + 1);
    const res = await pending;
    expect(res.ok).toBe(true);
  });
});
