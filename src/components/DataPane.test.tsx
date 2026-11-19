import '../test/notebook-env';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import { DataPane } from './DataPane';

// Parquet runs in DuckDB's worker, which the real package's test covers.
const parquet = vi.hoisted(() => ({
  openEngine: vi.fn(),
  parquetTable: vi.fn(),
}));
vi.mock('../lib/parquet', () => parquet);

// JupyterLab's JSON renderer is its own package, with its own React 18
// under it, which the test run can't share with the app's React (the
// build dedupes them). This stands in for it: a widget with its class.
vi.mock('@jupyterlab/json-extension', async () => {
  const { Widget } = await import('@lumino/widgets');
  return {
    rendererFactory: {
      createRenderer: () => {
        const w = new Widget();
        w.addClass('jp-RenderedJSON');
        return Object.assign(w, { renderModel: async () => {} });
      },
    },
  };
});

/** A browser-kind backend, whose files come through the contents API, with `files` as text. */
function backendWith(files: Record<string, string>, sizes: Record<string, number> = {}) {
  const fake = fakeServices({ '': [] });
  fake.contents.get.mockImplementation((async (path: string, opts?: { content?: boolean }) => {
    if (!(path in files)) {
      throw Object.assign(new Error('not found'), { response: { status: 404 } });
    }
    // The size comes first, without the content.
    if (opts?.content === false) {
      return { path, name: path, type: 'file', size: sizes[path] ?? files[path]!.length };
    }
    return { path, name: path, type: 'file', format: 'text', content: files[path] };
  }) as never);
  return { ...fake, backend: fakeBackend(fake.services, { kind: 'browser' }) };
}

const MOONS = 'name,radius\nIo,1821.6\nEuropa,1560.8\nGanymede,2634.1\n';

