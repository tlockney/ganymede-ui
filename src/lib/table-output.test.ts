import '../test/notebook-env';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { MimeModel } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

const { createRendermime } = await import('./jupyterlab');
const {
  FIRST_REPLY_MS,
  PAGE_TARGET,
  RenderedTable,
  TABLE_MIME,
  compareValues,
  footerText,
  rowsOf,
} = await import('./table-output');
type RenderedTable = import('./table-output').RenderedTable;
type Kernel = import('@jupyterlab/services').Kernel.IKernelConnection;

const contents = {
  getDownloadUrl: async (path: string) => `/files/${path}`,
} as unknown as Contents.IManager;
const rendermime = createRendermime('Io.ipynb', contents);
const renderers: IRenderMime.IRenderer[] = [];

const moons = {
  schema: {
    fields: [
      { name: 'moon', type: 'string' },
      { name: 'radius_km', type: 'number' },
    ],
  },
  data: [
    { moon: 'Io', radius_km: 1821.6 },
    { moon: 'Europa', radius_km: 1560.8 },
    { moon: 'Ganymede', radius_km: 2634.1 },
    { moon: '<img src=x onerror=alert(1)>', radius_km: null },
  ],
  ganymede: { rows: 4, shown: 4, title: 'Galilean moons' },
};

async function render(resource: unknown, trusted = false) {
  const data = {
    [TABLE_MIME]: resource as never,
    'text/html': '<table></table>',
    'text/plain': 'Table',
  };
  const mime = rendermime.preferredMimeType(data, trusted ? 'any' : 'ensure');
  expect(mime).toBe(TABLE_MIME);
  const renderer = rendermime.createRenderer(mime!);
  renderers.push(renderer);
  document.body.appendChild(renderer.node);
  await renderer.renderModel(new MimeModel({ data, trusted }));
  return renderer as RenderedTable;
}

const column = (node: HTMLElement, i: number) =>
  [...node.querySelectorAll('tbody tr')].map(tr => tr.children[i]!.textContent);

afterEach(() => {
  for (const r of renderers.splice(0)) {
    r.node.remove();
    r.dispose();
  }
});

describe('table output', () => {
  it('is preferred over HTML, trusted or not, and sets cells as text', async () => {
    for (const trusted of [false, true]) {
      const t = await render(moons, trusted);
      expect(t.node.querySelector('caption')!.textContent).toBe('Galilean moons');
      expect([...t.node.querySelectorAll('th .gm-table-type')].map(e => e.textContent)).toEqual([
        'string',
        'number',
      ]);
      expect(column(t.node, 0)).toEqual([
        'Io',
        'Europa',
        'Ganymede',
        '<img src=x onerror=alert(1)>',
      ]);
      expect(t.node.querySelector('tbody img')).toBeNull();
      expect(t.node.querySelector('td.gm-null')!.textContent).toBe('null');
      expect(t.node.querySelector('.gm-table-footer')!.textContent).toBe('Rows 1–4 of 4');
    }
  });

  it('sorts ascending, descending, then back, with nulls last', async () => {
    const t = await render(moons);
    const header = () => t.node.querySelectorAll<HTMLButtonElement>('th button')[1]!;
    header().click();
    expect(column(t.node, 1)).toEqual(['1560.8', '1821.6', '2634.1', 'null']);
    expect(t.node.querySelectorAll('th')[1]!.getAttribute('aria-sort')).toBe('ascending');
    header().click();
    expect(column(t.node, 1)).toEqual(['2634.1', '1821.6', '1560.8', 'null']);
    header().click();
    expect(column(t.node, 0)[0]).toBe('Io');
  });

  it('pages 50 rows at a time and says when the kernel embedded fewer than the source has', async () => {
    const data = Array.from({ length: 120 }, (_, i) => [i, `r${i}`]);
    const t = await render({
      schema: { fields: [{ name: 'i', type: 'integer' }, { name: 's' }] },
      data,
      ganymede: { rows: 5000, shown: 120 },
    });
    expect(t.node.querySelectorAll('tbody tr')).toHaveLength(50);
    const footer = () => t.node.querySelector('.gm-table-footer')!.textContent;
    expect(footer()).toBe('‹›Rows 1–50 of 120 embedded; the source has 5,000.');
    t.node.querySelector<HTMLButtonElement>('[aria-label="Next rows"]')!.click();
    t.node.querySelector<HTMLButtonElement>('[aria-label="Next rows"]')!.click();
    expect(column(t.node, 0)).toHaveLength(20);
    expect(t.node.querySelector<HTMLButtonElement>('[aria-label="Next rows"]')!.disabled).toBe(
      true,
    );
    t.node.querySelector<HTMLButtonElement>('th button')!.click();
    expect(footer()).toContain('Sorted within the first 120.');
    expect(column(t.node, 0)[0]).toBe('0');
  });

  it('keeps NaN last when sorting descending', async () => {
    const t = await render({
      schema: { fields: [{ name: 'x', type: 'number' }] },
      data: [[1], ['NaN'], [3], [null]],
    });
    const header = () => t.node.querySelector<HTMLButtonElement>('th button')!;
    header().click();
    header().click();
    expect(column(t.node, 0)).toEqual(['3', '1', 'NaN', 'null']);
    expect(document.activeElement).toBe(header());
  });

  it('drops a caption when an update has no title', async () => {
    const t = await render(moons);
    await t.renderModel(
      new MimeModel({ data: { [TABLE_MIME]: { ...moons, ganymede: { rows: 4 } } as never } }),
    );
    expect(t.node.querySelector('caption')).toBeNull();
  });

  it('survives a malformed bundle', async () => {
    const t = await render({ data: 'nope' });
    expect(t.node.querySelector('.gm-table-footer')!.textContent).toBe('No rows');
  });
});

