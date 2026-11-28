/**
 * Rendering helpers, widgets and safety filters for live Markdown preview (#673).
 *
 * Keeps DOM widgets (tables, MathJax math, inline images, task checkboxes,
 * ordered list markers, line breaks), inline HTML matching, math scanning, and
 * URL/attachment validation separate from CodeMirror state orchestration.
 */
import type { syntaxTree } from '@codemirror/language';
import type { Text } from '@codemirror/state';
import { type EditorView, WidgetType } from '@codemirror/view';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { attachmentDataUrl } from './journal';

export type SyntaxNode = ReturnType<ReturnType<typeof syntaxTree>['resolve']>;

/** External services and per-cell attachment access for widgets. */
export interface LivePreviewContext {
  latexTypesetter: IRenderMime.ILatexTypesetter | null;
  resolver: IRenderMime.IResolver | null;
  getAttachments: (() => unknown) | null;
  attachmentsRevision: number;
}

export interface TextSpan {
  from: number;
  to: number;
}

export interface MathMatch {
  from: number;
  to: number;
  tex: string;
  display: boolean;
}

// URL & attachment safety ---------------------------------------------------

// Reject explicit schemes unless allowlisted; scheme-less paths are relative.
const EXPLICIT_SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
// eslint-disable-next-line no-control-regex -- intentionally rejects ASCII control bytes
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/;
const SAFE_DATA_IMAGE_RE = /^data:image\/(?:png|jpeg|gif|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

export type ImageUrlClassification =
  | { kind: 'external'; url: string }
  | { kind: 'data'; url: string }
  | { kind: 'attachment'; url: string }
  | { kind: 'relative'; url: string };

/**
 * Validate a link target URL for click navigation or inline `<a href>`.
 * Allows http:, https:, mailto:, fragment `#...`, and scheme-less relative paths.
 */
export function isSafeLinkUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_CHARS_RE.test(trimmed)) return null;
  if (trimmed.startsWith('#')) return trimmed;
  if (trimmed.startsWith('//')) return null;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (EXPLICIT_SCHEME_RE.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (
        parsed.protocol === 'http:' ||
        parsed.protocol === 'https:' ||
        parsed.protocol === 'mailto:'
      ) {
        return trimmed;
      }
      return null;
    } catch {
      return null;
    }
  }
  return trimmed;
}

/**
 * Validate and normalize an image source URL.
 * Allows external http(s), raster `data:image/(png|jpeg|gif|webp);base64,...`,
 * `attachment:<name>`, and safe relative paths. Rejects scripts and SVG data URIs.
 */
export function classifyImageUrl(raw: string): ImageUrlClassification | null {
  const trimmed = raw.trim();
  if (!trimmed || CONTROL_CHARS_RE.test(trimmed)) return null;
  if (trimmed.startsWith('attachment:')) {
    return trimmed.length > 'attachment:'.length ? { kind: 'attachment', url: trimmed } : null;
  }
  if (/^data:/i.test(trimmed)) {
    const m = SAFE_DATA_IMAGE_RE.exec(trimmed);
    if (!m) return null;
    const prefix = trimmed.slice(0, trimmed.indexOf(',') + 1).toLowerCase();
    const compact = m[1].replace(/\s/g, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(compact)) return null;
    return { kind: 'data', url: `${prefix}${compact}` };
  }
  if (trimmed.startsWith('//')) return null;
  if (EXPLICIT_SCHEME_RE.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { kind: 'external', url: trimmed };
      }
      return null;
    } catch {
      return null;
    }
  }
  return { kind: 'relative', url: trimmed };
}

function validateResolvedImageUrl(resolved: string): string | null {
  const trimmed = resolved.trim();
  if (!trimmed || CONTROL_CHARS_RE.test(trimmed) || trimmed.startsWith('//')) return null;
  if (/^data:/i.test(trimmed)) {
    const classified = classifyImageUrl(trimmed);
    return classified?.kind === 'data' ? classified.url : null;
  }
  if (EXPLICIT_SCHEME_RE.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return trimmed;
      return null;
    } catch {
      return null;
    }
  }
  return trimmed;
}

function splitRelativeUrl(url: string): { path: string; query: string; fragment: string } {
  let rest = url;
  let fragment = '';
  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    fragment = rest.slice(hashIdx);
    rest = rest.slice(0, hashIdx);
  }
  let query = '';
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) {
    query = rest.slice(qIdx);
    rest = rest.slice(0, qIdx);
  }
  return { path: rest, query, fragment };
}

const resolvedUrlCache = new WeakMap<IRenderMime.IResolver, Map<string, Promise<string | null>>>();

