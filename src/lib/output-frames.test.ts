import '../test/notebook-env';
import { afterEach, describe, expect, it } from 'vitest';
import type { Contents } from '@jupyterlab/services';
import { MimeModel } from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

// The renderers the app swaps into JupyterLab's registry, rendered for
// real in jsdom. jsdom doesn't run a frame's srcdoc, so what the frame
// does once loaded is left to the end-to-end suite.

const { createRendermime } = await import('./jupyterlab');
const { FRAME_CSP, javascriptBody } = await import('./output-frames');

const contents = {
  getDownloadUrl: async (path: string) => `/files/${path}`,
} as unknown as Contents.IManager;
const rendermime = createRendermime('Io.ipynb', contents);
const renderers: IRenderMime.IRenderer[] = [];

async function render(mimeType: string, source: string, trusted: boolean) {
  const renderer = rendermime.createRenderer(mimeType);
  renderers.push(renderer);
  document.body.appendChild(renderer.node);
  await renderer.renderModel(new MimeModel({ data: { [mimeType]: source }, trusted }));
  return renderer.node;
}

afterEach(() => {
  for (const r of renderers.splice(0)) {
    r.node.remove();
    r.dispose();
  }
  delete (window as { pwned?: boolean }).pwned;
});

describe('output frames', () => {
  it('renders trusted HTML in a sandboxed frame without the same origin', async () => {
    const node = await render('text/html', '<b>Io</b><script>window.pwned = true</script>', true);
    const frame = node.querySelector('iframe')!;
    const sandbox = frame.getAttribute('sandbox')!.split(' ');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-same-origin');
    expect(frame.srcdoc).toContain(`content="${FRAME_CSP}"`);
    expect(frame.srcdoc).toContain('<b>Io</b>');
    expect(node.querySelector('b')).toBeNull();
    expect((window as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it('sanitizes untrusted HTML in the page, as JupyterLab does', async () => {
    const node = await render('text/html', '<b>Io</b><img src=x onerror="pwned=1">', false);
    expect(node.querySelector('iframe')).toBeNull();
    expect(node.querySelector('b')).toHaveTextContent('Io');
    expect(node.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('runs trusted JavaScript in a frame, never in the page', async () => {
    const node = await render('application/javascript', 'window.pwned = true', true);
    expect(node.querySelector('iframe')!.srcdoc).toContain(javascriptBody('window.pwned = true'));
    expect((window as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it('runs untrusted JavaScript in a frame only after Run', async () => {
    const node = await render('application/javascript', 'window.pwned = true', false);
    expect(node.querySelector('iframe')).toBeNull();
    node.querySelector('button')!.click();
    expect(node.querySelector('iframe')).not.toBeNull();
    expect((window as { pwned?: boolean }).pwned).toBeUndefined();
  });

  it("keeps a script's closing tag in JavaScript from ending the frame's script", () => {
    const body = javascriptBody('const s = "</script><b>x</b>";');
    expect(body.match(/<\/script>/g)).toHaveLength(1);
    expect(body).toContain('\\u003c/script>');
  });

  it('shows untrusted SVG as an image, where its scripts do not run', async () => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/><script>window.pwned = true</script></svg>';
    const node = await render('image/svg+xml', svg, false);
    expect(node.querySelector('svg')).toBeNull();
    expect(node.querySelector('img')!.src).toBe(`data:image/svg+xml,${encodeURIComponent(svg)}`);
    expect((window as { pwned?: boolean }).pwned).toBeUndefined();
    // Chosen over the plain-text repr, as a trusted one is.
    expect(
      rendermime.preferredMimeType({ 'image/svg+xml': svg, 'text/plain': '<Figure>' }, 'ensure'),
    ).toBe('image/svg+xml');
  });

  it('sanitizes Markdown outputs even when trusted', async () => {
    const node = await render('text/markdown', 'Io <img src=x onerror="pwned=1">', true);
    expect(node.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it("sizes a frame from its own window's messages only", async () => {
    const node = await render('text/html', '<p>Io</p>', true);
    const frame = node.querySelector('iframe')!;
    const post = (source: MessageEventSource | null, data: unknown) =>
      window.dispatchEvent(new MessageEvent('message', { source, data }));

    post(window, { ganymedeFrame: 'height', height: 500 });
    expect(frame.style.height).toBe('');
    post(frame.contentWindow, { ganymedeFrame: 'height', height: 'tall' });
    expect(frame.style.height).toBe('');
    post(frame.contentWindow, { ganymedeFrame: 'height', height: 120 });
    expect(frame.style.height).toBe('120px');
    post(frame.contentWindow, { ganymedeFrame: 'height', height: 1e9 });
    expect(frame.style.height).toBe('20000px');
  });
});
