import { describe, expect, it } from 'vitest';
import { findInNotebook, findSnippet } from './notebook-find';

describe('findInNotebook', () => {
  it('matches case-insensitively on the trimmed query', () => {
    const found = findInNotebook([{ type: 'code', source: 'VOLCANOES = 2' }], '  volcano  ');
    expect(found.query).toBe('volcano');
    expect(found.matches).toEqual([{ cell: 0, heading: null, snippet: 'VOLCANOES = 2' }]);
  });

  it('finds nothing for an empty query', () => {
    expect(findInNotebook([{ type: 'code', source: 'x = 1' }], '')).toEqual({
      query: '',
      matches: [],
      more: 0,
    });
    expect(findInNotebook([{ type: 'code', source: 'x = 1' }], '   ').matches).toEqual([]);
  });

  it('gives each matching cell the nearest heading at or above it', () => {
    const cells = [
      { type: 'code', source: 'before = "plume"' },
      { type: 'markdown', source: '# Io\nText about plumes.' },
      { type: 'markdown', source: 'text\n## Volcanoes\nA plume rises.' },
      { type: 'code', source: '# a code comment\nplume = 1' },
    ];
    expect(findInNotebook(cells, 'plume').matches).toEqual([
      // No heading above the first cell.
      { cell: 0, heading: null, snippet: 'before = "plume"' },
      // The heading is in the same cell, above the matching line.
      { cell: 1, heading: 'Io', snippet: 'Text about plumes.' },
      { cell: 2, heading: 'Volcanoes', snippet: 'A plume rises.' },
      // A code cell keeps the last heading in the notebook above it; its
      // own comment is no heading.
      { cell: 3, heading: 'Volcanoes', snippet: 'plume = 1' },
    ]);
  });

  it('does not count a heading below the matching line in its cell', () => {
    const cells = [
      { type: 'markdown', source: '# Above\nplume' },
      { type: 'markdown', source: 'plume first\n## Below' },
    ];
    expect(findInNotebook(cells, 'plume').matches).toEqual([
      { cell: 0, heading: 'Above', snippet: 'plume' },
      { cell: 1, heading: 'Above', snippet: 'plume first' },
    ]);
  });

  it('keeps the heading for later cells, and ignores code cell text', () => {
    const cells = [
      { type: 'markdown', source: '## Europa' },
      { type: 'code', source: 'europa = 1' },
      { type: 'markdown', source: '```\n# not a heading\n```\neuropa 2' },
    ];
    expect(findInNotebook(cells, 'europa').matches.map(m => m.heading)).toEqual([
      'Europa',
      'Europa',
      'Europa',
    ]);
  });

  it('lists one row per cell, with its first matching line', () => {
    const found = findInNotebook([{ type: 'code', source: 'plume = 1\nplume = 2' }], 'plume');
    expect(found.matches).toEqual([{ cell: 0, heading: null, snippet: 'plume = 1' }]);
  });

  it('caps the matches and counts the rest', () => {
    const cells = Array.from({ length: 5 }, () => ({ type: 'markdown', source: 'plume' }));
    const found = findInNotebook(cells, 'plume', 2);
    expect(found.matches.map(m => m.cell)).toEqual([0, 1]);
    expect(found.more).toBe(3);
  });

  it('handles Windows line ends', () => {
    expect(
      findInNotebook([{ type: 'markdown', source: '# Io\r\nplume\r\n' }], 'plume').matches,
    ).toEqual([{ cell: 0, heading: 'Io', snippet: 'plume' }]);
  });

  it('gives a setext heading’s text line that heading (#879)', () => {
    // The underline is the line after the match, so the heading above the
    // match is the match's own line.
    expect(
      findInNotebook([{ type: 'markdown', source: 'Volcanoes\n=========' }], 'volcano').matches,
    ).toEqual([{ cell: 0, heading: 'Volcanoes', snippet: 'Volcanoes' }]);
    expect(
      findInNotebook(
        [
          { type: 'markdown', source: 'Plumes\n---' },
          { type: 'code', source: 'plume = 1' },
        ],
        'plume',
      ).matches,
    ).toEqual([
      { cell: 0, heading: 'Plumes', snippet: 'Plumes' },
      { cell: 1, heading: 'Plumes', snippet: 'plume = 1' },
    ]);
  });
});

describe('findSnippet', () => {
  it('leaves a short line whole', () => {
    expect(findSnippet('  plume = 1  ', 'plume')).toBe('plume = 1');
  });

  it('cuts a long line around the match, with "…" where it was cut', () => {
    const line = `${'a'.repeat(80)} plume ${'b'.repeat(80)}`;
    const snippet = findSnippet(line, 'plume');
    expect(snippet).toContain('plume');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    // About 60 characters, plus the two marks.
    expect(snippet.length).toBeLessThanOrEqual(62);
  });

  it('keeps the start or end when the match is near it', () => {
    const line = `plume ${'b'.repeat(100)}`;
    expect(findSnippet(line, 'plume').startsWith('plume ')).toBe(true);
    expect(findSnippet(line, 'plume').endsWith('…')).toBe(true);
    const end = `${'a'.repeat(100)} plume`;
    expect(findSnippet(end, 'plume').startsWith('…')).toBe(true);
    expect(findSnippet(end, 'plume').endsWith('plume')).toBe(true);
  });

  it('places the match in the text itself, where lower case is a different length (#879)', () => {
    // 'İ' lower-cases to two characters, so an index into the lower-cased
    // line lands past the match and cuts it out of the snippet.
    const line = `${'İ'.repeat(60)} plume ${'b'.repeat(80)}`;
    expect(findSnippet(line, 'plume')).toContain('plume');
  });

  it('takes the query as text, not as a pattern', () => {
    const line = `${'a '.repeat(40)} (plume) ${'b'.repeat(40)}`;
    expect(findSnippet(line, '(plume)')).toContain('(plume)');
  });
});
