import { CommandRegistry } from '@lumino/commands';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GROUPS,
  SHORTCUTS,
  bindShortcuts,
  formatKeys,
  isCustomized,
  keysFor,
  matches,
  problemWith,
  resetKeys,
  setKeys,
  subscribe,
} from './shortcuts';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('shortcuts', () => {
  it('has one row per command, each in a group and with keys', () => {
    const ids = SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SHORTCUTS) {
      expect(GROUPS).toContain(s.group);
      expect(s.keys.length).toBeGreaterThan(0);
    }
  });

  it('looks up keys by command', () => {
    expect(keysFor('delete')).toEqual([['D', 'D']]);
    expect(keysFor('no-such-command')).toEqual([]);
  });

  it('formats a sequence', () => {
    // Not a Mac in jsdom: modifiers are spelled out.
    expect(formatKeys(['Shift Enter'])).toBe('Shift+Enter');
    expect(formatKeys(['D', 'D'])).toBe('D D');
  });

  it('matches a keydown against a single-keystroke binding', () => {
    expect(matches(key({ key: 's', code: 'KeyS', keyCode: 83, ctrlKey: true }), 'save')).toBe(true);
    expect(matches(key({ key: 's', code: 'KeyS', keyCode: 83 }), 'save')).toBe(false);
    // Sequences don't match a single keydown.
    expect(matches(key({ key: 'd', code: 'KeyD', keyCode: 68 }), 'delete')).toBe(false);
  });
});

describe('customized shortcuts', () => {
  afterEach(() => resetKeys());

  it('replaces the defaults, persists, and resets', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    setKeys('insert-below', [['N']]);
    expect(keysFor('insert-below')).toEqual([['N']]);
    expect(isCustomized('insert-below')).toBe(true);
    expect(JSON.parse(localStorage.getItem('ganymede-ui:shortcuts')!)).toEqual({
      'insert-below': [['N']],
    });
    expect(listener).toHaveBeenCalledOnce();

    resetKeys('insert-below');
    expect(keysFor('insert-below')).toEqual([['B']]);
    expect(localStorage.getItem('ganymede-ui:shortcuts')).toBeNull();
    unsubscribe();
  });

  it('drops an override that equals the defaults', () => {
    setKeys('save', [['Accel S']]);
    expect(isCustomized('save')).toBe(false);
  });

  it('applies to matches', () => {
    setKeys('save', [['Alt S']]);
    const altS = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      keyCode: 83,
      altKey: true,
    });
    expect(matches(altS, 'save')).toBe(true);
  });

  it('refuses plain characters where text is typed, and bindings already taken', () => {
    expect(problemWith('run-cell', ['Q'])).toMatch(/types a character/);
    expect(problemWith('run-cell', ['Shift Q'])).toMatch(/types a character/);
    expect(problemWith('run-cell', ['Ctrl Q'])).toBeUndefined();
    expect(problemWith('insert-below', ['Q'])).toBeUndefined();
    expect(problemWith('insert-below', ['A'])).toBe('A is already Insert cell above.');
    // Edit and command mode never fire together.
    expect(problemWith('command-mode', ['Accel A'])).toBeUndefined();
    // Notebook shortcuts fire in both.
    expect(problemWith('insert-below', ['Shift Enter'])).toMatch(/Run cell, select below/);
  });

  it('rebinds a registry when the keys change', () => {
    const commands = new CommandRegistry();
    commands.addCommand('insert-below', { execute: () => {} });
    const bindings = bindShortcuts(commands, [['insert-below', ['.a', '.b']]]);
    const keys = () => commands.keyBindings.map(b => `${b.keys.join(' ')}@${b.selector}`);
    expect(keys()).toEqual(['B@.a', 'B@.b']);
    setKeys('insert-below', [['N'], ['Ctrl N']]);
    expect(keys()).toEqual(['N@.a', 'N@.b', 'Ctrl N@.a', 'Ctrl N@.b']);
    bindings.dispose();
    expect(keys()).toEqual([]);
  });
});
