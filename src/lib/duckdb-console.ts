/**
 * The DuckDB console's logic (#679): reading SQL, the files a statement
 * names, a session on one DuckDB engine, and the notebook Export to
 * Notebook writes. DuckConsole.tsx is the view. Everything here takes an
 * `Engine` (parquet.ts), so a test runs it against a stand-in or, in Node,
 * the real package.
 */
import type { Backend } from './backends';
import {
  MAX_JSON_BYTES,
  MAX_PARQUET_BYTES,
  MAX_ROWS,
  MAX_TEXT_BYTES,
  dataKind,
  tableName,
  type DataKind,
} from './data-files';
import { TooLarge, megabytes, readBytes } from './data-read';
import { messageOf } from './problems';
import { type Cell, notebookOf } from './sample';
import { plain, type ArrowLike, type Engine } from './parquet';
import type { TableField, TableResource } from './table-output';

// ---------- Reading SQL ----------

type Piece = {
  kind: 'code' | 'string' | 'name' | 'comment';
  text: string;
  /** A string, name or block comment that the text ends in the middle of. */
  open: boolean;
};

/** The dollar-quote tag at `i` (`$$` or `$tag$`), or undefined. */
function dollarTag(text: string, i: number): string | undefined {
  return /^\$[A-Za-z_\u0080-￿]?[\w\u0080-￿]*\$/.exec(text.slice(i, i + 80))?.[0];
}

/**
 * The text as DuckDB's lexer splits it: code, `'strings'`, `"names"`,
 * `$$dollar strings$$` (also `string`), and `-- line` and nested
 * `/* block *\/` comments. A `;` or a quote inside any but code means
 * nothing to a statement.
 */
function pieces(text: string): Piece[] {
  const out: Piece[] = [];
  let code = '';
  let i = 0;
  const flush = () => {
    if (code) out.push({ kind: 'code', text: code, open: false });
    code = '';
  };
  const quoted = (quote: string, kind: 'string' | 'name') => {
    flush();
    let j = i + 1;
    for (;;) {
      const q = text.indexOf(quote, j);
      if (q === -1) {
        out.push({ kind, text: text.slice(i), open: true });
        i = text.length;
        return;
      }
      // A doubled quote is a quote in the text.
      if (text[q + 1] === quote) {
        j = q + 2;
        continue;
      }
      out.push({ kind, text: text.slice(i, q + 1), open: false });
      i = q + 1;
      return;
    }
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === "'") quoted("'", 'string');
    else if (c === '"') quoted('"', 'name');
    else if (c === '-' && text[i + 1] === '-') {
      flush();
      const nl = text.indexOf('\n', i);
      const end = nl === -1 ? text.length : nl;
      out.push({ kind: 'comment', text: text.slice(i, end), open: false });
      i = end;
    } else if (c === '/' && text[i + 1] === '*') {
      flush();
      let depth = 1;
      let j = i + 2;
      while (j < text.length && depth > 0) {
        if (text[j] === '/' && text[j + 1] === '*') {
          depth++;
          j += 2;
        } else if (text[j] === '*' && text[j + 1] === '/') {
          depth--;
          j += 2;
        } else j++;
      }
      out.push({ kind: 'comment', text: text.slice(i, j), open: depth > 0 });
      i = j;
    } else if (c === '$' && dollarTag(text, i) && !/[\w$]/.test(text[i - 1] ?? '')) {
      const tag = dollarTag(text, i)!;
      flush();
      const end = text.indexOf(tag, i + tag.length);
      const stop = end === -1 ? text.length : end + tag.length;
      out.push({ kind: 'string', text: text.slice(i, stop), open: end === -1 });
      i = stop;
    } else {
      code += c;
      i++;
    }
  }
  flush();
  return out;
}

/** Whether a statement piece holds SQL: not only blanks, `;` and comments. */
const hasCode = (ps: Piece[]) =>
  ps.some(p => p.kind !== 'comment' && (p.kind !== 'code' || /[^\s;]/.test(p.text)));

/**
 * A dot command (`.tables`, `.schema name`): a line that starts with a
 * dot, which no SQL does. Each line is one command.
 */
