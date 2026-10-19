/// <reference types="node" />
// docs/shortcuts.md lists the default shortcuts from SHORTCUTS. This test
// fails when they drift; `UPDATE_DOCS=1 npx vitest run shortcuts-doc`
// rewrites the table (then run `npx prettier --write docs/shortcuts.md`).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GROUPS, SHORTCUTS } from './shortcuts';

const DOC = resolve(__dirname, '../../docs/shortcuts.md');
const START = '<!-- shortcuts:start -->';
const END = '<!-- shortcuts:end -->';

const MAC: Record<string, string> = {
  Accel: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Enter: '↩',
  Escape: 'Esc',
  Tab: '⇥',
  ArrowUp: '↑',
  ArrowDown: '↓',
};
const OTHER: Record<string, string> = {
  Accel: 'Ctrl',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  Escape: 'Esc',
};

/** One keystroke ("Accel Shift G") as a Mac (⌘⇧G) or elsewhere (Ctrl+Shift+G) writes it. */
function stroke(k: string, mac: boolean): string {
  const parts = k.split(' ').map(p => (mac ? MAC : OTHER)[p] ?? p);
  return mac ? parts.join('') : parts.join('+');
}

function bindings(keys: readonly (readonly string[])[], mac: boolean): string {
  return keys.map(seq => seq.map(k => `\`${stroke(k, mac)}\``).join(' ')).join(', ');
}

function table(): string {
  return GROUPS.map(group => {
    const rows = SHORTCUTS.filter(s => s.group === group).map(
      s => `| ${s.label} | ${bindings(s.keys, true)} | ${bindings(s.keys, false)} |`,
    );
    return [
      `### ${group}`,
      '',
      '| Action | Mac | Windows, Linux |',
      '| --- | --- | --- |',
      ...rows,
    ].join('\n');
  }).join('\n\n');
}

/** Prettier pads table cells; compare without the padding. */
const normalize = (s: string) =>
  s
    .split('\n')
    .map(l =>
      l
        .replace(/[ \t]+/g, ' ')
        .replace(/-{3,}/g, '---')
        .trim(),
    )
    .join('\n')
    .trim();

describe('docs/shortcuts.md', () => {
  it('lists the default shortcuts', () => {
    const doc = readFileSync(DOC, 'utf8');
    const start = doc.indexOf(START);
    const end = doc.indexOf(END);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const expected = table();
    if (process.env.UPDATE_DOCS) {
      writeFileSync(
        DOC,
        `${doc.slice(0, start + START.length)}\n\n${expected}\n\n${doc.slice(end)}`,
      );
      return;
    }
    expect(normalize(doc.slice(start + START.length, end))).toBe(normalize(expected));
  });
});
