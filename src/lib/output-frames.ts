/**
 * Trusted HTML and JavaScript outputs, each in its own sandboxed iframe
 * (#35), after nteract's design (runtimed/runt, `docs/adr/output-frame-security.md`).
 *
 * JupyterLab renders them in the app's own document, where they could read
 * the token in sessionStorage, call the server with the login cookie, and,
 * in the Apple apps, reach the web view's message handlers. Here the frame
 * has `sandbox` without `allow-same-origin`, so its origin is opaque: no
 * cookies, storage or DOM of the app. Content goes in through `srcdoc`; the
 * only message out is the frame's height, checked against the frame's own
 * window before it is used.
 *
 * Untrusted HTML still renders in the page through JupyterLab's sanitizer,
 * and Markdown outputs are always sanitized, since trusted Markdown would
 * otherwise run its HTML's scripts in the page. SVG renders as an `<img>`,
 * where scripts don't run and nothing else loads, so it shows untrusted
 * too: JupyterLab shows "Cannot display an untrusted SVG" instead, which
 * hides every SVG plot in a notebook made elsewhere (#133).
 */
import {
  RenderedHTML,
  RenderedJavaScript,
  RenderedMarkdown,
  RenderedSVG,
  renderSVG,
  type IRenderMimeRegistry,
} from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';

/** What a frame may do. Never `allow-same-origin`. */
export const FRAME_SANDBOX =
  'allow-scripts allow-downloads allow-forms allow-pointer-lock allow-popups allow-popups-to-escape-sandbox';

/**
 * The frame's own policy: scripts and styles inline or from HTTPS, as
 * plotting libraries load from CDNs; no `<base>` and no form posts.
 */
