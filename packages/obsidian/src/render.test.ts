import { describe, expect, it, vi } from 'vitest';
import { parseNotebook } from './notebook.ts';
import type { Notebook } from './notebook.ts';
import {
  applyOpen,
  captureOpen,
  IFRAME_CSP,
  renderError,
  renderNotebook,
  utf8ToBase64,
} from './render.ts';
import type { Highlight } from './render.ts';

function codeNb(output: unknown, source = 'x'): Notebook {
  return {
    language: 'python',
    cells: [{ type: 'code', source, executionCount: 3, outputs: [output as never] }],
  };
}

async function draw(nb: Notebook) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const hl = vi.fn<Highlight>();
  renderNotebook(nb, root, hl);
  return { root, hl };
}

describe('renderNotebook', () => {
  it('renders html in an iframe with an empty sandbox and a CSP', async () => {
    const html = '<p>hi</p><script>window.pwned = 1</script>';
    const { root } = await draw(codeNb({ kind: 'html', html }));
    const frame = root.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame!.hasAttribute('sandbox')).toBe(true);
    expect(frame!.getAttribute('sandbox')).toBe('');
    const srcdoc = frame!.getAttribute('srcdoc')!;
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain(IFRAME_CSP);
    expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<p>hi</p>'));
    expect(root.querySelector('script')).toBeNull();
    expect(document.querySelector('script')).toBeNull();
  });

  it('renders svg as an img data URL, never inline', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
    const { root } = await draw(codeNb({ kind: 'svg', svg }));
    const img = root.querySelector('img')!;
    expect(img.getAttribute('src')).toBe(`data:image/svg+xml;base64,${btoa(svg)}`);
    expect(root.querySelector('svg')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
  });

  it('adds the svg namespace so an img can draw it', async () => {
    const svg = '<svg viewBox="0 0 1 1" fill="currentColor"><use xlink:href="#a"/></svg>';
    const { root } = await draw(codeNb({ kind: 'svg', svg }));
    const src = root.querySelector('img')!.getAttribute('src')!;
    const decoded = atob(src.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1 1" fill="currentColor"><use xlink:href="#a"/></svg>',
    );
  });

  it('encodes unicode svg without throwing', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>héllo ✓ 日本 😀</text></svg>';
    expect(() => btoa(svg)).toThrow();
    const { root } = await draw(codeNb({ kind: 'svg', svg }));
    const src = root.querySelector('img')!.getAttribute('src')!;
    const b64 = src.replace('data:image/svg+xml;base64,', '');
    expect(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))).toBe(svg);
    expect(utf8ToBase64('✓')).toBe('4pyT');
  });

  it('renders text, stream and error outputs as literal text', async () => {
    const nb = parseNotebook(
      JSON.stringify({
        nbformat: 4,
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [
              { output_type: 'stream', name: 'stdout', text: '<b>x</b>' },
              {
                output_type: 'error',
                ename: '<i>E</i>',
                evalue: '<u>v</u>',
                traceback: ['<s>t</s>'],
              },
              { output_type: 'display_data', data: { 'text/plain': '<img src=x onerror=1>' } },
            ],
          },
        ],
      }),
    );
    const { root } = await draw(nb);
    const pres = [...root.querySelectorAll('.ganymede-nb-output pre')];
    expect(pres).toHaveLength(3);
    expect(pres[0].textContent).toBe('<b>x</b>');
    expect(pres[1].textContent).toBe('<s>t</s>');
    expect(pres[2].textContent).toBe('<img src=x onerror=1>');
    expect(root.querySelector('b, i, u, s')).toBeNull();
    expect(root.querySelector('.ganymede-nb-output img')).toBeNull();
  });

  it('uses images only for whitelisted bitmap mimes', async () => {
    const ok = await draw(codeNb({ kind: 'image', mime: 'image/png', base64: 'AAAA' }));
    expect(ok.root.querySelector('img')!.getAttribute('src')).toBe('data:image/png;base64,AAAA');
    const bad = await draw(codeNb({ kind: 'image', mime: 'image/x-foo', base64: 'AAAA' }));
    expect(bad.root.querySelector('img')).toBeNull();
    expect(bad.root.textContent).toContain('unsupported output: image/x-foo');
  });

  it('parsed non-whitelisted image mimes never become an img', async () => {
    const nb = parseNotebook(
      JSON.stringify({
        nbformat: 4,
        cells: [
          {
            cell_type: 'code',
            source: '',
            outputs: [{ output_type: 'display_data', data: { 'image/x-foo': 'AAAA' } }],
          },
        ],
      }),
    );
    const { root } = await draw(nb);
    expect(root.querySelector('img')).toBeNull();
    expect(root.textContent).toContain('unsupported output: image/x-foo');
  });

  it('renders markdown cells and outputs itself; code never reaches a markdown renderer', async () => {
    const nb: Notebook = {
      language: 'python',
      cells: [
        { type: 'markdown', source: '# Title', attachments: {} },
        {
          type: 'code',
          source: 'a',
          executionCount: 1,
          outputs: [{ kind: 'markdown', markdown: '**out**' }],
        },
      ],
    };
    const { root } = await draw(nb);
    expect(root.querySelector('h1')!.textContent).toBe('Title');
    expect(root.querySelector('strong')!.textContent).toBe('out');
  });

  it('resolves attachment: images in markdown cells, bitmaps only', async () => {
    const nb: Notebook = {
      language: '',
      cells: [
        {
          type: 'markdown',
          source: '![p](attachment:a.png) ![s](attachment:b.svg)',
          attachments: { 'a.png': 'data:image/png;base64,AAAA' },
        },
      ],
    };
    const { root } = await draw(nb);
    const imgs = root.querySelectorAll('img');
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(root.textContent).toContain('s');
  });

  it('renders a folded code cell with its source as literal text', async () => {
    const src = '<b>x</b> = 1 // </code></pre><script>1</script>';
    const { root } = await draw(codeNb({ kind: 'text', text: 'o', stderr: false }, src));
    expect(root.querySelector('.ganymede-nb-prompt')).toBeNull();
    const details = root.querySelector('details.ganymede-nb-code')!;
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.querySelector('summary')!.textContent).toBe('Code [3]');
    expect(details.querySelector('summary .ganymede-nb-count')!.textContent).toBe(' [3]');
    const code = details.querySelector('.ganymede-nb-source.markdown-rendered > pre > code')!;
    expect(code.textContent).toBe(src);
    expect(code.className).toBe('language-python');
    expect(details.querySelector('b, script')).toBeNull();
    // Outputs stay visible: after the details, not inside it.
    expect(details.querySelector('.ganymede-nb-output')).toBeNull();
    expect(details.nextElementSibling!.classList.contains('ganymede-nb-output')).toBe(true);
    expect(root.querySelector('.ganymede-nb')!.classList.contains('markdown-preview-view')).toBe(
      true,
    );
  });

  it('hands the code element and language to the highlighter', async () => {
    const { root, hl } = await draw(codeNb({ kind: 'text', text: '', stderr: false }, 'a = 1'));
    expect(hl).toHaveBeenCalledTimes(1);
    expect(hl.mock.calls[0][0]).toBe(root.querySelector('code'));
    expect(hl.mock.calls[0][1]).toBe('python');
  });

  it('names only allowlisted languages and skips the highlighter otherwise', async () => {
    const lang = async (l: string) => {
      const { root, hl } = await draw({
        ...codeNb({ kind: 'text', text: '', stderr: false }),
        language: l,
      });
      return { cls: root.querySelector('code')!.className, called: hl.mock.calls.length };
    };
    expect(await lang('Python')).toEqual({ cls: 'language-python', called: 1 });
    expect(await lang('deno')).toEqual({ cls: 'language-typescript', called: 1 });
    expect(await lang('dataviewjs')).toEqual({ cls: '', called: 0 });
    expect(await lang('py`thon')).toEqual({ cls: '', called: 0 });
    expect(await lang('')).toEqual({ cls: '', called: 0 });
  });

  it('renders code without a highlighter', () => {
    const root = document.createElement('div');
    renderNotebook(codeNb({ kind: 'text', text: '', stderr: false }, 'q'), root);
    expect(root.querySelector('code')!.textContent).toBe('q');
  });

  it('shows the traceback when there is one, else name: value, else nothing', async () => {
    const err = async (e: object) =>
      (
        await draw(codeNb({ kind: 'error', ename: '', evalue: '', traceback: '', ...e }))
      ).root.querySelector('.ganymede-nb-error')!.textContent;
    expect(await err({ ename: 'E', evalue: 'v', traceback: 'tb line\n' })).toBe('tb line');
    expect(await err({ ename: 'E', evalue: 'v' })).toBe('E: v');
    expect(await err({ evalue: 'only' })).toBe(': only');
    expect(await err({})).toBe('');
  });

  it('keeps expanded code cells open across a re-render', async () => {
    const nb: Notebook = {
      language: 'python',
      cells: [1, 2, 3].map(n => ({
        type: 'code' as const,
        source: String(n),
        executionCount: n,
        outputs: [],
      })),
    };
    const { root } = await draw(nb);
    root.querySelectorAll('details')[1].setAttribute('open', '');
    expect(captureOpen(root)).toEqual([false, true, false]);
    const next = document.createElement('div');
    renderNotebook(nb, next);
    applyOpen(next, captureOpen(root));
    expect([...next.querySelectorAll('details')].map(d => d.hasAttribute('open'))).toEqual([
      false,
      true,
      false,
    ]);
    // A notebook with fewer cells doesn't throw.
    const small = document.createElement('div');
    renderNotebook({ ...nb, cells: nb.cells.slice(0, 1) }, small);
    expect(() => applyOpen(small, [false, true, true])).not.toThrow();
  });

  it('omits the count for a cell that never ran', async () => {
    const nb = codeNb({ kind: 'text', text: '', stderr: false });
    if (nb.cells[0].type === 'code') nb.cells[0].executionCount = null;
    const { root } = await draw(nb);
    expect(root.querySelector('summary')!.textContent).toBe('Code');
  });

  it('shows a message for an empty notebook', async () => {
    const { root } = await draw({ language: '', cells: [] });
    expect(root.textContent).toContain('no cells');
  });
});

describe('renderError', () => {
  it('shows the message as text', () => {
    const root = document.createElement('div');
    renderError(root, 'Bad <b>thing</b>');
    expect(root.textContent).toContain('Bad <b>thing</b>');
    expect(root.querySelector('b')).toBeNull();
  });
});
