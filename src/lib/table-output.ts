/**
 * Table output (`application/vnd.dataresource+json`, ganymede#747): rows
 * and columns from cdp-kernel's `jupyter.table` and `jupyter.sql`, or
 * pandas with `display.html.table_schema` on, shown as a table that
 * sorts by a column and pages through rows 50 at a time.
 *
 * Every cell is set as text, never HTML, so a table from an untrusted
 * notebook is safe to show. The bundle's `ganymede.rows` is the source's
 * row count when the kernel embedded fewer (`ganymede.shown`); the footer
 * says so, and sorting says it covers only the rows embedded.
 */
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

export const TABLE_MIME = 'application/vnd.dataresource+json';
export const PAGE_SIZE = 50;
/** Longest text shown in a cell; the rest is in its tooltip. */
const MAX_CELL = 200;

export interface TableField {
  name: string;
  type?: string;
}

export interface TableResource {
  schema?: { fields?: TableField[] };
  data?: unknown[];
  ganymede?: { rows?: number; shown?: number; title?: string };
}

const NUMERIC = new Set(['integer', 'number']);

/** A cell's value as the text the table shows. */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** A number for sorting: numbers, and the strings large integers and NaN arrive as. */
function sortNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isNaN(n) && value !== 'NaN' ? Number.NaN : n;
  }
  return Number.NaN;
}

/** Compares two values of one column; nulls sort last in either direction. */
export function compareValues(a: unknown, b: unknown, type: string | undefined): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull || bNull) return aNull === bNull ? 0 : aNull ? 1 : -1;
  if (NUMERIC.has(type ?? '') || (typeof a === 'number' && typeof b === 'number')) {
    const x = sortNumber(a);
    const y = sortNumber(b);
    if (Number.isNaN(x) || Number.isNaN(y))
      return Number.isNaN(x) === Number.isNaN(y) ? 0 : Number.isNaN(x) ? 1 : -1;
    return x - y;
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return cellText(a).localeCompare(cellText(b), undefined, { numeric: true });
}

/** The rows as arrays in field order: `data` may hold objects or arrays. */
export function rowsOf(resource: TableResource, fields: TableField[]): unknown[][] {
  const data = Array.isArray(resource.data) ? resource.data : [];
  return data.map(row =>
    Array.isArray(row)
      ? fields.map((_, i) => row[i])
      : row !== null && typeof row === 'object'
        ? fields.map(f => (row as Record<string, unknown>)[f.name])
        : fields.map(() => undefined),
  );
}

/** The footer: how many rows, which are shown, and what sorting covers. */
export function footerText(options: {
  start: number;
  end: number;
  embedded: number;
  total: number;
  sorted: boolean;
}): string {
  const { start, end, embedded, total, sorted } = options;
  const fmt = (n: number) => n.toLocaleString('en-US');
  const range =
    embedded === 0 ? 'No rows' : `Rows ${fmt(start + 1)}–${fmt(end)} of ${fmt(embedded)}`;
  if (total <= embedded) return range;
  const cut = `${range} embedded; the source has ${fmt(total)}`;
  return sorted ? `${cut}. Sorted within the first ${fmt(embedded)}.` : `${cut}.`;
}

/** The table renderer: text only, so it's safe for untrusted output. */
export class RenderedTable extends Widget implements IRenderMime.IRenderer {
  private _fields: TableField[] = [];
  private _rows: unknown[][] = [];
  private _order: number[] = [];
  private _total = 0;
  private _page = 0;
  private _sort: { column: number; descending: boolean } | null = null;
  private _title?: string;

  constructor(readonly mimeType: string = TABLE_MIME) {
    super();
    this.addClass('gm-table');
  }

  renderModel(model: IRenderMime.IMimeModel): Promise<void> {
    const resource = (model.data[this.mimeType] ?? {}) as TableResource;
    const fields = resource.schema?.fields;
    this._fields = Array.isArray(fields)
      ? fields.map(f => ({
          name: String(f?.name ?? ''),
          type: typeof f?.type === 'string' ? f.type : undefined,
        }))
      : [];
    this._rows = rowsOf(resource, this._fields);
    this._order = this._rows.map((_, i) => i);
    const rows = resource.ganymede?.rows;
    this._total = typeof rows === 'number' && rows > this._rows.length ? rows : this._rows.length;
    this._page = 0;
    this._sort = null;
    this._draw(typeof resource.ganymede?.title === 'string' ? resource.ganymede.title : undefined);
    return Promise.resolve();
  }

