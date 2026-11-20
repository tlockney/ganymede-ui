import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBackend, fakeServices } from '../test/fakes';
import {
  MAX_CONSOLES,
  MAX_STATEMENTS,
  clearConsoles,
  consoleFor,
  defaultConsoleName,
  loadConsoles,
  moveConsoleFolders,
  newConsoleId,
  onConsolesChange,
  renameConsole,
  saveConsole,
  useConsoles,
  type ConsoleRecord,
} from './console-recents';

const KEY = 'ganymede:http://a';
const STORAGE = 'ganymede-ui:console-recents';

const rec = (id: string, extra: Partial<ConsoleRecord> = {}): ConsoleRecord => ({
  id,
  name: `Console ${id}`,
  folder: '',
  statements: [],
  used: 0,
  ...extra,
});

beforeEach(() => localStorage.clear());

describe('recent consoles (#735)', () => {
  it('keeps the most recently saved first, one record for an id', () => {
    saveConsole(KEY, rec('a', { used: 1 }));
    saveConsole(KEY, rec('b', { used: 2 }));
    saveConsole(KEY, rec('a', { used: 3, statements: ['select 1'] }));
    expect(loadConsoles(KEY).map(r => r.id)).toEqual(['a', 'b']);
    expect(loadConsoles(KEY)[0]?.statements).toEqual(['select 1']);
  });

  it('keeps 20 per server, and 200 statements in each, dropping the oldest', () => {
    for (let i = 0; i < MAX_CONSOLES + 3; i++) saveConsole(KEY, rec(`c${i}`, { used: i }));
    const ids = loadConsoles(KEY).map(r => r.id);
    expect(ids).toHaveLength(MAX_CONSOLES);
    expect(ids[0]).toBe(`c${MAX_CONSOLES + 2}`);
    expect(ids).not.toContain('c0');
    const many = Array.from({ length: MAX_STATEMENTS + 5 }, (_, i) => `select ${i}`);
    saveConsole(KEY, rec('long', { statements: many, used: 999 }));
    const kept = loadConsoles(KEY)[0]!.statements;
    expect(kept).toHaveLength(MAX_STATEMENTS);
    expect(kept.at(-1)).toBe(`select ${MAX_STATEMENTS + 4}`);
    expect(kept[0]).toBe('select 5');
  });

  it('keeps each server’s own list', () => {
    saveConsole(KEY, rec('a'));
    saveConsole('browser', rec('b'));
    expect(loadConsoles(KEY).map(r => r.id)).toEqual(['a']);
    expect(loadConsoles('browser').map(r => r.id)).toEqual(['b']);
    clearConsoles(KEY);
    expect(loadConsoles(KEY)).toEqual([]);
    expect(loadConsoles('browser')).toHaveLength(1);
  });

  it('reads corrupted storage as empty, and keeps the good records', () => {
    for (const bad of ['not json', '[]', 'null', '{"x":3}']) {
      localStorage.setItem(STORAGE, bad);
      expect(loadConsoles('x')).toEqual([]);
    }
    localStorage.setItem(
      STORAGE,
      JSON.stringify({
        [KEY]: [
          { id: 'ok', name: 'Ok', folder: 'f', statements: ['a', 3, 'b'], used: 5 },
          { id: 'ok', name: 'Twice', folder: '', statements: [], used: 6 },
          { id: 7, name: 'Bad id', folder: '' },
          { name: 'No id', folder: '' },
          'text',
          { id: 'nameless', folder: '' },
        ],
      }),
    );
    expect(loadConsoles(KEY)).toEqual([
      { id: 'ok', name: 'Ok', folder: 'f', statements: ['a', 'b'], used: 5 },
    ]);
  });

  it('never throws when storage fails', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    try {
      expect(loadConsoles(KEY)).toEqual([]);
      const heard = vi.fn();
      const off = onConsolesChange(heard);
      expect(() => saveConsole(KEY, rec('a'))).not.toThrow();
      expect(() => renameConsole(KEY, 'a', 'x', '')).not.toThrow();
      expect(() => clearConsoles(KEY)).not.toThrow();
      expect(heard).toHaveBeenCalled();
      off();
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });

  it('names a console, making its record when it has none', () => {
    renameConsole(KEY, 'a', 'Moons', 'moons');
    expect(loadConsoles(KEY)[0]).toMatchObject({
      id: 'a',
      name: 'Moons',
      folder: 'moons',
      statements: [],
    });
    saveConsole(KEY, rec('a', { name: 'Moons', statements: ['select 1'] }));
    renameConsole(KEY, 'a', 'Orbits', 'moons');
    expect(loadConsoles(KEY)[0]).toMatchObject({ name: 'Orbits', statements: ['select 1'] });
  });

  it('numbers the default names per server: the lowest not in use', () => {
    expect(defaultConsoleName([])).toBe('Console 1');
    saveConsole(KEY, rec('a', { name: 'Console 1' }));
    saveConsole(KEY, rec('b', { name: 'Console 3' }));
    expect(defaultConsoleName(loadConsoles(KEY))).toBe('Console 2');
    expect(consoleFor('browser', undefined, 'x').name).toBe('Console 1');
  });

  it('finds the console for an id, or makes a new one on the folder', () => {
    saveConsole(KEY, rec('a', { name: 'Moons', folder: 'moons' }));
    expect(consoleFor(KEY, 'a', 'elsewhere')).toEqual({ id: 'a', name: 'Moons', folder: 'moons' });
    expect(consoleFor(KEY, 'new', 'elsewhere')).toEqual({
      id: 'new',
      name: 'Console 1',
      folder: 'elsewhere',
    });
    const fresh = consoleFor(KEY, undefined, '');
    expect(fresh.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(newConsoleId()).not.toBe(newConsoleId());
  });

  it('follows a move of a console’s folder, or one above it, and goes with a delete', () => {
    saveConsole(KEY, rec('in', { folder: 'moons/inner' }));
    saveConsole(KEY, rec('same', { folder: 'moons' }));
    saveConsole(KEY, rec('out', { folder: 'moonshine' }));
    saveConsole(KEY, rec('root', { folder: '' }));
    moveConsoleFolders(KEY, 'moons', 'planets');
    const folders = Object.fromEntries(loadConsoles(KEY).map(r => [r.id, r.folder]));
    expect(folders).toEqual({ in: 'planets/inner', same: 'planets', out: 'moonshine', root: '' });
    moveConsoleFolders(KEY, 'planets', null);
    expect(
      loadConsoles(KEY)
        .map(r => r.id)
        .sort(),
    ).toEqual(['out', 'root']);
  });

  it('is kept in step for a hook, across a save', () => {
    const backend = fakeBackend(fakeServices({ '': [] }).services, { kind: 'browser' });
    const { result } = renderHook(() => useConsoles(backend));
    expect(result.current).toEqual([]);
    act(() => saveConsole('browser', rec('a')));
    expect(result.current.map(r => r.id)).toEqual(['a']);
    act(() => clearConsoles('browser'));
    expect(result.current).toEqual([]);
  });
});
