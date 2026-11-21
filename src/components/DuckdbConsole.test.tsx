import '../test/notebook-env';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import type { ArrowResult } from '../lib/duckdb-console';
import { DuckdbConsole } from './DuckdbConsole';
import {
  startConsole,
  clearConsoles,
  listedConsoles,
  loadConsoles,
  saveConsole,
} from '../lib/console-recents';
import { recentsKey } from '../lib/recents';

// DuckDB itself runs in a worker; duckdb-console.real.test.ts covers the real package.
const parquet = vi.hoisted(() => ({ openEngine: vi.fn() }));
vi.mock('../lib/parquet', async importOriginal => ({
  ...(await importOriginal<typeof import('../lib/parquet')>()),
  ...parquet,
}));

function arrow(columns: [string, string, unknown[]][]): ArrowResult {
  return {
    numRows: columns[0]?.[2].length ?? 0,
    schema: { fields: columns.map(([name, type]) => ({ name, type: { toString: () => type } })) },
    getChildAt: (i: number) => ({ get: (r: number) => columns[i]![2][r] }),
    toArray: () => [],
  } as unknown as ArrowResult;
}

// jsdom has no layout: CodeMirror measures text through ranges.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const MOONS = arrow([
  ['name', 'Utf8', ['Io', 'Europa']],
  ['radius', 'Float64', [1821.6, 1560.8]],
]);

function engineFor(answer: (sql: string) => ArrowResult | Error = () => MOONS) {
  const engine = {
    register: vi.fn(),
    query: vi.fn(async (sql: string) => {
      const r = answer(sql);
      if (r instanceof Error) throw r;
      return r;
    }),
    close: vi.fn(async () => {}),
  };
  // The `describe` the console asks of a query first is not one of the statements.
  parquet.openEngine.mockResolvedValue({
    ...engine,
    query: async (sql: string) =>
      sql.startsWith('describe select * from (') ? { toArray: () => [] } : engine.query(sql),
  });
  return engine;
}

// One backend per fake, so a rerender passes the same one.
const backends = new WeakMap<object, ReturnType<typeof fakeBackend>>();
function backend(fake: ReturnType<typeof fakeServices>) {
  if (!backends.has(fake)) backends.set(fake, fakeBackend(fake.services, { kind: 'browser' }));
  return backends.get(fake)!;
}

const handlers = { onRename: vi.fn(), onOpenConsole: vi.fn() };
const props = (
  fake: ReturnType<typeof fakeServices>,
  folder: string,
  id: string,
  onOpenNotebook: () => void,
  name = 'Console 1',
) => ({ backend: backend(fake), folder, id, name, ...handlers, onOpenNotebook });

function setup(files: Record<string, string> = {}, folder = '', id = 'c1') {
  const fake = fakeServices({ '': [] });
  fake.contents.get.mockImplementation((async (path: string, opts?: { content?: boolean }) => {
    if (!(path in files)) throw Object.assign(new Error('nf'), { response: { status: 404 } });
    if (opts?.content === false)
      return { path, name: path, type: 'file', size: files[path]!.length };
    return { path, name: path, type: 'file', format: 'text', content: files[path] };
  }) as never);
  const opened = vi.fn();
  const ui = render(<DuckdbConsole {...props(fake, folder, id, opened)} />);
  return { ...ui, fake, opened };
}

const editor = () => document.querySelector('.cm-editor') as HTMLElement;
const content = () => document.querySelector('.cm-content') as HTMLElement;
const view = () => EditorView.findFromDOM(editor())!;
const type = (text: string) =>
  act(() =>
    view().dispatch({
      changes: { from: 0, to: view().state.doc.length, insert: text },
      selection: { anchor: text.length },
    }),
  );
const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => void fireEvent.keyDown(content(), { key: k, ...init }));
const typed = () => view().state.doc.toString();