function resolveViaNotebookResolver(
  resolver: IRenderMime.IResolver,
  rawUrl: string,
): Promise<string | null> {
  let cache = resolvedUrlCache.get(resolver);
  if (!cache) {
    cache = new Map();
    resolvedUrlCache.set(resolver, cache);
  }
  const existing = cache.get(rawUrl);
  if (existing) return existing;
  const pending = (async () => {
    try {
      const isLocal = resolver.isLocal ? resolver.isLocal(rawUrl) : true;
      if (!isLocal) return validateResolvedImageUrl(rawUrl);
      const { path, query, fragment } = splitRelativeUrl(rawUrl);
      const resolvedPath = await resolver.resolveUrl(path, { attribute: 'src', tag: 'img' });
      let downloadUrl = await resolver.getDownloadUrl(resolvedPath);
      const safe = validateResolvedImageUrl(downloadUrl);
      if (!safe) return null;
      downloadUrl = safe;
      if (!/^data:/i.test(downloadUrl)) {
        if (query) {
          const cleanQuery = query.slice(1);
          downloadUrl += (downloadUrl.includes('?') ? '&' : '?') + cleanQuery;
        }
        if (fragment) downloadUrl += fragment;
      }
      return downloadUrl;
    } catch {
      return null;
    }
  })();
  cache.set(rawUrl, pending);
  return pending;
}

function resolveAttachment(attachments: unknown, rawUrl: string): string | null {
  let dataUrl = attachmentDataUrl(attachments, rawUrl);
  if (!dataUrl && rawUrl.includes('%')) {
    try {
      const decoded = `attachment:${decodeURIComponent(rawUrl.slice('attachment:'.length))}`;
      dataUrl = attachmentDataUrl(attachments, decoded);
    } catch {
      // Malformed percent encoding falls through to missing state.
    }
  }
  if (!dataUrl) return null;
  const validated = classifyImageUrl(dataUrl);
  return validated?.kind === 'data' ? validated.url : null;
}

// Inline HTML parsing & pairing ---------------------------------------------

export interface ParsedHtmlTag {
  name: string;
  closing: boolean;
  selfClosing: boolean;
  attrs: Record<string, string>;
}