describe('table helpers', () => {
  it('compares by type', () => {
    expect(compareValues(2, 10, 'integer')).toBeLessThan(0);
    expect(compareValues('9007199254740993', 5, 'integer')).toBeGreaterThan(0);
    expect(compareValues('NaN', 1, 'number')).toBeGreaterThan(0);
    expect(compareValues('b10', 'b9', 'string')).toBeGreaterThan(0);
    expect(compareValues(null, 'a', 'string')).toBe(1);
    expect(compareValues(false, true, 'boolean')).toBeLessThan(0);
    expect(compareValues('NaN', 1, 'number', true)).toBeGreaterThan(0);
    expect(compareValues(null, 1, 'number', true)).toBe(1);
    expect(compareValues('9007199254740993', '9007199254740992', 'integer')).toBeGreaterThan(0);
    expect(compareValues('9007199254740993', '9007199254740992', 'integer', true)).toBeLessThan(0);
  });

  it('reads rows as objects or arrays', () => {
    const fields = [{ name: 'a' }, { name: 'b' }];
    expect(rowsOf({ data: [{ b: 2, a: 1 }, [3, 4], 5] }, fields)).toEqual([
      [1, 2],
      [3, 4],
      [undefined, undefined],
    ]);
  });

  it('writes the footer', () => {
    expect(footerText({ start: 0, end: 0, embedded: 0, total: 0, sorted: false })).toBe('No rows');
    expect(footerText({ start: 50, end: 100, embedded: 1000, total: 1000, sorted: true })).toBe(
      'Rows 51–100 of 1,000',
    );
  });
});

/**
 * A kernel that keeps a 2,500-row table under id "t1", as cdp-kernel does,
 * and answers the table comm. `refuse` makes it close the comm at once, as
 * a kernel that no longer has the table does.
 */
