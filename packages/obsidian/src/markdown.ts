// Safe Markdown for untrusted notebook content. Obsidian's own renderer runs
// other plugins' processors (Dataview JS, inline queries) and passes raw
// HTML through, so notebook Markdown never goes through it. Instead: marked
// parses to HTML, DOMParser turns that into an inert document (no script runs,
// no image loads), and an allowlist copies clean nodes into the target.
// Pure DOM, no obsidian import.

import { marked } from 'marked';

const ALLOWED = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'code',
  'pre',
  'em',
  'strong',
  'b',
  'i',
  'del',
  's',
  'a',
  'img',
  'blockquote',
  'hr',
  'br',
  'span',
  'div',
  'sup',
  'sub',
  'details',
  'summary',
  'kbd',
  'input',
]);

// Dropped with their contents. Anything else not allowed is unwrapped: its
// element goes, its text and allowed children stay.
const DROP_WITH_CONTENTS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'svg',
  'math',
  'noscript',
  'link',
  'meta',
  'base',
  'title',
  'head',
]);

const SAFE_IMG = /^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]*$/i;
const SAFE_HREF = /^(?:https?:|mailto:|#)/i;

function safeHref(raw: string): string | null {
  // Browsers ignore tabs, newlines and leading control characters in URLs.
  // eslint-disable-next-line no-control-regex
  const href = raw.replace(/[\u0000- ]/g, '');
  return SAFE_HREF.test(href) ? raw.trim() : null;
}

function numeric(v: string | null): string | null {
  return v !== null && /^\d{1,4}$/.test(v.trim()) ? v.trim() : null;
}

function copyAttrs(src: Element, dest: Element, tag: string): void {
  const set = (name: string, value: string | null) => {
    if (value !== null) dest.setAttribute(name, value);
  };
  if (tag === 'a') {
    const href = src.getAttribute('href');
    set('href', href === null ? null : safeHref(href));
    if (dest.hasAttribute('href')) {
      dest.setAttribute('rel', 'noopener noreferrer');
      if (/^https?:/i.test(dest.getAttribute('href')!)) {
        dest.setAttribute('target', '_blank');
        dest.setAttribute('class', 'external-link');
      }
    }
    set('title', src.getAttribute('title'));
  } else if (tag === 'th' || tag === 'td') {
    const align = src.getAttribute('align')?.toLowerCase() ?? null;
    set('align', align !== null && ['left', 'right', 'center'].includes(align) ? align : null);
    set('colspan', numeric(src.getAttribute('colspan')));
    set('rowspan', numeric(src.getAttribute('rowspan')));
  } else if (tag === 'ol') {
    set('start', numeric(src.getAttribute('start')));
  }
}

type Attachments = Record<string, string>;

function copyChildren(src: Node, dest: Node, doc: Document, att: Attachments): void {
  for (const child of Array.from(src.childNodes)) {
    if (child.nodeType === 3) {
      dest.appendChild(doc.createTextNode(child.textContent ?? ''));
    } else if (child.nodeType === 1) {
      copyElement(child as Element, dest, doc, att);
    }
    // Comments, processing instructions and the rest are dropped.
  }
}

function copyElement(src: Element, dest: Node, doc: Document, att: Attachments): void {
  const tag = src.localName.toLowerCase();
  if (DROP_WITH_CONTENTS.has(tag)) return;
  if (!ALLOWED.has(tag)) {
    copyChildren(src, dest, doc, att);
    return;
  }
  if (tag === 'input') {
    if (src.getAttribute('type')?.toLowerCase() !== 'checkbox') return;
    const box = doc.createElement('input');
    box.setAttribute('type', 'checkbox');
    box.setAttribute('disabled', '');
    if (src.hasAttribute('checked')) box.setAttribute('checked', '');
    dest.appendChild(box);
    return;
  }
  if (tag === 'img') {
    let url = src.getAttribute('src')?.replace(/\s+/g, '') ?? '';
    // A notebook's own attachment, already limited to bitmap data: URLs.
    if (url.startsWith('attachment:')) {
      let name = url.slice('attachment:'.length);
      try {
        name = decodeURIComponent(name);
      } catch {
        // Use the name as written.
      }
      url = att[name] ?? '';
    }
    if (!SAFE_IMG.test(url)) {
      // Never load it: show the alt text instead.
      const alt = src.getAttribute('alt');
      if (alt) dest.appendChild(doc.createTextNode(alt));
      return;
    }
    const img = doc.createElement('img');
    img.setAttribute('src', url);
    for (const a of ['alt', 'title']) {
      const v = src.getAttribute(a);
      if (v !== null) img.setAttribute(a, v);
    }
    dest.appendChild(img);
    return;
  }
  const out = doc.createElement(tag);
  copyAttrs(src, out, tag);
  dest.appendChild(out);
  copyChildren(src, out, doc, att);
}

/**
 * Parse `markdown` and append a clean rendering of it to `el`. `attachments`
 * maps a cell's attachment names to bitmap data: URLs, for `attachment:NAME`
 * images. */
export function renderSafeMarkdown(
  markdown: string,
  el: HTMLElement,
  attachments: Attachments = {},
): void {
  const html = marked.parse(markdown, { gfm: true, async: false }) as string;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const doc = el.ownerDocument;
  const wrap = doc.createElement('div');
  wrap.className = 'markdown-rendered ganymede-nb-markdown';
  copyChildren(parsed.body, wrap, doc, attachments);
  el.appendChild(wrap);
}
