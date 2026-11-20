// @vitest-environment node
// Runs parquet.ts against the real DuckDB wasm package at the pinned
// version, through its blocking Node build: writes a Parquet file with
// DuckDB, then reads it back as the data view does.
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SQL_MODULES } from '@tlockney/cdp-kernel/browser';
import { loadDuckdbFiles } from './duckdb-files';
import {
  columnFor,
  openEngine,
  parquetTable,
  plain,
  takeBatches,
  type ArrowLike,
  type BatchLike,
  type Engine,
} from './parquet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Blocking = any;
const require = createRequire(import.meta.url);

async function nodeEngine(): Promise<{ engine: Engine; db: Blocking }> {
  const duckdb: Blocking = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs');
  const bundle = {
    mainModule: require.resolve('@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm'),
    mainWorker: '',
  };
  const db = await duckdb.createDuckDB(
    { mvp: bundle },
    new duckdb.VoidLogger(),
    duckdb.NODE_RUNTIME,
  );
  await db.instantiate(() => {});
  const conn = db.connect();
  const engine: Engine = {
    register: (name, bytes) => db.registerFileBuffer(name, bytes),
    query: sql => conn.query(sql) as ArrowLike,
  };
  return { engine, db: { db, conn } };
}

describe('parquet', () => {
  it('reads the schema and rows of a real Parquet file', async () => {
    const { engine, db } = await nodeEngine();
    const file = join(tmpdir(), `ganymede-ui-test-${process.pid}.parquet`);
    db.conn.query(`
      copy (select
        i::bigint as id,
        'row ' || i as name,
        i * 1.5 as score,
        (i % 2 = 0) as even,
        9223372036854775807::bigint as big,
        1.25::decimal(10, 2) as price,
        date '2024-01-01' + i::integer as day,
        [i, i + 1] as pair,
        NULL::varchar as nothing,
        18446744073709551615::ubigint as wide
      from range(5) t(i)) to '${file}' (format parquet)`);
    const bytes: Uint8Array = db.db.copyFileToBuffer(file).slice();
    rmSync(file, { force: true });

    const t = await parquetTable(engine, bytes, 'in.parquet', 3);
    expect(t.total).toBe(5);
    expect(t.schema.map(c => c.name)).toEqual([
      'id',
      'name',
      'score',
      'even',
      'big',
      'price',
      'day',
      'pair',
      'nothing',
      'wide',
    ]);
    expect(t.resource.schema?.fields?.map(f => f.type)).toEqual([
      'integer',
      'string',
      // `i * 1.5` is a DECIMAL(38,1), wider than a double holds exactly: text.
      'string',
      'boolean',
      'integer',
      'number',
      'string',
      'string',
      'string',
      'integer',
    ]);
    // The row cap, with the file's own count kept for the footer.
    expect(t.resource.data).toHaveLength(3);
    expect(t.resource.ganymede?.rows).toBeUndefined();
    const first = t.resource.data![0] as unknown[];
    expect(first[0]).toBe(0);
    expect(first[1]).toBe('row 0');
    expect(first[2]).toBe('0.0');
    expect(first[3]).toBe(true);
    // Past 2^53: kept exact, as text.
    expect(first[4]).toBe('9223372036854775807');
    expect(first[5]).toBe(1.25);
    expect(first[6]).toBe('2024-01-01');
    expect(first[7]).toBe('[0, 1]');
    expect(first[8]).toBeNull();
    expect(first[9]).toBe('18446744073709551615');
  }, 60_000);
});

describe('columns', () => {
  it('maps DuckDB types to table types and plain SQL', () => {
    expect(columnFor({ name: 'a"b', type: 'BIGINT' })).toEqual({
      type: 'integer',
      select: '"a""b"',
    });
    expect(columnFor({ name: 'x', type: 'HUGEINT' }).select).toBe('cast("x" as varchar)');
    expect(columnFor({ name: 'x', type: 'DECIMAL(10,2)' })).toEqual({
      type: 'number',
      select: 'cast("x" as double)',
    });
    // Up to 18 digits (64-bit) a number; wider, exact text; a list of them is no decimal.
    expect(columnFor({ name: 'x', type: 'DECIMAL(18,2)' })).toEqual({
      type: 'number',
      select: 'cast("x" as double)',
    });
    expect(columnFor({ name: 'x', type: 'DECIMAL(19,2)' })).toEqual({
      type: 'string',
      select: 'cast("x" as varchar)',
    });
    expect(columnFor({ name: 'x', type: 'DECIMAL(3,2)[]' }).type).toBe('string');
    expect(columnFor({ name: 'x', type: 'TIMESTAMP' }).type).toBe('string');
  });
  it('turns 64-bit integers into numbers only when they fit', () => {
    expect(plain(5n)).toBe(5);
    expect(plain(2n ** 60n)).toBe('1152921504606846976');
    expect(plain('x')).toBe('x');
  });
});