function pagingKernel(
  options: { refuse?: boolean; refuseSort?: boolean; hold?: boolean; total?: number } = {},
) {
  const all = Array.from({ length: 2500 }, (_, i) => [i, `row ${i}`]);
  const log: Record<string, unknown>[] = [];
  const listeners: ((sender: unknown, status: string) => void)[] = [];
  const disposedListeners: (() => void)[] = [];
  const kernel = {
    statusChanged: {
      connect: (fn: (sender: unknown, status: string) => void, self: unknown) =>
        void listeners.push(fn.bind(self)),
      disconnect: () => true,
    },
    disposed: {
      connect: (fn: () => void, self: unknown) => void disposedListeners.push(fn.bind(self)),
      disconnect: () => true,
    },
    status: (status: string) => listeners.forEach(fn => fn(kernel, status)),
    dispose: () => disposedListeners.forEach(fn => fn()),
    createComm(target: string) {
      expect(target).toBe(PAGE_TARGET);
      const comm = {
        isDisposed: false,
        onMsg: (_msg: unknown) => {},
        onClose: (_msg: unknown) => {},
        open(data: { id: string }) {
          log.push({ open: data.id });
          if (options.refuse || data.id !== 't1') {
            queueMicrotask(() => {
              comm.onMsg({ content: { data: { error: 'The kernel no longer has this table' } } });
              comm.onClose({});
            });
          }
        },
        send(data: {
          request: number;
          offset: number;
          limit: number;
          sort?: { column: string; descending: boolean };
        }) {
          log.push(data);
          const answer = () => {
            const rows = [...all];
            if (data.sort) {
              const c = data.sort.column === 'n' ? 0 : 1;
              rows.sort(
                (a, b) =>
                  (a[c]! < b[c]! ? -1 : a[c]! > b[c]! ? 1 : 0) * (data.sort!.descending ? -1 : 1),
              );
            }
            const reply =
              options.refuseSort && data.sort
                ? { request: data.request, error: 'sorting is offered up to 1,000,000 rows' }
                : {
                    request: data.request,
                    offset: data.offset,
                    total: options.total ?? all.length,
                    rows: rows.slice(data.offset, data.offset + data.limit),
                  };
            comm.onMsg({ content: { data: reply } });
          };
          // Each request answered on its own, or never with `hold`.
          if (!options.hold) queueMicrotask(answer);
        },
        close() {
          comm.isDisposed = true;
        },
      };
      return comm;
    },
  };
  return {
    kernel: kernel as unknown as Kernel,
    log,
    status: kernel.status,
    dispose: kernel.dispose,
  };
}

const big = {
  schema: {
    fields: [
      { name: 'n', type: 'integer' },
      { name: 'name', type: 'string' },
    ],
  },
  data: Array.from({ length: 1000 }, (_, i) => ({ n: i, name: `row ${i}` })),
  ganymede: { rows: 2500, shown: 1000, page: 't1' },
};

async function renderPaged(kernel: Kernel | null, trusted = true, resource: unknown = big) {
  const renderer = new RenderedTable(TABLE_MIME, () => kernel);
  renderers.push(renderer);
  document.body.appendChild(renderer.node);
  await renderer.renderModel(new MimeModel({ data: { [TABLE_MIME]: resource as never }, trusted }));
  return renderer;
}

const settle = () => new Promise(resolve => setTimeout(resolve, 0));
const footer = (node: HTMLElement) => node.querySelector('.gm-table-footer span')!.textContent;

