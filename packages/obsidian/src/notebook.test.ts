import { describe, expect, it } from 'vitest';
import { fence, NotebookError, parseNotebook, stripAnsi } from './notebook.ts';
import type { Output } from './notebook.ts';

function nb(cells: unknown[], metadata: unknown = {}, nbformat = 4): string {
  return JSON.stringify({ nbformat, nbformat_minor: 5, metadata, cells });
}

function outputsOf(raw: unknown): Output[] {
  const parsed = parseNotebook(nb([{ cell_type: 'code', source: '', outputs: [raw] }]));
  const cell = parsed.cells[0];
  if (cell.type !== 'code') throw new Error('not code');
  return cell.outputs;
}

function bundle(data: Record<string, unknown>): Output {
  return outputsOf({ output_type: 'display_data', data, metadata: {} })[0];
}

describe('parseNotebook structure', () => {
  it('joins source given as a string or an array', () => {
    const p = parseNotebook(
      nb([
        { cell_type: 'markdown', source: '# hi\nthere' },
        { cell_type: 'markdown', source: ['# hi\n', 'there'] },
      ]),
    );
    expect(p.cells.map(c => c.source)).toEqual(['# hi\nthere', '# hi\nthere']);
  });

  it('tolerates missing cells, outputs and metadata', () => {
    expect(parseNotebook('{"nbformat":4}')).toEqual({ language: '', cells: [] });
    const p = parseNotebook('{"nbformat":4,"cells":[{"cell_type":"code","source":"1"}]}');
    expect(p.cells).toEqual([{ type: 'code', source: '1', executionCount: null, outputs: [] }]);
  });

  it('rejects nbformat 3 with a clear message', () => {
    expect(() => parseNotebook(nb([], {}, 3))).toThrow(/only nbformat 4/i);
    expect(() => parseNotebook(nb([], {}, 3))).toThrow(NotebookError);
  });

  it('reports invalid JSON and non-objects as NotebookError', () => {
    expect(() => parseNotebook('{nope')).toThrow(NotebookError);
    expect(() => parseNotebook('[]')).toThrow(NotebookError);
  });

  it('shows an unknown cell type as raw', () => {
    const p = parseNotebook(nb([{ cell_type: 'weird', source: 'x' }]));
    expect(p.cells).toEqual([{ type: 'raw', source: 'x' }]);
  });

  it.each([
    [{ language_info: { name: 'python' }, kernelspec: { language: 'r' } }, 'python'],
    [{ kernelspec: { language: 'javascript' } }, 'javascript'],
    [{ language_info: {}, kernelspec: {} }, ''],
    [{}, ''],
  ])('language from %j is %j', (metadata, expected) => {
    expect(parseNotebook(nb([], metadata)).language).toBe(expected);
  });

  it('reads the execution count', () => {
    const p = parseNotebook(nb([{ cell_type: 'code', source: '', execution_count: 7 }]));
    expect(p.cells[0]).toMatchObject({ executionCount: 7 });
  });
});

describe('parseNotebook outputs', () => {
  it('maps stdout and stderr streams, stripping ANSI', () => {
    expect(
      outputsOf({ output_type: 'stream', name: 'stdout', text: ['a\n', '\x1b[31mb\x1b[0m'] }),
    ).toEqual([{ kind: 'text', text: 'a\nb', stderr: false }]);
    expect(outputsOf({ output_type: 'stream', name: 'stderr', text: 'warn' })).toEqual([
      { kind: 'text', text: 'warn', stderr: true },
    ]);
  });

  it('strips colors, bold and OSC hyperlinks from error tracebacks', () => {
    const [o] = outputsOf({
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad',
      traceback: [
        '\x1b[0;31m---\x1b[0m',
        '\x1b[1mBold\x1b[22m \x1b]8;;http://x.test\x07link\x1b]8;;\x07 \x1b]8;;http://y.test\x1b\\l2\x1b]8;;\x1b\\',
      ],
    });
    expect(o).toEqual({
      kind: 'error',
      ename: 'ValueError',
      evalue: 'bad',
      traceback: '---\nBold link l2',
    });
  });

  it('stripAnsi leaves plain text alone', () => {
    expect(stripAnsi('a [31m b')).toBe('a [31m b');
    expect(stripAnsi('\x1b[38;5;208mx\x1b[0m')).toBe('x');
  });

  it('prefers html over png over plain', () => {
    expect(bundle({ 'text/plain': 'p', 'image/png': 'AAAA', 'text/html': '<b>h</b>' })).toEqual({
      kind: 'html',
      html: '<b>h</b>',
    });
    expect(bundle({ 'text/plain': 'p', 'image/png': 'AAAA' })).toMatchObject({ kind: 'image' });
  });

  it('prefers the ganymede result over html and renders name = value', () => {
    const o = bundle({
      'text/html': '<b>h</b>',
      'application/vnd.ganymede.result+json': { name: 'df', value: { a: [1, 2] } },
    });
    expect(o).toEqual({
      kind: 'text',
      text: 'df = ' + JSON.stringify({ a: [1, 2] }, null, 2),
      stderr: false,
    });
  });

  it('falls back to text/plain for widget-only bundles', () => {
    expect(
      bundle({ 'application/vnd.jupyter.widget-view+json': { model_id: 'x' }, 'text/plain': 'W' }),
    ).toEqual({ kind: 'text', text: 'W', stderr: false });
  });

  it('notes unsupported outputs when nothing is usable', () => {
    expect(bundle({ 'application/vnd.jupyter.widget-view+json': { model_id: 'x' } })).toEqual({
      kind: 'unsupported',
      mimes: ['application/vnd.jupyter.widget-view+json'],
    });
  });

  it('removes whitespace from multi-line base64', () => {
    expect(bundle({ 'image/png': 'AAAA\nBBBB\r\n CC==\n' })).toEqual({
      kind: 'image',
      mime: 'image/png',
      base64: 'AAAABBBBCC==',
    });
    expect(bundle({ 'image/jpeg': ['AA\n', 'BB\n'] })).toMatchObject({ base64: 'AABB' });
  });

  it('joins string[] values for html, svg and markdown', () => {
    expect(bundle({ 'text/html': ['<p>', 'x</p>'] })).toEqual({ kind: 'html', html: '<p>x</p>' });
    expect(bundle({ 'image/svg+xml': ['<svg>', '</svg>'] })).toEqual({
      kind: 'svg',
      svg: '<svg></svg>',
    });
    expect(bundle({ 'text/markdown': ['# a\n', 'b'] })).toEqual({
      kind: 'markdown',
      markdown: '# a\nb',
    });
  });

  it('renders application/json objects as pretty text', () => {
    expect(bundle({ 'application/json': { a: 1 } })).toEqual({
      kind: 'text',
      text: '{\n  "a": 1\n}',
      stderr: false,
    });
  });
});

describe('fence', () => {
  it('uses three backticks by default', () => {
    expect(fence('x = 1', 'python')).toBe('```python\nx = 1\n```');
  });

  it('outruns a ``` run in the source', () => {
    expect(fence('a\n```\nb', 'md')).toBe('````md\na\n```\nb\n````');
  });

  it('outruns a ```` run in the source', () => {
    expect(fence('````', '')).toBe('`````\n````\n`````');
  });
});