export const FRAME_CSP = [
  "default-src https: data: blob: 'unsafe-inline' 'unsafe-eval'",
  'img-src * data: blob:',
  'media-src * data: blob:',
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Frames taller than this scroll; keeps a runaway output from growing forever. */
const MAX_HEIGHT = 20_000;

/** Theme values the frame's body copies from the page when it renders. */
const THEME_VARS: [string, string][] = [
  ['color', '--jp-content-font-color1'],
  ['font-family', '--jp-content-font-family'],
  ['font-size', '--jp-content-font-size1'],
];

/** The app's scheme, which follows the system's (`useColorScheme`). */
function colorScheme(): 'dark' | 'light' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** The frame document: the policy, the page's text style, a sizer, then the content. */
export function frameDocument(body: string): string {
  const style = getComputedStyle(document.body);
  const theme = THEME_VARS.map(([prop, v]) => {
    const value = style.getPropertyValue(v).trim();
    return value ? `${prop}:${value.replace(/[<>;{}]/g, '')};` : '';
  }).join('');
  const scheme = colorScheme();
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">
<meta name="color-scheme" content="${scheme}">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}body{${theme}}#root{display:flow-root}</style>
<script>
addEventListener('DOMContentLoaded', function () {
  var root = document.getElementById('root');
  var post = function () {
    parent.postMessage({ ganymedeFrame: 'height', height: Math.ceil(root.getBoundingClientRect().height) }, '*');
  };
  new ResizeObserver(post).observe(root);
  addEventListener('load', post);
});
</script></head><body><div id="root">${body}</div></body></html>`;
}

/** A JavaScript output's frame body: `element` is its node, as in Jupyter. */
export function javascriptBody(code: string): string {
  // JSON with `<` escaped can't close the script element.
  const source = JSON.stringify(code).replace(/</g, '\\u003c');
  return `<div id="output"></div><script>var element = document.getElementById('output');
(0, eval)(${source});</script>`;
}

/** Frames on screen; a message counts only from one of their windows. */
const frames = new Set<HTMLIFrameElement>();

function onMessage(event: MessageEvent): void {
  if (!event.source) return;
  let frame: HTMLIFrameElement | undefined;
  for (const f of frames) if (f.contentWindow === event.source) frame = f;
  const data = event.data as { ganymedeFrame?: unknown; height?: unknown } | null;
  if (!frame || typeof data !== 'object' || data === null || data.ganymedeFrame !== 'height')
    return;
  const { height } = data;
  if (typeof height !== 'number' || !Number.isFinite(height) || height < 0) return;
  frame.style.height = `${Math.min(height, MAX_HEIGHT)}px`;
}

/** Puts a sandboxed frame showing `body` in `host`. */
export function renderFrame(host: HTMLElement, body: string): HTMLIFrameElement {
  if (frames.size === 0) window.addEventListener('message', onMessage);
  const frame = document.createElement('iframe');
  frame.className = 'gn-OutputFrame';
  frame.setAttribute('sandbox', FRAME_SANDBOX);
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.srcdoc = frameDocument(body);
  // The same scheme on the element as in its document, or the browser
  // paints the frame an opaque background.
  frame.style.colorScheme = colorScheme();
  frames.add(frame);
  host.appendChild(frame);
  return frame;
}

/** Stops listening to a frame, and to all once none are left. */
export function forgetFrame(frame: HTMLIFrameElement | undefined): void {
  if (!frame || !frames.delete(frame)) return;
  if (frames.size === 0) window.removeEventListener('message', onMessage);
}

/** Trusted HTML in a frame; untrusted HTML sanitized in the page, as before. */
export class FramedHTML extends RenderedHTML {
  private _frame?: HTMLIFrameElement;

  override render(model: IRenderMime.IMimeModel): Promise<void> {
    forgetFrame(this._frame);
    this._frame = undefined;
    if (!model.trusted) return super.render(model);
    this._frame = renderFrame(this.node, String(model.data[this.mimeType]));
    return Promise.resolve();
  }

  override dispose(): void {
    forgetFrame(this._frame);
    super.dispose();
  }
}

/** Trusted JavaScript in a frame; untrusted waits for a click, then runs in a frame too. */
export class FramedJavaScript extends RenderedJavaScript {
  private _frame?: HTMLIFrameElement;

  override render(model: IRenderMime.IMimeModel): Promise<void> {
    forgetFrame(this._frame);
    this._frame = undefined;
    const code = String(model.data[this.mimeType] ?? '');
    const run = () => {
      this.node.textContent = '';
      this._frame = renderFrame(this.node, javascriptBody(code));
    };
    if (model.trusted) {
      run();
      return Promise.resolve();
    }
    const trans = this.translator.load('jupyterlab');
    const pre = document.createElement('pre');
    pre.textContent = trans.__(
      'Are you sure that you want to run arbitrary Javascript within your JupyterLab session?',
    );
    const button = document.createElement('button');
    button.textContent = trans.__('Run');
    button.onclick = run;
    this.node.append(pre, button);
    return Promise.resolve();
  }

  override dispose(): void {
    forgetFrame(this._frame);
    super.dispose();
  }
}

/** Markdown outputs, always sanitized. */
export class SanitizedMarkdown extends RenderedMarkdown {
  override render(model: IRenderMime.IMimeModel): Promise<void> {
    return super.render({
      trusted: false,
      data: model.data,
      metadata: model.metadata,
      setData: options => model.setData(options),
    });
  }
}

/** SVG as an `<img>`, trusted or not. */
export class ImageSVG extends RenderedSVG {
  override render(model: IRenderMime.IMimeModel): Promise<void> {
    const metadata = model.metadata[this.mimeType] as { unconfined?: boolean } | undefined;
    return renderSVG({
      host: this.node,
      source: String(model.data[this.mimeType] ?? ''),
      trusted: true,
      unconfined: metadata?.unconfined,
      translator: this.translator,
    });
  }
}

/** Replaces the registry's HTML, JavaScript, Markdown and SVG renderers, keeping their ranks. */
export function installOutputFrames(registry: IRenderMimeRegistry): void {
  const replace = (
    mimeTypes: string[],
    safe: boolean,
    create: (options: IRenderMime.IRendererOptions) => IRenderMime.IRenderer,
  ) =>
    registry.addFactory(
      { safe, mimeTypes, createRenderer: create },
      registry.getRank(mimeTypes[0]!),
    );
  replace(['text/html'], true, options => new FramedHTML(options));
  replace(['text/javascript', 'application/javascript'], false, o => new FramedJavaScript(o));
  replace(['text/markdown'], true, options => new SanitizedMarkdown(options));
  replace(['image/svg+xml'], true, options => new ImageSVG(options));
}
