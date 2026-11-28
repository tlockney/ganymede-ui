import { describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  ConsoleSession,
  History,
  consoleNotebook,
  distinctNames,
  dotCommand,
  endsStatement,
  filePaths,
  fromStream,
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
  it("reads E'...' escape strings, where a backslash escapes the next character", () => {
    expect(statementsOf(`select E'it\\'s; here'; select 2`)).toEqual([
      `select E'it\\'s; here'`,
      'select 2',
    ]);
    expect(statementsOf(`select e'a\\\\'; select 2`)).toEqual([`select e'a\\\\'`, 'select 2']);
    expect(endsStatement(`select E'it\\'s; here';`)).toBe(true);
    // Still open: the quote after the backslash is escaped.
    expect(endsStatement(`select E'it\\'; select 2;`)).toBe(false);
    // A doubled quote works in one too.
    expect(statementsOf(`select E'it''s; ok'; select 2`)).toEqual([
      `select E'it''s; ok'`,
      'select 2',
    ]);
  });
  it('does not take a backslash as an escape outside an E string', () => {
    // `'a\'` is the string `a\`: the quote ends it, and the next `;` ends the statement.
    expect(statementsOf(`select 'a\\'; select 2`)).toEqual([`select 'a\\'`, 'select 2']);
    // An E at the end of a longer word is not the prefix.
    expect(statementsOf(`select name'a\\'; select 2`)).toEqual([`select name'a\\'`, 'select 2']);
    expect(statementsOf(`select 1 as e, 'a\\'; select 2`)).toEqual([
      `select 1 as e, 'a\\'`,
      'select 2',
    ]);
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
    // Nor is one inside a block comment still open above it.
    expect(statementsOf('/* note\n.tables\n*/ select 1;')).toEqual([
      '/* note\n.tables\n*/ select 1',
    ]);
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
    // A comment still open after the statement is still being typed.
    expect(endsStatement('select 1; /* still typing')).toBe(false);
    expect(endsStatement('select 1;\n/* note\n.tables')).toBe(false);
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

describe('distinctNames', () => {
  it('keeps the first name and numbers the rest as DuckDB does', () => {
    expect(distinctNames(['x', 'x'])).toEqual(['x', 'x_1']);
    expect(distinctNames(['x', 'x', 'x'])).toEqual(['x', 'x_1', 'x_2']);
    expect(distinctNames(['a', 'b', 'a', 'd'])).toEqual(['a', 'b', 'a_1', 'd']);
    // The same as DuckDB gives for these (checked on the real engine).
    expect(distinctNames(['x', 'x', 'x_1'])).toEqual(['x', 'x_1', 'x_1_1']);
    expect(distinctNames(['x_1', 'x', 'x', 'x_1'])).toEqual(['x_1', 'x', 'x_2', 'x_1_1']);
    expect(distinctNames(['X', 'x'])).toEqual(['X', 'x_1']);
  });
});

describe('file paths', () => {
  it('finds the files a FROM, a JOIN or a read_ function names, once each, and no others', () => {
    expect(
      filePaths(
        `select * from 'data/moons.csv' join 'data/moons.csv' using (id) join "x.csv" join 'y.TSV'
         where a = 'b.json' or c = 'notes.txt' or d = 'x.parquet' -- 'z.csv'
         /* 'w.csv' */ and e = $$q.csv$$`,
      ),
    ).toEqual(['data/moons.csv', 'y.TSV']);
    // A name that is only an extension is a hidden file, not a data file.
    expect(filePaths(`select * from '.csv'`)).toEqual([]);
    expect(filePaths(`select * from 'data/.json'`)).toEqual([]);
  });
  it('reads the table after FROM and after any JOIN, past blanks and comments', () => {
    expect(filePaths(`select * from 'a.csv'`)).toEqual(['a.csv']);
    expect(filePaths(`SELECT * FROM\n  /* the moons */ -- note\n  'a.csv'`)).toEqual(['a.csv']);
    for (const join of [
      'join',
      'inner join',
      'left join',
      'left outer join',
      'right join',
      'full outer join',
      'cross join',
      'natural join',
      'semi join',
      'anti join',
      'asof join',
      'positional join',
      'lateral join',
    ]) {
      expect(filePaths(`select * from t ${join} 'b.parquet'`)).toEqual(['b.parquet']);
    }
    expect(filePaths(`select * from (select * from 'a.csv') t join 'b.json' on true`)).toEqual([
      'a.csv',
      'b.json',
    ]);
  });
  it('reads a string after a comma of a FROM list', () => {
    expect(filePaths(`select * from x, 'c.csv'`)).toEqual(['c.csv']);
    expect(filePaths(`select * from x as t, y, 'c.csv' u, 'd.tsv'`)).toEqual(['c.csv', 'd.tsv']);
    expect(filePaths(`select * from read_csv('a.csv'), 'b.csv'`)).toEqual(['a.csv', 'b.csv']);
    expect(filePaths(`select * from (select 1) t, 'c.csv' where a = 1`)).toEqual(['c.csv']);
    // Commas elsewhere are not a FROM list.
    expect(filePaths(`select a, 'c.csv' from t`)).toEqual([]);
    expect(filePaths(`select * from t where a in (1, 'c.csv')`)).toEqual([]);
    expect(filePaths(`select * from t group by a, 'c.csv'`)).toEqual([]);
    expect(filePaths(`select * from t order by a, 'c.csv'`)).toEqual([]);
    expect(filePaths(`select * from t where f(a, 'c.csv')`)).toEqual([]);
    expect(filePaths(`select * from t limit 1; select a, 'c.csv'`)).toEqual([]);
  });
  it('reads the first argument of a read_ function, in any case', () => {
    expect(filePaths(`select * from read_csv('d.csv', header=true)`)).toEqual(['d.csv']);
    expect(filePaths(`select * from READ_PARQUET ( 'e.parquet' )`)).toEqual(['e.parquet']);
    for (const f of [
      'read_csv',
      'read_csv_auto',
      'read_parquet',
      'read_json',
      'read_json_auto',
      'read_ndjson',
      'read_text',
    ]) {
      expect(filePaths(`select count(*) from ${f}('f.csv')`)).toEqual(['f.csv']);
    }
    // Only the first argument, and only a read_ function's.
    expect(filePaths(`select * from read_csv('a.csv', columns = 'b.csv')`)).toEqual(['a.csv']);
    expect(filePaths(`select * from read_csv(x, 'b.csv')`)).toEqual([]);
    expect(filePaths(`select upper('g.csv'), lower('h.json')`)).toEqual([]);
  });
  it('leaves a string anywhere else alone, so valid SQL is not refused', () => {
    expect(filePaths(`select * from t where src = 'big.parquet'`)).toEqual([]);
    expect(filePaths(`select '../x.csv'`)).toEqual([]);
    expect(filePaths(`select 'a.csv' as name, 'b.json' from t`)).toEqual([]);
    expect(filePaths(`select * from t where src is distinct from 'a.csv'`)).toEqual([]);
    expect(filePaths(`insert into t values ('a.csv')`)).toEqual([]);
    expect(filePaths(`select * from t -- from 'a.csv'\n where x = 1`)).toEqual([]);
    expect(filePaths(`select * from t /* join 'a.csv' */`)).toEqual([]);
    expect(filePaths(`select read_csv_x, 'a.csv' from t`)).toEqual([]);
    expect(filePaths(`select * from "a.csv"`)).toEqual([]);
    // The `is distinct from` operator is not a FROM list.
    expect(filePaths(`select a is distinct from b, 'c.csv' from t`)).toEqual([]);
    expect(filePaths(`select describe, 'a.csv' from t`)).toEqual([]);
    expect(filePaths(`select * from read_csv(['a.csv'], columns = ['b.csv'])`)).toEqual(['a.csv']);
    expect(filePaths(`select f(['a.csv'])`)).toEqual([]);
  });
  it('reads E and dollar strings as file names, as DuckDB does', () => {
    expect(filePaths(`select * from E'a.csv'`)).toEqual(['a.csv']);
    expect(filePaths(`select * from e'it\\'s.csv'`)).toEqual(["it's.csv"]);
    expect(filePaths(`select * from E'\\'\\'.csv'`)).toEqual(["''.csv"]);
    expect(filePaths(`select * from E'a''b.csv'`)).toEqual(["a'b.csv"]);
    expect(filePaths(`select * from $$a.csv$$`)).toEqual(['a.csv']);
    expect(filePaths(`select * from $t$b.csv$t$`)).toEqual(['b.csv']);
    expect(filePaths(`select * from read_csv(E'a.csv'), $$b.tsv$$`)).toEqual(['a.csv', 'b.tsv']);
    expect(filePaths(`select * from read_csv($$a.csv$$)`)).toEqual(['a.csv']);
    expect(filePaths(`select E'a.csv', $$b.csv$$`)).toEqual([]);
  });
  it('reads a list as the first argument of a file function', () => {
    expect(filePaths(`select * from read_csv(['a.csv', 'b.csv'])`)).toEqual(['a.csv', 'b.csv']);
    expect(
      filePaths(`select * from read_parquet( ['a.parquet','b.parquet'], union_by_name=true)`),
    ).toEqual(['a.parquet', 'b.parquet']);
    expect(filePaths(`select * from read_csv([E'a.csv', $$b.csv$$])`)).toEqual(['a.csv', 'b.csv']);
    // Only the first argument's list, and only a file function's.
    expect(filePaths(`select * from read_csv(x, ['b.csv'])`)).toEqual([]);
    expect(filePaths(`select * from read_csv('a.csv', names = ['b.csv'])`)).toEqual(['a.csv']);
    expect(filePaths(`select * from t where x in ['a.csv', 'b.csv']`)).toEqual([]);
  });
  it('reads the name after describe and summarize', () => {
    expect(filePaths(`describe 'a.csv'`)).toEqual(['a.csv']);
    expect(filePaths(`SUMMARIZE 'b.parquet'`)).toEqual(['b.parquet']);
    expect(filePaths(`summarize select 'c.csv'`)).toEqual([]);
  });
  it('reads the name after pivot, unpivot and show', () => {
    expect(filePaths(`pivot 'a.csv' on x using sum(y)`)).toEqual(['a.csv']);
    expect(filePaths(`UNPIVOT 'b.csv' on x into name n value v`)).toEqual(['b.csv']);
    expect(filePaths(`pivot_wider 'c.csv' on x using sum(y)`)).toEqual(['c.csv']);
    expect(filePaths(`pivot_longer 'd.csv' on x`)).toEqual(['d.csv']);
    expect(filePaths(`show 'e.csv'`)).toEqual(['e.csv']);
    expect(filePaths(`select show, 'f.csv' from t`)).toEqual([]);
    expect(filePaths(`select pivot, 'f.csv' from t`)).toEqual([]);
  });
  it('reads the name after using in delete and merge', () => {
    expect(filePaths(`delete from t using 'b.csv' b where t.k = b.k`)).toEqual(['b.csv']);
    expect(
      filePaths(`merge into t using 'x.csv' s on t.k = s.k when matched then update set v = s.v`),
    ).toEqual(['x.csv']);
    expect(filePaths(`select * from t join u using (id)`)).toEqual([]);
    // ALTER ... USING takes a value, not a table.
    expect(filePaths(`alter table t alter c set data type varchar using 'a.csv'`)).toEqual([]);
  });
  it('reads a string only as the argument itself or an item of its list', () => {
    expect(filePaths(`select * from read_csv(m['a.csv'])`)).toEqual([]);
    expect(filePaths(`select * from read_csv(x || 'b.csv')`)).toEqual([]);
    expect(filePaths(`select * from read_csv([x || 'b.csv'])`)).toEqual([]);
    expect(filePaths(`select * from read_csv([x, 'c.csv'])`)).toEqual(['c.csv']);
  });
  it('keeps a FROM list through an is distinct from in a join', () => {
    expect(filePaths(`select * from t join u on t.x is distinct from u.x, 'a.csv'`)).toEqual([
      'a.csv',
    ]);
  });
  it('reads the other file functions', () => {
    for (const f of ['parquet_scan', 'sniff_csv', 'parquet_metadata', 'parquet_schema']) {
      expect(filePaths(`select * from ${f}('f.csv')`)).toEqual(['f.csv']);
    }
    expect(filePaths(`select * from parquet_file_metadata('g.parquet')`)).toEqual(['g.parquet']);
    expect(filePaths(`select * from parquet_kv_metadata('h.parquet')`)).toEqual(['h.parquet']);
    expect(filePaths(`select sniff_csv_x('i.csv')`)).toEqual([]);
  });
  it('reads a doubled quote as one', () => {
    expect(filePaths(`select * from 'it''s.csv'`)).toEqual(["it's.csv"]);
    expect(filePaths(`select * from 'unterminated.csv`)).toEqual([]);
  });
  it('locates a path from the folder, and refuses one outside it', () => {
    expect(locate('data/moons.csv', '')).toEqual({ local: 'data/moons.csv' });
    expect(locate('./data//moons.csv', 'work')).toEqual({ local: 'work/data/moons.csv' });
    expect(locate('a/../b.csv', 'work')).toEqual({ local: 'work/b.csv' });
    expect(locate('../b.csv', 'work')).toEqual({ outside: true });
    expect(locate('a/../../b.csv', '')).toEqual({ outside: true });
    expect(locate('../b.csv', 'work', true)).toEqual({ local: 'b.csv' });
    expect(locate('../../b.csv', 'work', true)).toEqual({ outside: true });
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
    expect(t.resource.schema?.fields?.map(f => f.name)).toEqual(['a', 'a_1']);
  });
  it('numbers rows across the batches of a streamed result', () => {
    const batch = (values: number[]) => ({
      numRows: values.length,
      getChildAt: () => ({ get: (r: number) => values[r] }),
    });
    const result = fromStream({
      schema: { fields: [{ name: 'n', type: { toString: () => 'Int32' } }] },
      batches: [batch([0, 1, 2]), batch([3, 4]), batch([5])],
      more: true,
    });
    expect(result.numRows).toBe(6);
    const t = resultTable(result, undefined, 4)!;
    expect(t.resource.data).toEqual([[0], [1], [2], [3]]);
    expect(t.total).toBe(6);
    expect(t.more).toBe(true);
    expect(
      resultTable(fromStream({ ...{ schema: result.schema }, batches: [], more: false }))?.total,
    ).toBe(0);
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

  it('loads each file once, under a table name of its own', () => {
    const nb = consoleNotebook(
      { files: ['work/a.csv', 'work/a.csv', 'work/b/a.csv'], ran: [] },
      'work',
      kernel,
    );
    expect(nb.cells.slice(1).map(c => c.source)).toEqual([
      'await jupyter.sql.load("a_file", "a.csv");',
      'await jupyter.sql.load("a_file_2", "b/a.csv");',
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
      '-- one more\ninsert into t values (4)': arrow([['Count', 'Int64', [1n]]]),
      'select count(*) as "Count" from t': arrow([['Count', 'Int64', [3n]]]),
    };
    const { engine } = standIn(sql => answers[sql]!);
    const s = new ConsoleSession(engine, backendWith({}).backend, '');
    expect((await s.run('create table t(i int)')).message).toBe('OK');
    expect((await s.run('insert into t values (1), (2)')).message).toBe('2 rows affected');
    expect((await s.run('insert into t values (3)')).message).toBe('1 row affected');
    // A comment before it doesn't hide what it was.
    expect((await s.run('-- one more\ninsert into t values (4)')).message).toBe('1 row affected');
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
      'select cast(#1 as varchar) as "l", #2 as "n", cast(#3 as double) as "d", ' +
        'cast(#4 as varchar) as "w", ' +
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
        ['c', 'DOUBLE'],
      ]),
    );
    await new ConsoleSession(plain.engine, backendWith({}).backend, '').run('select 1');
    expect(plain.calls.queries).toEqual(['select 1']);
    const broken = standIn(undefined, () => new Error('Binder Error'));
    await new ConsoleSession(broken.engine, backendWith({}).backend, '').run('select 1');
    expect(broken.calls.queries).toEqual(['select 1']);
  });

  it('reads only the start of a big result when the engine can stream', async () => {
    const stream = vi.fn(async (_sql: string, maxRows: number) => ({
      schema: { fields: [{ name: 'n', type: { toString: () => 'Int32' } }] },
      batches: [
        { numRows: maxRows, getChildAt: () => ({ get: (r: number) => r }) },
        { numRows: 2, getChildAt: () => ({ get: (r: number) => r + maxRows }) },
      ],
      more: true,
    }));
    const { engine, calls } = standIn();
    const s = new ConsoleSession({ ...engine, stream }, backendWith({}).backend, '');
    const ran = await s.run('select * from range(100000)');
    expect(stream).toHaveBeenCalledWith('select * from range(100000)', 10_000);
    // The whole result was never asked for: `query` only described it.
    expect(calls.queries).toEqual([]);
    expect(ran.shown?.resource.data).toHaveLength(10_000);
    expect(ran.shown?.more).toBe(true);
    expect(ran.shown?.total).toBe(10_002);
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
