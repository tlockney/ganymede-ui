/**
 * The DuckDB console's logic (#679): reading SQL, the files a statement
 * names, a session on one DuckDB engine, and the notebook Export to
 * Notebook writes. DuckdbConsole.tsx is the view. Everything here takes an
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
import { notFound } from './rename';
import { type Cell, notebookOf } from './sample';
import { columnFor, plain, quoteName, type ArrowLike, type Engine, type Streamed } from './parquet';
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
 * The text as DuckDB's lexer splits it: code, `'strings'` (and `E'escape
 * strings'`, where `\'` is a quote), `"names"`,
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
  /**
   * The quoted text from `start` (the quote is at `i`): up to the quote that
   * ends it. A doubled quote is a quote in the text; in an escape string
   * (`E'...'`) a backslash also takes the character after it.
   */
  const quoted = (quote: string, kind: 'string' | 'name', start = i, escapes = false) => {
    flush();
    let j = i + 1;
    while (j < text.length) {
      const c = text[j];
      if (escapes && c === '\\') j += 2;
      else if (c !== quote) j++;
      else if (text[j + 1] === quote) j += 2;
      else {
        out.push({ kind, text: text.slice(start, j + 1), open: false });
        i = j + 1;
        return;
      }
    }
    out.push({ kind, text: text.slice(start), open: true });
    i = text.length;
  };
  while (i < text.length) {
    const c = text[i]!;
    if (c === "'") {
      // `E'...'`: the E belongs to the string, unless it ends a longer word.
      const escapes = /[eE]$/.test(code) && !/[\w$\u0080-\uffff]/.test(text[i - 2] ?? '');
      if (escapes) code = code.slice(0, -1);
      quoted("'", 'string', escapes ? i - 1 : i, escapes);
    } else if (c === '"') quoted('"', 'name');
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
 * A dot command (`.tables`, `.schema name`): one line that starts with a
 * dot, which no statement does.
 */
export function isDotCommand(text: string): boolean {
  return text.trimStart().startsWith('.');
}

/** SQL cut at each `;` outside strings, names and comments: the statements it ends, and the text after the last. */
function splitSql(sql: string): { done: string[]; rest: string; open: boolean } {
  const done: string[] = [];
  let current: Piece[] = [];
  const text = (ps: Piece[]) => ps.map(p => p.text).join('');
  const end = () => {
    if (hasCode(current)) done.push(text(current).trim());
    current = [];
  };
  for (const p of pieces(sql)) {
    if (p.kind !== 'code') {
      current.push(p);
      continue;
    }
    p.text.split(';').forEach((part, k) => {
      if (k > 0) end();
      if (part) current.push({ kind: 'code', text: part, open: false });
    });
  }
  return {
    done,
    rest: hasCode(current) ? text(current).trim() : '',
    // A block comment still open after the last `;`: the input isn't ended.
    open: current.some(p => p.open),
  };
}

/**
 * What the input holds: `items` that are complete (a statement ended by a
 * `;`, or a dot command, which takes its line and may come before, between
 * or after statements) and `rest`, SQL after the last `;` that nothing has
 * ended, which is empty when only blanks and comments follow it. A line
 * that starts with a dot continues the SQL above it when that is not yet
 * ended (a number like `.5`, or a string still open).
 */
function scan(text: string): { items: string[]; rest: string; open: boolean } {
  const items: string[] = [];
  let buffer = '';
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('.')) {
      const above = splitSql(buffer);
      if (above.rest === '' && !above.open) {
        items.push(...above.done, line.trim());
        buffer = '';
        continue;
      }
    }
    buffer += buffer === '' ? line : `\n${line}`;
  }
  const { done, rest, open } = splitSql(buffer);
  return { items: [...items, ...done], rest, open };
}

/**
 * The statements in the text, each without its `;`, in order: split at a
 * `;` that is outside strings, names and comments. Text after the last `;`
 * is a statement too, and comments alone are not.
 */
export function statementsOf(text: string): string[] {
  const { items, rest } = scan(text);
  return rest ? [...items, rest] : items;
}

/**
 * The Enter rule: Enter runs the input when it holds a complete statement
 * or dot command and nothing after it but blanks and comments (a `;` inside
 * a string or a comment that is still open doesn't end one); any other
 * Enter adds a line. Shift-Enter always runs.
 */