export function isDotCommand(text: string): boolean {
  return text.trimStart().startsWith('.');
}

/**
 * The statements in the text, each without its `;`, in order: split at a
 * `;` that is outside strings, names and comments. Text after the last `;`
 * is a statement too, and comments alone are not. A dot command takes its
 * line.
 */
export function statementsOf(text: string): string[] {
  if (isDotCommand(text)) {
    return text
      .split('\n')
      .map(l => l.trim())
      .filter(l => l !== '');
  }
  const out: string[] = [];
  let current: Piece[] = [];
  const end = () => {
    if (hasCode(current))
      out.push(
        current
          .map(p => p.text)
          .join('')
          .trim(),
      );
    current = [];
  };
  for (const p of pieces(text)) {
    if (p.kind !== 'code') {
      current.push(p);
      continue;
    }
    const parts = p.text.split(';');
    parts.forEach((part, k) => {
      if (k > 0) end();
      if (part) current.push({ kind: 'code', text: part, open: false });
    });
  }
  end();
  return out;
}

/**
 * The Enter rule: Enter runs the input when its last SQL character is a
 * `;` (a trailing comment doesn't count, and a `;` inside a string or
 * comment that is still open doesn't), or when it is a dot command; any
 * other Enter adds a line. Shift-Enter always runs.
 */
export function endsStatement(text: string): boolean {
  if (text.trim() === '') return false;
  if (isDotCommand(text)) return true;
  const ps = pieces(text);
  if (ps.some(p => p.open)) return false;
  for (let k = ps.length - 1; k >= 0; k--) {
    const p = ps[k]!;
    if (p.kind === 'comment') continue;
    if (p.kind !== 'code') return false;
    const t = p.text.trimEnd();
    if (t === '') continue;
    return t.endsWith(';');
  }
  return false;
}

// ---------- History ----------

/**
 * What you ran, to walk with ↑ and ↓. Repeating the last input adds
 * nothing. Walking back saves what you had typed, and walking past the
 * newest brings it back.
 */
export class History {
  private items: string[] = [];
  private at: number | null = null;
  private draft = '';

  get entries(): readonly string[] {
    return this.items;
  }

  /** Remembers an input that ran, and ends any walk. */
  add(text: string): void {
    const t = text.trim();
    if (t && this.items[this.items.length - 1] !== t) this.items.push(t);
    this.at = null;
    this.draft = '';
  }

  /** The older input than the one shown, or undefined at the oldest. `current` is what is typed. */
  previous(current: string): string | undefined {
    if (this.items.length === 0) return undefined;
    if (this.at === null) {
      this.draft = current;
      this.at = this.items.length;
    }
    if (this.at === 0) return undefined;
    this.at--;
    return this.items[this.at];
  }

  /** The newer input, then what was typed before the walk; undefined when not walking. */
  next(): string | undefined {
    if (this.at === null) return undefined;
    this.at++;
    if (this.at >= this.items.length) {
      this.at = null;
      return this.draft;
    }
    return this.items[this.at];
  }

  /** The input was edited by hand: the walk starts again from the end. */
  stop(): void {
    this.at = null;
  }
}

// ---------- Files ----------

const FILE_EXTENSION = /\.(csv|tsv|json|parquet)$/i;

/** The text of a `'string'` piece, as SQL reads it. */
function stringValue(p: Piece): string | undefined {
  if (p.kind !== 'string' || p.open || !p.text.startsWith("'")) return undefined;
  return p.text.slice(1, -1).replaceAll("''", "'");
}

/**
 * The quoted strings in the SQL that name a CSV, TSV, JSON or Parquet file,
 * as written, once each. Only `'single quoted'` strings: a `"name"` is an
 * identifier, and a string in a comment is not SQL.
 */
export function filePaths(sql: string): string[] {
  const found = new Set<string>();
  for (const p of pieces(sql)) {
    const v = stringValue(p);
    if (v !== undefined && FILE_EXTENSION.test(v)) found.add(v);
  }
  return [...found];
}

export type Located =
  /** A file in the folder: its path for the contents API. */
  | { local: string }
  /** Not in the folder: a URL or an absolute path, which DuckDB is left to read. */
  | { other: true }
  /** Outside the folder, which the console won't read. */
  | { outside: true };

