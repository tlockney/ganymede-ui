import { describe, expect, it } from 'vitest';
import { GROUPS, SHORTCUTS, formatKeys, keysFor, matches } from './shortcuts';

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
