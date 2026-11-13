import '../test/notebook-env';
import { afterEach, describe, expect, it } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { MimeModel } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

const { createRendermime } = await import('./jupyterlab');
const { TABLE_MIME, compareValues, footerText, rowsOf } = await import('./table-output');
type RenderedTable = import('./table-output').RenderedTable;

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
