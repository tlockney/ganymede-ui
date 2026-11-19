// @vitest-environment node
// Runs parquet.ts against the real DuckDB wasm package at the pinned
// version, through its blocking Node build: writes a Parquet file with
// DuckDB, then reads it back as the data view does.
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { loadDuckdbFiles } from './duckdb-files';
import { columnFor, openEngine, parquetTable, plain, type ArrowLike, type Engine } from './parquet';

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
      'number',
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
    expect(first[2]).toBe(0);
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