describe('DuckdbConsole', () => {
  beforeEach(() => {
    parquet.openEngine.mockReset();
    localStorage.clear();
    handlers.onRename.mockReset();
    handlers.onOpenConsole.mockReset();
  });

  it('runs a statement ending in ; on Enter and shows its rows as a table', async () => {
    const engine = engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select * from moons;');
    key('Enter');
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    expect(within(table).getByText('Europa')).toBeInTheDocument();
    expect(engine.query).toHaveBeenCalledWith('select * from moons');
    expect(screen.getByText(/^2 rows · \d+ ms/)).toBeInTheDocument();
    // The input is empty again, and the statement is in the scrollback.
    expect(typed()).toBe('');
    expect(document.querySelector('.duck-sql')).toHaveTextContent('select * from moons');
  });

  it('highlights SQL in the scrollback and in the input (#708)', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select * from moons qualify 1');
    const typedKeywords = () =>
      [...content().querySelectorAll('span')].filter(s => s.className).map(s => s.textContent);
    await waitFor(() =>
      expect(typedKeywords()).toEqual(expect.arrayContaining(['select', 'qualify'])),
    );
    key('Enter', { shiftKey: true });
    await screen.findByRole('table');
    const sql = document.querySelector('.duck-sql')!;
    expect(sql).toHaveTextContent('select * from moons qualify 1');
    const marked = () =>
      [...sql.querySelectorAll('span')].filter(s => s.className).map(s => s.textContent);
    await waitFor(() =>
      expect(marked()).toEqual(expect.arrayContaining(['select', 'from', 'qualify'])),
    );
    expect(sql).toHaveTextContent('select * from moons qualify 1');
  });

  it('adds a line on Enter before the statement ends, and runs on Shift-Enter', async () => {
    const engine = engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select *');
    key('Enter');
    expect(typed()).toBe('select *\n');
    expect(engine.query).not.toHaveBeenCalled();
    type('select *\nfrom moons');
    key('Enter', { shiftKey: true });
    await screen.findByRole('table');
    expect(engine.query).toHaveBeenCalledWith('select *\nfrom moons');
    // Shift-Enter on only a comment runs nothing and keeps it.
    type('-- a note');
    key('Enter', { shiftKey: true });
    expect(typed()).toBe('-- a note');
  });

  it('runs every statement of a paste, and stops at the first error', async () => {
    const engine = engineFor(sql => (sql === 'bad' ? new Error('Parser Error: bad') : MOONS));
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1; bad; select 3;');
    key('Enter');
    expect(await screen.findByRole('alert')).toHaveTextContent('Parser Error: bad');
    expect(engine.query.mock.calls.map(c => c[0])).toEqual(['select 1', 'bad']);
    expect([...document.querySelectorAll('.duck-sql')].map(e => e.textContent)).toEqual([
      'select 1',
      'bad',
    ]);
  });

  it('shows an error inline and keeps working', async () => {
    const engine = engineFor(sql =>
      sql.startsWith('selec ') ? new Error('Parser Error: syntax') : MOONS,
    );
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('selec 1;');
    key('Enter');
    expect(await screen.findByRole('alert')).toHaveTextContent('Parser Error: syntax');
    type('select 1;');
    key('Enter');
    await screen.findByRole('table');
    expect(engine.query).toHaveBeenCalledTimes(2);
    // The error stays above the new result.
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('says what a statement without rows did', async () => {
    engineFor(() => arrow([['Count', 'Int64', []]]));
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('create table t(i int);');
    key('Enter');
    expect(await screen.findByText(/^OK · \d+ ms/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('walks the history with ↑ and ↓ at the first and last line', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1;');
    key('Enter');
    type('select 2;');
    key('Enter');
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
    type('draft');
    key('ArrowUp');
    expect(typed()).toBe('select 2;');
    key('ArrowUp');
    expect(typed()).toBe('select 1;');
    key('ArrowDown');
    expect(typed()).toBe('select 2;');
    key('ArrowDown');
    expect(typed()).toBe('draft');
  });

  it('starts the history walk over after an edit of any kind, Backspace and Delete too', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1;');
    key('Enter');
    type('select 2;');
    key('Enter');
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
    const edits: [string, () => void][] = [
      [
        'typing',
        () =>
          act(() =>
            view().dispatch({ changes: { from: 9, insert: 'x' }, userEvent: 'input.type' }),
          ),
      ],
      [
        'Backspace',
        () =>
          act(() => view().dispatch({ changes: { from: 8, to: 9 }, userEvent: 'delete.backward' })),
      ],
      [
        'Delete',
        () =>
          act(() => view().dispatch({ changes: { from: 8, to: 9 }, userEvent: 'delete.forward' })),
      ],
    ];
    for (const [, edit] of edits) {
      key('ArrowUp');
      expect(typed()).toBe('select 2;');
      edit();
      // Walking again starts from the newest, not one further back.
      view().dispatch({ selection: { anchor: 0 } });
      key('ArrowUp');
      expect(typed()).toBe('select 2;');
      key('ArrowDown');
      type('');
    }
  });

  it('keeps two inputs entered quickly in order, each statement under its own', async () => {
    const release: (() => void)[] = [];
    const engine = engineFor();
    engine.query.mockImplementation(async (sql: string) => {
      if (sql === 'a1') await new Promise<void>(r => release.push(r));
      return MOONS;
    });
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('a1; a2;');
    key('Enter');
    type('b1;');
    key('Enter');
    await waitFor(() => expect(release).toHaveLength(1));
    expect(engine.query.mock.calls.map(c => c[0])).toEqual(['a1']);
    await act(async () => release[0]!());
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(3));
    expect(engine.query.mock.calls.map(c => c[0])).toEqual(['a1', 'a2', 'b1']);
    expect([...document.querySelectorAll('.duck-sql')].map(e => e.textContent)).toEqual([
      'a1',
      'a2',
      'b1',
    ]);
  });

  it('leaves ↑ to the cursor inside a multi-line input', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1;');
    key('Enter');
    await screen.findByRole('table');
    type('select\n1');
    // The cursor is on the second line: ↑ is not a history key there.
    key('ArrowUp');
    expect(typed()).toBe('select\n1');
  });

  it('reads a named file from the folder before the statement runs', async () => {
    const engine = engineFor();
    setup({ 'work/data/moons.csv': 'name\nIo\n' }, 'work');
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type(`select * from 'data/moons.csv';`);
    key('Enter');
    await screen.findByRole('table');
    expect(engine.register).toHaveBeenCalledTimes(1);
    const [name, bytes] = engine.register.mock.calls[0] as unknown as [string, Uint8Array];
    expect([name, new TextDecoder().decode(bytes)]).toEqual(['data/moons.csv', 'name\nIo\n']);
    expect(screen.getByText(/read work\/data\/moons\.csv/)).toBeInTheDocument();
  });

  it('shows a file that is missing or too large inline', async () => {
    const engine = engineFor(sql =>
      sql.includes('gone') ? new Error('IO Error: No files found') : MOONS,
    );
    setup({});
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type(`select * from 'gone.csv';`);
    key('Enter');
    expect(await screen.findByRole('alert')).toHaveTextContent('No files found');
    type(`select * from '../x.csv';`);
    key('Enter');
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(2));
    expect(screen.getAllByRole('alert')[1]).toHaveTextContent('outside this window’s folder');
    expect(engine.query.mock.calls.map(c => c[0])).toEqual([`select * from 'gone.csv'`]);
  });

  it('ends the engine when it closes, and when it closes while DuckDB is still starting', async () => {
    const engine = engineFor();
    const first = setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    expect(engine.close).not.toHaveBeenCalled();
    first.unmount();
    await waitFor(() => expect(engine.close).toHaveBeenCalledTimes(1));

    let release!: (e: unknown) => void;
    const late = engineFor();
    parquet.openEngine.mockReturnValue(new Promise(r => (release = r)));
    const second = setup();
    await waitFor(() => expect(parquet.openEngine).toHaveBeenCalledTimes(2));
    second.unmount();
    expect(late.close).not.toHaveBeenCalled();
    await act(async () => release(late));
    await waitFor(() => expect(late.close).toHaveBeenCalledTimes(1));
  });

  it('starts one engine per console', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1;');
    key('Enter');
    type('select 2;');
    key('Enter');
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
    expect(parquet.openEngine).toHaveBeenCalledTimes(1);
  });

  it('keeps its engine and what it read when its folder is renamed, and reads from the new one', async () => {
    const engine = engineFor();
    const files = { 'work/a.csv': 'x\n1\n', 'moved/b.csv': 'y\n2\n' };
    const { fake, opened, rerender } = setup(files, 'work');
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type(`select * from 'a.csv';`);
    key('Enter');
    await screen.findByRole('table');

    rerender(<DuckdbConsole {...props(fake, 'moved', 'c1', opened)} />);
    type(`select * from 'b.csv';`);
    key('Enter');
    await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
    expect(parquet.openEngine).toHaveBeenCalledTimes(1);
    expect(engine.close).not.toHaveBeenCalled();
    expect(engine.register.mock.calls.map(c => c[0])).toEqual(['a.csv', 'b.csv']);
    expect(screen.getByText(/read moved\/b\.csv/)).toBeInTheDocument();

    fake.contents.save.mockClear();
    await userEvent.click(screen.getByRole('button', { name: 'Export to Notebook' }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith('moved/duckdb-console.ipynb'));
    const [, model] = fake.contents.save.mock.calls[0] as unknown as [
      string,
      { content: { cells: { source: string }[] } },
    ];
    expect(model.content.cells.map(c => c.source).slice(1, 3)).toEqual([
      'await jupyter.sql.load("a_file", "a.csv");',
      'await jupyter.sql.load("b_file", "b.csv");',
    ]);
  });

  it('drops the result of a statement that ran on an engine the console has since replaced', async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const engine = engineFor();
    engine.query.mockImplementation(async () => {
      await gate;
      return MOONS;
    });
    const { opened, rerender } = setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select * from moons;');
    key('Enter');
    expect(await screen.findByText('Running…')).toBeInTheDocument();
    // A new backend means a new engine: the first one's answer is not this console's.
    rerender(
      <DuckdbConsole
        backend={backend(fakeServices({ '': [] }))}
        folder=""
        id="c1"
        name="Console 1"
        onRename={handlers.onRename}
        onOpenConsole={handlers.onOpenConsole}
        onOpenNotebook={opened}
      />,
    );
    await waitFor(() => expect(parquet.openEngine).toHaveBeenCalledTimes(2));
    await act(async () => release());
    await waitFor(() => expect(engine.close).toHaveBeenCalled());
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('Running…')).toBeInTheDocument();
  });

  it('keeps waiting for its own engine when one it has since replaced starts', async () => {
    let first!: (engine: unknown) => void;
    parquet.openEngine.mockReturnValueOnce(new Promise(r => (first = r)));
    const { opened, rerender } = setup();
    // The replacement's engine stays pending.
    parquet.openEngine.mockReturnValueOnce(new Promise(() => {}));
    rerender(
      <DuckdbConsole
        backend={backend(fakeServices({ '': [] }))}
        folder=""
        id="c1"
        name="Console 1"
        onRename={handlers.onRename}
        onOpenConsole={handlers.onOpenConsole}
        onOpenNotebook={opened}
      />,
    );
    await waitFor(() => expect(parquet.openEngine).toHaveBeenCalledTimes(2));
    const stale = engineFor();
    await act(async () => first(stale));
    // The first engine is closed, and does not stand in for the one still starting.
    await waitFor(() => expect(stale.close).toHaveBeenCalled());
    expect(screen.getByText('Starting DuckDB…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export to Notebook' })).toBeDisabled();
  });

  it('drops the failure of an engine the console has since replaced', async () => {
    let fail!: (e: unknown) => void;
    parquet.openEngine.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)));
    const { opened, rerender } = setup();
    // Typed while DuckDB is still starting: it waits for the engine.
    type('select 1;');
    key('Enter');
    expect(await screen.findByText('Running…')).toBeInTheDocument();
    engineFor();
    rerender(
      <DuckdbConsole
        backend={backend(fakeServices({ '': [] }))}
        folder=""
        id="c1"
        name="Console 1"
        onRename={handlers.onRename}
        onOpenConsole={handlers.onOpenConsole}
        onOpenNotebook={opened}
      />,
    );
    await waitFor(() => expect(parquet.openEngine).toHaveBeenCalledTimes(2));
    await act(async () => fail(new Error('first engine failed')));
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    expect(screen.queryByText(/first engine failed/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('leaves ↓ to the cursor on all but the last line of a recalled input, and ↓ to a selection', async () => {
    engineFor();
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select\n1;');
    key('Enter');
    await screen.findByRole('table');
    type('draft');
    key('ArrowUp');
    expect(typed()).toBe('select\n1;');
    // Walking, the cursor on the first of two lines: ↓ moves the cursor, not the walk.
    view().dispatch({ selection: { anchor: 0 } });
    key('ArrowDown');
    expect(typed()).toBe('select\n1;');
    // A selection on the last line is for the cursor too.
    view().dispatch({ selection: { anchor: 7, head: 9 } });
    key('ArrowDown');
    expect(typed()).toBe('select\n1;');
    // From the end, ↓ goes on to what was typed.
    view().dispatch({ selection: { anchor: 9 } });
    key('ArrowDown');
    expect(typed()).toBe('draft');
  });

  it('says a result it cut off has more rows than it shows', async () => {
    const batch = (n: number) => ({ numRows: n, getChildAt: () => ({ get: (r: number) => r }) });
    parquet.openEngine.mockResolvedValue({
      register: vi.fn(),
      query: async () => ({ toArray: () => [] }),
      stream: async () => ({
        schema: { fields: [{ name: 'i', type: { toString: () => 'Int64' } }] },
        batches: [batch(10_240)],
        more: true,
      }),
      close: async () => {},
    });
    setup();
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select * from range(100000);');
    key('Enter');
    expect(
      await screen.findByText(/^more than 10,000 rows · \d+ ms · showing the first 10,000$/),
    ).toBeInTheDocument();
  });

  it('says when DuckDB does not start', async () => {
    parquet.openEngine.mockImplementation(async () => {
      throw new Error('no wasm');
    });
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('DuckDB didn’t start: no wasm');
    // The error replaces the starting line, which would otherwise stay for good.
    expect(screen.queryByText('Starting DuckDB…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Export to Notebook' })).toBeDisabled();
  });

  it('exports a notebook of what ran, beside the folder, and opens it', async () => {
    engineFor(sql => (sql === 'bad' ? new Error('Parser Error') : MOONS));
    const { fake, opened } = setup({ 'work/a.csv': 'x\n1\n' }, 'work');
    const exportButton = screen.getByRole('button', { name: 'Export to Notebook' });
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    // Nothing ran yet.
    expect(exportButton).toBeDisabled();
    type(`select * from 'a.csv'; bad; select 2;`);
    key('Enter');
    await waitFor(() => expect(exportButton).toBeEnabled());
    fake.contents.save.mockClear();
    await userEvent.click(exportButton);
    await waitFor(() => expect(opened).toHaveBeenCalledWith('work/duckdb-console.ipynb'));
    const [path, model] = fake.contents.save.mock.calls[0] as unknown as [
      string,
      { content: { cells: { source: string }[] } },
    ];
    expect(path).toBe('work/duckdb-console.ipynb');
    expect(model.content.cells.map(c => c.source).slice(1)).toEqual([
      'await jupyter.sql.load("a_file", "a.csv");',
      "await jupyter.sql`select * from 'a.csv'`;",
    ]);
  });

  it('names the export freely when one is there already, and says when saving fails', async () => {
    engineFor();
    const { fake, opened } = setup({ 'duckdb-console.ipynb': '{}' }, '');
    await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
    type('select 1;');
    key('Enter');
    const button = screen.getByRole('button', { name: 'Export to Notebook' });
    await waitFor(() => expect(button).toBeEnabled());
    fake.contents.save.mockRejectedValueOnce(new Error('read-only'));
    await userEvent.click(button);
    expect(await screen.findByText(/Couldn’t export a notebook: read-only/)).toBeInTheDocument();
    expect(opened).not.toHaveBeenCalled();
    await userEvent.click(button);
    await waitFor(() => expect(opened).toHaveBeenCalledWith('duckdb-console 2.ipynb'));
  });

  describe('names and recent consoles (#735)', () => {
    const storeKey = recentsKey({ kind: 'browser' } as never);
    const record = (id: string, name: string, statements: string[], used = 1) => ({
      id,
      name,
      folder: '',
      statements,
      used,
    });

    it('shows its name and renames it on Enter, not on Esc or an empty name', async () => {
      engineFor();
      setup();
      await userEvent.click(screen.getByRole('button', { name: 'Console 1' }));
      const field = screen.getByRole('textbox', { name: 'Console name' });
      await userEvent.clear(field);
      await userEvent.type(field, 'Moons{Enter}');
      expect(handlers.onRename).toHaveBeenCalledWith('Moons');
      expect(screen.queryByRole('textbox', { name: 'Console name' })).toBeNull();

      await userEvent.click(screen.getByRole('button', { name: 'Console 1' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Console name' }), 'zzz{Escape}');
      expect(screen.queryByRole('textbox', { name: 'Console name' })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Console 1' }));
      await userEvent.clear(screen.getByRole('textbox', { name: 'Console name' }));
      await userEvent.keyboard('{Enter}');
      expect(handlers.onRename).toHaveBeenCalledTimes(1);
    });

    it('keeps what ran under its record, most recent first', async () => {
      engineFor();
      saveConsole(storeKey, record('old', 'Old', ['select 0'], 1));
      setup({}, 'moons', 'c1');
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      type('select 1; select 2;');
      key('Enter', { shiftKey: true });
      await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
      const [first, second] = loadConsoles(storeKey);
      expect(first).toMatchObject({
        id: 'c1',
        name: 'Console 1',
        folder: 'moons',
        statements: ['select 1', 'select 2'],
      });
      expect(second?.id).toBe('old');
    });

    it('opens again with its statements and no results, and runs them again on a new engine', async () => {
      const engine = engineFor();
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1', 'select 2']));
      setup({}, '', 'c1');
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      expect([...document.querySelectorAll('.duck-sql')].map(e => e.textContent)).toEqual([
        'select 1',
        'select 2',
      ]);
      expect(screen.queryByRole('table')).toBeNull();
      expect(engine.query).not.toHaveBeenCalled();
      expect(screen.getAllByText('Not run in this session')).toHaveLength(2);

      await userEvent.click(screen.getByRole('button', { name: 'Run All Again' }));
      await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
      expect(engine.query.mock.calls.map(c => c[0])).toEqual(['select 1', 'select 2']);
      expect(screen.queryByRole('button', { name: 'Run All Again' })).toBeNull();
      expect(screen.queryByText('Not run in this session')).toBeNull();
      // Running them again adds nothing to the record.
      expect(loadConsoles(storeKey)[0]?.statements).toEqual(['select 1', 'select 2']);

      // A new statement appends to the same record; ↑ brings back the last.
      type('select 3;');
      key('Enter');
      await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(3));
      const records = loadConsoles(storeKey);
      expect(records).toHaveLength(1);
      expect(records[0]?.statements).toEqual(['select 1', 'select 2', 'select 3']);
      key('ArrowUp');
      expect(typed()).toBe('select 3;');
    });

    it('gives its name back when closed unused, and keeps what ran', async () => {
      engineFor();
      expect(startConsole(storeKey, 'c1', '').name).toBe('Console 1');
      const first = setup({}, '', 'c1');
      first.unmount();
      expect(startConsole(storeKey, 'c2', '').name).toBe('Console 1');
      const second = setup({}, '', 'c2');
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      type('select 1;');
      key('Enter');
      await screen.findByRole('table');
      second.unmount();
      expect(loadConsoles(storeKey).map(r => r.id)).toEqual(['c2']);
    });

    it('gives its name back on pagehide, as a closed Mac tab’s page gets it', async () => {
      engineFor();
      startConsole(storeKey, 'c1', '');
      const { unmount } = setup({}, '', 'c1');
      act(() => void window.dispatchEvent(new Event('pagehide')));
      // Gone, and not put back by the console's own re-reservation.
      expect(loadConsoles(storeKey)).toEqual([]);
      expect(startConsole(storeKey, 'c2', '').name).toBe('Console 1');
      // The unmount's own release after it changes nothing more.
      unmount();
      expect(loadConsoles(storeKey).map(r => r.id)).toEqual(['c2']);
    });

    it('takes its name again when its page comes back from the back/forward cache', async () => {
      engineFor();
      const a = startConsole(storeKey, 'c1', '');
      setup({}, '', 'c1');
      act(() => void window.dispatchEvent(new Event('pagehide')));
      expect(loadConsoles(storeKey)).toEqual([]);
      const back = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(back, 'persisted', { value: true });
      act(() => void window.dispatchEvent(back));
      expect(loadConsoles(storeKey)).toMatchObject([{ id: 'c1', name: a.name, statements: [] }]);
      expect(startConsole(storeKey, 'c2', '').name).not.toBe(a.name);
    });

    it('keeps its name taken after a clear once its page is back from the back/forward cache', async () => {
      engineFor();
      const a = startConsole(storeKey, 'c1', '');
      setup({}, '', 'c1');
      act(() => void window.dispatchEvent(new Event('pagehide')));
      const back = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(back, 'persisted', { value: true });
      act(() => void window.dispatchEvent(back));
      act(() => clearConsoles(storeKey));
      expect(loadConsoles(storeKey)).toMatchObject([{ id: 'c1', name: a.name, statements: [] }]);
      expect(startConsole(storeKey, 'c2', '').name).not.toBe(a.name);
    });

    it('keeps a used console’s record through pagehide and a back/forward cache restore', async () => {
      engineFor();
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1', 'select 2']));
      setup({}, '', 'c1');
      act(() => void window.dispatchEvent(new Event('pagehide')));
      const back = new Event('pageshow') as PageTransitionEvent;
      Object.defineProperty(back, 'persisted', { value: true });
      act(() => void window.dispatchEvent(back));
      expect(loadConsoles(storeKey)).toMatchObject([
        { id: 'c1', name: 'Console 1', statements: ['select 1', 'select 2'] },
      ]);
    });

    it('keeps an open unused console’s name taken after a clear', async () => {
      engineFor();
      const a = startConsole(storeKey, 'a', '');
      setup({}, '', 'a');
      act(() => clearConsoles(storeKey));
      // A's reservation is back, unlisted, so B can't take its name.
      expect(loadConsoles(storeKey).map(r => r.id)).toEqual(['a']);
      expect(listedConsoles(loadConsoles(storeKey))).toEqual([]);
      expect(startConsole(storeKey, 'b', '').name).not.toBe(a.name);
    });

    it('keeps an open console’s name taken after a clear, and starts its record over', async () => {
      engineFor();
      const a = startConsole(storeKey, 'a', '');
      setup({}, '', 'a');
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      type('select 1;');
      key('Enter');
      await screen.findByRole('table');
      expect(listedConsoles(loadConsoles(storeKey)).map(r => r.id)).toEqual(['a']);
      act(() => clearConsoles(storeKey));
      // Back as a reservation with nothing saved: unlisted, its name still taken.
      expect(loadConsoles(storeKey)).toMatchObject([{ id: 'a', name: a.name, statements: [] }]);
      expect(listedConsoles(loadConsoles(storeKey))).toEqual([]);
      expect(startConsole(storeKey, 'b', '').name).not.toBe(a.name);
      // Its next statement lists it again with only that statement.
      type('select 2;');
      key('Enter');
      await waitFor(() => expect(screen.getAllByRole('table')).toHaveLength(2));
      expect(loadConsoles(storeKey).find(r => r.id === 'a')?.statements).toEqual(['select 2']);
    });

    it('walks the restored statements with ↑', async () => {
      engineFor();
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1', 'select 2']));
      setup();
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      key('ArrowUp');
      expect(typed()).toBe('select 2');
      key('ArrowUp');
      expect(typed()).toBe('select 1');
    });

    it('starts its record over after Clear Recent Consoles', async () => {
      engineFor();
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1']));
      setup();
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      act(() => clearConsoles(storeKey));
      type('select 2;');
      key('Enter');
      await screen.findByRole('table');
      expect(loadConsoles(storeKey)).toHaveLength(1);
      expect(loadConsoles(storeKey)[0]?.statements).toEqual(['select 2']);
    });

    it('stops Run All Again at an error and leaves the rest to run again', async () => {
      const engine = engineFor(sql => (sql === 'bad' ? new Error('boom') : MOONS));
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1', 'bad', 'select 3']));
      setup();
      await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
      await userEvent.click(screen.getByRole('button', { name: 'Run All Again' }));
      expect(await screen.findByText('boom')).toBeInTheDocument();
      expect(engine.query.mock.calls.map(c => c[0])).toEqual(['select 1', 'bad']);
      expect(screen.getAllByText('Not run in this session')).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Run All Again' })).toBeEnabled();
    });

    it('lists other recent consoles to open, and clears them', async () => {
      engineFor();
      saveConsole(storeKey, record('c1', 'Console 1', ['select 1'], 3));
      saveConsole(storeKey, record('b', 'Beta', ['select 2'], 2));
      setup({}, '', 'c1');
      const menu = screen.getByRole('combobox', { name: 'Recent consoles' });
      // Not the console itself.
      expect(within(menu).queryByRole('option', { name: /Console 1/ })).toBeNull();
      await userEvent.selectOptions(menu, 'b');
      expect(handlers.onOpenConsole).toHaveBeenCalledWith('b');
      await userEvent.selectOptions(
        menu,
        screen.getByRole('option', { name: 'Clear Recent Consoles' }),
      );
      expect(listedConsoles(loadConsoles(storeKey))).toEqual([]);
      await waitFor(() => expect(screen.queryByRole('combobox')).toBeNull());
    });

    it('runs when storage fails', async () => {
      engineFor();
      const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('full');
      });
      try {
        setup();
        await waitFor(() => expect(screen.queryByText('Starting DuckDB…')).toBeNull());
        type('select 1;');
        key('Enter');
        expect(await screen.findByRole('table')).toBeInTheDocument();
      } finally {
        set.mockRestore();
      }
    });
  });
});