export function endsStatement(text: string): boolean {
  const { items, rest, open } = scan(text);
  return items.length > 0 && rest === '' && !open;
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

/**
 * The text of a string piece, as SQL reads it: `'it''s'`, `E'it\\'s'` (a
 * backslash takes the next character) or `$tag$...$tag$` (verbatim).
 * DuckDB reads all three as a file name where one is expected.
 */
function stringValue(p: Piece): string | undefined {
  if (p.kind !== 'string' || p.open) return undefined;
  if (p.text.startsWith('$')) {
    const tag = /^\$[^$]*\$/.exec(p.text)?.[0];
    return tag === undefined ? undefined : p.text.slice(tag.length, -tag.length);
  }
  const escapes = !p.text.startsWith("'");
  const body = p.text.slice(escapes ? 2 : 1, -1);
  // A doubled quote first, so `E'\'\''` (two escaped quotes) is `''`, not one quote.
  const collapsed = body.replaceAll("''", "'");
  return escapes ? collapsed.replace(/\\(.)/gs, '$1') : collapsed;
}

/** Keywords that end a FROM list at its own level of parentheses. */
const ENDS_FROM = new Set([
  'select',
  'where',
  'group',
  'order',
  'having',
  'limit',
  'offset',
  'window',
  'qualify',
  'union',
  'except',
  'intersect',
  'returning',
  'set',
  'values',
  'using_sample',
  'sample',
]);

/** Statements whose next string is a table: `describe 'a.csv'`, `pivot 'a.csv' on x using sum(y)`. */
const TABLE_STATEMENTS = new Set([
  'describe',
  'summarize',
  'show',
  'pivot',
  'unpivot',
  'pivot_wider',
  'pivot_longer',
]);

/**
 * A table function whose first argument is a file name: `read_csv`,
 * `read_parquet`, ... (`read_*`), `parquet_scan` and the other `parquet_*`
 * functions, and `sniff_csv`.
 */
const FILE_FUNCTION = /^(read_|parquet_|sniff_csv$)/;

/**
 * The strings in the SQL that DuckDB reads as a file name: the table
 * reference after FROM or any JOIN (and after a comma of a FROM list), the
 * name after `describe`, `summarize`, `show`, `pivot`, `unpivot`,
 * `pivot_wider` or `pivot_longer`, the table after USING in a DELETE or
 * MERGE, or the first argument of a file
 * function (`FILE_FUNCTION`), which may be a list of names
 * (`read_csv(['a.csv', 'b.csv'])`). A string anywhere else is a value
 * (`where src = 'big.parquet'`, a select item, a function argument), so it
 * is left alone. `'single quoted'`, `E'escape'` and `$$dollar$$` strings
 * count, as DuckDB reads all three as names; a `"name"` is an identifier,
 * and a string in a comment is not SQL.
 */
function fileReferences(sql: string): string[] {
  type Token = { kind: 'word' | 'punct' | 'string'; text: string; value?: string };
  const tokens: Token[] = [];
  for (const p of pieces(sql)) {
    if (p.kind === 'comment') continue;
    if (p.kind === 'string') {
      tokens.push({ kind: 'string', text: p.text, value: stringValue(p) });
    } else if (p.kind === 'name') {
      tokens.push({ kind: 'punct', text: p.text });
    } else {
      for (const m of p.text.matchAll(/[\w$\u0080-\uffff]+|\S/g)) {
        tokens.push({ kind: /^[\w$\u0080-\uffff]/.test(m[0]) ? 'word' : 'punct', text: m[0] });
      }
    }
  }
  const found: string[] = [];
  // One frame for each open `(` or `[` (and the statement itself).
  type Frame = {
    /** In a FROM list now. */
    from: boolean;
    /** The parentheses of a file function. */
    fn: boolean;
    /** Still before the first comma. */
    first: boolean;
    /** The list that is a file function's first argument. */
    list: boolean;
  };
  const frame = (over: Partial<Frame> = {}): Frame => ({
    from: false,
    fn: false,
    first: true,
    list: false,
    ...over,
  });
  // `using 'f.csv'` names a table only in DELETE and MERGE; ALTER ... USING takes a value.
  const dml = tokens.some(t => t.kind === 'word' && /^(delete|merge)$/i.test(t.text));
  const stack: Frame[] = [frame()];
  const top = () => stack[stack.length - 1]!;
  tokens.forEach((t, i) => {
    const prev = tokens[i - 1];
    const prevWord = prev?.kind === 'word' ? prev.text.toLowerCase() : '';
    const word = t.kind === 'word' ? t.text.toLowerCase() : '';
    if (t.kind === 'word') {
      if (word === 'from' || word === 'join') {
        // `is distinct from` is a comparison: it neither starts a FROM list nor ends one.
        if (!(word === 'from' && prevWord === 'distinct')) top().from = true;
      } else if (ENDS_FROM.has(word)) top().from = false;
    } else if (t.text === '(') {
      stack.push(frame({ fn: prev?.kind === 'word' && FILE_FUNCTION.test(prevWord) }));
    } else if (t.text === '[') {
      stack.push(frame({ list: top().fn && top().first && prev?.text === '(' }));
    } else if (t.text === ')' || t.text === ']') {
      if (stack.length > 1) stack.pop();
    } else if (t.text === ',') top().first = false;
    if (t.kind !== 'string' || t.value === undefined) return;
    const afterFrom =
      prevWord === 'join' ||
      // `delete … using 'f.csv'` and `merge … using 'f.csv'`; `join … using (id)` has no string here.
      (prevWord === 'using' && dml) ||
      TABLE_STATEMENTS.has(prevWord) ||
      (prevWord === 'from' && tokens[i - 2]?.text.toLowerCase() !== 'distinct') ||
      (prev?.text === ',' && top().from);
    const readerArg = top().fn && top().first && prev?.text === '(';
    const listed = top().list && (prev?.text === '[' || prev?.text === ',');
    // `.csv` alone is a hidden file, not a CSV file.
    if ((afterFrom || readerArg || listed) && FILE_EXTENSION.test(t.value) && dataKind(t.value)) {
      found.push(t.value);
    }
  });
  return found;
}

/** The files the SQL reads (`fileReferences`), as written, once each. */
export function filePaths(sql: string): string[] {
  return [...new Set(fileReferences(sql))];
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

/** What the console reads of a result: DuckDB's Arrow table, or the start of one. */
export interface ResultRows {
  numRows: number;
  /** Set when the result has more rows than `numRows`: it was read only so far. */
  more?: boolean;
  schema: { fields: { name: string; type: { toString(): string; scale?: number } }[] };
  getChildAt(i: number): { get(row: number): unknown } | null;
}

export interface Shown {
  resource: TableResource;
  /**
   * Rows the statement returned, which may be more than the table holds;
   * when `more`, only the rows read before the result was cut off.
   */
  total: number;
  /** The result has more rows than `total`: its end was never read. */
  more?: boolean;
}

/** What DuckDB's Arrow table gives the console, beyond `ArrowLike`. */
export type ArrowResult = ArrowLike & ResultRows;

/** A streamed result's batches as one result, rows numbered across them. */
export function fromStream(streamed: Streamed): ResultRows {
  const starts: number[] = [];
  let numRows = 0;
  for (const b of streamed.batches) {
    starts.push(numRows);
    numRows += b.numRows;
  }
  return {
    numRows,
    more: streamed.more,
    schema: streamed.schema,
    getChildAt: i => ({
      get(row) {
        // The last batch that starts at or before the row.
        let k = starts.length - 1;
        while (k > 0 && starts[k]! > row) k--;
        return streamed.batches[k]?.getChildAt(i)?.get(row - starts[k]!);
      },
    }),
  };
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
 * Names the table can tell apart: DuckDB allows two columns of one name,
 * and names them as it does for a subquery: the first keeps the name, the
 * next are `x_1`, `x_2`, ..., skipping a name that is taken (`x_1_1`), and
 * names that differ only in case are the same.
 */
export function distinctNames(names: string[]): string[] {
  // For each name (lower case): the suffix to try next; a name given out counts as taken.
  const next = new Map<string, number>();
  return names.map(base => {
    const key = base.toLowerCase();
    let n = next.get(key);
    if (n === undefined) {
      next.set(key, 1);
      return base;
    }
    let name = `${base}_${n}`;
    while (next.has(name.toLowerCase())) name = `${base}_${++n}`;
    next.set(key, n + 1);
    next.set(name.toLowerCase(), 1);
    return name;
  });
}

/**
 * A statement's rows for the table renderer, the first `maxRows` of them.
 * Undefined when it returned no columns (a `create`, say).
 */
export function resultTable(
  result: ResultRows,
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
  const names = distinctNames(fields.map((f, i) => f.name || `column ${i + 1}`));
  return {
    total: result.numRows,
    ...(result.more ? { more: true } : {}),
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
function summary(sql: string, result: ResultRows): { shown?: Shown; message?: string } {
  const columns = result.schema.fields;
  if (columns.length === 1 && columns[0]!.name === 'Count') {
    if (result.numRows === 0) return { message: 'OK' };
    if (
      /^\s*(create|insert|update|delete|copy|merge)\b/i.test(withoutComments(sql)) &&
      result.numRows === 1
    ) {
      const n = Number(plain(result.getChildAt(0)?.get(0)));
      return { message: `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'} affected` };
    }
  }
  const shown = resultTable(result);
  return shown ? { shown } : { message: 'OK' };
}

/** What a statement starts with when it is a query, which `describe` can wrap. */
const SELECT_LIKE = /^\s*(select|with|from|values|table|show|summarize|describe|\()/i;

/** The SQL without its comments, for reading how it starts. */
const withoutComments = (sql: string) =>
  pieces(sql)
    .filter(p => p.kind !== 'comment')
    .map(p => p.text)
    .join('');

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
    private folder: string,
  ) {}

  /**
   * The folder was renamed or moved to `to`: later reads, and the paths of
   * the files read so far, use the new path. What DuckDB has registered
   * keeps its names, which are relative to the folder.
   */
  moveFolder(to: string): void {
    const from = this.folder;
    if (to === from) return;
    this.files.forEach((path, i) => {
      if (from === '' || path.startsWith(`${from}/`)) {
        this.files[i] = from === '' ? `${to}/${path}` : to + path.slice(from.length);
      }
    });
    this.folder = to;
  }

  /** Runs `statement`; rejects with what to show when it can't. */
  run(statement: string): Promise<Ran> {
    return this.queue(() => this.execute(statement));
  }

  /**
   * Runs everything one input held, one statement after another, as a
   * single turn: another input asked meanwhile waits for the whole of it,
   * so the statements of two inputs never interleave. Stops at the first
   * error. `report` hears each result or error as it comes.
   */
  runInput(
    statements: readonly string[],
    report: (index: number, outcome: { ran: Ran } | { error: unknown }) => void,
  ): Promise<void> {
    return this.queue(async () => {
      for (const [i, statement] of statements.entries()) {
        try {
          report(i, { ran: await this.execute(statement) });
        } catch (error) {
          report(i, { error });
          return;
        }
      }
    });
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task);
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
    const shown = await this.forDisplay(sql);
    const t0 = performance.now();
    // Streamed where the engine can, so a big result isn't all brought here.
    const result = this.engine.stream
      ? fromStream(await this.engine.stream(shown, MAX_ROWS))
      : ((await this.engine.query(shown)) as unknown as ResultRows);
    const ms = Math.round(performance.now() - t0);
    if (!dot) this.ran.push(statement);
    return { ...summary(sql, result), ms, files };
  }

  /**
   * The SQL to run for `sql`. A query's columns of a type that has no plain
   * value in Arrow's JavaScript (lists, structs, maps, intervals, blobs,
   * timestamps, times, wide decimals and integers, enums, UUIDs) come as
   * DuckDB's own text for them, as the data view's Parquet does: the query
   * is wrapped to cast them, after asking its column types (a `describe`,
   * which plans the query and doesn't run it). Anything else, and a query
   * that can't be wrapped, runs as written.
   */
  private async forDisplay(sql: string): Promise<string> {
    if (!SELECT_LIKE.test(withoutComments(sql))) return sql;
    let columns: { name: string; type: string }[];
    try {
      const described = (await this.engine.query(
        `describe select * from (\n${sql}\n)`,
      )) as ArrowLike;
      columns = described
        .toArray()
        .map(r => r.toJSON())
        .map(r => ({ name: String(r.column_name), type: String(r.column_type) }));
    } catch {
      return sql;
    }
    const refs = columns.map((_, i) => `#${i + 1}`);
    const read = columns.map((c, i) => columnFor(c, refs[i]).select);
    if (read.every((r, i) => r === refs[i])) return sql;
    const select = columns.map((c, i) => `${read[i]} as ${quoteName(c.name)}`);
    return `select ${select.join(', ')} from (\n${sql}\n)`;
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
      if (notFound(e)) return undefined;
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
  // Each file once (`a.csv` and `./a.csv` are one), under a table name of its
  // own: two files of one name in different folders get `_2`, `_3`, ….
  const taken = new Set<string>();
  const loads = [...new Set(session.files)].map(path => {
    const base = `${tableName(path)}_file`;
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
    taken.add(name);
    return { path, name };
  });
  const cells: Cell[] = [
    {
      cell_type: 'markdown',
      source: [
        '# DuckDB console',
        '',
        'The statements that ran, in order. Files are read by the paths the console used, relative to this notebook’s folder.',
      ].join('\n'),
    },
    ...loads.map(({ path, name }): Cell => ({
      cell_type: 'code',
      source: `await jupyter.sql.load(${JSON.stringify(name)}, ${JSON.stringify(relative(path))});`,
    })),
    ...session.ran.map((sql): Cell => ({
      cell_type: 'code',
      source: `await jupyter.sql\`${templateText(sql)}\`;`,
    })),
  ];
  return notebookOf(kernelspec, cells, 'console');
}
