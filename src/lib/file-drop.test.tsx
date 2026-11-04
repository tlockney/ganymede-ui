import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { Contents } from '@jupyterlab/services';
import {
  carriesFiles,
  copyIntoFolder,
  freeName,
  isNotebookFile,
  parseNotebook,
  useFileDrop,
} from './file-drop';

// Dropping notebooks from Finder or Files (#216). The drop itself, as WebKit
// delivers it, is checked by hand on a device; these drive the same
// handlers with jsdom's events.

const NB = { nbformat: 4, nbformat_minor: 5, metadata: {}, cells: [] };
const notebook = (name: string, content: unknown = NB) =>
  new File([JSON.stringify(content)], name, { type: '' });

function contents(names: string[] = []) {
  return {
    get: vi.fn(async (_path: string) => ({ content: names.map(name => ({ name })) })),
    save: vi.fn(async (path: string) => ({ path })),
  };
}
const asManager = (c: ReturnType<typeof contents>) => c as unknown as Contents.IManager;

describe('freeName', () => {
  it('keeps a name that is free', () => {
    expect(freeName('Io.ipynb', ['Europa.ipynb'])).toBe('Io.ipynb');
  });

  it('adds a copy suffix to a name that is taken, as a duplicate gets', () => {
    expect(freeName('Io.ipynb', ['Io.ipynb'])).toBe('Io-Copy1.ipynb');
    expect(freeName('Io.ipynb', ['Io.ipynb', 'Io-Copy1.ipynb'])).toBe('Io-Copy2.ipynb');
  });

  it('compares names without case, as a Mac’s disk does', () => {
    expect(freeName('io.ipynb', ['IO.ipynb'])).toBe('io-Copy1.ipynb');
    expect(freeName('Io.IPYNB', ['io.ipynb'])).toBe('Io-Copy1.IPYNB');
  });
});

describe('isNotebookFile and carriesFiles', () => {
  it('knows a notebook by its name', () => {
    expect(isNotebookFile({ name: 'Io.ipynb' })).toBe(true);
    expect(isNotebookFile({ name: 'Io.IPYNB' })).toBe(true);
    expect(isNotebookFile({ name: 'Io.py' })).toBe(false);
  });

  it('knows a drag with files', () => {
    expect(carriesFiles({ types: ['Files'] })).toBe(true);
    expect(carriesFiles({ types: ['text/plain'] })).toBe(false);
    expect(carriesFiles(null)).toBe(false);
  });
});

describe('parseNotebook', () => {
  it('reads a notebook', () => {
    expect(parseNotebook(JSON.stringify(NB))).toEqual(NB);
  });

  it('refuses what isn’t one', () => {
    expect(() => parseNotebook('{')).toThrow(/not JSON/);
    expect(() => parseNotebook('[]')).toThrow(/no nbformat/);
    expect(() => parseNotebook('{"cells": []}')).toThrow(/no nbformat/);
  });
});

describe('copyIntoFolder', () => {
  it('saves a dropped notebook into the folder through the contents API', async () => {
    const fake = contents(['Europa.ipynb']);
    const result = await copyIntoFolder(asManager(fake), 'moons', [notebook('Io.ipynb')]);
    expect(fake.get).toHaveBeenCalledWith('moons', { content: true });
    expect(fake.save).toHaveBeenCalledWith('moons/Io.ipynb', {
      type: 'notebook',
      format: 'json',
      content: NB,
    });
    expect(result).toEqual({ paths: ['moons/Io.ipynb'], errors: [] });
  });

  it('saves at the root without a leading slash', async () => {
    const fake = contents();
    const result = await copyIntoFolder(asManager(fake), '', [notebook('Io.ipynb')]);
    expect(result.paths).toEqual(['Io.ipynb']);
  });

  it('never replaces a notebook already there, nor one dropped with it', async () => {
    const fake = contents(['Io.ipynb']);
    const result = await copyIntoFolder(asManager(fake), 'moons', [
      notebook('Io.ipynb'),
      notebook('Io.ipynb'),
    ]);
    expect(result.paths).toEqual(['moons/Io-Copy1.ipynb', 'moons/Io-Copy2.ipynb']);
  });

  it('skips files that aren’t notebooks, and says so', async () => {
    const fake = contents();
    const result = await copyIntoFolder(asManager(fake), '', [
      notebook('Io.ipynb'),
      new File(['x'], 'moons.csv'),
    ]);
    expect(result.paths).toEqual(['Io.ipynb']);
    expect(result.errors).toEqual([
      'Only notebooks (.ipynb) can be dropped here, not “moons.csv”.',
    ]);
  });

  it('says which file couldn’t be read or saved, and goes on', async () => {
    const fake = contents();
    fake.save.mockRejectedValueOnce(new Error('Permission denied'));
    const result = await copyIntoFolder(asManager(fake), '', [
      notebook('Io.ipynb'),
      new File(['not json'], 'Europa.ipynb'),
      notebook('Ganymede.ipynb'),
    ]);
    expect(result.paths).toEqual(['Ganymede.ipynb']);
    expect(result.errors).toEqual([
      'Couldn’t add “Io.ipynb”: Permission denied',
      'Couldn’t add “Europa.ipynb”: it isn’t a notebook (not JSON)',
    ]);
  });

  it('says so when the folder can’t be listed, and saves nothing', async () => {
    const fake = contents();
    fake.get.mockRejectedValueOnce(new Error('Not found'));
    const result = await copyIntoFolder(asManager(fake), 'gone', [notebook('Io.ipynb')]);
    expect(fake.save).not.toHaveBeenCalled();
    expect(result.errors).toEqual(['Couldn’t read the folder: Not found']);
  });
});

