import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { StartScreen } from './StartScreen';

const setup = () => {
  const props = { onTry: vi.fn(), onOpen: vi.fn(), onConnect: vi.fn() };
  render(<StartScreen {...props} />);
  return props;
};
const input = () => screen.getByLabelText('Notebook file') as HTMLInputElement;
const upload = (file: File) => userEvent.upload(input(), file, { applyAccept: false });
const notebook = (name = 'Mine.ipynb') =>
  new File([JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [], metadata: {} })], name);

describe('StartScreen', () => {
  it('offers three actions in this order, each with a line of detail', () => {
    setup();
    const names = screen.getAllByRole('button').map(b => b.textContent);
    expect(names).toEqual(['Try a Notebook', 'Open a Notebook…', 'Connect to a Server…']);
    for (const name of names) {
      const details = screen.getByRole('button', { name: name! }).getAttribute('aria-describedby');
      expect(document.getElementById(details!)?.textContent).toBeTruthy();
    }
    // Server, token and placement belong to the sheet.
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Token|Server/)).not.toBeInTheDocument();
  });

  it('says where browser work is kept', () => {
    setup();
    expect(
      screen.getByText('Saved in this browser. Download a copy to keep it elsewhere.'),
    ).toBeInTheDocument();
  });

  it('takes no focus on its own, and Tab starts at Try a Notebook', async () => {
    setup();
    expect(document.body).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Try a Notebook' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Open a Notebook…' })).toHaveFocus();
    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Connect to a Server…' })).toHaveFocus();
  });

  it('Try a Notebook and Connect to a Server… call their handlers', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Try a Notebook' }));
    expect(props.onTry).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole('button', { name: 'Connect to a Server…' }));
    expect(props.onConnect).toHaveBeenCalledOnce();
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it('Open a Notebook… asks for a notebook file through a hidden input', async () => {
    setup();
    expect(input()).toHaveAttribute('accept', '.ipynb,application/x-ipynb+json');
    expect(input()).toHaveAttribute('type', 'file');
    expect(input()).not.toBeVisible();
    const click = vi.spyOn(input(), 'click');
    await userEvent.click(screen.getByRole('button', { name: 'Open a Notebook…' }));
    expect(click).toHaveBeenCalledOnce();
  });

  it('hands over a file that is a notebook, and lets the same file be picked again', async () => {
    const props = setup();
    const file = notebook();
    await upload(file);
    expect(props.onOpen).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input().value).toBe('');
  });

  it.each([
    ['a name that isn’t .ipynb', new File(['{"nbformat": 4}'], 'notes.txt'), 'notes.txt'],
    ['text that isn’t JSON', new File(['hello'], 'a.ipynb'), 'not JSON'],
    ['JSON that isn’t a notebook', new File(['{"cells": []}'], 'a.ipynb'), 'no nbformat'],
    ['a JSON list', new File(['[1, 2]'], 'a.ipynb'), 'no nbformat'],
    ['an empty file', new File([''], 'a.ipynb'), 'not JSON'],
  ])('says so for %s, and opens nothing', async (_, file, reason) => {
    const props = setup();
    await upload(file);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(`Couldn’t open “${file.name}”`);
    expect(alert).toHaveTextContent(reason);
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(input().value).toBe('');
  });

  it('clears the error once a notebook is picked, or Try is chosen', async () => {
    const props = setup();
    await upload(new File(['hello'], 'a.ipynb'));
    await screen.findByRole('alert');
    await upload(notebook());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(props.onOpen).toHaveBeenCalledOnce();
    await upload(new File(['hello'], 'a.ipynb'));
    await screen.findByRole('alert');
    await userEvent.click(screen.getByRole('button', { name: 'Try a Notebook' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error it is given', () => {
    render(<StartScreen onTry={vi.fn()} onOpen={vi.fn()} onConnect={vi.fn()} error="It broke." />);
    expect(screen.getByRole('alert')).toHaveTextContent('It broke.');
  });

  it('does nothing when the picker is dismissed', async () => {
    const props = setup();
    input().dispatchEvent(new Event('change', { bubbles: true }));
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
