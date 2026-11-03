import '../test/notebook-env';
import { afterEach, describe, expect, it } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';

// CodeMirror measures text; jsdom has no layout.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { parseNotebook, rejoinLines, renderPreview } = await import('./preview');

function notebookText(cells: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ nbformat: 4, nbformat_minor: 5, metadata: {}, cells, ...extra });
}

const HTML_OUTPUT = {
  output_type: 'display_data',
  metadata: {},
  data: {
    'text/html': ['<b>bold</b>\n', '<script>window.ran = true</script>'],
    'text/plain': ['<IPython.core.display.HTML object>'],
  },
};

const CELLS = [
  { cell_type: 'markdown', id: 'm', metadata: {}, source: ['# Moons\n', 'Io and Europa'] },
  {
    cell_type: 'code',
    id: 'c',
    metadata: { trusted: true },
    execution_count: 1,
    source: ['x = 1\n', 'x'],
    outputs: [HTML_OUTPUT],
  },
];

let host: HTMLElement;
let dispose: (() => void) | undefined;

function render(text: string) {
  host = document.createElement('div');
  document.body.append(host);
  const preview = renderPreview(host, text);
  dispose = () => preview.dispose();
  return preview;
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
  host?.remove();
  delete (window as { ran?: boolean }).ran;
});

describe('parseNotebook', () => {
  it('says what is wrong with a file that is not a notebook', () => {
    expect(() => parseNotebook('{')).toThrow('not valid JSON');
    expect(() => parseNotebook('[]')).toThrow('not a Jupyter notebook');
    expect(() => parseNotebook('null')).toThrow('not a Jupyter notebook');
    expect(() => parseNotebook(JSON.stringify({ nbformat: 3, worksheets: [] }))).toThrow(
      'this one is nbformat 3',
    );
  });

  it('joins lines stored as arrays, but not JSON outputs', () => {
    const content = rejoinLines({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          metadata: {},
          execution_count: 1,
          source: ['a\n', 'b'],
          outputs: [
            { output_type: 'stream', name: 'stdout', text: ['one\n', 'two\n'] },
            {
              output_type: 'execute_result',
              execution_count: 1,
              metadata: {},
              data: { 'image/svg+xml': ['<svg>\n', '</svg>'], 'application/json': ['a', 'b'] },
            },
          ],
        },
        {
          cell_type: 'markdown',
          metadata: {},
          source: ['![x](attachment:x.svg)'],
          attachments: { 'x.svg': { 'image/svg+xml': ['<svg>\n', '</svg>'] } },
        },
      ],
    } as nbformat.INotebookContent);
    const [code, markdown] = content.cells as [nbformat.ICodeCell, nbformat.IMarkdownCell];
    expect(code.source).toBe('a\nb');
    expect((code.outputs[0] as nbformat.IStream).text).toBe('one\ntwo\n');
    const data = (code.outputs[1] as nbformat.IExecuteResult).data;
    expect(data['image/svg+xml']).toBe('<svg>\n</svg>');
    expect(data['application/json']).toEqual(['a', 'b']);
    expect(markdown.attachments!['x.svg']!['image/svg+xml']).toBe('<svg>\n</svg>');
  });
});

describe('renderPreview', () => {
  it('renders every cell, read-only', async () => {
    const preview = render(notebookText(CELLS));
    expect(preview.cells).toBe(2);
    // Lumino lays the cells out on the next frame.
    await expect.poll(() => host.querySelectorAll('.jp-Cell').length).toBe(2);
    expect(preview.notebook.widgets.every(cell => cell.readOnly)).toBe(true);
    await expect
      .poll(() => host.querySelector('.jp-MarkdownOutput h1')?.textContent)
      .toContain('Moons');
  });

  it('shows outputs untrusted even when the file says trusted', async () => {
    const preview = render(notebookText(CELLS));
    expect(preview.notebook.model!.cells.get(1).trusted).toBe(false);
    // Rendering is asynchronous; wait for the sanitized HTML.
    await expect.poll(() => host.querySelector('.jp-RenderedHTMLCommon b')).not.toBeNull();
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('iframe')).toBeNull();
    expect((window as { ran?: boolean }).ran).toBeUndefined();
  });

  it('throws for a file that is not a notebook', () => {
    host = document.createElement('div');
    expect(() => renderPreview(host, 'not json')).toThrow('not valid JSON');
    expect(host.childElementCount).toBe(0);
  });
});
