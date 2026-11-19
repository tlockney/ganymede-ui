import { describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  ConsoleSession,
  History,
  consoleNotebook,
  dotCommand,
  endsStatement,
  filePaths,
  limitFor,
  locate,
  resultTable,
  statementsOf,
  templateText,
  type ArrowResult,
} from './duckdb-console';
import { MAX_JSON_BYTES, MAX_PARQUET_BYTES, MAX_TEXT_BYTES } from './data-files';
import type { Engine } from './parquet';

describe('statementsOf', () => {
  it('splits at a semicolon, and keeps text after the last one', () => {
    expect(statementsOf('select 1; select 2;')).toEqual(['select 1', 'select 2']);
    expect(statementsOf('select 1;\nselect 2')).toEqual(['select 1', 'select 2']);
    expect(statementsOf('  select\n  1  ')).toEqual(['select\n  1']);
  });
  it('does not split inside strings, names, dollar strings or comments', () => {
    expect(statementsOf(`select 'a;b', "c;d", $$e;f$$, $t$g;h$t$ -- i;j\n; select 2`)).toEqual([
      `select 'a;b', "c;d", $$e;f$$, $t$g;h$t$ -- i;j`,
      'select 2',
    ]);
    expect(statementsOf('select /* a; /* nested; */ b; */ 1; select 2')).toEqual([
      'select /* a; /* nested; */ b; */ 1',
      'select 2',
    ]);
    expect(statementsOf(`select 'it''s;ok'; select 2`)).toEqual([`select 'it''s;ok'`, 'select 2']);
  });
  it('skips empty statements and comments alone', () => {
    expect(statementsOf(';; -- nothing\n; /* x */ ;')).toEqual([]);
    expect(statementsOf('')).toEqual([]);
  });
  it('takes dot commands among statements, wherever the line falls', () => {
    expect(statementsOf('.tables\nselect 1;\n.schema t\nselect 2')).toEqual([
      '.tables',
      'select 1',
      '.schema t',
      'select 2',
    ]);
    expect(statementsOf('select 1;\n.tables')).toEqual(['select 1', '.tables']);
    // A dotted line that continues a statement, or a string, is not a command.
    expect(statementsOf('select\n.5 + 1;')).toEqual(['select\n.5 + 1']);
    expect(statementsOf("select 'a\n.b';")).toEqual(["select 'a\n.b'"]);
  });
  it('takes a dot command a line', () => {
    expect(statementsOf('.tables\n.schema moons')).toEqual(['.tables', '.schema moons']);
  });
});

describe('endsStatement (the Enter rule)', () => {
  it('runs on a final semicolon, not before it', () => {
    expect(endsStatement('select 1;')).toBe(true);
    expect(endsStatement('select 1;  \n')).toBe(true);
    expect(endsStatement('select 1')).toBe(false);
    expect(endsStatement('select 1;\nselect 2')).toBe(false);
    expect(endsStatement('')).toBe(false);
    expect(endsStatement('  \n')).toBe(false);
  });
  it('ignores a semicolon inside a string, a name or an open comment', () => {
    expect(endsStatement(`select 'a;`)).toBe(false);
    expect(endsStatement(`select 'a;'`)).toBe(false);
    expect(endsStatement(`select "a;"`)).toBe(false);
    expect(endsStatement('select 1 /* ;')).toBe(false);
    expect(endsStatement('select $$ ;')).toBe(false);
    expect(endsStatement('select $$ ; $$')).toBe(false);
  });
  it('looks past a trailing comment', () => {
    expect(endsStatement('select 1; -- done')).toBe(true);
    expect(endsStatement('select 1; /* done */')).toBe(true);
    expect(endsStatement('select 1 -- ;')).toBe(false);
  });
  it('runs on Enter when dot commands and statements are all ended', () => {
    expect(endsStatement('.tables\nselect 1;')).toBe(true);
    expect(endsStatement('select 1;\n.tables')).toBe(true);
    expect(endsStatement('.tables\nselect 1')).toBe(false);
    expect(endsStatement('select\n.5')).toBe(false);
  });
  it('runs a dot command on Enter', () => {
    expect(endsStatement('.tables')).toBe(true);
    expect(endsStatement('.schema moons')).toBe(true);
  });
});