describe('useFileDrop', () => {
  function Target(props: Parameters<typeof useFileDrop>[0]) {
    const drop = useFileDrop(props);
    return (
      <div data-testid="target" className={drop.active ? 'drop-active' : ''} {...drop.handlers}>
        <div data-testid="editor" />
      </div>
    );
  }

  const files = (...list: File[]) => ({ dataTransfer: { types: ['Files'], files: list } });

  it('copies a dropped notebook into its folder and reports where', async () => {
    const fake = contents();
    const onCopied = vi.fn();
    const onError = vi.fn();
    render(<Target contents={asManager(fake)} dir="moons" onCopied={onCopied} onError={onError} />);
    await act(async () => {
      fireEvent.drop(screen.getByTestId('editor'), files(notebook('Io.ipynb')));
    });
    expect(onCopied).toHaveBeenCalledWith(['moons/Io.ipynb']);
    expect(onError).not.toHaveBeenCalled();
  });

  it('keeps a dropped notebook from what is under the pointer', async () => {
    const fake = contents();
    const under = vi.fn();
    render(<Target contents={asManager(fake)} dir="" onError={vi.fn()} />);
    const editor = screen.getByTestId('editor');
    editor.addEventListener('drop', under);
    await act(async () => {
      fireEvent.drop(editor, files(notebook('Io.ipynb')));
    });
    expect(under).not.toHaveBeenCalled();
  });

  it('leaves other files to what is under the pointer', async () => {
    const fake = contents();
    const onError = vi.fn();
    render(<Target contents={asManager(fake)} dir="" onError={onError} />);
    const editor = screen.getByTestId('editor');
    // As CodeMirror takes a text file.
    editor.addEventListener('drop', e => e.preventDefault());
    await act(async () => {
      fireEvent.drop(editor, files(new File(['x'], 'moons.txt')));
    });
    expect(fake.save).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('says so when nothing took a file that isn’t a notebook', async () => {
    const fake = contents();
    const onError = vi.fn();
    render(<Target contents={asManager(fake)} dir="" onError={onError} />);
    await act(async () => {
      fireEvent.drop(screen.getByTestId('editor'), files(new File(['x'], 'moons.csv')));
    });
    expect(onError).toHaveBeenCalledWith(
      'Only notebooks (.ipynb) can be dropped here, not “moons.csv”.',
    );
  });

  it('shows it is a target while files are over it', () => {
    render(<Target contents={asManager(contents())} dir="" onError={vi.fn()} />);
    const target = screen.getByTestId('target');
    const editor = screen.getByTestId('editor');
    fireEvent.dragEnter(target, files());
    fireEvent.dragEnter(editor, files());
    fireEvent.dragLeave(target, files());
    expect(target).toHaveClass('drop-active');
    fireEvent.dragLeave(editor, files());
    expect(target).not.toHaveClass('drop-active');
  });

  it('accepts a drag with files, and ignores one without', () => {
    render(<Target contents={asManager(contents())} dir="" onError={vi.fn()} />);
    const target = screen.getByTestId('target');
    expect(fireEvent.dragOver(target, files())).toBe(false);
    expect(fireEvent.dragOver(target, { dataTransfer: { types: ['text/plain'] } })).toBe(true);
  });

  it('is no target until connected', () => {
    render(<Target dir="" onError={vi.fn()} />);
    const target = screen.getByTestId('target');
    expect(fireEvent.dragOver(target, files())).toBe(true);
    fireEvent.dragEnter(target, files());
    expect(target).not.toHaveClass('drop-active');
  });
});
