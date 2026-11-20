/**
 * Parquet files in the data view (#671), read through DuckDB wasm, the
 * same build jupyter.sql uses in the browser kernel: its module is the one
 * the app serves (scripts/kernel-modules.ts), its wasm and worker the ones
 * duckdb-files.ts caches. The page loads it on the first Parquet file, not
 * at start-up.
 *
 * `parquetTable` takes an `Engine`, the few calls it needs, so a test can
 * run it against the real package in Node.
 */
import { SQL_MODULES } from '@tlockney/cdp-kernel/browser';
import { FILES, loadDuckdbFiles } from './duckdb-files';
import { MAX_ROWS } from './data-files';
import type { TableField, TableResource } from './table-output';

/** What DuckDB gives back for a query: an Arrow table. */
export interface ArrowLike {
  schema: { fields: { name: string }[] };
  toArray(): { toJSON(): Record<string, unknown> }[];
}

/** One batch of an Arrow result: a slice of its rows. */
export interface BatchLike {
  numRows: number;
  getChildAt(i: number): { get(row: number): unknown } | null;
}

/** The start of a result read as a stream (`Engine.stream`). */
export interface Streamed {
  schema: { fields: { name: string; type: { toString(): string; scale?: number } }[] };
  batches: BatchLike[];
  /** The stream was stopped with rows unread: there are more than `batches` hold. */
  more: boolean;
}

/**
 * Reads batches from `reader` until they hold more than `maxRows` rows,
 * then stops reading (the `break` ends the loop), so the rest of a big
 * result is never brought into the page. The query is not cancelled: once
 * `send` has returned, `cancelSent` does nothing; DuckDB drops the open
 * result when the next statement runs on the connection.
 */
export async function takeBatches(
  reader: (AsyncIterable<BatchLike> | Iterable<BatchLike>) & {
    schema: Streamed['schema'];
    /** Reads the schema; a reader has none before it, and does nothing a second time. */
    open(): unknown;
  },
  maxRows: number,
): Promise<Streamed> {
  await reader.open();
  // Before reading on: a reader that has ended forgets its schema.
  const schema = reader.schema;
  const batches: BatchLike[] = [];
  let rows = 0;
  let more = false;
  for await (const batch of reader) {
    batches.push(batch);
    rows += batch.numRows;
    if (rows > maxRows) {
      more = true;
      break;
    }
  }
  return { schema, batches, more };
}

/** DuckDB, as far as reading one file goes. */
export interface Engine {
  /** Makes `bytes` readable by `name` in SQL. */
  register(name: string, bytes: Uint8Array): Promise<void> | void;
  query(sql: string): Promise<ArrowLike> | ArrowLike;
  /**
   * Runs `sql` and returns the first rows of its result, at least
   * `maxRows` of them when it has that many, leaving the rest unread.
   * Without it, a caller uses `query` and gets the whole result.
   */
  stream?(sql: string, maxRows: number): Promise<Streamed> | Streamed;
  close?(): Promise<void> | void;
}

export interface ParquetColumn {
  name: string;
  /** DuckDB's name for the type, as in `DESCRIBE`. */
  type: string;
}

export interface ParquetTable {
  resource: TableResource;
  schema: ParquetColumn[];
  /** Rows in the file. */
  total: number;
}

const FILE = 'data.parquet';

/** `name` as a quoted SQL identifier. */
export const quoteName = (name: string) => `"${name.replaceAll('"', '""')}"`;

const INTEGERS = /^(TINYINT|SMALLINT|INTEGER|BIGINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|INT\d*)$/;
const WIDE_INTEGERS = /^(HUGEINT|UHUGEINT)$/;

/**
 * The one map from a DuckDB type (as `DESCRIBE` names it) to the table's
 * column type and the SQL that reads the column, so that Arrow's JavaScript
 * value is one the table shows. `ref` is how the column is written in SQL
 * (its quoted name, or `#1`).  `select` is `ref` itself when the column is
 * read as it is. Integers up to 64 bits (`UBIGINT` too) come as numbers, or text past
 * 2^53 (`plain`); a decimal of up to 18 digits (a 64-bit one) is cast to a double,
 * rounded to its precision, so it sorts and filters as a number; a wider
 * one comes as text so no digit is lost; everything with no plain value
 * (hugeints, dates, timestamps, lists, structs, ...) comes as DuckDB's text.
 */
export function columnFor(
  column: ParquetColumn,
  ref = quoteName(column.name),
): { type: TableField['type']; select: string } {
  const t = column.type.toUpperCase();
  const raw = (type: TableField['type']) => ({ type, select: ref });
  const as = (type: TableField['type'], sql: string) => ({
    type,
    select: `cast(${ref} as ${sql})`,
  });
  if (INTEGERS.test(t)) return raw('integer');
  if (WIDE_INTEGERS.test(t)) return as('integer', 'varchar');
  if (t === 'FLOAT' || t === 'DOUBLE' || t === 'REAL') return raw('number');
  // `DECIMAL(10,2)`, not a list of them: up to 18 digits (64-bit) is a number.
  const decimal = /^DECIMAL\((\d+),\d+\)$/.exec(t);
  if (decimal) {
    return Number(decimal[1]) <= 18 ? as('number', 'double') : as('string', 'varchar');
  }
  if (t === 'BOOLEAN') return raw('boolean');
  if (t === 'VARCHAR') return raw('string');
  return as('string', 'varchar');
}