const TAG_NAME_RE = /^<\s*(\/?)\s*([a-zA-Z][\w-]*)/;
const ATTR_RE = /([a-zA-Z:_][\w-.:]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

const PAIRED_HTML_CLASSES: Record<string, string> = {
  b: 'cm-md-strong',
  strong: 'cm-md-strong',
  i: 'cm-md-em',
  em: 'cm-md-em',
  cite: 'cm-md-em',
  var: 'cm-md-em',
  code: 'cm-md-code',
  tt: 'cm-md-code',
  s: 'cm-md-del',
  del: 'cm-md-del',
  strike: 'cm-md-del',
  u: 'cm-md-u',
  ins: 'cm-md-u',
  mark: 'cm-md-mark',
  sub: 'cm-md-sub',
  sup: 'cm-md-sup',
  kbd: 'cm-md-kbd',
  small: 'cm-md-small',
  span: '',
  a: 'cm-md-link',
};

const VOID_HTML_TAGS = new Set(['br', 'img', 'wbr']);

export function parseInlineHtmlTag(raw: string): ParsedHtmlTag | null {
  const m = TAG_NAME_RE.exec(raw);
  if (!m) return null;
  const closing = m[1] === '/';
  const name = m[2].toLowerCase();
  const selfClosing = !closing && /\/\s*>$/.test(raw);
  const attrs: Record<string, string> = {};
  if (!closing) {
    const inner = raw.slice(m[0].length, selfClosing ? raw.lastIndexOf('/') : raw.length - 1);
    ATTR_RE.lastIndex = 0;
    let am: RegExpExecArray | null;
    while ((am = ATTR_RE.exec(inner))) {
      const key = am[1].toLowerCase();
      // Never propagate event handlers or style/srcdoc attributes.
      if (key.startsWith('on') || key === 'style' || key === 'srcdoc') continue;
      attrs[key] = am[2] ?? am[3] ?? am[4] ?? '';
    }
  }
  return { name, closing, selfClosing, attrs };
}

export function pairedHtmlClass(tag: ParsedHtmlTag): string | null {
  if (!(tag.name in PAIRED_HTML_CLASSES)) return null;
  if (tag.name === 'a') {
    const href = tag.attrs.href;
    if (!href || !isSafeLinkUrl(href)) return null;
  }
  return PAIRED_HTML_CLASSES[tag.name];
}

export function isSupportedVoidHtmlTag(tag: ParsedHtmlTag): boolean {
  return !tag.closing && VOID_HTML_TAGS.has(tag.name);
}

// Math scanning ($...$, $$...$$) matching JupyterLab removeMath semantics ---

/** Normalize and merge sorted or unsorted skip ranges. */
export function mergeSpans(spans: TextSpan[]): TextSpan[] {
  if (spans.length <= 1) return spans.slice();
  const sorted = spans.slice().sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: TextSpan[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i];
    const prev = merged[merged.length - 1];
    if (cur.from <= prev.to) {
      prev.to = Math.max(prev.to, cur.to);
    } else {
      merged.push({ from: cur.from, to: cur.to });
    }
  }
  return merged;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text.charCodeAt(i) === 92; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function hasBlankLineBreak(text: string, from: number, to: number): boolean {
  const slice = text.slice(from, to);
  return /\n[ \t]*\n/.test(slice);
}

function skipIndexFor(
  pos: number,
  skips: readonly TextSpan[],
  cursor: { idx: number },
): number | null {
  while (cursor.idx < skips.length && skips[cursor.idx].to <= pos) {
    cursor.idx++;
  }
  if (cursor.idx < skips.length && skips[cursor.idx].from <= pos && pos < skips[cursor.idx].to) {
    return skips[cursor.idx].to;
  }
  return null;
}

/**
 * Scan `$...$` and `$$...$$` segments in `text`, respecting escapes, code/URL
 * `skips`, balanced `{`/`}` braces, and paragraph breaks (`\n\s*\n`), matching
 * `@jupyterlab/rendermime`'s `removeMath` rules.
 */
export function findMathRanges(
  text: string,
  skips: readonly TextSpan[],
  scanFrom = 0,
  scanTo = text.length,
): MathMatch[] {
  const out: MathMatch[] = [];
  const mergedSkips = mergeSpans([...skips]);
  const skipCursor = { idx: 0 };

  let openPos = -1;
  let openDelim: '$' | '$$' | null = null;
  let braces = 0;
  let lastValidClose = -1;

  const reset = () => {
    openPos = -1;
    openDelim = null;
    braces = 0;
    lastValidClose = -1;
  };

  let i = scanFrom;
  while (i < scanTo) {
    const skippedTo = skipIndexFor(i, mergedSkips, skipCursor);
    if (skippedTo !== null) {
      // Do not allow an open math delimiter to span across an intervening block skip.
      if (openPos !== -1 && hasBlankLineBreak(text, openPos, Math.min(skippedTo, scanTo))) {
        if (lastValidClose !== -1 && openDelim) {
          const delimLen = openDelim.length;
          const tex = text.slice(openPos + delimLen, lastValidClose - delimLen);
          if (tex.trim().length > 0) {
            out.push({
              from: openPos,
              to: lastValidClose,
              tex,
              display: openDelim === '$$',
            });
          }
          i = lastValidClose;
        }
        reset();
      }
      i = Math.max(i + 1, skippedTo);
      continue;
    }

    const ch = text.charCodeAt(i);
    if (openPos !== -1) {
      if (ch === 10 /* \n */) {
        // Blank line terminates unclosed math, honoring fallback close if any.
        let j = i + 1;
        while (j < scanTo && (text.charCodeAt(j) === 32 || text.charCodeAt(j) === 9)) j++;
        if (j < scanTo && text.charCodeAt(j) === 10) {
          if (lastValidClose !== -1 && openDelim) {
            const delimLen = openDelim.length;
            const tex = text.slice(openPos + delimLen, lastValidClose - delimLen);
            if (tex.trim().length > 0) {
              out.push({
                from: openPos,
                to: lastValidClose,
                tex,
                display: openDelim === '$$',
              });
            }
            i = lastValidClose;
            reset();
            continue;
          }
          reset();
          i = j + 1;
          continue;
        }
      }
      if (ch === 123 /* '{' */ && !isEscaped(text, i)) {
        braces++;
      } else if (ch === 125 /* '}' */ && !isEscaped(text, i) && braces > 0) {
        braces--;
      } else if (ch === 36 /* '$' */ && !isEscaped(text, i)) {
        const isDouble = i + 1 < scanTo && text.charCodeAt(i + 1) === 36;
        const delim: '$' | '$$' = isDouble ? '$$' : '$';
        if (delim === openDelim) {
          const closeEnd = i + delim.length;
          if (braces > 0) {
            lastValidClose = closeEnd;
          } else {
            const tex = text.slice(openPos + delim.length, i);
            if (tex.trim().length > 0) {
              out.push({
                from: openPos,
                to: closeEnd,
                tex,
                display: delim === '$$',
              });
            }
            reset();
            i = closeEnd;
            continue;
          }
        }
        i += delim.length;
        continue;
      }
      i++;
      continue;
    }

    if (ch === 36 /* '$' */ && !isEscaped(text, i)) {
      const isDouble = i + 1 < scanTo && text.charCodeAt(i + 1) === 36;
      openPos = i;
      openDelim = isDouble ? '$$' : '$';
      braces = 0;
      lastValidClose = -1;
      i += openDelim.length;
      continue;
    }
    i++;
  }

  if (openPos !== -1 && lastValidClose !== -1 && openDelim) {
    const delimLen = openDelim.length;
    const tex = text.slice(openPos + delimLen, lastValidClose - delimLen);
    if (tex.trim().length > 0) {
      out.push({
        from: openPos,
        to: lastValidClose,
        tex,
        display: openDelim === '$$',
      });
    }
  }
  return out;
}

/** Whether a display or multi-line math match should own whole lines as a block widget. */
export function isWholeLineBlockMath(doc: Text, match: MathMatch): boolean {
  if (!match.display) return false;
  const startLine = doc.lineAt(match.from);
  const endLine = doc.lineAt(match.to);
  const before = startLine.text.slice(0, match.from - startLine.from);
  const after = endLine.text.slice(match.to - endLine.from);
  return before.trim() === '' && after.trim() === '';
}

// Widgets -------------------------------------------------------------------

/** Checkbox widget replacing `[ ]` or `[x]` in GFM task lists. */
export class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly markerFrom: number,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof CheckboxWidget &&
      other.checked === this.checked &&
      other.markerFrom === this.markerFrom
    );
  }

  ignoreEvent(event: Event): boolean {
    return event.type === 'mousedown' || event.type === 'click' || event.type === 'change';
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-task';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cm-md-checkbox';
    input.checked = this.checked;
    input.setAttribute('aria-label', this.checked ? 'Completed task' : 'Incomplete task');
    // Keep the caret out of the checkbox range so toggling doesn't pop raw Markdown open.
    input.addEventListener('mousedown', e => {
      e.preventDefault();
      e.stopPropagation();
    });
    const toggle = (e: Event) => {
      e.stopPropagation();
      const target = this.checked ? ' ' : 'x';
      const current = view.state.doc.sliceString(this.markerFrom, this.markerFrom + 3);
      if (/^\[[ xX]\]$/.test(current)) {
        view.dispatch({
          changes: { from: this.markerFrom + 1, to: this.markerFrom + 2, insert: target },
        });
      }
    };
    input.addEventListener('change', toggle);
    wrap.appendChild(input);
    return wrap;
  }
}

