// Render a parsed notebook into DOM. Notebook content is untrusted: Obsidian
// desktop is Electron with Node access, so nothing from a notebook is ever
// set as innerHTML or inserted as live markup. This file imports nothing from
// the obsidian package at runtime so it runs under jsdom in tests.

import { renderSafeMarkdown } from './markdown.ts';
import { codeLanguage, IMAGE_MIMES, standaloneSvg } from './notebook.ts';
import type { Cell, Notebook, Output } from './notebook.ts';

/** Syntax-highlights a code element in place (Prism, in the view); optional. */
export type Highlight = (code: HTMLElement, language: string) => void;

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

function renderOutput(out: Output, parent: HTMLElement): void {
  const box = div(parent, 'ganymede-nb-output');
  switch (out.kind) {
    case 'text':
      pre(box, out.stderr ? 'ganymede-nb-text ganymede-nb-stderr' : 'ganymede-nb-text', out.text);
      break;
    case 'error': {
      // The traceback when there is one, else the name and value, as
      // ganymede's html.rs does.
      const text = out.traceback
        ? out.traceback
        : out.ename || out.evalue
          ? `${out.ename}: ${out.evalue}`
          : '';
      pre(box, 'ganymede-nb-text ganymede-nb-error', text.trimEnd());
      break;
    }
    case 'html': {
      // An empty sandbox: no scripts, no same-origin access. The CSP meta is
      // a second layer. No script can report a height, so the CSS gives a
      // fixed one the reader can drag taller.
      const frame = parent.ownerDocument.createElement('iframe');
      frame.className = 'ganymede-nb-html';
      frame.setAttribute('sandbox', '');
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${IFRAME_CSP}"></head><body>${out.html}</body></html>`;
      box.appendChild(frame);
      break;
    }
    case 'svg':
      // As an <img> an SVG cannot run script; never inline it.
      img(box, `data:image/svg+xml;base64,${utf8ToBase64(standaloneSvg(out.svg))}`);
      break;
    case 'image':
      if ((IMAGE_MIMES as readonly string[]).includes(out.mime)) {
        img(box, `data:${out.mime};base64,${out.base64}`);
      } else {
        pre(box, 'ganymede-nb-text ganymede-nb-unsupported', `[unsupported output: ${out.mime}]`);
      }
      break;
    case 'markdown':
      renderSafeMarkdown(out.markdown, box);
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

function renderCell(
  cell: Cell,
  language: string,
  parent: HTMLElement,
  highlight: Highlight | undefined,
): void {
  const box = div(parent, `ganymede-nb-cell ganymede-nb-${cell.type}`);
  if (cell.type === 'markdown') {
    renderSafeMarkdown(cell.source, box, cell.attachments);
    return;
  }
  if (cell.type === 'raw') {
    pre(box, 'ganymede-nb-text ganymede-nb-raw', cell.source);
    return;
  }
  // Code is folded by default; outputs stay visible after it.
  const details = box.ownerDocument.createElement('details');
  details.className = 'ganymede-nb-code';
  if (cell.id) details.setAttribute('data-cell-id', cell.id);
  const summary = box.ownerDocument.createElement('summary');
  summary.append('Code');
  if (cell.executionCount !== null) {
    const count = box.ownerDocument.createElement('span');
    count.className = 'ganymede-nb-count';
    count.textContent = ` [${cell.executionCount}]`;
    summary.appendChild(count);
  }
  details.appendChild(summary);
  box.appendChild(details);
  // Built here, not by Obsidian's MarkdownRenderer: every plugin's
  // post-processors see what that renders. The source is textContent; the
  // highlighter only re-writes it as escaped tokens.
  const lang = codeLanguage(language);
  const doc = box.ownerDocument;
  const source = div(details, 'markdown-rendered ganymede-nb-source');
  const preEl = doc.createElement('pre');
  const code = doc.createElement('code');
  if (lang) {
    preEl.className = `language-${lang}`;
    code.className = `language-${lang}`;
  }
  code.textContent = cell.source;
  preEl.appendChild(code);
  source.appendChild(preEl);
  if (lang && highlight) highlight(code, lang);
  for (const out of cell.outputs) renderOutput(out, box);
}

/** Replace the contents of `root` with the rendered notebook. */
export function renderNotebook(nb: Notebook, root: HTMLElement, highlight?: Highlight): void {
  const frag = root.ownerDocument.createElement('div');
  frag.className = 'ganymede-nb markdown-preview-view markdown-rendered';
  for (const cell of nb.cells) renderCell(cell, nb.language, frag, highlight);
  if (nb.cells.length === 0) pre(frag, 'ganymede-nb-text', 'This notebook has no cells.');
  root.replaceChildren(frag);
}

/** Show a parse failure in the view instead of leaving it blank. */
export function renderError(root: HTMLElement, message: string): void {
  const box = root.ownerDocument.createElement('div');
  box.className = 'ganymede-nb markdown-preview-view markdown-rendered ganymede-nb-failure';
  const title = root.ownerDocument.createElement('strong');
  title.textContent = 'Cannot open this notebook';
  const body = root.ownerDocument.createElement('p');
  body.textContent = message;
  box.append(title, body);
  root.replaceChildren(box);
}

export interface OpenState {
  id: string | null;
  open: boolean;
}

/** Which code cells are expanded, in notebook order, with their cell ids. */
export function captureOpen(root: ParentNode): OpenState[] {
  return Array.from(root.querySelectorAll('details.ganymede-nb-code')).map(d => ({
    id: d.getAttribute('data-cell-id'),
    open: d.hasAttribute('open'),
  }));
}

/**
 * Re-expand the code cells `captureOpen` saw open. A cell with an id is
 * matched by id, so inserting a cell above doesn't move the state; a cell
 * without one is matched by position (against states that also had no id).
 */
export function applyOpen(root: ParentNode, state: OpenState[]): void {
  const byId = new Map<string, boolean>();
  for (const s of state) if (s.id) byId.set(s.id, s.open);
  Array.from(root.querySelectorAll('details.ganymede-nb-code')).forEach((d, i) => {
    const id = d.getAttribute('data-cell-id');
    const open = id ? byId.get(id) : state[i] && !state[i].id ? state[i].open : false;
    if (open) d.setAttribute('open', '');
  });
}