describe('History', () => {
  it('walks back and forward, and returns what was typed', () => {
    const h = new History();
    h.add('select 1;');
    h.add('select 2;');
    expect(h.previous('sel')).toBe('select 2;');
    expect(h.previous('select 2;')).toBe('select 1;');
    expect(h.previous('select 1;')).toBeUndefined();
    expect(h.next()).toBe('select 2;');
    expect(h.next()).toBe('sel');
    expect(h.next()).toBeUndefined();
  });
  it('skips blanks and a repeat of the last input, and restarts after a run', () => {
    const h = new History();
    h.add('  ');
    h.add('select 1;');
    h.add('select 1;');
    expect(h.entries).toEqual(['select 1;']);
    expect(h.previous('')).toBe('select 1;');
    h.add('select 2;');
    expect(h.previous('')).toBe('select 2;');
    h.stop();
    expect(h.next()).toBeUndefined();
    expect(h.previous('x')).toBe('select 2;');
  });
  it('has nothing to walk when empty', () => {
    const h = new History();
    expect(h.previous('x')).toBeUndefined();
    expect(h.next()).toBeUndefined();
  });
});

describe('file paths', () => {
  it('finds quoted data files, once each, and no others', () => {
    expect(
      filePaths(
        `select * from 'data/moons.csv' join 'data/moons.csv' using (id) join "x.csv" join 'y.TSV'
         where a = 'b.json' or c = 'notes.txt' or d = 'x.parquet' -- 'z.csv'
         /* 'w.csv' */ and e = $$q.csv$$`,
      ),
    ).toEqual(['data/moons.csv', 'y.TSV', 'b.json', 'x.parquet']);
  });
  it('reads a doubled quote as one', () => {
    expect(filePaths(`select * from 'it''s.csv'`)).toEqual(["it's.csv"]);
    expect(filePaths(`select 'unterminated.csv`)).toEqual([]);
  });
  it('locates a path from the folder, and refuses one outside it', () => {
    expect(locate('data/moons.csv', '')).toEqual({ local: 'data/moons.csv' });
    expect(locate('./data//moons.csv', 'work')).toEqual({ local: 'work/data/moons.csv' });
    expect(locate('a/../b.csv', 'work')).toEqual({ local: 'work/b.csv' });
    expect(locate('../b.csv', 'work')).toEqual({ outside: true });
    expect(locate('a/../../b.csv', '')).toEqual({ outside: true });
  });
  it('leaves URLs, absolute paths and wildcards to DuckDB', () => {
    for (const p of [
      'https://x.org/a.csv',
      's3://b/a.parquet',
      '/etc/a.csv',
      '~/a.csv',
      'd/*.csv',
      'a?.csv',
    ]) {
      expect(locate(p, 'work')).toEqual({ other: true });
    }
  });
  it('uses the data view’s limits', () => {
    expect(limitFor('csv')).toBe(MAX_TEXT_BYTES);
    expect(limitFor('tsv')).toBe(MAX_TEXT_BYTES);
    expect(limitFor('json')).toBe(MAX_JSON_BYTES);
    expect(limitFor('parquet')).toBe(MAX_PARQUET_BYTES);
  });
});

describe('dotCommand', () => {
  it('maps .tables and .schema to SQL', () => {
    expect(dotCommand('.tables')).toBe('show tables');
    expect(dotCommand('.schema moons')).toBe('describe "moons"');
    expect(dotCommand('.schema "my ""t"""')).toBe('describe "my ""t"""');
    expect(dotCommand('.schema a"b')).toBe('describe "a""b"');
  });
  it('says what is wrong with the others', () => {
    expect(() => dotCommand('.schema')).toThrow(/takes a table name/);
    expect(() => dotCommand('.nope')).toThrow(/no \.nope command/);
  });
});

/** An Arrow-like result of `columns`, each a type and its values. */
function arrow(columns: [string, string, unknown[]][], scale?: number): ArrowResult {
  return {
    numRows: columns[0]?.[2].length ?? 0,
    schema: {
      fields: columns.map(([name, type]) => ({ name, type: { toString: () => type, scale } })),
    },
    getChildAt: (i: number) => ({ get: (r: number) => columns[i]![2][r] }),
    toArray: () => [],
  } as unknown as ArrowResult;
}