/** Normalized marker for ordered list items (`1.`, `2.`, ...). */
export class OrderedMarkerWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  eq(other: WidgetType): boolean {
    return other instanceof OrderedMarkerWidget && other.label === this.label;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-order';
    span.textContent = this.label;
    return span;
  }
}

/** Inline `<br>` visual break widget outside cursor. */
export class BreakWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof BreakWidget;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-br';
    span.appendChild(document.createElement('br'));
    return span;
  }
}

// Per-typesetter bounded cache for synchronously cloning already-typeset MathJax DOM.
const mathDomCache = new WeakMap<IRenderMime.ILatexTypesetter, Map<string, HTMLElement>>();
const MAX_MATH_CACHE = 300;

function getCachedMath(typesetter: IRenderMime.ILatexTypesetter, key: string): HTMLElement | null {
  return mathDomCache.get(typesetter)?.get(key) ?? null;
}

function setCachedMath(
  typesetter: IRenderMime.ILatexTypesetter,
  key: string,
  node: HTMLElement,
): void {
  let cache = mathDomCache.get(typesetter);
  if (!cache) {
    cache = new Map();
    mathDomCache.set(typesetter, cache);
  }
  if (cache.size >= MAX_MATH_CACHE) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, node.cloneNode(true) as HTMLElement);
}

function renderMathIntoElement(
  dom: HTMLElement,
  tex: string,
  display: boolean,
  typesetter: IRenderMime.ILatexTypesetter | null,
  onReady?: () => void,
): () => void {
  const raw = display ? `$$${tex}$$` : `$${tex}$`;
  if (!typesetter) {
    dom.classList.add('cm-md-math-fallback');
    dom.textContent = raw;
    return () => {};
  }
  const key = `${display ? 'D' : 'I'}:${tex}`;
  const cached = getCachedMath(typesetter, key);
  if (cached) {
    dom.replaceChildren(...Array.from(cached.childNodes).map(n => n.cloneNode(true)));
    return () => {};
  }

  let cancelled = false;
  dom.classList.add('cm-md-math-pending');
  dom.textContent = raw;

  const scratch = document.createElement(display ? 'div' : 'span');
  scratch.textContent = raw;
  void Promise.resolve(typesetter.typeset(scratch))
    .then(() => {
      if (scratch.childElementCount > 0 || scratch.textContent !== raw) {
        setCachedMath(typesetter, key, scratch);
      }
      if (cancelled || !dom.isConnected) return;
      dom.classList.remove('cm-md-math-pending');
      dom.replaceChildren(...Array.from(scratch.childNodes).map(n => n.cloneNode(true)));
      onReady?.();
    })
    .catch(() => {
      if (cancelled || !dom.isConnected) return;
      dom.classList.remove('cm-md-math-pending');
      dom.classList.add('cm-md-math-fallback');
    });

  return () => {
    cancelled = true;
  };
}

/** Inline or display MathJax widget. */
export class MathWidget extends WidgetType {
  private cancel: (() => void) | null = null;

  constructor(
    readonly tex: string,
    readonly display: boolean,
    readonly block: boolean,
    readonly typesetter: IRenderMime.ILatexTypesetter | null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof MathWidget &&
      other.tex === this.tex &&
      other.display === this.display &&
      other.block === this.block &&
      other.typesetter === this.typesetter
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const dom = document.createElement(this.block ? 'div' : 'span');
    dom.className = this.display
      ? this.block
        ? 'cm-md-math cm-md-math-display cm-md-math-block'
        : 'cm-md-math cm-md-math-display'
      : 'cm-md-math cm-md-math-inline';
    dom.dataset.tex = this.tex;
    this.cancel = renderMathIntoElement(dom, this.tex, this.display, this.typesetter, () => {
      view.requestMeasure();
    });
    return dom;
  }

