import { beforeEach, describe, expect, it } from 'vitest';
import { type PaletteContext, filterEntries, paletteEntries } from './palette';
import { resetKeys } from './shortcuts';

const CONTEXT: PaletteContext = {
  path: 'moons/Io.ipynb',
  folder: 'moons',
  kernels: [
    { name: 'python3', displayName: 'Python 3' },
    { name: 'cdp', displayName: 'TypeScript' },
  ],
  kernel: 'python3',
  recents: ['moons/Io.ipynb', 'Europa.ipynb'],
  trusted: true,
  connected: true,
};

beforeEach(() => {
  localStorage.clear();
  resetKeys();
});

const find = (label: string, context = CONTEXT) =>
  paletteEntries(context).find(e => e.label === label);

describe('paletteEntries', () => {
  it('lists the app’s commands, the notebook’s, kernels and recents', () => {
    const labels = paletteEntries(CONTEXT).map(e => e.label);
    expect(labels).toEqual(
      expect.arrayContaining([
        'New Notebook',
        'Save',
        'Rename Notebook…',
        'Run All Cells',
        'Clear All Outputs',
        'Restart Kernel',
        'Change Kernel to TypeScript',
        'Move cells up',
        'Change to Markdown',
        'Find',
        'Open Europa',
        'Keyboard Shortcuts',
      ]),
    );
    // Only in a cell editor, or the palette itself.
    expect(labels).not.toContain('Complete');
    expect(labels).not.toContain('Command palette');
    // The open notebook isn't offered again.
    expect(labels).not.toContain('Open Io');
  });

  it('gives each its key and its argument', () => {
    expect(find('Save')).toMatchObject({ id: 'save', keys: expect.stringMatching(/S$/) });
    expect(find('Move cells up')).toMatchObject({ id: 'move-up', group: 'Command mode' });
    expect(find('Change Kernel to TypeScript')).toMatchObject({ id: 'change-kernel', arg: 'cdp' });
    expect(find('New Notebook')).toMatchObject({ id: 'new-notebook', arg: 'moons' });
    expect(find('Open Europa')).toMatchObject({ id: 'open', arg: 'Europa.ipynb', keys: '' });
    expect(find('Rename Notebook…')).toMatchObject({ prompt: 'New name', initial: 'Io' });
  });

  it('disables what can’t run now', () => {
    expect(find('Change Kernel to Python 3')?.disabled).toBe(true);
    expect(find('Trust Notebook')?.disabled).toBe(true);
    expect(find('Trust Notebook', { ...CONTEXT, trusted: false })?.disabled).toBe(false);
    const none = { ...CONTEXT, path: undefined, kernel: undefined };
    expect(find('Save', none)?.disabled).toBe(true);
    expect(find('Move cells up', none)?.disabled).toBe(true);
    expect(find('New Notebook', none)?.disabled).toBe(false);
    expect(find('Open Io', none)).toBeDefined();
    expect(find('New Notebook', { ...none, connected: false })?.disabled).toBe(true);
  });
});

describe('filterEntries', () => {
  const entries = paletteEntries(CONTEXT);
  const labels = (query: string) => filterEntries(entries, query).map(e => e.label);

  it('keeps everything for an empty query', () => {
    expect(filterEntries(entries, '  ')).toBe(entries);
  });

  it('puts a label that starts with the query first', () => {
    expect(labels('restart')[0]).toBe('Restart Kernel');
    expect(labels('run all')[0]).toBe('Run All Cells');
  });

  it('matches every word, at word starts or inside, and the group', () => {
    expect(labels('ker type')).toEqual(['Change Kernel to TypeScript']);
    expect(labels('kernel')).toContain('Interrupt Kernel');
    // "recent" is a group.
    expect(labels('recent')).toEqual(['Open Europa']);
    expect(labels('arkdow')).toEqual(expect.arrayContaining(['Change to Markdown']));
    expect(labels('zzz')).toEqual([]);
  });

  it('offers the exports only where the server makes them', () => {
    expect(find('Export as Markdown')?.disabled).toBe(true);
    const entry = find('Export as Script', { ...CONTEXT, publish: true });
    expect(entry?.disabled).toBe(false);
    expect(entry?.arg).toBe('script');
  });

  it('offers Run with Parameters only on a server that runs notebooks', () => {
    expect(find('Run with Parameters…')?.disabled).toBe(true);
    expect(find('Run with Parameters…', { ...CONTEXT, publish: true })?.disabled).toBe(false);
  });
});
