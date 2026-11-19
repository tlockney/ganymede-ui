import { describe, expect, it } from 'vitest';
import {
  dataKind,
  filterTable,
  inferType,
  notebookFor,
  notebookNameFor,
  parseDelimited,
  tableName,
  tableOf,
  typedValue,
} from './data-files';

describe('dataKind', () => {
  it('routes the four data extensions, in any case, and nothing else', () => {
    expect(dataKind('a.csv')).toBe('csv');
    expect(dataKind('dir/Data.TSV')).toBe('tsv');
    expect(dataKind('x/y.json')).toBe('json');
    expect(dataKind('y.Parquet')).toBe('parquet');
    for (const p of [
      'a.ipynb',
      'a.md',
      'csv',
      '.json',
      'a.csv.bak',
      'dir.csv/readme',
      '',
      undefined,
    ]) {
      expect(dataKind(p), String(p)).toBeUndefined();
    }
  });
});

describe('parseDelimited', () => {
  it('splits a header and rows', () => {
    expect(parseDelimited('a,b\n1,2\n3,4\n', ',')).toEqual({
      header: ['a', 'b'],
      rows: [
        ['1', '2'],
        ['3', '4'],
      ],
      truncated: false,
    });
  });

  it('reads quoted fields with delimiters, quotes and line breaks', () => {
    const p = parseDelimited('name,note\n"Io, moon","say ""hi"""\n"two\nlines",x\n', ',');
    expect(p.rows).toEqual([
      ['Io, moon', 'say "hi"'],
      ['two\nlines', 'x'],
    ]);
  });

  it('takes CRLF, CR and LF, and no row from a final line break', () => {
    expect(parseDelimited('a,b\r\n1,2\r\n', ',').rows).toEqual([['1', '2']]);
    expect(parseDelimited('a,b\r1,2\r3,4', ',').rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('skips a byte order mark and empty lines, but keeps quoted empties', () => {
    const p = parseDelimited('﻿a,b\n\n1,2\n\n"",\n', ',');
    expect(p.header).toEqual(['a', 'b']);
    expect(p.rows).toEqual([
      ['1', '2'],
      ['', ''],
    ]);
  });

  it('pads short rows and widens the header for long ones', () => {
    const p = parseDelimited('a,b\n1\n1,2,3\n', ',');
    expect(p.header).toEqual(['a', 'b', 'column 3']);
    expect(p.rows).toEqual([
      ['1', '', ''],
      ['1', '2', '3'],
    ]);
  });

  it('names empty and repeated columns', () => {
    expect(parseDelimited('a,,a,a\n', ',').header).toEqual(['a', 'column 2', 'a_2', 'a_3']);
  });

  it('uses tabs for TSV, where commas are text', () => {
    expect(parseDelimited('a\tb\n1,5\t"x\ty"\n', '\t').rows).toEqual([['1,5', 'x\ty']]);
  });

  it('treats a quote inside an unquoted field as text', () => {
    expect(parseDelimited('a,b\n5" pipe,x\n', ',').rows).toEqual([['5" pipe', 'x']]);
  });

  it('keeps a trailing delimiter as an empty last field', () => {
    expect(parseDelimited('a,b\n1,', ',').rows).toEqual([['1', '']]);
  });

  it('takes an unterminated quote to the end of the file', () => {
    expect(parseDelimited('a\n"open,\nstill', ',').rows).toEqual([['open,\nstill']]);
  });

  it('stops at the row cap and says so', () => {
    const text = 'n\n' + Array.from({ length: 50 }, (_, i) => i).join('\n');
    const p = parseDelimited(text, ',', 10);
    expect(p.rows).toHaveLength(10);
    expect(p.rows[9]).toEqual(['9']);
    expect(p.truncated).toBe(true);
    // Exactly the cap is not a truncation.
    expect(parseDelimited('n\n1\n2\n', ',', 2).truncated).toBe(false);
    expect(parseDelimited('n\n1\n2\n3', ',', 2).truncated).toBe(true);
    expect(parseDelimited('n\n1\n2\n3\n', ',', 2).rows).toEqual([['1'], ['2']]);
  });

  it('handles an empty file', () => {
    expect(parseDelimited('', ',')).toEqual({ header: [], rows: [], truncated: false });
  });
});

describe('column types', () => {
  it('infers integer, number, boolean and string', () => {
    expect(inferType(['1', '-2', ''])).toBe('integer');
    expect(inferType(['1', '2.5', '1e3'])).toBe('number');
    expect(inferType(['true', 'FALSE', ''])).toBe('boolean');
    expect(inferType(['a', '1'])).toBe('string');
    expect(inferType(['true', '1'])).toBe('string');
    expect(inferType(['', ''])).toBe('string');
    // Leading zeros are identifiers, not numbers.
    expect(inferType(['01234', '5'])).toBe('string');
    expect(inferType(['0', '10'])).toBe('integer');
  });

  it('converts cells to their column type', () => {
    expect(typedValue('', 'integer')).toBeNull();
    expect(typedValue('42', 'integer')).toBe(42);
    expect(typedValue('9007199254740993', 'integer')).toBe('9007199254740993');
    expect(typedValue('2.5', 'number')).toBe(2.5);
    expect(typedValue('True', 'boolean')).toBe(true);
    expect(typedValue('x', 'string')).toBe('x');
  });

  it('builds the table the renderer takes', () => {
    const t = tableOf(parseDelimited('name,n,ok\nIo,1,true\nEuropa,,false\n', ','), 'moons.csv');
    expect(t.schema?.fields).toEqual([
      { name: 'name', type: 'string' },
      { name: 'n', type: 'integer' },
      { name: 'ok', type: 'boolean' },
    ]);
    expect(t.data).toEqual([
      ['Io', 1, true],
      ['Europa', null, false],
    ]);
    expect(t.ganymede?.title).toBe('moons.csv');
  });
});

describe('filterTable', () => {
  const t = tableOf(parseDelimited('name,n\nIo,1\nEuropa,2\nGanymede,3\n', ','));
  it('keeps rows with the text in any cell, in any case', () => {
    expect(filterTable(t, 'EURO').data).toEqual([['Europa', 2]]);
    expect(filterTable(t, '3').data).toEqual([['Ganymede', 3]]);
    expect(filterTable(t, 'zzz').data).toEqual([]);
  });
  it('returns every row for an empty query', () => {
    expect(filterTable(t, '  ')).toBe(t);
  });
});

describe('notebook from a file', () => {
  const spec = { name: 'cdp-node', display_name: 'TypeScript', language: 'typescript' };
  it('names the table and the notebook from the file', () => {
    expect(tableName('data/Seattle Weather.csv')).toBe('seattle_weather');
    expect(tableName('2024-sales.tsv')).toBe('t_2024_sales');
    expect(tableName('....csv')).toBe('data');
    expect(notebookNameFor('a/b/moons.csv')).toBe('moons.ipynb');
  });
  it('loads the file with jupyter.sql, by its name beside the notebook', () => {
    const nb = notebookFor('dir/Big "Moons".csv', spec);
    expect(nb.metadata.kernelspec).toEqual(spec);
    const code = nb.cells.filter(c => c.cell_type === 'code').map(c => c.source);
    expect(code[0]).toBe('await jupyter.sql.load("big_moons", "Big \\"Moons\\".csv");');
    expect(code[1]).toContain('select * from big_moons limit 100');
  });
});