describe('paging through the kernel', () => {
  it('shows embedded pages without the kernel, and asks it for the rest', async () => {
    const { kernel, log } = pagingKernel();
    const table = await renderPaged(kernel);
    expect(table.paged).toBe(true);
    expect(footer(table.node)).toBe('Rows 1–50 of 2,500');
    table.showPage(19);
    expect(log).toEqual([]);
    expect(column(table.node, 0)[0]).toBe('950');
    table.showPage(20);
    expect(footer(table.node)).toContain('Loading…');
    await settle();
    expect(log).toEqual([{ open: 't1' }, { request: 1, offset: 1000, limit: 50 }]);
    expect(column(table.node, 0)[0]).toBe('1000');
    expect(footer(table.node)).toBe('Rows 1,001–1,050 of 2,500');
    table.showPage(49);
    await settle();
    expect(column(table.node, 0).at(-1)).toBe('2499');
  });

  it('sorts the whole table in the kernel', async () => {
    const { kernel, log } = pagingKernel();
    const table = await renderPaged(kernel);
    table.sortBy(0);
    table.sortBy(0);
    await settle();
    expect(log.at(-1)).toEqual({
      request: 2,
      offset: 0,
      limit: 50,
      sort: { column: 'n', descending: true },
    });
    expect(column(table.node, 0)[0]).toBe('2499');
    expect(footer(table.node)).toBe('Rows 1–50 of 2,500');
  });

  it('keeps to the embedded rows when the kernel no longer has the table', async () => {
    const { kernel } = pagingKernel({ refuse: true });
    const table = await renderPaged(kernel);
    table.showPage(30);
    await settle();
    await settle();
    expect(table.paged).toBe(false);
    expect(footer(table.node)).toBe('Rows 951–1,000 of 1,000 embedded; the source has 2,500.');
  });

  it("doesn't page an untrusted output, or without a kernel", async () => {
    const { kernel, log } = pagingKernel();
    expect((await renderPaged(kernel, false)).paged).toBe(false);
    const fits = { ...big, ganymede: { rows: 1000, shown: 1000, page: 't1' } };
    expect((await renderPaged(kernel, true, fits)).paged).toBe(false);
    expect(log).toEqual([]);
    // No kernel when a page is needed: back to the embedded rows.
    const alone = await renderPaged(null);
    alone.showPage(30);
    await settle();
    expect(alone.paged).toBe(false);
    expect(footer(alone.node)).toBe('Rows 951–1,000 of 1,000 embedded; the source has 2,500.');
  });

  it('asks the kernel for page 1 when fewer rows are embedded', async () => {
    const { kernel, log } = pagingKernel();
    const few = { ...big, data: big.data.slice(0, 20), ganymede: { ...big.ganymede, shown: 20 } };
    const table = await renderPaged(kernel, true, few);
    await settle();
    expect(log).toEqual([{ open: 't1' }, { request: 1, offset: 0, limit: 50 }]);
    expect(column(table.node, 0)).toHaveLength(50);
    expect(footer(table.node)).toBe('Rows 1–50 of 2,500');
  });

  it('keeps paging when the kernel refuses a sort, and says why', async () => {
    const { kernel } = pagingKernel({ refuseSort: true });
    const table = await renderPaged(kernel);
    table.sortBy(0);
    await settle();
    await settle();
    expect(table.paged).toBe(true);
    expect(footer(table.node)).toBe('Rows 1–50 of 2,500 · sorting is offered up to 1,000,000 rows');
    expect(table.node.querySelector('[aria-sort]')).toBeNull();
    table.showPage(20);
    await settle();
    expect(column(table.node, 0)[0]).toBe('1000');
  });

  it('stops loading when the kernel restarts mid-request', async () => {
    const { kernel, status } = pagingKernel({ hold: true });
    const table = await renderPaged(kernel);
    table.showPage(20);
    expect(footer(table.node)).toContain('Loading…');
    status('restarting');
    await settle();
    expect(table.paged).toBe(false);
    expect(footer(table.node)).not.toContain('Loading…');
  });

  it("falls back when the kernel doesn't answer at all", async () => {
    vi.useFakeTimers();
    try {
      const { kernel } = pagingKernel({ hold: true });
      const table = await renderPaged(kernel);
      table.showPage(20);
      expect(footer(table.node)).toContain('Loading…');
      await vi.advanceTimersByTimeAsync(FIRST_REPLY_MS);
      expect(table.paged).toBe(false);
      expect(footer(table.node)).not.toContain('Loading…');
    } finally {
      vi.useRealTimers();
    }
  });

  it('notices a kernel connection disposed mid-request', async () => {
    const { kernel, dispose } = pagingKernel({ hold: true });
    const table = await renderPaged(kernel);
    table.showPage(20);
    dispose();
    await settle();
    expect(table.paged).toBe(false);
    expect(footer(table.node)).not.toContain('Loading…');
  });

  it('asks again for a page whose answer was lost, once the person comes back', async () => {
    const { kernel, log } = pagingKernel({ hold: true });
    const table = await renderPaged(kernel);
    table.showPage(20);
    table.showPage(21);
    table.showPage(20);
    expect(log.filter(entry => 'request' in entry && entry.offset === 1000)).toHaveLength(2);
  });

  it('moves back to the last page when the kernel says the table shrank', async () => {
    const { kernel } = pagingKernel({ total: 1100 });
    const table = await renderPaged(kernel);
    table.showPage(40);
    await settle();
    await settle();
    expect(footer(table.node)).toBe('Rows 1,051–1,100 of 1,100');
  });

  it("asks once for a page in flight, and takes the kernel's row count", async () => {
    const { kernel, log } = pagingKernel({ total: 3000 });
    const table = await renderPaged(kernel);
    table.showPage(20);
    table.showPage(20);
    await settle();
    expect(log.filter(entry => 'request' in entry && entry.offset === 1000)).toHaveLength(1);
    expect(footer(table.node)).toBe('Rows 1,001–1,050 of 3,000');
  });

  it('writes the footer for a paged table', () => {
    expect(
      footerText({
        start: 1000,
        end: 1050,
        embedded: 1000,
        total: 2500,
        sorted: true,
        paged: true,
      }),
    ).toBe('Rows 1,001–1,050 of 2,500');
  });
});
