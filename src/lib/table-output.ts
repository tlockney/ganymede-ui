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
 *
 * When the kernel kept the whole table (`ganymede.page`, cdp-kernel#489)
 * and the output is trusted, the table pages and sorts through the kernel
 * instead, over the `ganymede.table.v1` comm: pages past the embedded rows,
 * and every sorted page, come from the kernel. If the kernel no longer has
 * the table (it restarted), the table keeps to the embedded rows.
 */
import type { IRenderMimeRegistry } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import type { Kernel } from '@jupyterlab/services';
import { Widget } from '@lumino/widgets';

export const TABLE_MIME = 'application/vnd.dataresource+json';
export const PAGE_SIZE = 50;
/** The comm target cdp-kernel answers page requests on. */
export const PAGE_TARGET = 'ganymede.table.v1';
/** Longest text shown in a cell; the rest is in its tooltip. */
const MAX_CELL = 200;

export interface TableField {
  name: string;
  type?: string;
}

export interface TableResource {
  schema?: { fields?: TableField[] };
  data?: unknown[];
  ganymede?: { rows?: number; shown?: number; title?: string; page?: string };
}

/** The kernel a notebook's tables page through, when it has one. */
export type KernelSource = () => Kernel.IKernelConnection | null | undefined;

interface PageReply {
  request?: unknown;
  rows?: unknown;
  total?: unknown;
  error?: unknown;
}

/**
 * How long the kernel has to answer its first page request. A kernel that
 * ignores the comm (one without the target that doesn't close it) would
 * otherwise leave the table loading. Once it has answered, a request waits
 * as long as it takes: a busy kernel answers when its cell ends.
 */
export const FIRST_REPLY_MS = 30_000;

/** The kernel can't page the table any more: it closed the comm, or restarted. */
class PagesClosed extends Error {}

/** One page of a table, as the kernel sent it. */
interface Page {
  rows: unknown[];
  total?: number;
}

/** A comm to the kernel's copy of one table, asking for rows by offset and sort. */
class TablePages {
  private _comm: Kernel.IComm;
  private _kernel: Kernel.IKernelConnection;
  private _next = 0;
  private _pending = new Map<
    number,
    { resolve: (page: Page) => void; reject: (e: Error) => void }
  >();
  private _failed: Error | null = null;
  private _answered = false;
  private _timer: ReturnType<typeof setTimeout> | undefined;

  constructor(kernel: Kernel.IKernelConnection, id: string) {
    this._kernel = kernel;
    this._comm = kernel.createComm(PAGE_TARGET);
    this._comm.onMsg = msg => this._receive(msg.content.data as PageReply);
    // A kernel without the target, or that no longer has the table, closes it.
    this._comm.onClose = () => this._fail(new PagesClosed('The kernel closed the table.'));
    // A restart disposes the comm without closing it.
    kernel.statusChanged.connect(this._onStatus, this);
    this._comm.open({ id });
  }

  rows(offset: number, limit: number, sort?: { column: string; descending: boolean }) {
    if (this._failed) return Promise.reject(this._failed);
    const request = ++this._next;
    return new Promise<Page>((resolve, reject) => {
      try {
        this._comm.send(sort ? { request, offset, limit, sort } : { request, offset, limit });
      } catch {
        this._fail(new PagesClosed('The kernel is gone.'));
        reject(this._failed!);
        return;
      }
      this._pending.set(request, { resolve, reject });
      if (!this._answered && this._timer === undefined) {
        this._timer = setTimeout(
          () => this._fail(new PagesClosed('The kernel did not answer.')),
          FIRST_REPLY_MS,
        );
      }
    });
  }

  dispose(): void {
    this._kernel.statusChanged.disconnect(this._onStatus, this);
    this._fail(new PagesClosed('The table closed.'));
    if (!this._comm.isDisposed) {
      try {
        this._comm.close();
      } catch {
        // The kernel is gone already.
      }
    }
  }

  private _receive(reply: PageReply): void {
    this._answered = true;
    clearTimeout(this._timer);
    const waiting =
      typeof reply?.request === 'number' ? this._pending.get(reply.request) : undefined;
    if (!waiting) {
      // An answer to no request: the kernel refused the table.
      if (typeof reply?.error === 'string') this._fail(new PagesClosed(reply.error));
      return;
    }
    this._pending.delete(reply.request as number);
    if (typeof reply.error === 'string' || !Array.isArray(reply.rows)) {
      // The kernel refused this request (a sort too big, say); the comm stays open.
      waiting.reject(new Error(typeof reply.error === 'string' ? reply.error : 'No rows.'));
    } else {
      const total = reply.total;
      waiting.resolve({
        rows: reply.rows,
        total:
          typeof total === 'number' && Number.isInteger(total) && total >= 0 ? total : undefined,
      });
    }
  }

  private _onStatus(_: Kernel.IKernelConnection, status: Kernel.Status): void {
    if (status === 'restarting' || status === 'autorestarting' || status === 'dead') {
      this._fail(new PagesClosed('The kernel restarted.'));
    }
  }

  private _fail(error: Error): void {
    clearTimeout(this._timer);
    this._failed ??= error;
    for (const { reject } of this._pending.values()) reject(error);
    this._pending.clear();
  }
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

/** A number for sorting: numbers, and the strings large integers arrive as; NaN if neither. */
function sortNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

const INTEGER_TEXT = /^-?\d+$/;

function isNumeric(a: unknown, b: unknown, type: string | undefined): boolean {
  return NUMERIC.has(type ?? '') || (typeof a === 'number' && typeof b === 'number');
}

/** Whether a value sorts last in either direction: null, or not a number in a numeric column. */
function sortsLast(value: unknown, type: string | undefined): boolean {
  if (value === null || value === undefined) return true;
  return NUMERIC.has(type ?? '') && Number.isNaN(sortNumber(value));
}

/**
 * Compares two values of one column, ascending or descending. Nulls, and
 * values that aren't numbers in a numeric column (such as `"NaN"`), sort
 * last either way.
 */
export function compareValues(
  a: unknown,
  b: unknown,
  type: string | undefined,
  descending = false,
): number {
  const aLast = sortsLast(a, type) || (isNumeric(a, b, type) && Number.isNaN(sortNumber(a)));
  const bLast = sortsLast(b, type) || (isNumeric(a, b, type) && Number.isNaN(sortNumber(b)));
  if (aLast || bLast) return aLast === bLast ? 0 : aLast ? 1 : -1;
  const sign = descending ? -1 : 1;
  if (isNumeric(a, b, type)) {
    // Integers past 2^53 arrive as strings; compare those exactly.
    if (
      typeof a === 'string' &&
      typeof b === 'string' &&
      INTEGER_TEXT.test(a) &&
      INTEGER_TEXT.test(b)
    ) {
      const x = BigInt(a);
      const y = BigInt(b);
      return sign * (x < y ? -1 : x > y ? 1 : 0);
    }
    return sign * (sortNumber(a) - sortNumber(b));
  }
  if (typeof a === 'boolean' && typeof b === 'boolean') return sign * (Number(a) - Number(b));
  return sign * cellText(a).localeCompare(cellText(b), undefined, { numeric: true });
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
  /** Paging through the kernel: every row is there to show. */
  paged?: boolean;
}): string {
  const { start, end, embedded, total, sorted, paged } = options;
  const fmt = (n: number) => n.toLocaleString('en-US');
  if (paged) return total === 0 ? 'No rows' : `Rows ${fmt(start + 1)}–${fmt(end)} of ${fmt(total)}`;
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
  /** The kernel's id for the whole table, while paging through the kernel. */
  private _remote: string | null = null;
  private _pages: TablePages | null = null;
  /** Pages fetched for the current sort. */
  private _cache = new Map<number, unknown[][]>();
  private _loading = false;
  /** The rows drawn last, kept on screen while the kernel sends the next page. */
  private _lastShown: unknown[][] = [];
  /** Bumped when the sort or the data changes, so a late answer is dropped. */
  private _generation = 0;
  /** Pages asked for and not answered yet, for the current generation. */
  private _inflight = new Set<number>();
  /** Why the kernel refused the last request (a sort too big), shown in the footer. */
  private _notice = '';

  constructor(
    readonly mimeType: string = TABLE_MIME,
    private readonly _kernel?: KernelSource,
  ) {
    super();
    this.addClass('gm-table');
  }

  /** Whether pages and sorts come from the kernel. */
  get paged(): boolean {
    return this._remote !== null;
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
    this._title =
      typeof resource.ganymede?.title === 'string' ? resource.ganymede.title : undefined;
    // Only a trusted output pages through the kernel: one from a file
    // nobody trusted doesn't get to open comms.
    const page = resource.ganymede?.page;
    this._closePages();
    // The kernel is looked up when a page is needed, so an output drawn
    // before the notebook rejoins its kernel still pages; with none, the
    // table falls back to the embedded rows then.
    this._remote =
      typeof page === 'string' &&
      model.trusted &&
      this._kernel !== undefined &&
      this._total > this._rows.length
        ? page
        : null;
    this._lastShown = [];
    this._loading = false;
    this._notice = '';
    // Fewer than a page embedded asks the kernel for the rest of page 1.
    this._show();
    return Promise.resolve();
  }

  dispose(): void {
    this._closePages();
    super.dispose();
  }

  /** Sorts by a column: ascending, then descending, then as the kernel sent it. */
  sortBy(column: number): void {
    const s = this._sort;
    if (s?.column !== column) this._sort = { column, descending: false };
    else if (!s.descending) this._sort = { column, descending: true };
    else this._sort = null;
    this._page = 0;
    this._notice = '';
    if (this._remote !== null) {
      this._generation++;
      this._cache.clear();
      this._inflight.clear();
      this._show(`sort-${column}`);
      return;
    }
    this._sortLocal();
    this._draw(`sort-${column}`);
  }

  /** Shows page `page` (from 0), clamped to the pages there are. */
  showPage(page: number): void {
    const pages = this._pageCount();
    const previous = page < this._page;
    this._page = Math.min(Math.max(0, page), pages - 1);
    const focus = previous ? 'previous' : 'next';
    if (this._remote !== null) this._show(focus);
    else this._draw(focus);
  }

  private _pageCount(): number {
    const rows = this._remote !== null ? this._total : this._rows.length;
    return Math.max(1, Math.ceil(rows / PAGE_SIZE));
  }

  private _sortLocal(): void {
    this._order = this._rows.map((_, i) => i);
    if (this._sort) {
      const { column: c, descending } = this._sort;
      const type = this._fields[c]?.type;
      this._order.sort((i, j) =>
        compareValues(this._rows[i]![c], this._rows[j]![c], type, descending),
      );
    }
  }

  /** The rows on the current page, or undefined while the kernel hasn't sent them. */
  private _visible(): unknown[][] | undefined {
    const start = this._page * PAGE_SIZE;
    if (this._remote === null) {
      return this._order.slice(start, start + PAGE_SIZE).map(i => this._rows[i]!);
    }
    const cached = this._cache.get(this._page);
    if (cached) return cached;
    // Unsorted pages within the embedded rows need no kernel.
    if (!this._sort && start + PAGE_SIZE <= this._rows.length) {
      return this._rows.slice(start, start + PAGE_SIZE);
    }
    return undefined;
  }

  /** Draws the current page, asking the kernel for it first if needed. */
  private _show(focus?: string): void {
    if (this._visible() !== undefined) {
      this._loading = false;
      this._draw(focus);
      return;
    }
    this._loading = true;
    this._draw(focus);
    // Asked already: its answer draws the page.
    if (this._inflight.has(this._page)) return;
    void this._fetch(this._page, focus);
  }

  private async _fetch(page: number, focus?: string): Promise<void> {
    const generation = this._generation;
    const sort = this._sort
      ? { column: this._fields[this._sort.column]!.name, descending: this._sort.descending }
      : undefined;
    this._inflight.add(page);
    try {
      if (!this._pages) {
        const kernel = this._kernel?.();
        if (!kernel || this._remote === null) throw new PagesClosed('No kernel.');
        this._pages = new TablePages(kernel, this._remote);
      }
      const reply = await this._pages.rows(page * PAGE_SIZE, PAGE_SIZE, sort);
      if (generation !== this._generation || this.isDisposed) return;
      this._inflight.delete(page);
      this._cache.set(page, rowsOf({ data: reply.rows }, this._fields));
      // The kernel's count wins: the table it holds is the live value.
      if (reply.total !== undefined) this._total = reply.total;
      if (page === this._page) {
        this._loading = false;
        this._draw(this._keepFocus(focus));
      }
    } catch (err) {
      if (generation !== this._generation || this.isDisposed) return;
      this._inflight.delete(page);
      if (err instanceof PagesClosed || !this._sort) {
        this._local(this._keepFocus(focus));
        return;
      }
      // The kernel refused the sort (too many rows): back to its order,
      // still paging, and say why.
      this._sort = null;
      this._generation++;
      this._cache.clear();
      this._inflight.clear();
      this._page = 0;
      this._notice = err instanceof Error ? err.message : String(err);
      this._show(this._keepFocus(focus));
    }
  }

  /** `focus` for a late answer, only if the person is still in this table. */
  private _keepFocus(focus?: string): string | undefined {
    return focus && this.node.contains(document.activeElement) ? focus : undefined;
  }

  /** Back to the embedded rows: the kernel can't page this table. */
  private _local(focus?: string): void {
    this._closePages();
    this._remote = null;
    this._loading = false;
    this._sortLocal();
    this._page = Math.min(this._page, this._pageCount() - 1);
    this._draw(focus);
  }

  private _closePages(): void {
    this._generation++;
    this._cache.clear();
    this._inflight.clear();
    this._pages?.dispose();
    this._pages = null;
  }

  /**
   * Draws the table. `focus` names the control to focus afterwards (the
   * one just clicked), and the horizontal scroll is kept.
   */
  private _draw(focus?: string): void {
    const node = this.node;
    const scrollLeft = node.querySelector('.gm-table-scroll')?.scrollLeft ?? 0;
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
      button.dataset.control = `sort-${i}`;
      button.addEventListener('click', () => this.sortBy(i));
      th.append(button);
      head.append(th);
    });

    const body = table.createTBody();
    const start = this._page * PAGE_SIZE;
    const shown = this._visible() ?? this._lastShown;
    this._lastShown = shown;
    const end =
      this._remote !== null ? Math.min(start + PAGE_SIZE, this._total) : start + shown.length;
    for (const row of shown) {
      const tr = body.insertRow();
      this._fields.forEach((_, c) => {
        const value = row[c];
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
    const pages =
      this._remote !== null ? this._pageCount() : Math.ceil(this._order.length / PAGE_SIZE);
    if (pages > 1) {
      const pager = (label: string, text: string, page: number, disabled: boolean) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = text;
        b.setAttribute('aria-label', label);
        b.disabled = disabled;
        b.dataset.control = label === 'Previous rows' ? 'previous' : 'next';
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
      paged: this._remote !== null,
    });
    if (this._loading) info.textContent += ' · Loading…';
    if (this._notice) info.textContent += ` · ${this._notice}`;
    if (this._loading) body.setAttribute('aria-busy', 'true');
    footer.append(info);
    node.append(footer);
    scroller.scrollLeft = scrollLeft;
    if (focus) {
      const target = node.querySelector<HTMLButtonElement>(`[data-control="${focus}"]`);
      (target && !target.disabled
        ? target
        : node.querySelector<HTMLButtonElement>('.gm-table-footer button:not(:disabled)')
      )?.focus();
    }
  }
}

/**
 * Adds the table renderer, ahead of HTML so tables don't show as their HTML
 * fallback. With `kernel`, the notebook's, tables the kernel kept page
 * through it.
 */
export function installTableOutput(registry: IRenderMimeRegistry, kernel?: KernelSource): void {
  const html = registry.getRank('text/html') ?? 50;
  registry.addFactory(
    {
      safe: true,
      mimeTypes: [TABLE_MIME],
      createRenderer: options => new RenderedTable(options.mimeType, kernel),
    },
    html - 1,
  );
}
