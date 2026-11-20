// @vitest-environment node
// Runs the console's session against the real DuckDB wasm package at the
// pinned version, through its blocking Node build: files registered under
// the path as written, then queried by it, and the result types as shown.
import { rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import { ConsoleSession } from './duckdb-console';
import { takeBatches, type ArrowLike, type Engine } from './parquet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Blocking = any;
const require = createRequire(import.meta.url);

async function nodeEngine(): Promise<{ engine: Engine; db: Blocking; conn: Blocking }> {
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
  return {
    db,
    conn,
    engine: {
      register: (name, bytes) => db.registerFileBuffer(name, bytes),
      query: sql => conn.query(sql) as ArrowLike,
      // As openEngine streams, over the blocking build's connection.
      stream: async (sql, maxRows) => {
        const reader = await conn.send(sql, true);
        return takeBatches(reader, maxRows);
      },
    },
  };
}

function backendWith(files: Record<string, string | Uint8Array>) {
  const fake = fakeServices({ '': [] });
  fake.contents.get.mockImplementation((async (path: string, opts?: { content?: boolean }) => {
    const f = files[path];
    if (f === undefined) throw Object.assign(new Error('nf'), { response: { status: 404 } });
    const bytes = typeof f === 'string' ? new TextEncoder().encode(f) : f;
    if (opts?.content === false) return { path, name: path, type: 'file', size: bytes.length };
    const content = typeof f === 'string' ? f : Buffer.from(f).toString('base64');
    return {
      path,
      name: path,
      type: 'file',
      format: typeof f === 'string' ? 'text' : 'base64',
      content,
    };
  }) as never);
  return fakeBackend(fake.services, { kind: 'browser' });
}

describe('ConsoleSession on the real DuckDB', () => {
  it('queries CSV, TSV, JSON and Parquet files by their relative paths, and keeps tables', async () => {
    const { engine, db, conn } = await nodeEngine();
    const file = join(tmpdir(), `ganymede-ui-console-${process.pid}.parquet`);
    conn.query(
      `copy (select i::bigint as id, 'p' || i as name from range(4) t(i)) to '${file}' (format parquet)`,
    );
    const parquet: Uint8Array = db.copyFileToBuffer(file).slice();
    rmSync(file, { force: true });
    const s = new ConsoleSession(
      engine,
      backendWith({
        'work/data/moons.csv': 'name,radius\nIo,1821.6\nEuropa,1560.8\n',
        'work/t.tsv': 'a\tb\n1\tx\n2\ty\n',
        'work/j.json': '[{"k": 1}, {"k": 2}, {"k": 3}]',
        'work/data/p.parquet': parquet,
      }),
      'work',
    );

    const csv = await s.run(`select name, radius from 'data/moons.csv' order by radius desc`);
    expect(csv.files).toEqual(['work/data/moons.csv']);
    expect(csv.shown?.resource.data).toEqual([
      ['Io', 1821.6],
      ['Europa', 1560.8],
    ]);
    expect(
      (await s.run(`select sum(b = 'y')::int as n from 't.tsv'`)).shown?.resource.data,
    ).toEqual([[1]]);
    expect((await s.run(`select count(*) as n from './j.json'`)).shown?.resource.data).toEqual([
      [3],
    ]);
    const pq = await s.run(`select * from 'data/p.parquet' where id > 1`);
    expect(pq.shown?.resource.data).toEqual([
      [2, 'p2'],
      [3, 'p3'],
    ]);

    // The session keeps its tables.
    expect((await s.run('create table z(i int)')).message).toBe('OK');
    expect((await s.run(`create table m as select * from 'data/moons.csv'`)).message).toBe(
      '2 rows affected',
    );
    expect((await s.run(`insert into m values ('Callisto', 2410.3)`)).message).toBe(
      '1 row affected',
    );
    expect((await s.run('select count(*) as n from m')).shown?.resource.data).toEqual([[3]]);
    expect((await s.run('.tables')).shown?.resource.data).toEqual([['m'], ['z']]);
    expect((await s.run('.schema m')).shown?.resource.data?.map(r => (r as unknown[])[0])).toEqual([
      'name',
      'radius',
    ]);

    // (DuckDB's own errors are the e2e test's: the Node build can't throw them.)
    expect((await s.run('select 42 as answer')).shown?.resource.data).toEqual([[42]]);
    expect(s.files).toEqual([
      'work/data/moons.csv',
      'work/t.tsv',
      'work/j.json',
      'work/data/p.parquet',
    ]);
    expect(s.ran).toHaveLength(9);
  }, 60_000);

  it('registers every string DuckDB reads as a file', async () => {
    const { engine, db, conn } = await nodeEngine();
    const file = join(tmpdir(), `ganymede-ui-console-forms-${process.pid}.parquet`);
    conn.query(`copy (select 7::bigint as id) to '${file}' (format parquet)`);
    const parquet: Uint8Array = db.copyFileToBuffer(file).slice();
    rmSync(file, { force: true });
    const s = new ConsoleSession(
      engine,
      backendWith({
        'a.csv': 'x\n1\n',
        'b.csv': 'x\n2\n',
        // Named only after USING, so only that position can have registered them.
        'del.csv': 'x\n2\n',
        'mrg.csv': 'x\n1\n',
        'p.parquet': parquet,
      }),
      '',
    );
    const rows = async (sql: string) => (await s.run(sql)).shown?.resource.data;
    const forms: [string, unknown[]][] = [
      [`select x from read_csv(['a.csv', 'b.csv']) order by x`, [[1], [2]]],
      [`select x from read_csv([E'a.csv', $$b.csv$$]) order by x`, [[1], [2]]],
      [`select id from read_parquet(['p.parquet'])`, [[7]]],
      [`select id from parquet_scan('p.parquet')`, [[7]]],
      [`select x from E'a.csv'`, [[1]]],
      [`select x from $$b.csv$$`, [[2]]],
      [`select x from $t$a.csv$t$`, [[1]]],
      [`select x from read_csv(E'b.csv')`, [[2]]],
      [`pivot 'a.csv' on x using sum(x)`, [[1]]],
      [`unpivot 'a.csv' on x into name n value v`, [['x', 1]]],
    ];
    for (const [sql, data] of forms) expect(await rows(sql), sql).toEqual(data);
    // DELETE ... USING and MERGE INTO ... USING read the file after USING as a table.
    await s.run(`create table t as select * from (values (1), (2), (3)) v(k)`);
    await s.run(`delete from t using 'del.csv' b where t.k = b.x`);
    expect(await rows(`select k from t order by k`), 'delete using').toEqual([[1], [3]]);
    await s.run(
      `merge into t using 'mrg.csv' s on t.k = s.x when matched then delete when not matched then insert values (s.x + 9)`,
    );
    expect(await rows(`select k from t order by k`), 'merge using').toEqual([[3]]);
    for (const sql of [
      `describe 'a.csv'`,
      `summarize 'a.csv'`,
      `show 'a.csv'`,
      `select * from sniff_csv('a.csv')`,
      `select * from parquet_metadata('p.parquet')`,
      `select * from parquet_schema('p.parquet')`,
      `select * from parquet_file_metadata('p.parquet')`,
    ]) {
      const r = await s.run(sql);
      expect(r.shown?.total, sql).toBeGreaterThan(0);
    }
  }, 60_000);

  it('shows the types DuckDB gives', async () => {
    const { engine } = await nodeEngine();
    const s = new ConsoleSession(engine, backendWith({}), '');
    const r = await s.run(`select 1 as a, 2.5::decimal(10, 2) as d, date '2024-01-02' as dt,
      timestamp '2024-01-02 03:04:05' as ts, [1, 2] as l, {'a': 1} as st, 5::bigint as b,
      true as bo, null as n, time '01:02:03' as tm, 1::hugeint as h`);
    expect(r.shown?.resource.data).toEqual([
      [
        1,
        2.5,
        '2024-01-02',
        '2024-01-02 03:04:05',
        '[1, 2]',
        "{'a': 1}",
        5,
        true,
        null,
        '01:02:03',
        '1',
      ],
    ]);
    const two = await s.run('select 1 as x, 2 as x');
    expect(two.shown?.resource.data).toEqual([[1, 2]]);
    expect(two.shown?.resource.schema?.fields?.map(f => f.name)).toEqual(['x', 'x_1']);
  }, 60_000);

  it('shows nested and odd types as DuckDB writes them', async () => {
    const { engine } = await nodeEngine();
    const s = new ConsoleSession(engine, backendWith({}), '');
    const one = async (sql: string) => (await s.run(sql)).shown?.resource.data?.[0];
    expect(await one('select [1.5, 2.25] as v')).toEqual(['[1.50, 2.25]']);
    expect(await one(`select {'a': 1.5} as v`)).toEqual(["{'a': 1.5}"]);
    expect(await one(`select [date '2024-01-01'] as v`)).toEqual(['[2024-01-01]']);
    expect(await one(`select interval 1 day as v`)).toEqual(['1 day']);
    expect(await one(`select 'ab'::blob as v`)).toEqual(['ab']);
    expect(await one(`select map {'k': 1} as v`)).toEqual(['{k=1}']);
    // Microseconds, which a JavaScript date can't hold.
    expect(await one(`select timestamp '2024-01-02 03:04:05.123456' as v`)).toEqual([
      '2024-01-02 03:04:05.123456',
    ]);
    expect(await one(`select time '01:02:03.5' as v`)).toEqual(['01:02:03.5']);
    // Past 2^53: every digit.
    expect(await one(`select 12345678901234567890123456789012345678::decimal(38, 0) as v`)).toEqual(
      ['12345678901234567890123456789012345678'],
    );
    expect(await one('select 123456789012345678901234567890::hugeint as v')).toEqual([
      '123456789012345678901234567890',
    ]);
    // The type map is parquet.ts's: a UBIGINT is a number while it fits, a decimal of up to 18 digits a number, a wider one exact text.
    expect(await one('select 7::ubigint as v')).toEqual([7]);
    expect(await one('select 18446744073709551615::ubigint as v')).toEqual([
      '18446744073709551615',
    ]);
    expect(await one('select 1.25::decimal(15, 2) as v')).toEqual([1.25]);
    expect(await one('select 1.25::decimal(18, 2) as v')).toEqual([1.25]);
    expect(await one('select 1.25::decimal(19, 2) as v')).toEqual(['1.25']);
    expect(await one(`select date '2024-01-02' as v`)).toEqual(['2024-01-02']);
    // Plain columns stay typed beside them, and a repeated name is kept.
    const mixed = await s.run('select 1 as a, [1] as b, 2 as a, 2.5 as d');
    expect(mixed.shown?.resource.schema?.fields).toEqual([
      { name: 'a', type: 'integer' },
      { name: 'b', type: 'string' },
      { name: 'a_1', type: 'integer' },
      { name: 'd', type: 'number' },
    ]);
    expect(mixed.shown?.resource.data).toEqual([[1, '[1]', 2, 2.5]]);
    // Other query forms are wrapped too, with a comment last.
    expect(await one('with x as (select [1] as l) select * from x -- done')).toEqual(['[1]']);
    expect(await one('from (values ([1, 2])) t(l)')).toEqual(['[1, 2]']);
    expect((await s.run('summarize select 1 as x')).shown?.total).toBe(1);
    // A statement that isn't a query runs as written.
    expect((await s.run('create table n as select [1] as l')).message).toBe('1 row affected');
    expect(await one('select l from n')).toEqual(['[1]']);
  }, 60_000);

  it('reads only the start of a big result, and keeps working after', async () => {
    const { engine } = await nodeEngine();
    const s = new ConsoleSession(engine, backendWith({}), '');
    const big = await s.run('select * from range(50000)');
    expect(big.shown?.resource.data).toHaveLength(10_000);
    expect(big.shown?.resource.data?.[9_999]).toEqual([9_999]);
    expect(big.shown?.more).toBe(true);
    // Fewer rows than the result has were brought out of DuckDB: a few batches past the cap.
    expect(big.shown!.total).toBeGreaterThan(10_000);
    expect(big.shown!.total).toBeLessThan(50_000);
    // The cut-off result leaves the connection usable.
    expect((await s.run('select 7 as k')).shown?.resource.data).toEqual([[7]]);
    // A result within the cap is read whole, with its exact count.
    const small = await s.run('select * from range(9000)');
    expect(small.shown?.total).toBe(9000);
    expect(small.shown?.more).toBeUndefined();
    // And so are results with no rows, and statements that return a count.
    const none = await s.run('select 1 as a where false');
    expect([none.shown?.total, none.shown?.resource.schema?.fields?.length]).toEqual([0, 1]);
    expect((await s.run('create table r as select * from range(30000)')).message).toBe(
      '30,000 rows affected',
    );
    expect((await s.run('select count(*) as n from r')).shown?.resource.data).toEqual([[30000]]);
    const exact = await s.run('select * from r');
    expect(exact.shown?.resource.data).toHaveLength(10_000);
    expect(exact.shown!.total).toBeLessThan(30_000);
  }, 60_000);
});