/**
 * Where a path as written in SQL is: relative to the window's folder
 * (`.` and `..` resolved, with a `..` past the folder refused), a URL or an
 * absolute path (left to DuckDB), or a wildcard (left to DuckDB, which says
 * what it finds).
 */
export function locate(written: string, folder: string): Located {
  if (/^[a-z][a-z0-9+.-]*:/i.test(written) || written.startsWith('/') || written.startsWith('~')) {
    return { other: true };
  }
  if (/[*?[]/.test(written)) return { other: true };
  const parts: string[] = [];
  for (const part of written.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (parts.pop() === undefined) return { outside: true };
    } else parts.push(part);
  }
  if (parts.length === 0) return { other: true };
  return { local: folder ? `${folder}/${parts.join('/')}` : parts.join('/') };
}

/**
 * What the console reads of a file, and holds in DuckDB's memory: the data
 * view's own limits. A text file isn't cut as the view cuts it, since a
 * query over half a file answers wrongly.
 */
export function limitFor(kind: DataKind): number {
  switch (kind) {
    case 'csv':
    case 'tsv':
      return MAX_TEXT_BYTES;
    case 'json':
      return MAX_JSON_BYTES;
    case 'parquet':
      return MAX_PARQUET_BYTES;
  }
}

// ---------- Results ----------

/** What DuckDB's Arrow table gives the console, beyond `ArrowLike`. */
export interface ArrowResult extends ArrowLike {
  numRows: number;
  schema: { fields: { name: string; type: { toString(): string; scale?: number } }[] };
  getChildAt(i: number): { get(row: number): unknown } | null;
}

export interface Shown {
  resource: TableResource;
  /** Rows the statement returned, which may be more than the table holds. */
  total: number;
}

const INTEGER = /^(Int(8|16|32)|Uint(8|16|32))$/;
const WIDE = /^(Int|Uint)64$/;
const FLOAT = /^Float(16|32|64)$/;

/** JSON text for a value, with 64-bit integers kept exact. */
function json(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v));
}

const stamp = (ms: number, withTime: boolean) => {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(ms);
  const iso = d.toISOString();
  return withTime
    ? iso.slice(0, 19).replace('T', ' ') + iso.slice(19, 23).replace(/\.000$/, '')
    : iso.slice(0, 10);
};