vi.mock('./duckdb-files', async importOriginal => ({
  ...(await importOriginal<object>()),
  loadDuckdbFiles: vi.fn(),
}));

describe('openEngine', () => {
  it('reads the module map after the files are loaded', async () => {
    const order: string[] = [];
    vi.mocked(loadDuckdbFiles).mockImplementation(async () => {
      await Promise.resolve();
      order.push('loaded');
    });
    await expect(
      openEngine(() => {
        order.push('map');
        return {};
      }),
    ).rejects.toThrow(/isn’t part of this build/);
    expect(order).toEqual(['loaded', 'map']);
  });
});

describe('openEngine close', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** A DuckDB module whose connection never closes, as one running a long query doesn't. */
  function stuck(closeConnection: string) {
    const terminate = vi.fn();
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.stubGlobal('__terminate', terminate);
    const code = `
      export class VoidLogger {}
      export class AsyncDuckDB {
        async instantiate() {}
        async registerFileBuffer() {}
        async connect() { return { query: async () => ({}), close: () => ${closeConnection} }; }
        async terminate() { globalThis.__terminate(); }
      }`;
    return {
      terminate,
      modules: () => ({ [SQL_MODULES.duckdb]: `data:text/javascript,${encodeURIComponent(code)}` }),
    };
  }

  it('ends the worker even when the connection never finishes closing', async () => {
    vi.mocked(loadDuckdbFiles).mockResolvedValue();
    const { terminate, modules } = stuck('new Promise(() => {})');
    const engine = await openEngine(modules);
    await engine.close!();
    expect(terminate).toHaveBeenCalledTimes(1);
  });

  it('ends the worker when closing the connection would fail', async () => {
    vi.mocked(loadDuckdbFiles).mockResolvedValue();
    const { terminate, modules } = stuck("Promise.reject(new Error('worker busy'))");
    const engine = await openEngine(modules);
    await engine.close!();
    expect(terminate).toHaveBeenCalledTimes(1);
  });
});

describe('takeBatches', () => {
  const batch = (numRows: number): BatchLike => ({ numRows, getChildAt: () => null });
  const schema = { fields: [] };

  /** A reader of `sizes`-row batches that counts the batches pulled from it. */
  function reader(sizes: number[]) {
    const state = { pulled: 0, opened: 0 };
    return {
      state,
      schema,
      open: () => {
        state.opened++;
      },
      async *[Symbol.asyncIterator]() {
        for (const n of sizes) {
          state.pulled++;
          yield batch(n);
        }
      },
    };
  }

  it('stops reading once the batches hold more than the cap', async () => {
    const r = reader([4, 4, 4, 4, 4]);
    const got = await takeBatches(r, 10);
    expect(got.more).toBe(true);
    expect(got.batches.map(b => b.numRows)).toEqual([4, 4, 4]);
    // No batch was pulled past the one that crossed the cap.
    expect(r.state.pulled).toBe(3);
    expect(r.state.opened).toBe(1);
  });

  it('reads a result that fits whole', async () => {
    const r = reader([4, 6]);
    const got = await takeBatches(r, 10);
    expect(got.more).toBe(false);
    expect(got.batches).toHaveLength(2);
    expect(r.state.pulled).toBe(2);
  });
});

describe('openEngine stream', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the SQL as a stream and stops reading past the row cap', async () => {
    vi.mocked(loadDuckdbFiles).mockResolvedValue();
    const calls = {
      send: [] as [string, boolean][],
      pulled: 0,
    };
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('location', { origin: 'http://localhost' });
    vi.stubGlobal('__calls', calls);
    const code = `
      export class VoidLogger {}
      export class AsyncDuckDB {
        async instantiate() {}
        async registerFileBuffer() {}
        async connect() {
          const calls = globalThis.__calls;
          return {
            query: async () => ({}),
            send: async (sql, stream) => {
              calls.send.push([sql, stream]);
              return {
                schema: { fields: [] },
                open() {},
                async *[Symbol.asyncIterator]() {
                  for (let i = 0; i < 10; i++) {
                    calls.pulled++;
                    yield { numRows: 3, getChildAt: () => null };
                  }
                },
              };
            },
            close: async () => {},
          };
        }
        async terminate() {}
      }`;
    const engine = await openEngine(() => ({
      [SQL_MODULES.duckdb]: `data:text/javascript,${encodeURIComponent(code)}`,
    }));
    const got = await engine.stream!('select 1', 7);
    expect(calls.send).toEqual([['select 1', true]]);
    expect(got.more).toBe(true);
    // 3 + 3 + 3 rows is the first to pass 7; the other seven batches stay unread.
    expect(got.batches).toHaveLength(3);
    expect(calls.pulled).toBe(3);
  });
});