describe('resultTable', () => {
  it('types columns and keeps what fits', () => {
    const t = resultTable(
      arrow([
        ['a', 'Int32', [1, 2]],
        ['b', 'Int64', [3n, 2n ** 60n]],
        ['c', 'Utf8', ['x', null]],
        ['d', 'Bool', [true, false]],
        ['e', 'Float64', [1.5, 2]],
        ['f', 'List<Int32>', [{ toJSON: () => [1, 2] }, null]],
      ]),
      'q',
    )!;
    expect(t.total).toBe(2);
    expect(t.resource.schema?.fields?.map(f => f.type)).toEqual([
      'integer',
      'integer',
      'string',
      'boolean',
      'number',
      'string',
    ]);
    expect(t.resource.data).toEqual([
      [1, 3, 'x', true, 1.5, '[1,2]'],
      [2, '1152921504606846976', null, false, 2, null],
    ]);
  });
  it('shows dates, times and decimals as DuckDB would', () => {
    const t = resultTable(
      arrow([
        ['d', 'Date32<DAY>', [Date.UTC(2024, 0, 2)]],
        ['t', 'Timestamp<MICROSECOND>', [Date.UTC(2024, 0, 2, 3, 4, 5)]],
        ['m', 'Time64<MICROSECOND>', [3_723_500_000]],
      ]),
    )!;
    expect(t.resource.data).toEqual([['2024-01-02', '2024-01-02 03:04:05', '01:02:03.5']]);
    const dec = resultTable(arrow([['p', 'Decimal[10e+2]', ['250']]], 2))!;
    expect(dec.resource.data).toEqual([[2.5]]);
  });
  it('caps the rows and keeps the count; renames a repeated column', () => {
    const t = resultTable(
      arrow([
        ['a', 'Int32', [1, 2, 3]],
        ['a', 'Int32', [4, 5, 6]],
      ]),
      undefined,
      2,
    )!;
    expect(t.total).toBe(3);
    expect(t.resource.data).toHaveLength(2);
    expect(t.resource.schema?.fields?.map(f => f.name)).toEqual(['a', 'a_2']);
  });
  it('has no table for no columns', () => {
    expect(resultTable(arrow([]))).toBeUndefined();
  });
});

describe('templateText and the exported notebook', () => {
  const kernel = { name: 'cdp-node', display_name: 'TypeScript', language: 'typescript' };

  it('escapes SQL so the template reads back as written', () => {
    const sql = 'select `a`, \'\\n\' as b, "${x}" as c, $$\\$$';
    const read = new Function('tag', `return tag\`${templateText(sql)}\`;`)(
      (s: TemplateStringsArray, ...v: unknown[]) => [s[0], v.length],
    ) as [string, number];
    expect(read).toEqual([sql, 0]);
  });

  it('has a load cell per file read, then a jupyter.sql cell per statement that ran', () => {
    const nb = consoleNotebook(
      {
        files: ['work/data/moons.csv', 'work/Big Set.parquet'],
        ran: ["create table m as select * from 'data/moons.csv'", 'select count(*) from m'],
      },
      'work',
      kernel,
    );
    expect(nb.metadata.kernelspec.name).toBe('cdp-node');
    const sources = nb.cells.map(c => c.source);
    expect(nb.cells.map(c => c.cell_type)).toEqual(['markdown', 'code', 'code', 'code', 'code']);
    expect(sources.slice(1)).toEqual([
      'await jupyter.sql.load("moons_file", "data/moons.csv");',
      'await jupyter.sql.load("big_set_file", "Big Set.parquet");',
      "await jupyter.sql`create table m as select * from 'data/moons.csv'`;",
      'await jupyter.sql`select count(*) from m`;',
    ]);
  });

  it('is just the title for a session with nothing run', () => {
    expect(consoleNotebook({ files: [], ran: [] }, '', kernel).cells).toHaveLength(1);
  });
});

// ---------- ConsoleSession, against a stand-in engine ----------

type Calls = { registered: [string, Uint8Array][]; queries: string[]; described: string[] };