  destroy(): void {
    this.cancel?.();
    this.cancel = null;
  }
}

/** Inline image widget with safe URL / attachment / relative resolution. */
export class ImageWidget extends WidgetType {
  private disposed = false;

  constructor(
    readonly alt: string,
    readonly title: string,
    readonly rawUrl: string,
    readonly widthAttr: string | null,
    readonly heightAttr: string | null,
    readonly ctx: LivePreviewContext,
    readonly classified: ImageUrlClassification | null,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof ImageWidget &&
      other.alt === this.alt &&
      other.title === this.title &&
      other.rawUrl === this.rawUrl &&
      other.widthAttr === this.widthAttr &&
      other.heightAttr === this.heightAttr &&
      other.ctx.resolver === this.ctx.resolver &&
      (this.classified?.kind !== 'attachment' ||
        other.ctx.attachmentsRevision === this.ctx.attachmentsRevision)
    );
  }

  private renderMissing(wrap: HTMLElement): void {
    wrap.replaceChildren();
    wrap.classList.add('cm-md-image-missing');
    const label = document.createElement('span');
    label.className = 'cm-md-image-fallback';
    label.textContent = this.alt ? `[image: ${this.alt}]` : '[image]';
    wrap.appendChild(label);
  }

  private attachImage(wrap: HTMLElement, src: string, view: EditorView): void {
    const img = document.createElement('img');
    img.className = 'cm-md-image-img';
    img.alt = this.alt;
    if (this.title) img.title = this.title;
    if (this.widthAttr && /^\d+$/.test(this.widthAttr)) img.width = Number(this.widthAttr);
    if (this.heightAttr && /^\d+$/.test(this.heightAttr)) img.height = Number(this.heightAttr);
    img.addEventListener('load', () => {
      if (!this.disposed && wrap.isConnected) view.requestMeasure();
    });
    img.addEventListener('error', () => {
      if (!this.disposed && wrap.isConnected) {
        this.renderMissing(wrap);
        view.requestMeasure();
      }
    });
    img.src = src;
    wrap.replaceChildren(img);
  }

  toDOM(view: EditorView): HTMLElement {
    this.disposed = false;
    const wrap = document.createElement('span');
    wrap.className = 'cm-md-image';
    if (!this.classified) {
      this.renderMissing(wrap);
      return wrap;
    }
    if (this.classified.kind === 'external' || this.classified.kind === 'data') {
      this.attachImage(wrap, this.classified.url, view);
      return wrap;
    }
    if (this.classified.kind === 'attachment') {
      const dataUrl = resolveAttachment(this.ctx.getAttachments?.(), this.classified.url);
      if (dataUrl) this.attachImage(wrap, dataUrl, view);
      else this.renderMissing(wrap);
      return wrap;
    }
    // Relative notebook path: resolve synchronously fallback or async through UrlResolver.
    if (!this.ctx.resolver) {
      this.attachImage(wrap, this.classified.url, view);
      return wrap;
    }
    wrap.classList.add('cm-md-image-loading');
    void resolveViaNotebookResolver(this.ctx.resolver, this.classified.url).then(resolved => {
      if (this.disposed || !wrap.isConnected) return;
      wrap.classList.remove('cm-md-image-loading');
      if (resolved) this.attachImage(wrap, resolved, view);
      else this.renderMissing(wrap);
      view.requestMeasure();
    });
    return wrap;
  }

  destroy(): void {
    this.disposed = true;
  }
}

// Tables --------------------------------------------------------------------

export type TableAlign = 'left' | 'center' | 'right' | null;

type CellSegment =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; children: CellSegment[] }
  | { kind: 'em'; children: CellSegment[] }
  | { kind: 'del'; children: CellSegment[] }
  | { kind: 'code'; text: string }
  | { kind: 'link'; href: string; children: CellSegment[] }
  | {
      kind: 'image';
      alt: string;
      title: string;
      rawUrl: string;
      classified: ImageUrlClassification | null;
    }
  | { kind: 'math'; tex: string }
  | { kind: 'br' }
  | { kind: 'styled'; tag: string; children: CellSegment[] };

export interface ParsedTableCell {
  from: number;
  segments: CellSegment[];
}

export interface ParsedTableModel {
  raw: string;
  alignments: TableAlign[];
  header: ParsedTableCell[];
  rows: ParsedTableCell[][];
}