  /** Sorts by a column: ascending, then descending, then as the kernel sent it. */
  sortBy(column: number): void {
    const s = this._sort;
    if (s?.column !== column) this._sort = { column, descending: false };
    else if (!s.descending) this._sort = { column, descending: true };
    else this._sort = null;
    this._order = this._rows.map((_, i) => i);
    if (this._sort) {
      const { column: c, descending } = this._sort;
      const type = this._fields[c]?.type;
      this._order.sort((i, j) => {
        const a = this._rows[i]![c];
        const b = this._rows[j]![c];
        const aNull = a === null || a === undefined;
        const bNull = b === null || b === undefined;
        if (aNull || bNull) return compareValues(a, b, type);
        return (descending ? -1 : 1) * compareValues(a, b, type) || i - j;
      });
    }
    this._page = 0;
    this._draw();
  }

  /** Shows page `page` (from 0), clamped to the pages there are. */
  showPage(page: number): void {
    const pages = Math.max(1, Math.ceil(this._rows.length / PAGE_SIZE));
    this._page = Math.min(Math.max(0, page), pages - 1);
    this._draw();
  }

  private _draw(title?: string): void {
    if (title !== undefined) this._title = title;
    const node = this.node;
    node.textContent = '';
    const scroller = document.createElement('div');
    scroller.className = 'gm-table-scroll';
    const table = document.createElement('table');
    if (this._title) table.createCaption().textContent = this._title;

    const head = table.createTHead().insertRow();
    this._fields.forEach((field, i) => {
      const th = document.createElement('th');
      th.scope = 'col';
      if (NUMERIC.has(field.type ?? '')) th.classList.add('gm-num');
      const button = document.createElement('button');
      button.type = 'button';
      const name = document.createElement('span');
      name.className = 'gm-table-name';
      name.textContent = field.name;
      button.append(name);
      if (this._sort?.column === i) {
        const arrow = document.createElement('span');
        arrow.className = 'gm-table-arrow';
        arrow.textContent = this._sort.descending ? ' ▼' : ' ▲';
        button.append(arrow);
        th.setAttribute('aria-sort', this._sort.descending ? 'descending' : 'ascending');
      }
      if (field.type) {
        const type = document.createElement('span');
        type.className = 'gm-table-type';
        type.textContent = field.type;
        button.append(type);
      }
      button.title = `Sort by ${field.name}`;
      button.addEventListener('click', () => this.sortBy(i));
      th.append(button);
      head.append(th);
    });

    const body = table.createTBody();
    const start = this._page * PAGE_SIZE;
    const end = Math.min(start + PAGE_SIZE, this._order.length);
    for (const index of this._order.slice(start, end)) {
      const tr = body.insertRow();
      this._rows[index]!.forEach((value, c) => {
        const td = tr.insertCell();
        const text = cellText(value);
        td.textContent = text.length > MAX_CELL ? `${text.slice(0, MAX_CELL - 1)}…` : text;
        if (text.length > MAX_CELL) td.title = text;
        if (value === null || value === undefined) td.classList.add('gm-null');
        if (NUMERIC.has(this._fields[c]?.type ?? '')) td.classList.add('gm-num');
      });
    }
    scroller.append(table);
    node.append(scroller);

    const footer = document.createElement('div');
    footer.className = 'gm-table-footer';
    const pages = Math.ceil(this._order.length / PAGE_SIZE);
    if (pages > 1) {
      const pager = (label: string, text: string, page: number, disabled: boolean) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.setAttribute('aria-label', label);
        b.disabled = disabled;
        b.addEventListener('click', () => this.showPage(page));
        return b;
      };
      footer.append(
        pager('Previous rows', '‹', this._page - 1, this._page === 0),
        pager('Next rows', '›', this._page + 1, this._page >= pages - 1),
      );
    }
    const info = document.createElement('span');
    info.textContent = footerText({
      start,
      end,
      embedded: this._rows.length,
      total: this._total,
      sorted: this._sort !== null,
    });
    footer.append(info);
    node.append(footer);
  }
}

/** Adds the table renderer, ahead of HTML so tables don't show as their HTML fallback. */
export function installTableOutput(registry: IRenderMimeRegistry): void {
  const html = registry.getRank('text/html') ?? 50;
  registry.addFactory(
    {
      safe: true,
      mimeTypes: [TABLE_MIME],
      createRenderer: options => new RenderedTable(options.mimeType),
    },
    html - 1,
  );
}