/** The column types a `describe` of a query answers: `[name, DuckDB type]`. */
function described(columns: [string, string][] = []): ArrowResult {
  return {
    numRows: columns.length,
    schema: { fields: [] },
    toArray: () =>
      columns.map(([column_name, column_type]) => ({
        toJSON: () => ({ column_name, column_type }),
      })),
  } as unknown as ArrowResult;
}

/** The `describe` the console asks of a query before running it. */
const isDescribe = (sql: string) => sql.startsWith('describe select * from (');

function standIn(
  answer: (sql: string) => ArrowResult | Error = () => arrow([['n', 'Int32', [1]]]),
  types: (sql: string) => ArrowResult | Error = () => described(),
) {
  const calls: Calls = { registered: [], queries: [], described: [] };
  const close = vi.fn(async () => {});
  const engine: Engine = {
    register: (name, bytes) => void calls.registered.push([name, bytes]),
    query: async sql => {
      if (isDescribe(sql)) {
        calls.described.push(sql);
        const d = types(sql);
        if (d instanceof Error) throw d;
        return d;
      }
      calls.queries.push(sql);
      const r = answer(sql);
      if (r instanceof Error) throw r;
      return r;
    },
    close,
  };
  return { engine, calls, close };
}

/** A browser-kind backend whose files are `files` (text), with `sizes` to say otherwise. */
function backendWith(files: Record<string, string>, sizes: Record<string, number> = {}) {
  const fake = fakeServices({ '': [] });
  fake.contents.get.mockImplementation((async (path: string, opts?: { content?: boolean }) => {
    if (!(path in files)) {
      throw Object.assign(new Error('not found'), { response: { status: 404 } });
    }
    if (opts?.content === false) {
      return { path, name: path, type: 'file', size: sizes[path] ?? files[path]!.length };
    }
    return { path, name: path, type: 'file', format: 'text', content: files[path] };
  }) as never);
  return { backend: fakeBackend(fake.services, { kind: 'browser' }), fake };
}

