// Render a parsed notebook into DOM. Notebook content is untrusted: Obsidian
// desktop is Electron with Node access, so nothing from a notebook is ever
// set as innerHTML or inserted as live markup. This file imports nothing from
// the obsidian package at runtime so it runs under jsdom in tests.

import { fence, IMAGE_MIMES } from './notebook.ts';
import type { Cell, Notebook, Output } from './notebook.ts';

export type RenderMarkdown = (markdown: string, el: HTMLElement) => Promise<void>;

/** Applied to the iframe document: no scripts, no network, inline styles and data: images only. */
export const IFRAME_CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

/** UTF-8 safe base64 (btoa alone throws on characters above U+00FF). */
export function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function div(parent: HTMLElement, cls: string): HTMLDivElement {
  const el = parent.ownerDocument.createElement('div');
  el.className = cls;
  parent.appendChild(el);
  return el;
}

function pre(parent: HTMLElement, cls: string, text: string): void {
  const el = parent.ownerDocument.createElement('pre');
  el.className = cls;
  el.textContent = text;
  parent.appendChild(el);
}

function img(parent: HTMLElement, src: string): void {
  const el = parent.ownerDocument.createElement('img');
  el.className = 'ganymede-nb-image';
  el.setAttribute('src', src);
  el.setAttribute('alt', 'notebook output');
  parent.appendChild(el);
}

async function renderOutput(
  out: Output,
  parent: HTMLElement,
  renderMarkdown: RenderMarkdown,
): Promise<void> {
  const box = div(parent, 'ganymede-nb-output');
  switch (out.kind) {
    case 'text':
      pre(box, out.stderr ? 'ganymede-nb-text ganymede-nb-stderr' : 'ganymede-nb-text', out.text);
      break;
    case 'error':
      pre(
        box,
        'ganymede-nb-text ganymede-nb-error',
        [`${out.ename}: ${out.evalue}`, out.traceback].filter(Boolean).join('\n'),
      );
      break;
    case 'html': {
      // An empty sandbox: no scripts, no same-origin access. The CSP meta is
      // a second layer. No script can report a height, so the CSS gives a
      // fixed one the reader can drag taller.
      const frame = parent.ownerDocument.createElement('iframe');
      frame.className = 'ganymede-nb-html';
      frame.setAttribute('sandbox', '');
      frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}"></head><body>${out.html}</body></html>`;
      box.appendChild(frame);
      break;
    }
    case 'svg':
      // As an <img> an SVG cannot run script; never inline it.
      img(box, `data:image/svg+xml;base64,${utf8ToBase64(out.svg)}`);
      break;
    case 'image':
      if ((IMAGE_MIMES as readonly string[]).includes(out.mime)) {
        img(box, `data:${out.mime};base64,${out.base64}`);
      } else {
        pre(box, 'ganymede-nb-text ganymede-nb-unsupported', `[unsupported output: ${out.mime}]`);
      }
      break;
    case 'markdown':
      await renderMarkdown(out.markdown, div(box, 'ganymede-nb-markdown'));
      break;
    case 'unsupported':
      pre(
        box,
        'ganymede-nb-text ganymede-nb-unsupported',
        `[unsupported output: ${out.mimes.join(', ') || 'empty'}]`,
      );
      break;
  }
}

async function renderCell(
  cell: Cell,
  language: string,
  parent: HTMLElement,
  renderMarkdown: RenderMarkdown,
): Promise<void> {
  const box = div(parent, `ganymede-nb-cell ganymede-nb-${cell.type}`);
  if (cell.type === 'markdown') {
    await renderMarkdown(cell.source, div(box, 'ganymede-nb-markdown'));
    return;
  }
  if (cell.type === 'raw') {
    pre(box, 'ganymede-nb-text ganymede-nb-raw', cell.source);
    return;
  }
  const label = div(box, 'ganymede-nb-prompt');
  label.textContent = `In [${cell.executionCount ?? ' '}]:`;
  await renderMarkdown(fence(cell.source, language), div(box, 'ganymede-nb-source'));
  for (const out of cell.outputs) await renderOutput(out, box, renderMarkdown);
}

/** Replace the contents of `root` with the rendered notebook. */
export async function renderNotebook(
  nb: Notebook,
  root: HTMLElement,
  renderMarkdown: RenderMarkdown,
): Promise<void> {
  const frag = root.ownerDocument.createElement('div');
  frag.className = 'ganymede-nb';
  for (const cell of nb.cells) await renderCell(cell, nb.language, frag, renderMarkdown);
  if (nb.cells.length === 0) pre(frag, 'ganymede-nb-text', 'This notebook has no cells.');
  root.replaceChildren(frag);
}

/** Show a parse failure in the view instead of leaving it blank. */
export function renderError(root: HTMLElement, message: string): void {
  const box = root.ownerDocument.createElement('div');
  box.className = 'ganymede-nb ganymede-nb-failure';
  const title = root.ownerDocument.createElement('strong');
  title.textContent = 'Cannot open this notebook';
  const body = root.ownerDocument.createElement('p');
  body.textContent = message;
  box.append(title, body);
  root.replaceChildren(box);
}