/** A value from Arrow as the table shows it: 64-bit integers as numbers when they fit. */
export function plain(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(value)
      : value.toString();
  }
  return value;
}

/**
 * The file's schema and its first `maxRows` rows. The file is registered
 * under a fixed name, so only one is read per engine at a time.
 */
export async function parquetTable(
  engine: Engine,
  bytes: Uint8Array,
  title?: string,
  maxRows = MAX_ROWS,
): Promise<ParquetTable> {
  await engine.register(FILE, bytes);
  const from = `read_parquet('${FILE}')`;
  const described = await engine.query(`describe select * from ${from}`);
  const schema = described
    .toArray()
    .map(r => r.toJSON())
    .map(r => ({ name: String(r.column_name), type: String(r.column_type) }));
  const count = await engine.query(`select count(*) as n from ${from}`);
  const total = Number(plain(count.toArray()[0]?.toJSON().n ?? 0));
  const columns = schema.map(c => columnFor(c));
  const select = columns.length ? columns.map((c, i) => `${c.select} as c${i}`).join(', ') : '1';
  const rows = await engine.query(`select ${select} from ${from} limit ${maxRows}`);
  const data = rows.toArray().map(r => {
    const row = r.toJSON();
    return columns.map((_, i) => plain(row[`c${i}`]) ?? null);
  });
  return {
    schema,
    total,
    resource: {
      schema: { fields: schema.map((c, i) => ({ name: c.name, type: columns[i]!.type })) },
      data,
      // No `rows`: the table would call the rest "the source" in its footer.
      ganymede: { title },
    },
  };
}

/** The structural part of duckdb-wasm's module that `openEngine` uses. */
interface DuckdbModule {
  VoidLogger: new () => unknown;
  AsyncDuckDB: new (
    logger: unknown,
    worker: Worker,
  ) => {
    instantiate(wasm: string): Promise<void>;
    registerFileBuffer(name: string, bytes: Uint8Array): Promise<void>;
    connect(): Promise<{
      query(sql: string): Promise<ArrowLike>;
      send(
        sql: string,
        allowStreamResult: boolean,
      ): Promise<AsyncIterable<BatchLike> & { schema: Streamed['schema']; open(): unknown }>;
      close(): Promise<void>;
    }>;
    terminate(): Promise<void>;
  };
}

/** A Worker URL that can start from this page: a cross-origin script goes through a blob. */
function workerUrl(url: string): { url: string; revoke(): void } {
  if (url.startsWith('blob:') || url.startsWith(location.origin)) return { url, revoke() {} };
  const wrapped = URL.createObjectURL(
    new Blob([`importScripts(${JSON.stringify(url)});`], { type: 'text/javascript' }),
  );
  return { url: wrapped, revoke: () => URL.revokeObjectURL(wrapped) };
}

/**
 * Starts DuckDB wasm in a worker of its own. Fetches its files from
 * jsDelivr the first time, as the kernel does, and from the page's cache
 * after (duckdb-files.ts); close it when the view goes away.
 */
export async function openEngine(modules: () => { [specifier: string]: string }): Promise<Engine> {
  // The map after the files are loaded, so a first open during the
  // prefetch still uses what the cache then holds.
  await loadDuckdbFiles();
  const urls = modules();
  const moduleUrl = urls[SQL_MODULES.duckdb];
  if (!moduleUrl) throw new Error('DuckDB isn’t part of this build.');
  const duckdb = (await import(/* @vite-ignore */ moduleUrl)) as DuckdbModule;
  const script = workerUrl(urls[SQL_MODULES.ehWorker] ?? FILES[0].url);
  const worker = new Worker(script.url);
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
  try {
    await db.instantiate(urls[SQL_MODULES.ehWasm] ?? FILES[1].url);
    const connection = await db.connect();
    return {
      register: (name, bytes) => db.registerFileBuffer(name, bytes),
      query: sql => connection.query(sql),
      // Streamed, so a big result stays in the worker past what is shown.
      stream: async (sql, maxRows) => {
        const reader = await connection.send(sql, true);
        return takeBatches(reader, maxRows);
      },
      // Terminate first: the connection closes only after a running query
      // does, which can be never, and terminating the worker ends both.
      close: async () => {
        try {
          await db.terminate();
        } finally {
          script.revoke();
        }
      },
    };
  } catch (e) {
    worker.terminate();
    script.revoke();
    throw e;
  }
}
