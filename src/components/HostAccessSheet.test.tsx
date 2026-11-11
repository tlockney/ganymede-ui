import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HostAccessSheet } from './HostAccessSheet';
import type { HostGrant, HostGrants } from '../lib/host-grants';

const defaults = { read: ['journal'], edit_self: true, run: [] };

function renderSheet(grant: HostGrant = {}, wants: string[] = []) {
  const load = vi.fn(async (): Promise<HostGrants> => ({ path: 'a.ipynb', grant, defaults }));
  const save = vi.fn(async (g: HostGrant): Promise<HostGrants> => ({
    path: 'a.ipynb',
    grant: g,
    defaults,
  }));
  const onClose = vi.fn();
  render(
    <HostAccessSheet name="a.ipynb" wants={wants} load={load} save={save} onClose={onClose} />,
  );
  return { load, save, onClose };
}

const useDefault = (section: string) =>
  screen.getAllByRole('checkbox', { name: /Use the server’s default/ })[
    ['Read', 'Its own cells', 'Run'].indexOf(section)
  ]!;

describe('HostAccessSheet', () => {
  it('shows the defaults, and saving them stores no grant', async () => {
    const { save, onClose } = renderSheet();
    expect(await screen.findByText('Use the server’s default: journal')).toBeInTheDocument();
    expect(screen.getByText('Use the server’s default: on')).toBeInTheDocument();
    expect(screen.getByText('Use the server’s default: none')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith({});
    expect(onClose).toHaveBeenCalled();
  });

  it('sets run and edit_self for this notebook alone', async () => {
    const { save } = renderSheet();
    await screen.findByText('Use the server’s default: none');
    await userEvent.click(useDefault('Run'));
    const runBox = screen.getByRole('textbox', { name: /Run, one folder/ });
    await userEvent.type(runBox, 'reports{enter}/daily/');
    await userEvent.click(useDefault('Its own cells'));
    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Add, edit and delete its own cells' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith({ run: ['reports', 'daily'], edit_self: false });
  });

  it('starts from the notebook’s own grant, and can go back to the default', async () => {
    const { save } = renderSheet({ read: ['', 'x'] });
    const readBox = await screen.findByRole('textbox', { name: /Read, one folder/ });
    expect(readBox).toHaveValue('/\nx');
    await userEvent.click(useDefault('Read'));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(save).toHaveBeenCalledWith({});
  });

  it('shows what the notebook asks for', async () => {
    renderSheet({}, ['notebooks.run', 'something.new']);
    expect(
      await screen.findByText(/This notebook asks to run other notebooks, something\.new\./),
    ).toBeInTheDocument();
  });

  it('keeps the sheet open and says why when saving fails', async () => {
    const { save, onClose } = renderSheet();
    save.mockRejectedValueOnce(new Error('No notebook at "a.ipynb"'));
    await screen.findByText('Use the server’s default: none');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('Not saved: No notebook at "a.ipynb"')).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
