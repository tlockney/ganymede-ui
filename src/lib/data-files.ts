/**
 * Data files that open in the page's data view instead of a text editor
 * (#671): CSV and TSV as a table, JSON as a tree, Parquet through DuckDB.
 * This module is the pure part: which paths those are, a CSV parser, the
 * column types, the table the table renderer shows, and the notebook that
 * "New Notebook from File" writes. Reading the bytes is data-read.ts, and
 * Parquet is parquet.ts.
 */
import type { TableField, TableResource } from './table-output';
import { parentOf } from './launch';

export type DataKind = 'csv' | 'tsv' | 'json' | 'parquet';

const KINDS: { [extension: string]: DataKind } = {
  csv: 'csv',
  tsv: 'tsv',
  json: 'json',
  parquet: 'parquet',
};

/** How a path opens: its data view, or undefined for a notebook or any other file. */
export function dataKind(path: string | undefined): DataKind | undefined {
  const name = path?.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  // `.json` alone is a hidden file named json, not an extension.
  if (dot <= 0) return undefined;
  return KINDS[name.slice(dot + 1).toLowerCase()];
}

/** Rows the table view keeps: the rest of a big file is left unread. */
export const MAX_ROWS = 10_000;
/** Bytes of a CSV or TSV read: about what MAX_ROWS rows of a wide file come to. */
export const MAX_TEXT_BYTES = 8 * 1024 * 1024;
/** JSON can't be cut and still parse: past this the tree isn't built. */
export const MAX_JSON_BYTES = 16 * 1024 * 1024;
/** Parquet is compressed; the file is read whole into DuckDB's memory. */
export const MAX_PARQUET_BYTES = 64 * 1024 * 1024;

export interface Parsed {
  /** The records after the header, each as long as the header. */
  header: string[];
  rows: string[][];
  /** The file had more rows than were parsed. */
  truncated: boolean;
}

/**
 * Parses delimited text (RFC 4180, as lenient as spreadsheets are): fields
 * may be quoted, with `""` for a quote, and then hold the delimiter and
 * line breaks; a quote inside an unquoted field is just text; a line
 * break is `\n`, `\r\n` or `\r`; a leading byte order mark and empty lines
 * are skipped. The first record is the header; a ragged record is padded
 * with empty fields, and one longer than the header adds `column N`
 * columns. Stops after `maxRows` records past the header, which is how a
 * large file stays cheap.
 */