describe('ConsoleSession', () => {
  it('reads a named file from the folder and registers it as written, once', async () => {
    const { engine, calls } = standIn();
    const { backend } = backendWith({ 'work/data/moons.csv': 'a\n1\n' });
    const s = new ConsoleSession(engine, backend, 'work');
    const first = await s.run(`select * from 'data/moons.csv'`);
    expect(first.files).toEqual(['work/data/moons.csv']);
    expect(calls.registered.map(([n, b]) => [n, new TextDecoder().decode(b)])).toEqual([
      ['data/moons.csv', 'a\n1\n'],
    ]);
    const again = await s.run(`select count(*) from 'data/moons.csv'`);
    expect(again.files).toEqual([]);
    expect(calls.registered).toHaveLength(1);
    expect(s.files).toEqual(['work/data/moons.csv']);
    expect(calls.queries).toEqual([
      `select * from 'data/moons.csv'`,
      `select count(*) from 'data/moons.csv'`,
    ]);
  });

  it('runs before a statement’s files are read, not after', async () => {
    const order: string[] = [];
    const { engine } = standIn(
      () => {
        order.push('query');
        return arrow([['n', 'Int32', [1]]]);
      },
      () => {
        order.push('describe');
        return described();
      },
    );
    engine.register = () => void order.push('register');
    const { backend } = backendWith({ 'a.parquet': 'x' });
    await new ConsoleSession(engine, backend, '').run(`select * from 'a.parquet'`);
    expect(order).toEqual(['register', 'describe', 'query']);
  });

  it('refuses a file over the data view’s limit, before it runs, saying what to do', async () => {
    const { engine, calls } = standIn();
    const { backend } = backendWith({ 'big.csv': 'a\n1\n' }, { 'big.csv': MAX_TEXT_BYTES + 1 });
    const s = new ConsoleSession(engine, backend, '');
    await expect(s.run(`select * from 'big.csv'`)).rejects.toThrow(
      /big\.csv is 8\.0 MB, over the 8\.0 MB the console reads.*Export to Notebook/,
    );
    expect(calls.queries).toEqual([]);
    expect(calls.registered).toEqual([]);
    expect(s.ran).toEqual([]);
    // The console keeps working.
    await expect(s.run('select 1')).resolves.toMatchObject({ shown: expect.anything() });
  });

  it('refuses a path outside the folder, and a read that fails', async () => {
    const { engine, calls } = standIn();
    const { backend, fake } = backendWith({});
    const s = new ConsoleSession(engine, backend, 'work');
    await expect(s.run(`select * from '../secret.csv'`)).rejects.toThrow(
      /outside this window’s folder/,
    );
    fake.contents.get.mockRejectedValue(new Error('disk on fire'));
    await expect(s.run(`select * from 'a.csv'`)).rejects.toThrow(
      /Couldn’t read a\.csv: disk on fire/,
    );
    expect(calls.queries).toEqual([]);
  });

  it('leaves a missing file to DuckDB, whose error shows', async () => {
    const { engine, calls } = standIn(sql =>
      /nope\.csv/.test(sql)
        ? new Error('IO Error: No files found that match the pattern "nope.csv"')
        : arrow([]),
    );
    const { backend } = backendWith({});
    const s = new ConsoleSession(engine, backend, '');
    await expect(s.run(`select * from 'nope.csv'`)).rejects.toThrow(/No files found/);
    expect(calls.registered).toEqual([]);
    expect(s.ran).toEqual([]);
    expect(s.files).toEqual([]);
  });

  it('leaves a file missing from the in-browser drive to DuckDB too', async () => {
    // JupyterLite's drive throws a plain Error, with no response status.
    const { engine, calls } = standIn();
    const { backend, fake } = backendWith({});
    fake.contents.get.mockRejectedValue(new Error('Could not find file: a.csv'));
    const s = new ConsoleSession(engine, backend, '');
    await expect(s.run(`select * from 'a.csv'`)).resolves.toMatchObject({ files: [] });
    expect(calls.queries).toEqual([`select * from 'a.csv'`]);
    expect(calls.registered).toEqual([]);
  });

  it('does not read URLs or files named in a comment', async () => {
    const { engine, calls } = standIn();
    const { backend, fake } = backendWith({});
    const s = new ConsoleSession(engine, backend, '');
    await s.run(`select * from 'https://x.org/a.csv' -- 'b.csv'`);
    expect(fake.contents.get).not.toHaveBeenCalled();
    expect(calls.registered).toEqual([]);
  });

  it('records only the statements that ran without an error, not dot commands', async () => {
    const { engine } = standIn(sql =>
      sql === 'bad' ? new Error('Parser Error') : arrow([['n', 'Int32', [1]]]),
    );
    const { backend } = backendWith({});
    const s = new ConsoleSession(engine, backend, '');
    await s.run('select 1');
    await expect(s.run('bad')).rejects.toThrow('Parser Error');
    await s.run('.tables');
    await s.run('select 2');
    expect(s.ran).toEqual(['select 1', 'select 2']);
  });

  it('runs a dot command as its SQL', async () => {
    const { engine, calls } = standIn();
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    await s.run('.tables');
    await s.run('.schema moons');
    expect(calls.queries).toEqual(['show tables', 'describe "moons"']);
    await expect(s.run('.bogus')).rejects.toThrow(/no \.bogus command/);
  });

  it('says what a statement without rows did', async () => {
    const answers: Record<string, ArrowResult> = {
      'create table t(i int)': arrow([['Count', 'Int64', []]]),
      'insert into t values (1), (2)': arrow([['Count', 'Int64', [2n]]]),
      'insert into t values (3)': arrow([['Count', 'Int64', [1n]]]),
      'select count(*) as "Count" from t': arrow([['Count', 'Int64', [3n]]]),
    };
    const { engine } = standIn(sql => answers[sql]!);
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    expect((await s.run('create table t(i int)')).message).toBe('OK');
    expect((await s.run('insert into t values (1), (2)')).message).toBe('2 rows affected');
    expect((await s.run('insert into t values (3)')).message).toBe('1 row affected');
    // A query that happens to be called Count is a table.
    expect((await s.run('select count(*) as "Count" from t')).shown?.total).toBe(1);
  });

  it('runs statements one at a time, in the order asked', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const engine: Engine = {
      register: () => {},
      query: async sql => {
        if (isDescribe(sql)) return described();
        order.push(`start ${sql}`);
        if (sql === 'slow') await gate;
        order.push(`end ${sql}`);
        return arrow([['n', 'Int32', [1]]]);
      },
    };
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    const a = s.run('slow');
    const b = s.run('fast');
    await vi.waitFor(() => expect(order).toEqual(['start slow']));
    await new Promise(r => setTimeout(r, 5));
    expect(order).toEqual(['start slow']);
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(['start slow', 'end slow', 'start fast', 'end fast']);
  });

  it('casts the columns with no plain value, after asking their types', async () => {
    const { engine, calls } = standIn(undefined, () =>
      described([
        ['l', 'DECIMAL(3,2)[]'],
        ['n', 'INTEGER'],
        ['d', 'DECIMAL(10,2)'],
        ['w', 'DECIMAL(38,0)'],
        ['a b', 'TIMESTAMP'],
      ]),
    );
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    await s.run('select * from t -- c');
    expect(calls.described).toEqual(['describe select * from (\nselect * from t -- c\n)']);
    expect(calls.queries).toEqual([
      'select cast(#1 as varchar) as "l", #2 as "n", #3 as "d", cast(#4 as varchar) as "w", ' +
        'cast(#5 as varchar) as "a b" from (\nselect * from t -- c\n)',
    ]);
    // What ran is the statement as typed.
    expect(s.ran).toEqual(['select * from t -- c']);
  });

  it('runs a query as written when every column is plain or it can’t be described', async () => {
    const plain = standIn(undefined, () =>
      described([
        ['a', 'BIGINT'],
        ['b', 'VARCHAR'],
        ['c', 'DATE'],
      ]),
    );
    await new ConsoleSession(plain.engine, backendWith({}).backend, '').run('select 1');
    expect(plain.calls.queries).toEqual(['select 1']);
    const broken = standIn(undefined, () => new Error('Binder Error'));
    await new ConsoleSession(broken.engine, backendWith({}).backend, '').run('select 1');
    expect(broken.calls.queries).toEqual(['select 1']);
  });

  it('asks no types of a statement that isn’t a query', async () => {
    const { engine, calls } = standIn();
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    await s.run('create table t as select 1');
    await s.run('insert into t values (1)');
    expect(calls.described).toEqual([]);
    await s.run('/* c */ with x as (select 1) select * from x');
    await s.run('(select 1)');
    expect(calls.described).toHaveLength(2);
  });

  it('keeps the statements of one input together, whatever else is asked', async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const engine: Engine = {
      register: () => {},
      query: async sql => {
        if (isDescribe(sql)) return described();
        order.push(sql);
        if (sql === 'a1') await gate;
        return arrow([['n', 'Int32', [1]]]);
      },
    };
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    const heard: string[] = [];
    const a = s.runInput(['a1', 'a2'], (i, o) => heard.push(`a${i + 1} ${'ran' in o}`));
    const b = s.runInput(['b1'], (i, o) => heard.push(`b${i + 1} ${'ran' in o}`));
    await vi.waitFor(() => expect(order).toEqual(['a1']));
    release();
    await Promise.all([a, b]);
    expect(order).toEqual(['a1', 'a2', 'b1']);
    expect(heard).toEqual(['a1 true', 'a2 true', 'b1 true']);
    // The export follows the same order.
    expect(s.ran).toEqual(['a1', 'a2', 'b1']);
  });

  it('stops an input at its first error, and the next input still runs', async () => {
    const { engine, calls } = standIn(sql =>
      sql === 'bad' ? new Error('Parser Error') : arrow([['n', 'Int32', [1]]]),
    );
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    const heard: string[] = [];
    const report = (i: number, o: { ran: unknown } | { error: unknown }) =>
      heard.push(`${i} ${'ran' in o ? 'ran' : (o.error as Error).message}`);
    await s.runInput(['ok', 'bad', 'never'], report);
    await s.runInput(['later'], report);
    expect(heard).toEqual(['0 ran', '1 Parser Error', '0 ran']);
    expect(calls.queries).toEqual(['ok', 'bad', 'later']);
  });

  it('closes the engine once, and then refuses statements', async () => {
    const { engine, close } = standIn();
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    await s.close();
    await s.close();
    expect(close).toHaveBeenCalledTimes(1);
    await expect(s.run('select 1')).rejects.toThrow(/closed/);
  });
});