function unescapeCellText(text: string): string {
  return text.replace(/\\([\\|`*_{}[\]()#+\-.!>~])/g, '$1');
}

function parseTableAlignments(doc: Text, delimiterNode: SyntaxNode): TableAlign[] {
  let raw = doc.sliceString(delimiterNode.from, delimiterNode.to).trim();
  if (raw.startsWith('|')) raw = raw.slice(1);
  if (raw.endsWith('|')) raw = raw.slice(0, -1);
  return raw.split('|').map(part => {
    const s = part.trim();
    const left = s.startsWith(':');
    const right = s.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

function buildTextAndMathSegments(
  doc: Text,
  from: number,
  to: number,
  mathMatches: readonly MathMatch[],
): CellSegment[] {
  if (to <= from) return [];
  const out: CellSegment[] = [];
  let pos = from;
  for (const m of mathMatches) {
    if (m.to <= from) continue;
    if (m.from >= to) break;
    if (m.from >= from && m.to <= to) {
      if (m.from > pos) {
        out.push({ kind: 'text', text: unescapeCellText(doc.sliceString(pos, m.from)) });
      }
      out.push({ kind: 'math', tex: m.tex });
      pos = m.to;
    }
  }
  if (pos < to) {
    out.push({ kind: 'text', text: unescapeCellText(doc.sliceString(pos, to)) });
  }
  return out;
}

function buildCellSegments(
  doc: Text,
  parent: SyntaxNode,
  rangeFrom: number,
  rangeTo: number,
  mathMatches: readonly MathMatch[],
): CellSegment[] {
  const segments: CellSegment[] = [];
  const appendInlineSlice = (from: number, to: number) => {
    if (to <= from) return;
    segments.push(...buildTextAndMathSegments(doc, from, to, mathMatches));
  };

  let cursorPos = rangeFrom;
  const children: SyntaxNode[] = [];
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.to <= rangeFrom || c.from >= rangeTo) continue;
    children.push(c);
  }

  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.from > cursorPos) {
      appendInlineSlice(cursorPos, c.from);
    }
    const { name, from, to } = c;
    if (name === 'EmphasisMark' || name === 'StrikethroughMark' || name === 'CodeMark') {
      cursorPos = Math.max(cursorPos, to);
      continue;
    }
    if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
      const kind = name === 'StrongEmphasis' ? 'strong' : name === 'Emphasis' ? 'em' : 'del';
      segments.push({ kind, children: buildCellSegments(doc, c, from, to, mathMatches) });
      cursorPos = to;
    } else if (name === 'InlineCode') {
      let innerFrom = from;
      let innerTo = to;
      for (let m = c.firstChild; m; m = m.nextSibling) {
        if (m.name === 'CodeMark') {
          if (m.from === from) innerFrom = m.to;
          else if (m.to === to) innerTo = m.from;
        }
      }
      segments.push({
        kind: 'code',
        text: doc.sliceString(innerFrom, Math.max(innerFrom, innerTo)),
      });
      cursorPos = to;
    } else if (name === 'Link') {
      const urlNode = c.getChild('URL');
      const rawSlice = urlNode ? doc.sliceString(urlNode.from, urlNode.to).trim() : '';
      const rawHref =
        rawSlice.startsWith('<') && rawSlice.endsWith('>') ? rawSlice.slice(1, -1) : rawSlice;
      const safeHref = isSafeLinkUrl(rawHref) ?? '#';
      const labelStart = c.firstChild?.name === 'LinkMark' ? c.firstChild.to : from;
      let labelEnd = to;
      for (let m = c.firstChild; m; m = m.nextSibling) {
        if (m.name === 'LinkMark' && m.from > labelStart && doc.sliceString(m.from, m.to) === ']') {
          labelEnd = m.from;
          break;
        }
      }
      segments.push({
        kind: 'link',
        href: safeHref,
        children: buildCellSegments(doc, c, labelStart, labelEnd, mathMatches),
      });
      cursorPos = to;
    } else if (name === 'Autolink' || name === 'URL') {
      const urlNode = name === 'URL' ? c : c.getChild('URL');
      const rawHref = urlNode ? doc.sliceString(urlNode.from, urlNode.to) : '';
      const safeHref = isSafeLinkUrl(rawHref);
      if (safeHref) {
        segments.push({
          kind: 'link',
          href: safeHref,
          children: [{ kind: 'text', text: rawHref }],
        });
      } else {
        segments.push({ kind: 'text', text: doc.sliceString(from, to) });
      }
      cursorPos = to;
    } else if (name === 'Image') {
      const image = extractImageParts(doc, c);
      segments.push({
        kind: 'image',
        alt: image.alt,
        title: image.title,
        rawUrl: image.rawUrl,
        classified: classifyImageUrl(image.rawUrl),
      });
      cursorPos = to;
    } else if (name === 'HTMLTag') {
      const parsed = parseInlineHtmlTag(doc.sliceString(from, to));
      if (parsed && !parsed.closing && parsed.name === 'br') {
        segments.push({ kind: 'br' });
        cursorPos = to;
      } else if (parsed && !parsed.closing && parsed.name === 'img') {
        const rawUrl = parsed.attrs.src ?? '';
        segments.push({
          kind: 'image',
          alt: parsed.attrs.alt ?? '',
          title: parsed.attrs.title ?? '',
          rawUrl,
          classified: classifyImageUrl(rawUrl),
        });
        cursorPos = to;
      } else if (
        parsed &&
        !parsed.closing &&
        !parsed.selfClosing &&
        pairedHtmlClass(parsed) !== null
      ) {
        // Pair matching closing tag within the same sibling slice.
        let depth = 1;
        let matchIdx = -1;
        for (let j = i + 1; j < children.length; j++) {
          if (children[j].name !== 'HTMLTag') continue;
          const nextTag = parseInlineHtmlTag(doc.sliceString(children[j].from, children[j].to));
          if (!nextTag || nextTag.name !== parsed.name) continue;
          if (!nextTag.closing && !nextTag.selfClosing) depth++;
          else if (nextTag.closing) {
            depth--;
            if (depth === 0) {
              matchIdx = j;
              break;
            }
          }
        }
        if (matchIdx !== -1) {
          const closeNode = children[matchIdx];
          const innerSegs = buildCellSegments(doc, parent, to, closeNode.from, mathMatches);
          if (parsed.name === 'a' && parsed.attrs.href) {
            const href = isSafeLinkUrl(parsed.attrs.href) ?? '#';
            segments.push({ kind: 'link', href, children: innerSegs });
          } else {
            segments.push({ kind: 'styled', tag: parsed.name, children: innerSegs });
          }
          cursorPos = closeNode.to;
          i = matchIdx;
        } else {
          appendInlineSlice(from, to);
          cursorPos = to;
        }
      } else {
        appendInlineSlice(from, to);
        cursorPos = to;
      }
    } else if (name === 'Escape') {
      segments.push({ kind: 'text', text: doc.sliceString(from + 1, to) });
      cursorPos = to;
    } else {
      appendInlineSlice(from, to);
      cursorPos = to;
    }
  }

  if (cursorPos < rangeTo) {
    appendInlineSlice(cursorPos, rangeTo);
  }
  return segments;
}

function collectCellSkips(doc: Text, node: SyntaxNode, skips: TextSpan[]): void {
  if (
    node.name === 'InlineCode' ||
    node.name === 'Image' ||
    node.name === 'Autolink' ||
    node.name === 'URL' ||
    node.name === 'HTMLTag'
  ) {
    skips.push({ from: node.from, to: node.to });
    return;
  }
  if (node.name === 'Link') {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (c.name === 'URL' || c.name === 'LinkTitle' || c.name === 'Image') {
        skips.push({ from: c.from, to: c.to });
      }
    }
    return;
  }
  for (let c = node.firstChild; c; c = c.nextSibling) {
    collectCellSkips(doc, c, skips);
  }
}

function parseTableCell(doc: Text, cellNode: SyntaxNode): ParsedTableCell {
  let mathMatches: MathMatch[] = [];
  const rawCell = doc.sliceString(cellNode.from, cellNode.to);
  if (rawCell.includes('$')) {
    const skips: TextSpan[] = [];
    collectCellSkips(doc, cellNode, skips);
    const shifted = skips.map(s => ({ from: s.from - cellNode.from, to: s.to - cellNode.from }));
    mathMatches = findMathRanges(rawCell, shifted, 0, rawCell.length).map(m => ({
      ...m,
      from: m.from + cellNode.from,
      to: m.to + cellNode.from,
    }));
  }
  return {
    from: cellNode.from,
    segments: buildCellSegments(doc, cellNode, cellNode.from, cellNode.to, mathMatches),
  };
}

export function extractTableModel(doc: Text, tableNode: SyntaxNode): ParsedTableModel {
  let alignments: TableAlign[] = [];
  let header: ParsedTableCell[] = [];
  const rows: ParsedTableCell[][] = [];

  for (let child = tableNode.firstChild; child; child = child.nextSibling) {
    if (child.name === 'TableDelimiter') {
      alignments = parseTableAlignments(doc, child);
    } else if (child.name === 'TableHeader' || child.name === 'TableRow') {
      const cells: ParsedTableCell[] = [];
      for (let cell = child.firstChild; cell; cell = cell.nextSibling) {
        if (cell.name === 'TableCell') cells.push(parseTableCell(doc, cell));
      }
      if (child.name === 'TableHeader') header = cells;
      else rows.push(cells);
    }
  }

  return {
    raw: doc.sliceString(tableNode.from, tableNode.to),
    alignments,
    header,
    rows,
  };
}

function appendCellSegments(
  parent: HTMLElement,
  segments: readonly CellSegment[],
  ctx: LivePreviewContext,
  view: EditorView,
  cancels: (() => void)[],
): void {
  for (const seg of segments) {
    switch (seg.kind) {
      case 'text':
        parent.appendChild(document.createTextNode(seg.text));
        break;
      case 'code': {
        const el = document.createElement('code');
        el.textContent = seg.text;
        parent.appendChild(el);
        break;
      }
      case 'strong':
      case 'em':
      case 'del': {
        const el = document.createElement(seg.kind);
        appendCellSegments(el, seg.children, ctx, view, cancels);
        parent.appendChild(el);
        break;
      }
      case 'styled': {
        const el = document.createElement(seg.tag);
        appendCellSegments(el, seg.children, ctx, view, cancels);
        parent.appendChild(el);
        break;
      }
      case 'link': {
        const el = document.createElement('a');
        el.href = seg.href;
        el.rel = 'noopener noreferrer';
        el.target = '_blank';
        el.className = 'cm-md-link';
        appendCellSegments(el, seg.children, ctx, view, cancels);
        parent.appendChild(el);
        break;
      }
      case 'br':
        parent.appendChild(document.createElement('br'));
        break;
      case 'math': {
        const span = document.createElement('span');
        span.className = 'cm-md-math cm-md-math-inline';
        cancels.push(
          renderMathIntoElement(span, seg.tex, false, ctx.latexTypesetter, () => {
            view.requestMeasure();
          }),
        );
        parent.appendChild(span);
        break;
      }
      case 'image': {
        const w = new ImageWidget(seg.alt, seg.title, seg.rawUrl, null, null, ctx, seg.classified);
        cancels.push(() => w.destroy());
        parent.appendChild(w.toDOM(view));
        break;
      }
    }
  }
}

/** Block/grid widget rendering a GFM pipe table when the cursor is elsewhere. */
export class TableWidget extends WidgetType {
  private cancels: (() => void)[] = [];

  constructor(
    readonly model: ParsedTableModel,
    readonly ctx: LivePreviewContext,
  ) {
    super();
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof TableWidget &&
      other.model.raw === this.model.raw &&
      other.ctx.latexTypesetter === this.ctx.latexTypesetter &&
      other.ctx.resolver === this.ctx.resolver &&
      other.ctx.attachmentsRevision === this.ctx.attachmentsRevision
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-md-table-wrap';
    const table = document.createElement('table');
    table.className = 'cm-md-table';

    const colCount = Math.max(
      this.model.alignments.length,
      this.model.header.length,
      ...this.model.rows.map(r => r.length),
    );

    const makeRow = (cells: readonly ParsedTableCell[], tag: 'th' | 'td'): HTMLTableRowElement => {
      const tr = document.createElement('tr');
      for (let i = 0; i < colCount; i++) {
        const cell = cells[i];
        const el = document.createElement(tag);
        const align = this.model.alignments[i] ?? null;
        if (align) el.style.textAlign = align;
        if (cell) {
          el.dataset.from = String(cell.from);
          appendCellSegments(el, cell.segments, this.ctx, view, this.cancels);
        }
        tr.appendChild(el);
      }
      return tr;
    };

    if (this.model.header.length > 0) {
      const thead = document.createElement('thead');
      thead.appendChild(makeRow(this.model.header, 'th'));
      table.appendChild(thead);
    }

    if (this.model.rows.length > 0) {
      const tbody = document.createElement('tbody');
      for (const row of this.model.rows) {
        tbody.appendChild(makeRow(row, 'td'));
      }
      table.appendChild(tbody);
    }

    // Clicking a rendered cell jumps the caret right into that Markdown cell so it opens raw there.
    table.addEventListener('click', event => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest('a');
      if (link && (event.metaKey || event.ctrlKey)) {
        const safe = isSafeLinkUrl(link.getAttribute('href') ?? '');
        if (safe) {
          event.preventDefault();
          window.open(safe, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (link) event.preventDefault();
      if (window.getSelection()?.isCollapsed === false) return;
      const cellEl = target.closest<HTMLElement>('[data-from]');
      const pos = cellEl ? Number(cellEl.dataset.from) : NaN;
      if (!Number.isNaN(pos)) {
        event.preventDefault();
        view.focus();
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      }
    });

    wrap.appendChild(table);
    return wrap;
  }

  destroy(): void {
    for (const cancel of this.cancels) cancel();
    this.cancels = [];
  }
}

// Image part extraction -----------------------------------------------------

export function extractImageParts(
  doc: Text,
  imageNode: SyntaxNode,
): { alt: string; rawUrl: string; title: string } {
  const urlNode = imageNode.getChild('URL');
  const titleNode = imageNode.getChild('LinkTitle');
  const rawUrlSlice = urlNode ? doc.sliceString(urlNode.from, urlNode.to).trim() : '';
  const rawUrl =
    rawUrlSlice.startsWith('<') && rawUrlSlice.endsWith('>')
      ? rawUrlSlice.slice(1, -1)
      : rawUrlSlice;

  let altStart = imageNode.from + 2; // after '!['
  let altEnd = imageNode.from + 2;
  for (let c = imageNode.firstChild; c; c = c.nextSibling) {
    if (c.name === 'LinkMark') {
      const tok = doc.sliceString(c.from, c.to);
      if (tok === '![') altStart = c.to;
      else if (tok === ']') {
        altEnd = c.from;
        break;
      }
    }
  }
  const alt = altEnd > altStart ? doc.sliceString(altStart, altEnd) : '';
  let title = titleNode ? doc.sliceString(titleNode.from, titleNode.to).trim() : '';
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith("'") && title.endsWith("'")) ||
    (title.startsWith('(') && title.endsWith(')'))
  ) {
    title = title.slice(1, -1);
  }
  return { alt, rawUrl, title };
}