export function parseDelimited(text: string, delimiter: string, maxRows = MAX_ROWS): Parsed {
  const records: string[][] = [];
  const limit = maxRows + 1;
  let truncated = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;
  let record: string[] = [];
  // A record of one empty, unquoted field is an empty line.
  let sawContent = false;

  const endRecord = () => {
    if (record.length === 1 && record[0] === '' && !sawContent) {
      record = [];
      return;
    }
    records.push(record);
    record = [];
    sawContent = false;
  };

  while (i < n) {
    if (records.length >= limit) {
      truncated = true;
      break;
    }
    // One field.
    let field = '';
    if (text[i] === '"') {
      sawContent = true;
      i++;
      for (;;) {
        const q = text.indexOf('"', i);
        if (q === -1) {
          // Unterminated: the rest of the file is the field.
          field += text.slice(i);
          i = n;
          break;
        }
        field += text.slice(i, q);
        if (text[q + 1] === '"') {
          field += '"';
          i = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
      // Text after the closing quote up to the delimiter stays in the field.
      while (i < n && text[i] !== delimiter && text[i] !== '\n' && text[i] !== '\r') {
        field += text[i++];
      }
    } else {
      let j = i;
      while (j < n && text[j] !== delimiter && text[j] !== '\n' && text[j] !== '\r') j++;
      field = text.slice(i, j);
      if (field !== '') sawContent = true;
      i = j;
    }
    record.push(field);
    if (i >= n) break;
    const c = text[i];
    if (c === delimiter) {
      i++;
      // A delimiter at the end of the file leaves one more, empty, field.
      sawContent = true;
      if (i >= n) {
        record.push('');
        break;
      }
    } else {
      // \n, \r or \r\n.
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      endRecord();
    }
  }
  if (record.length > 0) endRecord();
  if (records.length > limit) {
    records.length = limit;
    truncated = true;
  }

  const [first = [], ...rows] = records;
  let width = first.length;
  for (const r of rows) width = Math.max(width, r.length);
  const header = Array.from({ length: width }, (_, k) => first[k] ?? '');
  for (const r of rows) while (r.length < width) r.push('');
  return { header: uniqueNames(header), rows, truncated };
}

/** Names for the columns: an empty one is `column N`, a repeated one gets `_2`, `_3`…. */
function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((raw, k) => {
    const base = raw.trim() === '' ? `column ${k + 1}` : raw;
    let name = base;
    for (let n = 2; seen.has(name); n++) name = `${base}_${n}`;
    seen.add(name);
    return name;
  });
}

const INTEGER = /^-?(0|[1-9]\d*)$/;
const DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** Digits that aren't an integer (`01234`, `+5`): identifiers, kept as text. */
const DIGITS = /^[+-]?\d+$/;
const BOOLEAN = /^(true|false)$/i;

/** The table type of a column from its text: what every non-empty value parses as. */
export function inferType(values: readonly string[]): TableField['type'] {
  let kind: 'integer' | 'number' | 'boolean' | undefined;
  for (const v of values) {
    if (v === '') continue;
    const here = INTEGER.test(v)
      ? 'integer'
      : DECIMAL.test(v) && !DIGITS.test(v)
        ? 'number'
        : BOOLEAN.test(v)
          ? 'boolean'
          : undefined;
    if (!here) return 'string';
    if (kind === undefined) kind = here;
    else if (kind !== here) {
      // Integers and decimals together are numbers; nothing else mixes.
      if (kind === 'boolean' || here === 'boolean') return 'string';
      kind = 'number';
    }
  }
  return kind ?? 'string';
}

/**
 * A cell as its column's type: empty is null; an integer past what a
 * JavaScript number holds stays text, as the table output sends them.
 */
export function typedValue(text: string, type: TableField['type']): unknown {
  if (text === '') return null;
  switch (type) {
    case 'integer': {
      const n = Number(text);
      return Number.isSafeInteger(n) ? n : text;
    }
    case 'number':
      return Number(text);
    case 'boolean':
      return text.toLowerCase() === 'true';
    default:
      return text;
  }
}

/** The table renderer's input for parsed text, with the column types inferred. */
export function tableOf(parsed: Parsed, title?: string): TableResource {
  const fields = parsed.header.map((name, k) => ({
    name,
    type: inferType(parsed.rows.map(r => r[k]!)),
  }));
  return {
    schema: { fields },
    data: parsed.rows.map(r => r.map((text, k) => typedValue(text, fields[k]!.type))),
    ganymede: { title },
  };
}

/** Whether a row has `query` (any case) in any cell. An empty query matches every row. */
export function rowMatches(row: readonly unknown[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q));
}

/** The resource with only the rows that match `query`. */
export function filterTable(resource: TableResource, query: string): TableResource {
  if (!query.trim()) return resource;
  const data = (resource.data ?? []).filter(row => rowMatches(row as unknown[], query));
  return { ...resource, data };
}

/** A table name for a file: its name without the extension, as an SQL identifier. */
export function tableName(path: string): string {
  const file = path.split('/').pop() ?? path;
  const stem = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file;
  const id = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!id) return 'data';
  return /^\d/.test(id) ? `t_${id}` : id;
}

/** The new notebook's file name: the data file's, with `.ipynb` in place of its extension. */
export function notebookNameFor(path: string): string {
  const file = path.split('/').pop() ?? path;
  const dot = file.lastIndexOf('.');
  return `${dot > 0 ? file.slice(0, dot) : file}.ipynb`;
}

/** The folder a notebook made from `path` goes in: the file's own. */
export const notebookDirFor = parentOf;

/**
 * The notebook "New Notebook from File" writes: a cell that loads the file
 * into DuckDB with `jupyter.sql.load` (CSV, TSV, JSON and Parquet all),
 * by its name, which a kernel started in the notebook's folder finds, and
 * one that shows the first rows. `kernelspec` is the one the caller picked.
 */
export function notebookFor(
  path: string,
  kernelspec: { name: string; display_name: string; language: string },
) {
  const file = path.split('/').pop() ?? path;
  const table = tableName(path);
  const cells = [
    { cell_type: 'markdown', source: `# ${file}\n\nLoaded into DuckDB as \`${table}\`.` },
    {
      cell_type: 'code',
      source: `await jupyter.sql.load(${JSON.stringify(table)}, ${JSON.stringify(file)});`,
    },
    { cell_type: 'code', source: `await jupyter.sql\`select * from ${table} limit 100\`;` },
  ] as const;
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: { kernelspec, language_info: { name: 'typescript' } },
    cells: cells.map((c, i) => ({
      id: `data-${i + 1}`,
      cell_type: c.cell_type,
      metadata: {},
      source: c.source,
      ...(c.cell_type === 'code' ? { outputs: [], execution_count: null } : {}),
    })),
  };
}