describe('DataPane', () => {
  it('shows a CSV as a table with typed columns', async () => {
    const { backend } = backendWith({ 'moons.csv': MOONS });
    render(<DataPane backend={backend} path="moons.csv" onOpenNotebook={() => {}} />);
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(within(table).getByText('Ganymede')).toBeInTheDocument();
    expect(within(table).getByTitle('Sort by radius')).toBeInTheDocument();
    expect(screen.getByText('number')).toBeInTheDocument();
  });

  it('filters rows by text', async () => {
    const { backend } = backendWith({ 'moons.csv': MOONS });
    render(<DataPane backend={backend} path="moons.csv" onOpenNotebook={() => {}} />);
    await screen.findByRole('table');
    await userEvent.type(screen.getByRole('searchbox', { name: 'Filter rows' }), 'euro');
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(2));
    expect(screen.getByText('Europa')).toBeInTheDocument();
    expect(screen.queryByText('Io')).toBeNull();
  });

  it('says when the row cap cut the file', async () => {
    const big = 'n\n' + Array.from({ length: 10_050 }, (_, i) => i).join('\n');
    const { backend } = backendWith({ 'big.csv': big });
    render(<DataPane backend={backend} path="big.csv" onOpenNotebook={() => {}} />);
    expect(await screen.findByText('Showing the first 10,000 rows.')).toBeInTheDocument();
  });

  it('shows a JSON file as a tree, and one that isn’t JSON as an error', async () => {
    const { backend } = backendWith({
      'a.json': '{"moons": ["Io", "Europa"]}',
      'bad.json': '{oops',
    });
    const { unmount } = render(
      <DataPane backend={backend} path="a.json" onOpenNotebook={() => {}} />,
    );
    await waitFor(() =>
      expect(document.querySelector('.data-body .jp-RenderedJSON')).not.toBeNull(),
    );
    expect(screen.queryByRole('searchbox')).toBeNull();
    unmount();
    render(<DataPane backend={backend} path="bad.json" onOpenNotebook={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/isn’t valid JSON/);
  });

  it('offers Open as Text only when the host has an editor', async () => {
    const { backend } = backendWith({ 'moons.csv': MOONS });
    const open = vi.fn();
    const { rerender } = render(
      <DataPane backend={backend} path="moons.csv" onOpenNotebook={() => {}} />,
    );
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Open as Text' })).toBeNull();
    rerender(
      <DataPane backend={backend} path="moons.csv" onOpenAsText={open} onOpenNotebook={() => {}} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open as Text' }));
    expect(open).toHaveBeenCalledOnce();
  });

  it('makes a notebook beside the file and opens it', async () => {
    const { backend, contents } = backendWith({ 'data/moons.csv': MOONS });
    const opened = vi.fn();
    render(<DataPane backend={backend} path="data/moons.csv" onOpenNotebook={opened} />);
    await screen.findByRole('table');
    await userEvent.click(screen.getByRole('button', { name: 'New Notebook from File' }));
    await waitFor(() => expect(opened).toHaveBeenCalledWith('data/moons.ipynb'));
    const [path, model] = contents.save.mock.calls[0] as [
      string,
      { content: { cells: { source: string }[] } },
    ];
    expect(path).toBe('data/moons.ipynb');
    expect(model.content.cells[1]!.source).toBe('await jupyter.sql.load("moons", "moons.csv");');
  });

  it('refuses a file over the ceiling, saying what to do instead', async () => {
    const { backend } = backendWith({ 'huge.csv': 'a\n1\n' }, { 'huge.csv': 300 * 1024 * 1024 });
    render(<DataPane backend={backend} path="huge.csv" onOpenNotebook={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/300 MB, over the 256 MB/);
    expect(alert).toHaveTextContent('New Notebook from File queries it with DuckDB.');
  });

  it('says when the first bytes hold no complete row, not an empty table', async () => {
    const { backend } = backendWith({ 'wide.csv': 'x'.repeat(9 * 1024 * 1024) });
    render(<DataPane backend={backend} path="wide.csv" onOpenNotebook={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/first 8\.0 MB .* no complete row/);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('drops the record a byte cut left half-read, in a quoted field too', async () => {
    const head = 'a,b\n1,2\n';
    const text = head + '"' + 'x'.repeat(9 * 1024 * 1024) + '\ny",3\n';
    const { backend } = backendWith({ 'q.csv': text });
    render(<DataPane backend={backend} path="q.csv" onOpenNotebook={() => {}} />);
    await screen.findByRole('table');
    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('Showing the first 1 rows.')).toBeInTheDocument();
  });

  describe('Parquet', () => {
    const table = {
      schema: [
        { name: 'id', type: 'BIGINT' },
        { name: 'name', type: 'VARCHAR' },
      ],
      total: 5,
      resource: {
        schema: {
          fields: [
            { name: 'id', type: 'integer' },
            { name: 'name', type: 'string' },
          ],
        },
        data: [
          [1, 'Io'],
          [2, 'Europa'],
        ],
        ganymede: { title: 'm.parquet' },
      },
    };
    const files = { 'm.parquet': 'PAR1' };

    beforeEach(() => {
      parquet.openEngine.mockReset();
      parquet.parquetTable.mockReset();
    });

    it('shows the schema, the rows and how many of the file’s rows they are', async () => {
      const close = vi.fn();
      parquet.openEngine.mockResolvedValue({ close });
      parquet.parquetTable.mockResolvedValue(table);
      const { backend } = backendWith(files);
      const { unmount } = render(
        <DataPane backend={backend} path="m.parquet" onOpenNotebook={() => {}} />,
      );
      expect(await screen.findByText('Showing the first 2 of 5 rows.')).toBeInTheDocument();
      expect(screen.getByText('Schema (2 columns)')).toBeInTheDocument();
      expect(screen.getByText('id: BIGINT')).toBeInTheDocument();
      expect(screen.getByText('name: VARCHAR')).toBeInTheDocument();
      expect(await screen.findByRole('table')).toHaveTextContent('Europa');
      // The map is read when the engine is ready, not before: a function.
      expect(typeof parquet.openEngine.mock.calls[0]![0]).toBe('function');
      expect(close).not.toHaveBeenCalled();
      unmount();
      expect(close).toHaveBeenCalledOnce();
    });

    it('closes the engine of a load that finishes after the view went away', async () => {
      const close = vi.fn();
      let finish!: (t: unknown) => void;
      parquet.openEngine.mockResolvedValue({ close });
      parquet.parquetTable.mockReturnValue(new Promise(r => (finish = r)));
      const { backend } = backendWith(files);
      const { unmount } = render(
        <DataPane backend={backend} path="m.parquet" onOpenNotebook={() => {}} />,
      );
      await waitFor(() => expect(parquet.parquetTable).toHaveBeenCalled());
      unmount();
      expect(close).not.toHaveBeenCalled();
      finish(table);
      await waitFor(() => expect(close).toHaveBeenCalledOnce());
    });

    it('closes the engine when reading the file fails', async () => {
      const close = vi.fn();
      parquet.openEngine.mockResolvedValue({ close });
      parquet.parquetTable.mockRejectedValue(new Error('Not a Parquet file'));
      const { backend } = backendWith(files);
      render(<DataPane backend={backend} path="m.parquet" onOpenNotebook={() => {}} />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Not a Parquet file');
      expect(close).toHaveBeenCalledOnce();
    });
  });
});
