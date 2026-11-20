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
        'Show or Hide Type Errors',
        'Show or Hide Live Markdown Preview',
      ]),
    );
    // Only in a cell editor, or the palette itself.
    expect(labels).not.toContain('Complete');
    expect(labels).not.toContain('Command palette');
    // The open notebook isn't offered again.
    expect(labels).not.toContain('Open Io');
  });

  it('offers the type errors switch as the page command that runs it (#669)', () => {
    expect(find('Show or Hide Type Errors')).toMatchObject({
      id: 'toggle-type-errors',
      group: 'View',
    });
    expect(find('Show or Hide Type Errors')!.disabled).toBeFalsy();
  });

  it('offers go to definition and rename symbol as page commands, the second asking for the name (#676)', () => {
    expect(find('Go to Definition')).toMatchObject({
      id: 'go-to-definition',
      group: 'Cell',
      keys: 'F12',
    });
    expect(find('Rename Symbol…')).toMatchObject({
      id: 'rename-symbol',
      group: 'Cell',
      keys: 'F2',
      prompt: 'New name',
    });
    expect(find('Go to Definition')!.disabled).toBeFalsy();
    const none = { ...CONTEXT, path: undefined, kernel: undefined };
    expect(find('Go to Definition', none)?.disabled).toBe(true);
    expect(find('Rename Symbol…', none)?.disabled).toBe(true);
  });

  it('offers the live Markdown preview switch as the page command that runs it (#672)', () => {
    expect(find('Show or Hide Live Markdown Preview')).toMatchObject({
      id: 'toggle-live-markdown',
      group: 'View',
    });
    expect(find('Show or Hide Live Markdown Preview')!.disabled).toBeFalsy();
  });

  it('offers the journal view as the page command that switches it, named for the view it goes to (#184)', () => {
    expect(find('View as Journal')).toMatchObject({ id: 'toggle-journal', group: 'View' });
    expect(find('View as Journal')!.disabled).toBeFalsy();
    expect(find('Open as Notebook', { ...CONTEXT, journal: true })).toMatchObject({
      id: 'toggle-journal',
    });
    expect(find('View as Journal', { ...CONTEXT, journal: true })).toBeUndefined();
    expect(find('View as Journal', { ...CONTEXT, path: undefined })?.disabled).toBe(true);
  });

  it('lists the commands that run or edit cells as disabled while the journal shows (#184)', () => {
    const journal = { ...CONTEXT, journal: true };
    for (const label of [
      'Run All Cells',
      'Clear All Outputs',
      'Insert Code Cell',
      'Insert Markdown Cell',
      'Run cell',
      'Insert cell above',
      'Delete cells',
      'Change to Markdown',
      'Go to Definition',
      'Rename Symbol…',
    ]) {
      expect(find(label)?.disabled, `${label} in the notebook`).toBeFalsy();
      expect(find(label, journal)?.disabled, `${label} in the journal`).toBe(true);
    }
    // What doesn't touch the cells stays on.
    expect(find('Save', journal)!.disabled).toBeFalsy();
    expect(find('Restart Kernel', journal)!.disabled).toBeFalsy();
  });

  it('gives each its key and its argument', () => {
    expect(find('Save')).toMatchObject({ id: 'save', keys: expect.stringMatching(/S$/) });
    expect(find('Move cells up')).toMatchObject({ id: 'move-up', group: 'Command mode' });
    expect(find('Change Kernel to TypeScript')).toMatchObject({ id: 'change-kernel', arg: 'cdp' });
    expect(find('New Notebook')).toMatchObject({ id: 'new-notebook', arg: 'moons' });
    expect(find('New DuckDB Console')).toMatchObject({
      id: 'new-duckdb-console',
      arg: 'moons',
      group: 'File',
      disabled: false,
    });
    expect(find('Open Europa')).toMatchObject({ id: 'open', arg: 'Europa.ipynb', keys: '' });
    expect(find('Rename Notebook…')).toMatchObject({ prompt: 'New name', initial: 'Io' });
  });

  it('disables the DuckDB console without a connection', () => {
    expect(find('New DuckDB Console', { ...CONTEXT, connected: false })?.disabled).toBe(true);
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
    expect(find('Run with Parameters…', { ...CONTEXT, runParams: true })?.disabled).toBe(false);
  });
});
