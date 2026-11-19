import '../test/notebook-env';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import { DataPane } from './DataPane';

/** A browser-kind backend, whose files come through the contents API, with `files` as text. */
function backendWith(files: Record<string, string>) {
  const fake = fakeServices({ '': [] });
  fake.contents.get.mockImplementation((async (path: string, opts?: { content?: boolean }) => {
    if (path in files)
      return { path, name: path, type: 'file', format: 'text', content: files[path] };
    if (opts?.content === false) {
      throw Object.assign(new Error('not found'), { response: { status: 404 } });
    }
    throw new Error('missing');
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
});