/** A cell's value as the table shows it, for the Arrow type `type`. */
export function cellOf(
  value: unknown,
  type: { toString(): string; scale?: number },
): { type: TableField['type']; value: unknown } {
  const name = type.toString();
  if (value === null || value === undefined) {
    return { type: columnType(name), value: null };
  }
  if (INTEGER.test(name)) return { type: 'integer', value: Number(value) };
  if (WIDE.test(name)) return { type: 'integer', value: plain(value) };
  if (FLOAT.test(name)) return { type: 'number', value: Number(value) };
  if (name === 'Bool') return { type: 'boolean', value: !!value };
  if (name === 'Utf8' || name === 'LargeUtf8') return { type: 'string', value: String(value) };
  if (name.startsWith('Decimal')) {
    // The unscaled integer, as text, over 10 to the scale.
    const scale = type.scale ?? 0;
    return { type: 'number', value: Number(String(value)) / 10 ** scale };
  }
  if (name.startsWith('Date')) return { type: 'string', value: stamp(Number(value), false) };
  if (name.startsWith('Timestamp')) return { type: 'string', value: stamp(Number(value), true) };
  if (name.startsWith('Time64')) {
    // Microseconds since midnight.
    const us = Number(value);
    const s = Math.floor(us / 1e6);
    const hms = [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
      .map(n => String(n).padStart(2, '0'))
      .join(':');
    const frac = us % 1e6;
    return {
      type: 'string',
      value: frac ? `${hms}.${String(frac).padStart(6, '0').replace(/0+$/, '')}` : hms,
    };
  }
  if (typeof value === 'object') return { type: 'string', value: json(value) };
  return { type: 'string', value: String(value) };
}

function columnType(name: string): TableField['type'] {
  if (INTEGER.test(name) || WIDE.test(name)) return 'integer';
  if (FLOAT.test(name) || name.startsWith('Decimal')) return 'number';
  if (name === 'Bool') return 'boolean';
  return 'string';
}

/**
 * A statement's rows for the table renderer, the first `maxRows` of them.
 * Undefined when it returned no columns (a `create`, say).
 */
export function resultTable(
  result: ArrowResult,
  title?: string,
  maxRows = MAX_ROWS,
): Shown | undefined {
  const fields = result.schema.fields;
  if (fields.length === 0) return undefined;
  const shown = Math.min(result.numRows, maxRows);
  const columns = fields.map((_, i) => result.getChildAt(i));
  const types = fields.map(f => columnType(f.type.toString()));
  const data: unknown[][] = [];
  for (let r = 0; r < shown; r++) {
    data.push(
      fields.map((f, i) => {
        const cell = cellOf(columns[i]?.get(r), f.type);
        // A value that isn't what its column says (a union) makes it text.
        if (cell.value !== null && cell.type !== types[i]) types[i] = 'string';
        return cell.value;
      }),
    );
  }
  // Names the table can tell apart: DuckDB allows two columns of one name.
  const seen = new Set<string>();
  const names = fields.map((f, i) => {
    const base = f.name || `column ${i + 1}`;
    let name = base;
    for (let n = 2; seen.has(name); n++) name = `${base}_${n}`;
    seen.add(name);
    return name;
  });
  return {
    total: result.numRows,
    resource: {
      schema: { fields: names.map((name, i) => ({ name, type: types[i] })) },
      data: types.some(
        (t, i) => t === 'string' && columnType(fields[i]!.type.toString()) !== 'string',
      )
        ? data.map(row =>
            row.map((v, i) =>
              v === null || typeof v === 'string' || types[i] !== 'string' ? v : String(v),
            ),
          )
        : data,
      ganymede: { title },
    },
  };
}

// ---------- A session ----------

const quoteName = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** SQL for a dot command, or an error that says what it takes. */
export function dotCommand(line: string): string {
  const [word = '', ...rest] = line.trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (word) {
    case '.tables':
      return 'show tables';
    case '.schema':
      if (!arg) throw new Error('.schema takes a table name: .schema moons');
      return `describe ${quoteName(/^".*"$/.test(arg) ? arg.slice(1, -1).replaceAll('""', '"') : arg)}`;
    default:
      throw new Error(`There is no ${word} command. The console has .tables and .schema <table>.`);
  }
}

export interface Ran {
  shown?: Shown;
  /** What happened, when no rows came back. */
  message?: string;
  ms: number;
  /** Files it read from the folder for this statement. */
  files: string[];
}

/**
 * What to show for a result: its rows, or a line when it has none to show:
 * DuckDB answers a `create` with an empty `Count` column and an `insert`,
 * `update` or `delete` with the rows it changed.
 */
function summary(sql: string, result: ArrowResult): { shown?: Shown; message?: string } {
  const columns = result.schema.fields;
  if (columns.length === 1 && columns[0]!.name === 'Count') {
    if (result.numRows === 0) return { message: 'OK' };
    if (/^\s*(create|insert|update|delete|copy|merge)\b/i.test(sql) && result.numRows === 1) {
      const n = Number(plain(result.getChildAt(0)?.get(0)));
      return { message: `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} affected` };
    }
  }
  const shown = resultTable(result);
  return shown ? { shown } : { message: 'OK' };
}

/** A file a statement names that the folder has no file for. */
const isMissing = (e: unknown) =>
  (e as { response?: { status?: number } } | null)?.response?.status === 404;

/**
 * One console: a DuckDB engine, which the tables you create stay in, and
 * what ran. Statements run one at a time, in the order they were asked.
 */
export class ConsoleSession {
  /** The statements that ran without an error, as written, in order. */
  readonly ran: string[] = [];
  /** The files read from the folder, registered with DuckDB, in order. */
  readonly files: string[] = [];
  private readonly registered = new Set<string>();
  private chain: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor(
    private readonly engine: Engine,
    private readonly backend: Backend,
    /** The window's folder, a contents path; '' for the root. */
    private readonly folder: string,
  ) {}

  /** Runs `statement`; rejects with what to show when it can't. */
  run(statement: string): Promise<Ran> {
    const next = this.chain.then(() => this.execute(statement));
    this.chain = next.catch(() => {});
    return next;
  }

  private async execute(statement: string): Promise<Ran> {
    if (this.closed) throw new Error('The console is closed.');
    const dot = isDotCommand(statement);
    const sql = dot ? dotCommand(statement) : statement;
    const files: string[] = [];
    // Each file a statement names, read from the folder the first time.
    if (!dot) {
      for (const written of filePaths(sql)) {
        const read = await this.register(written);
        if (read) files.push(read);
      }
    }
    const t0 = performance.now();
    const result = (await this.engine.query(sql)) as ArrowResult;
    const ms = Math.round(performance.now() - t0);
    if (this.closed) throw new Error('The console is closed.');
    if (!dot) this.ran.push(statement);
    return { ...summary(sql, result), ms, files };
  }

  /**
   * Reads the file `written` names and registers it with DuckDB under that
   * name, so the statement finds it as written. Returns the file's path
   * when it did. A file the folder lacks is left for DuckDB to say.
   */
  private async register(written: string): Promise<string | undefined> {
    if (this.registered.has(written)) return undefined;
    const at = locate(written, this.folder);
    if ('other' in at) return undefined;
    if ('outside' in at) {
      throw new Error(`${written} is outside this window’s folder, so the console won’t read it.`);
    }
    const limit = limitFor(dataKind(at.local)!);
    let bytes: Uint8Array;
    try {
      // Whole: a query over half a file would answer wrongly.
      ({ bytes } = await readBytes(this.backend, at.local, limit, true));
    } catch (e) {
      if (isMissing(e)) return undefined;
      if (e instanceof TooLarge) {
        throw new Error(
          `${written} is ${megabytes(e.size)}, over the ${megabytes(limit)} the console reads. ` +
            'A notebook on a kernel can query it: Export to Notebook, or New Notebook from File.',
          { cause: e },
        );
      }
      throw new Error(`Couldn’t read ${written}: ${messageOf(e)}`, { cause: e });
    }
    await this.engine.register(written, bytes);
    this.registered.add(written);
    this.files.push(at.local);
    return at.local;
  }

  /** Ends the engine: its worker stops. Safe to call twice. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.engine.close?.();
  }
}

// ---------- Export ----------

/** Text as a template literal's content: what `jupyter.sql` then reads back as written. */
export function templateText(sql: string): string {
  return sql.replaceAll('\\', '\\\\').replaceAll('`', '\\`').replaceAll('${', '\\${');
}

/** The notebook's file name; `freePath` makes it unique in the folder. */
export const CONSOLE_NOTEBOOK = 'duckdb-console.ipynb';

/**
 * The notebook Export to Notebook writes: one `jupyter.sql.load` cell for
 * each file the session read (a table named for the file, with `_file`
 * after it so it never meets a table of your own), then one `jupyter.sql`
 * cell per statement that ran without an error, in order. The notebook sits
 * in the folder the paths are relative to, so a kernel that runs there
 * finds them.
 */
export function consoleNotebook(
  session: Pick<ConsoleSession, 'ran' | 'files'>,
  folder: string,
  kernelspec: { name: string; display_name: string; language: string },
) {
  const relative = (path: string) =>
    folder && path.startsWith(`${folder}/`) ? path.slice(folder.length + 1) : path;
  const cells: Cell[] = [
    {
      cell_type: 'markdown',
      source: [
        '# DuckDB console',
        '',
        'The statements that ran, in order. Files are read by the paths the console used, relative to this notebook’s folder.',
      ].join('\n'),
    },
    ...session.files.map((path): Cell => ({
      cell_type: 'code',
      source: `await jupyter.sql.load(${JSON.stringify(`${tableName(path)}_file`)}, ${JSON.stringify(relative(path))});`,
    })),
    ...session.ran.map((sql): Cell => ({
      cell_type: 'code',
      source: `await jupyter.sql\`${templateText(sql)}\`;`,
    })),
  ];
  return notebookOf(kernelspec, cells, 'console');
}
