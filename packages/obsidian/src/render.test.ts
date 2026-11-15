import { describe, expect, it, vi } from 'vitest';
import { parseNotebook } from './notebook.ts';
import type { Notebook } from './notebook.ts';
import { IFRAME_CSP, renderError, renderNotebook, utf8ToBase64 } from './render.ts';

function codeNb(output: unknown, source = 'x'): Notebook {
  return {
    language: 'python',
    cells: [{ type: 'code', source, executionCount: 3, outputs: [output as never] }],
  };
}

async function draw(nb: Notebook) {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const md = vi.fn(async (text: string, el: HTMLElement) => {
    el.textContent = text;
  });
  await renderNotebook(nb, root, md);
  return { root, md };
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
    expect(pres[1].textContent).toContain('<i>E</i>: <u>v</u>');
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

  it('sends markdown cells and markdown outputs to the callback', async () => {
    const nb: Notebook = {
      language: 'python',
      cells: [
        { type: 'markdown', source: '# Title' },
        {
          type: 'code',
          source: 'a',
          executionCount: 1,
          outputs: [{ kind: 'markdown', markdown: '**out**' }],
        },
      ],
    };
    const { md } = await draw(nb);
    const texts = md.mock.calls.map(c => c[0]);
    expect(texts).toContain('# Title');
    expect(texts).toContain('**out**');
  });

  it('renders code cells as a fenced block with an In label', async () => {
    const { root, md } = await draw(codeNb({ kind: 'text', text: 'o', stderr: false }, 'a = ```'));
    expect(md.mock.calls[0][0]).toBe('````python\na = ```\n````');
    expect(root.querySelector('.ganymede-nb-prompt')!.textContent).toBe('In [3]:');
  });

  it('names only allowlisted languages in the fence', async () => {
    const lang = async (l: string) =>
      (await draw({ ...codeNb({ kind: 'text', text: '', stderr: false }), language: l })).md.mock
        .calls[0][0];
    expect(await lang('Python')).toBe('```python\nx\n```');
    expect(await lang('deno')).toBe('```typescript\nx\n```');
    expect(await lang('dataviewjs')).toBe('```\nx\n```');
    expect(await lang('py`thon')).toBe('```\nx\n```');
    expect(await lang('')).toBe('```\nx\n```');
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
