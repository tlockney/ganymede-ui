/**
 * Live Markdown preview (#672, #673): a Markdown cell renders in place as you
 * type, the way Obsidian's live preview does. Headings, emphasis, inline code,
 * links (including autolinks and bare URLs), images, bullet/ordered/task lists,
 * block quotes with hanging indents, fenced code with language highlighting,
 * tables, MathJax math, safe inline HTML and horizontal rules show as they
 * will read, and the syntax that makes them is hidden. Where the cursor or the
 * selection is, the Markdown shows raw again. Running the cell gives the full
 * render, as before.
 *
 * It is CodeMirror decorations over the Markdown syntax tree, so the document
 * is never changed: undo, copy, selection and saving see the raw text.
 *
 * The switch ("Live Markdown Preview") is the app's, kept in local storage
 * and off by default. Only Markdown cells' editors get the extension
 * (`jupyterlab.ts`); a code cell's never does.
 */
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { type Language, type LanguageDescription, syntaxTree } from '@codemirror/language';
import {
  Compartment,
  type EditorState,
  type Extension,
  Facet,
  type Range,
  type RangeSet,
  StateEffect,
  StateField,
  type Text,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Signal } from '@lumino/signaling';
import {
  BreakWidget,
  CheckboxWidget,
  classifyImageUrl,
  extractImageParts,
  extractTableModel,
  findMathRanges,
  ImageWidget,
  isSafeLinkUrl,
  isSupportedVoidHtmlTag,
  isWholeLineBlockMath,
  type LivePreviewContext,
  type MathMatch,
  MathWidget,
  mergeSpans,
  OrderedMarkerWidget,
  pairedHtmlClass,
  parseInlineHtmlTag,
  type SyntaxNode,
  TableWidget,
  type TextSpan,
} from './markdown-preview-render';

const KEY = 'ganymede-ui:live-markdown';
/** The switch for this page when local storage can't hold it. */
let fallback: boolean | undefined;
const changed = new Signal<object, boolean>({});
// Another window (each Mac window is its own web view) changed the switch.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === KEY || e.key === null) changed.emit(liveMarkdownEnabled());
  });
}

/** Whether Markdown cells preview live; off unless the person turned it on. */
export function liveMarkdownEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return fallback ?? false;
  }
}

/** Turn the preview on or off, in every open editor, and remember it. */
export function setLiveMarkdownEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
    fallback = undefined;
  } catch {
    // Private mode: for this page only.
    fallback = on;
  }
  changed.emit(on);
}

/** Subscribe to live Markdown preview toggle changes across this page and sibling windows. */
export function onLiveMarkdownChange(listener: (on: boolean) => void): () => void {
  const slot = (_: unknown, on: boolean) => listener(on);
  changed.connect(slot);
  return () => {
    changed.disconnect(slot);
  };
}

/** For tests: forget a switch kept only in this page. */
export function resetLiveMarkdownForTests(): void {
  fallback = undefined;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}

/** The class on the editor's content while the preview is on; `jupyter.css` styles it. */
export const LIVE_CLASS = 'cm-md-live';

/**
 * Per-notebook URL resolver facet attached by `createNotebook` so Markdown
 * cells can resolve notebook-relative images while preserving a zero-arg
 * `liveMarkdownPreview()` entry point for standalone editors and tests.
 */
export const liveMarkdownResolver = Facet.define<
  IRenderMime.IResolver | null,
  IRenderMime.IResolver | null
>({
  combine: values => values.find(v => v != null) ?? null,
});

export interface LiveMarkdownOptions {
  /** Code language lookup or registry for fenced code block syntax highlighting. */
  codeLanguages?:
    readonly LanguageDescription[] | ((info: string) => Language | LanguageDescription | null);
  /** Shared MathJax typesetter used to render `$...$` and `$$...$$`. */
  latexTypesetter?: IRenderMime.ILatexTypesetter | null;
  /** Optional explicit URL resolver (overrides `liveMarkdownResolver` facet when provided). */
  resolver?: IRenderMime.IResolver | null;
  /** Accessor for the current Markdown cell's `attachments` map. */
  attachments?: () => unknown;
  /** Subscribes to attachment map changes on the cell model; returns an unsubscribe callback. */
  onAttachmentsChange?: (listener: () => void) => () => void;
}

const EMPTY_OPTIONS: LiveMarkdownOptions = {};
const optionsFacet = Facet.define<LiveMarkdownOptions, LiveMarkdownOptions>({
  combine: values => values[values.length - 1] ?? EMPTY_OPTIONS,
});

/** A bullet in place of `-`, `*` or `+`. */
class BulletWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-bullet';
    span.textContent = '•';
    return span;
  }
}

/** A horizontal rule in place of `---`. */
class RuleWidget extends WidgetType {
  eq(): boolean {
    return true;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'cm-md-rule';
    return span;
  }
}

const HIDE = Decoration.replace({});
const BULLET = Decoration.replace({ widget: new BulletWidget() });
const RULE = Decoration.replace({ widget: new RuleWidget() });
const BR_REPLACE = Decoration.replace({ widget: new BreakWidget() });
const mark = (cls: string) => Decoration.mark({ class: cls });

/** A marker and the space after it (`# `, `> `), one range. */
function withSpace(state: EditorState, from: number, to: number): number {
  void from;
  return state.doc.sliceString(to, to + 1) === ' ' ? to + 1 : to;
}

/** Whether a selection range touches `from..to`, the ends included. */
function touches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some(r => r.from <= to && r.to >= from);
}

/** Whether a selection range touches a line of the document that holds `from..to`. */
function touchesLines(state: EditorState, from: number, to: number): boolean {
  const a = state.doc.lineAt(from).from;
  const b = state.doc.lineAt(to).to;
  return touches(state, a, b);
}

/** Every line number from the line at `from` to the one at `to`. */
function lineRange(state: EditorState, from: number, to: number): number[] {
  const out: number[] = [];
  for (let n = state.doc.lineAt(from).number; n <= state.doc.lineAt(to).number; n++) out.push(n);
  return out;
}

function overlapsSpan(from: number, to: number, spans: readonly TextSpan[]): boolean {
  for (const s of spans) {
    if (from < s.to && to > s.from) return true;
  }
  return false;
}

function scanTextFeatures(
  doc: Text,
  spans: readonly TextSpan[],
): { hasDollar: boolean; hasAngle: boolean } {
  let hasDollar = false;
  let hasAngle = false;
  for (const s of spans) {
    if (s.to <= s.from) continue;
    const cur = doc.iterRange(s.from, s.to);
    while (!cur.next().done) {
      if (!hasDollar && cur.value.includes('$')) hasDollar = true;
      if (!hasAngle && cur.value.includes('<')) hasAngle = true;
      if (hasDollar && hasAngle) return { hasDollar, hasAngle };
    }
  }
  return { hasDollar, hasAngle };
}

function contextFromState(state: EditorState, attachmentsRevision = 0): LivePreviewContext {
  const opts = state.facet(optionsFacet);
  const facetResolver = state.facet(liveMarkdownResolver);
  return {
    latexTypesetter: opts.latexTypesetter ?? null,
    resolver: opts.resolver !== undefined ? opts.resolver : facetResolver,
    getAttachments: opts.attachments ?? null,
    attachmentsRevision,
  };
}

/** Collect skip ranges (code, HTML, URLs, images) inside an inline container for math scanning. */
function collectInlineSkips(node: SyntaxNode, skips: TextSpan[]): void {
  if (
    node.name === 'InlineCode' ||
    node.name === 'FencedCode' ||
    node.name === 'CodeBlock' ||
    node.name === 'HTMLBlock' ||
    node.name === 'CommentBlock' ||
    node.name === 'Comment' ||
    node.name === 'ProcessingInstruction' ||
    node.name === 'HTMLTag' ||
    node.name === 'Image' ||
    node.name === 'Autolink' ||
    node.name === 'URL'
  ) {
    skips.push({ from: node.from, to: node.to });
    return;
  }
  if (node.name === 'Link') {
    for (let c = node.firstChild; c; c = c.nextSibling) {
      if (
        c.name === 'LinkMark' ||
        c.name === 'URL' ||
        c.name === 'LinkTitle' ||
        c.name === 'LinkLabel' ||
        c.name === 'Image'
      ) {
        skips.push({ from: c.from, to: c.to });
      }
    }
    return;
  }
  for (let c = node.firstChild; c; c = c.nextSibling) {
    collectInlineSkips(c, skips);
  }
}

/** Find `$...$` / `$$...$$` math ranges inside a single block node (fast skip when `$` is absent). */
function mathInBlock(state: EditorState, block: SyntaxNode): MathMatch[] {
  const { hasDollar } = scanTextFeatures(state.doc, [{ from: block.from, to: block.to }]);
  if (!hasDollar) return [];
  const raw = state.doc.sliceString(block.from, block.to);
  const skips: TextSpan[] = [];
  for (let c = block.firstChild; c; c = c.nextSibling) {
    collectInlineSkips(c, skips);
  }
  const shiftedSkips = skips.map(s => ({ from: s.from - block.from, to: s.to - block.from }));
  return findMathRanges(raw, shiftedSkips, 0, raw.length).map(m => ({
    ...m,
    from: m.from + block.from,
    to: m.to + block.from,
  }));
}

interface ReplaceEntry {
  from: number;
  to: number;
  deco: Decoration;
}

function filterDisjointReplaces(entries: ReplaceEntry[]): Range<Decoration>[] {
  if (entries.length === 0) return [];
  entries.sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Range<Decoration>[] = [];
  let lastTo = -1;
  for (const e of entries) {
    if (e.to <= e.from) continue;
    if (e.from < lastTo) continue;
    out.push(e.deco.range(e.from, e.to));
    lastTo = e.to;
  }
  return out;
}

interface LineDecorationAcc {
  classes: Set<string>;
  quoteDepth: number;
  indentEm: number;
  hangEm: number;
}

interface CollectedDecorations {
  all: Range<Decoration>[];
  replaces: Range<Decoration>[];
}

/**
 * Collect all Markdown preview decorations (blocks, lines, inline marks, and
 * replaced widgets) across `scanSpans`. Keeping the full parsed frontier
 * incrementally updated by top-level block avoids re-walking a large cell on
 * cursor moves while preserving off-screen parse updates.
 */
function collectDecorationsInSpans(
  state: EditorState,
  scanSpans: readonly TextSpan[],
  ctx: LivePreviewContext,
): CollectedDecorations {
  const lineAcc = new Map<number, LineDecorationAcc>();
  const marks: Range<Decoration>[] = [];
  const replaces: ReplaceEntry[] = [];
  const processedHtml = new Set<number>();

  const ensureLine = (lineNum: number): LineDecorationAcc => {
    let entry = lineAcc.get(lineNum);
    if (!entry) {
      entry = { classes: new Set(), quoteDepth: 0, indentEm: 0, hangEm: 0 };
      lineAcc.set(lineNum, entry);
    }
    return entry;
  };

  const addLineClass = (lineNum: number, cls: string) => {
    const entry = ensureLine(lineNum);
    for (const c of cls.split(' ')) {
      if (c) entry.classes.add(c);
    }
  };

  const hide = (from: number, to: number) => {
    if (to > from) replaces.push({ from, to, deco: HIDE });
  };

  const inSpans = (pos: number): boolean => scanSpans.some(s => pos >= s.from && pos <= s.to);

  const { hasDollar: mayContainMath, hasAngle: mayContainHtml } = scanTextFeatures(
    state.doc,
    scanSpans,
  );
  const orderedLabels = new Map<number, string>();
  const hiddenMathSpans: TextSpan[] = [];

  const handleBlockInlineExtras = (block: SyntaxNode) => {
    if (!mayContainMath && !mayContainHtml) return;
    if (mayContainMath) {
      const matches = mathInBlock(state, block);
      for (const m of matches) {
        const raw = m.display ? touchesLines(state, m.from, m.to) : touches(state, m.from, m.to);
        if (!raw) {
          hiddenMathSpans.push({ from: m.from, to: m.to });
          if (inSpans(m.from)) {
            const wholeBlock = isWholeLineBlockMath(state.doc, m);
            const rFrom = wholeBlock ? state.doc.lineAt(m.from).from : m.from;
            const rTo = wholeBlock ? state.doc.lineAt(m.to).to : m.to;
            replaces.push({
              from: rFrom,
              to: rTo,
              deco: Decoration.replace({
                widget: new MathWidget(m.tex, m.display, wholeBlock, ctx.latexTypesetter),
                block: wholeBlock,
              }),
            });
          }
        }
      }
    }

    if (!mayContainHtml) return;
    const htmlNodes: SyntaxNode[] = [];
    const gatherHtml = (n: SyntaxNode) => {
      if (n.name === 'HTMLTag') {
        htmlNodes.push(n);
        return;
      }
      if (
        n.name === 'InlineCode' ||
        n.name === 'FencedCode' ||
        n.name === 'CodeBlock' ||
        n.name === 'Image' ||
        n.name === 'Autolink' ||
        n.name === 'URL'
      ) {
        return;
      }
      for (let c = n.firstChild; c; c = c.nextSibling) {
        if (
          c.name === 'Paragraph' ||
          c.name === 'Blockquote' ||
          c.name === 'ListItem' ||
          c.name === 'BulletList' ||
          c.name === 'OrderedList' ||
          c.name === 'Table' ||
          c.name === 'FencedCode' ||
          c.name === 'Task'
        ) {
          continue;
        }
        gatherHtml(c);
      }
    };
    gatherHtml(block);

    interface OpenTag {
      node: SyntaxNode;
      name: string;
      cls: string;
    }
    const stack: OpenTag[] = [];
    for (const tagNode of htmlNodes) {
      if (overlapsSpan(tagNode.from, tagNode.to, hiddenMathSpans)) continue;
      const parsed = parseInlineHtmlTag(state.doc.sliceString(tagNode.from, tagNode.to));
      if (!parsed) continue;

      if (isSupportedVoidHtmlTag(parsed)) {
        processedHtml.add(tagNode.from);
        if (parsed.name === 'br') {
          if (!touches(state, tagNode.from, tagNode.to) && inSpans(tagNode.from)) {
            replaces.push({ from: tagNode.from, to: tagNode.to, deco: BR_REPLACE });
          } else {
            marks.push(mark('cm-md-html').range(tagNode.from, tagNode.to));
          }
        } else if (parsed.name === 'img') {
          const rawUrl = parsed.attrs.src ?? '';
          const classified = classifyImageUrl(rawUrl);
          if (classified && !touches(state, tagNode.from, tagNode.to) && inSpans(tagNode.from)) {
            replaces.push({
              from: tagNode.from,
              to: tagNode.to,
              deco: Decoration.replace({
                widget: new ImageWidget(
                  parsed.attrs.alt ?? '',
                  parsed.attrs.title ?? '',
                  rawUrl,
                  parsed.attrs.width ?? null,
                  parsed.attrs.height ?? null,
                  ctx,
                  classified,
                ),
              }),
            });
          } else {
            marks.push(mark('cm-md-html').range(tagNode.from, tagNode.to));
          }
        }
        continue;
      }

      if (!parsed.closing && !parsed.selfClosing) {
        const cls = pairedHtmlClass(parsed);
        if (cls !== null) stack.push({ node: tagNode, name: parsed.name, cls });
      } else if (parsed.closing) {
        let matchIdx = -1;
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k].name === parsed.name) {
            matchIdx = k;
            break;
          }
        }
        if (matchIdx !== -1) {
          const open = stack[matchIdx];
          stack.length = matchIdx;
          processedHtml.add(open.node.from);
          processedHtml.add(tagNode.from);
          const spanFrom = open.node.from;
          const spanTo = tagNode.to;
          if (!overlapsSpan(spanFrom, spanTo, hiddenMathSpans)) {
            if (open.cls) marks.push(mark(open.cls).range(spanFrom, spanTo));
            if (!touches(state, spanFrom, spanTo)) {
              if (inSpans(open.node.from)) hide(open.node.from, open.node.to);
              if (inSpans(tagNode.from)) hide(tagNode.from, tagNode.to);
            }
          }
        }
      }
    }
  };

  for (const r of scanSpans) {
    syntaxTree(state).iterate({
      from: r.from,
      to: r.to,
      enter: node => {
        const { name, from, to } = node;

        if (name === 'Paragraph') {
          handleBlockInlineExtras(node.node);
          if (!node.node.firstChild) return false;
          return undefined;
        }
        if (name.startsWith('ATXHeading')) {
          const level = name.charCodeAt(10) - 48;
          if (level >= 1 && level <= 6) {
            handleBlockInlineExtras(node.node);
            for (const n of lineRange(state, from, to)) {
              addLineClass(n, `cm-md-h cm-md-h${level}`);
            }
            if (!touchesLines(state, from, to)) {
              const hash = node.node.getChild('HeaderMark');
              if (hash) hide(hash.from, withSpace(state, hash.from, hash.to));
              const last = node.node.lastChild;
              if (last && last.name === 'HeaderMark' && last.from !== hash?.from) {
                const start =
                  state.doc.sliceString(last.from - 1, last.from) === ' '
                    ? last.from - 1
                    : last.from;
                hide(start, last.to);
              }
            }
          }
        } else if (name === 'SetextHeading1' || name === 'SetextHeading2') {
          const level = name === 'SetextHeading1' ? 1 : 2;
          handleBlockInlineExtras(node.node);
          const first = node.node.getChild('HeaderMark');
          const end = first ? Math.max(from, state.doc.lineAt(first.from).from - 1) : to;
          for (const n of lineRange(state, from, end)) {
            addLineClass(n, `cm-md-h cm-md-h${level}`);
          }
          if (first && !touchesLines(state, from, to)) {
            const underlineLine = state.doc.lineAt(first.from);
            const wholeUnderline =
              underlineLine.from > 0 &&
              state.doc.sliceString(underlineLine.from, first.from).trim() === '';
            if (wholeUnderline) {
              hide(underlineLine.from - 1, underlineLine.to);
            } else {
              hide(first.from, first.to);
            }
          }
        } else if (name === 'Task') {
          handleBlockInlineExtras(node.node);
        } else if (name === 'Table') {
          if (!touchesLines(state, from, to)) {
            const model = extractTableModel(state.doc, node.node);
            const firstLine = state.doc.lineAt(from);
            const lastLine = state.doc.lineAt(to);
            const leadingEmpty =
              state.doc.sliceString(firstLine.from, from).trim() === '' && to === lastLine.to;
            const widget = new TableWidget(model, ctx);
            if (leadingEmpty) {
              replaces.push({
                from: firstLine.from,
                to,
                deco: Decoration.replace({ widget, block: true }),
              });
            } else {
              replaces.push({
                from,
                to,
                deco: Decoration.replace({ widget }),
              });
            }
            return false;
          }
        } else if (name === 'TableCell') {
          handleBlockInlineExtras(node.node);
        } else if (name === 'OrderedList') {
          let nextNum: number | null = null;
          for (let item = node.node.firstChild; item; item = item.nextSibling) {
            if (item.name !== 'ListItem') continue;
            const lm = item.getChild('ListMark');
            if (!lm) continue;
            const rawMark = state.doc.sliceString(lm.from, lm.to);
            if (nextNum === null) {
              const parsed = parseInt(rawMark, 10);
              nextNum = Number.isNaN(parsed) ? 1 : parsed;
            }
            const delim = rawMark.endsWith(')') ? ')' : '.';
            orderedLabels.set(lm.from, `${nextNum}${delim}`);
            nextNum++;
          }
        } else if (name === 'ListItem') {
          const listMark = node.node.getChild('ListMark');
          if (listMark) {
            const lineNum = state.doc.lineAt(listMark.from).number;
            const itemLine = state.doc.line(lineNum);
            const prefixRaw = state.doc.sliceString(itemLine.from, listMark.from);
            const afterQuote = prefixRaw.replace(/^[ \t>]*>/, '');
            let leadingSpaces = 0;
            for (let i = 0; i < afterQuote.length; i++) {
              leadingSpaces += afterQuote[i] === '\t' ? 2 : 1;
            }
            const orderedLabel = orderedLabels.get(listMark.from);
            const task = node.node.getChild('Task');
            let markerEm = 1.35;
            if (orderedLabel) {
              markerEm = Math.max(2, orderedLabel.length) * 0.62 + 0.5 + (task ? 1.45 : 0);
            } else if (task) {
              markerEm = 1.45;
            }
            const hangEm = Math.round((leadingSpaces * 0.45 + markerEm) * 100) / 100;
            const acc = ensureLine(lineNum);
            acc.classes.add('cm-md-li');
            acc.indentEm = hangEm;
            acc.hangEm = hangEm;
          }
        } else if (name === 'ListMark') {
          const listItem = node.node.parent;
          const listParent = listItem?.parent;
          const task = listItem?.getChild('Task');
          const taskMarker = task?.getChild('TaskMarker');

          if (listParent?.name === 'BulletList') {
            if (taskMarker) {
              const rawTask = touchesLines(state, from, taskMarker.to);
              if (!rawTask) {
                hide(from, withSpace(state, from, to));
                const text = state.doc.sliceString(taskMarker.from, taskMarker.to);
                const checked = text.length >= 2 && text[1].toLowerCase() === 'x';
                replaces.push({
                  from: taskMarker.from,
                  to: taskMarker.to,
                  deco: Decoration.replace({
                    widget: new CheckboxWidget(checked, taskMarker.from),
                  }),
                });
                if (checked && task && task.to > taskMarker.to) {
                  marks.push(mark('cm-md-task-done').range(taskMarker.to, task.to));
                }
              }
            } else if (!touchesLines(state, from, to)) {
              replaces.push({ from, to, deco: BULLET });
            }
          } else if (listParent?.name === 'OrderedList') {
            const label = orderedLabels.get(from);
            const rawMark = state.doc.sliceString(from, to);
            if (!touchesLines(state, from, to)) {
              if (label && label !== rawMark) {
                replaces.push({
                  from,
                  to,
                  deco: Decoration.replace({ widget: new OrderedMarkerWidget(label) }),
                });
              } else {
                marks.push(mark('cm-md-order').range(from, to));
              }
            } else {
              marks.push(mark('cm-md-order').range(from, to));
            }
            if (taskMarker && !touchesLines(state, taskMarker.from, taskMarker.to)) {
              const text = state.doc.sliceString(taskMarker.from, taskMarker.to);
              const checked = text.length >= 2 && text[1].toLowerCase() === 'x';
              replaces.push({
                from: taskMarker.from,
                to: taskMarker.to,
                deco: Decoration.replace({ widget: new CheckboxWidget(checked, taskMarker.from) }),
              });
              if (checked && task && task.to > taskMarker.to) {
                marks.push(mark('cm-md-task-done').range(taskMarker.to, task.to));
              }
            }
          }
        } else if (name === 'Blockquote') {
          for (const n of lineRange(state, from, to)) {
            const acc = ensureLine(n);
            acc.classes.add('cm-md-quote');
            acc.quoteDepth += 1;
          }
        } else if (name === 'QuoteMark') {
          if (!touchesLines(state, from, to)) hide(from, withSpace(state, from, to));
        } else if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
          if (overlapsSpan(from, to, hiddenMathSpans)) return false;
          const cls =
            name === 'StrongEmphasis'
              ? 'cm-md-strong'
              : name === 'Emphasis'
                ? 'cm-md-em'
                : 'cm-md-del';
          marks.push(mark(cls).range(from, to));
          if (!touches(state, from, to)) {
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (c.name === 'EmphasisMark' || c.name === 'StrikethroughMark') {
                hide(c.from, c.to);
              }
            }
          }
        } else if (name === 'InlineCode') {
          marks.push(mark('cm-md-code').range(from, to));
          if (!touches(state, from, to)) {
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (c.name === 'CodeMark') hide(c.from, c.to);
            }
          }
          return false;
        } else if (name === 'Link') {
          if (overlapsSpan(from, to, hiddenMathSpans)) return false;
          marks.push(mark('cm-md-link').range(from, to));
          if (!touches(state, from, to)) {
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (['LinkMark', 'URL', 'LinkLabel', 'LinkTitle'].includes(c.name)) {
                hide(c.from, c.to);
              }
            }
          }
        } else if (name === 'Autolink') {
          if (overlapsSpan(from, to, hiddenMathSpans)) return false;
          marks.push(mark('cm-md-link').range(from, to));
          if (!touches(state, from, to)) {
            for (let c = node.node.firstChild; c; c = c.nextSibling) {
              if (c.name === 'LinkMark') hide(c.from, c.to);
            }
          }
        } else if (name === 'URL') {
          const parentName = node.node.parent?.name;
          if (
            parentName !== 'Link' &&
            parentName !== 'Image' &&
            parentName !== 'Autolink' &&
            !overlapsSpan(from, to, hiddenMathSpans)
          ) {
            marks.push(mark('cm-md-link').range(from, to));
          }
        } else if (name === 'Image') {
          if (!touches(state, from, to)) {
            const { alt, rawUrl, title } = extractImageParts(state.doc, node.node);
            const classified = classifyImageUrl(rawUrl);
            if (classified) {
              replaces.push({
                from,
                to,
                deco: Decoration.replace({
                  widget: new ImageWidget(alt, title, rawUrl, null, null, ctx, classified),
                }),
              });
            }
          }
          return false;
        } else if (name === 'HTMLTag') {
          if (!processedHtml.has(from) && !overlapsSpan(from, to, hiddenMathSpans)) {
            marks.push(mark('cm-md-html').range(from, to));
          }
        } else if (name === 'Comment' || name === 'CommentBlock') {
          marks.push(mark('cm-md-comment').range(from, to));
        } else if (name === 'HTMLBlock') {
          marks.push(mark('cm-md-html').range(from, to));
          return false;
        } else if (name === 'HorizontalRule') {
          if (!touchesLines(state, from, to)) replaces.push({ from, to, deco: RULE });
        } else if (name === 'FencedCode') {
          const raw = touchesLines(state, from, to);
          const lines = lineRange(state, from, to);
          const marksPos: number[] = [];
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'CodeMark') marksPos.push(c.from);
          }
          for (const n of lines) {
            const l = state.doc.line(n);
            const fence = n === lines[0] || (marksPos.length > 1 && n === lines[lines.length - 1]);
            if (fence && !raw) {
              addLineClass(n, 'cm-md-codeblock cm-md-fence');
              hide(l.from, l.to);
            } else {
              addLineClass(n, 'cm-md-codeblock');
            }
          }
          return false;
        } else if (name === 'CodeBlock') {
          for (const n of lineRange(state, from, to)) {
            addLineClass(n, 'cm-md-codeblock');
          }
          return false;
        }
        return undefined;
      },
    });
  }

  const linesOut: Range<Decoration>[] = [];
  for (const [lineNum, acc] of lineAcc) {
    const l = state.doc.line(lineNum);
    const styles: string[] = [];
    if (acc.quoteDepth > 1) styles.push(`--cm-md-quote-depth:${acc.quoteDepth}`);
    if (acc.indentEm > 0) styles.push(`--cm-md-indent:${acc.indentEm}em`);
    if (acc.hangEm > 0) styles.push(`--cm-md-hang:${acc.hangEm}em`);
    const cls = Array.from(acc.classes).join(' ');
    const spec =
      styles.length > 0
        ? Decoration.line({ class: cls, attributes: { style: styles.join(';') } })
        : Decoration.line({ class: cls });
    linesOut.push(spec.range(l.from));
  }

  const disjointReplaces = filterDisjointReplaces(replaces);
  const mergedAtomRanges = mergeSpans(disjointReplaces.map(r => ({ from: r.from, to: r.to }))).map(
    s => HIDE.range(s.from, s.to),
  );
  const all = [...marks, ...linesOut, ...disjointReplaces];
  return { all, replaces: mergedAtomRanges };
}

/** The decorations for `state`'s Markdown, with the cursor's places left raw. */
export function livePreviewDecorations(state: EditorState): DecorationSet {
  const ctx = contextFromState(state);
  const { all } = collectDecorationsInSpans(state, [{ from: 0, to: state.doc.length }], ctx);
  return Decoration.set(all, true);
}

/** Top-level Markdown blocks touched by old or new selection, expanded to full line boundaries. */
function dirtySelectionSpans(tr: Transaction): TextSpan[] {
  const tree = syntaxTree(tr.state);
  const doc = tr.state.doc;
  const raw: TextSpan[] = [];

  const addTopBlockAt = (pos: number, side: -1 | 1) => {
    let cur: SyntaxNode = tree.resolveInner(pos, side);
    while (cur.parent && cur.parent.name !== 'Document') {
      cur = cur.parent;
    }
    const fromPos = cur.name === 'Document' ? pos : cur.from;
    const toPos = cur.name === 'Document' ? pos : cur.to;
    raw.push({
      from: doc.lineAt(fromPos).from,
      to: doc.lineAt(toPos).to,
    });
  };

  for (const sel of [tr.startState.selection, tr.state.selection]) {
    for (const r of sel.ranges) {
      addTopBlockAt(r.from, -1);
      addTopBlockAt(r.from, 1);
      if (r.to !== r.from) {
        addTopBlockAt(r.to, -1);
        addTopBlockAt(r.to, 1);
      }
      raw.push({
        from: doc.lineAt(r.from).from,
        to: doc.lineAt(r.to).to,
      });
    }
  }
  return mergeSpans(raw);
}

const setLive = StateEffect.define<boolean>();
const bumpAttachments = StateEffect.define<void>();

interface LiveFieldState {
  on: boolean;
  attachmentsRevision: number;
  decorations: DecorationSet;
  atomic: RangeSet<Decoration>;
}

const EMPTY_LIVE: LiveFieldState = {
  on: false,
  attachmentsRevision: 0,
  decorations: Decoration.none,
  atomic: Decoration.none,
};

const liveField = StateField.define<LiveFieldState>({
  create(state) {
    const on = liveMarkdownEnabled();
    if (!on) return EMPTY_LIVE;
    const { all, replaces } = collectDecorationsInSpans(
      state,
      [{ from: 0, to: state.doc.length }],
      contextFromState(state, 0),
    );
    return {
      on: true,
      attachmentsRevision: 0,
      decorations: Decoration.set(all, true),
      atomic: Decoration.set(replaces, true),
    };
  },
  update(value, tr) {
    let on = value.on;
    let switched = false;
    let attachmentsRevision = value.attachmentsRevision;
    let attachmentsChanged = false;
    for (const e of tr.effects) {
      if (e.is(setLive)) {
        on = e.value;
        switched = true;
      } else if (e.is(bumpAttachments)) {
        attachmentsRevision += 1;
        attachmentsChanged = true;
      }
    }
    if (!on) {
      return on === value.on && !attachmentsChanged
        ? value
        : { on: false, attachmentsRevision, decorations: Decoration.none, atomic: Decoration.none };
    }
    const ctx = contextFromState(tr.state, attachmentsRevision);
    if (
      !switched &&
      !attachmentsChanged &&
      !tr.docChanged &&
      syntaxTree(tr.state) === syntaxTree(tr.startState)
    ) {
      if (!tr.selection) return value;
      // Only top-level blocks whose selection state could have changed are recomputed.
      const dirty = dirtySelectionSpans(tr);
      if (dirty.length > 0) {
        const { all, replaces } = collectDecorationsInSpans(tr.state, dirty, ctx);
        const minFrom = Math.max(0, dirty[0].from - 1);
        const maxTo = Math.min(tr.state.doc.length, dirty[dirty.length - 1].to + 1);
        const keepOutsideDirty = (from: number, to: number) =>
          !dirty.some(d => from >= d.from && to <= d.to);
        return {
          on: true,
          attachmentsRevision,
          decorations: value.decorations.update({
            filter: keepOutsideDirty,
            filterFrom: minFrom,
            filterTo: maxTo,
            add: all,
            sort: true,
          }),
          atomic: value.atomic.update({
            filter: keepOutsideDirty,
            filterFrom: minFrom,
            filterTo: maxTo,
            add: replaces,
            sort: true,
          }),
        };
      }
      return value;
    }

    const { all, replaces } = collectDecorationsInSpans(
      tr.state,
      [{ from: 0, to: tr.state.doc.length }],
      ctx,
    );
    return {
      on: true,
      attachmentsRevision,
      decorations: Decoration.set(all, true),
      atomic: Decoration.set(replaces, true),
    };
  },
  provide: f => [
    EditorView.decorations.from(f, v => v.decorations),
    EditorView.atomicRanges.from(f, v => () => v.atomic),
    EditorView.contentAttributes.from(f, (v): Record<string, string> =>
      v.on ? { class: LIVE_CLASS } : {},
    ),
  ],
});

/** Cmd/Ctrl-clicking a link or `<a href>` opens validated http(s)/mailto targets safely. */
const linkClickHandler = EditorView.domEventHandlers({
  click(event, view) {
    if (!view.state.field(liveField).on) return false;
    if (!event.metaKey && !event.ctrlKey) return false;
    const target = event.target;
    if (!(target instanceof Node)) return false;
    let pos: number;
    try {
      pos = view.posAtDOM(target);
    } catch {
      return false;
    }
    let cur: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
    while (cur) {
      if (cur.name === 'Link' || cur.name === 'Autolink' || cur.name === 'URL') {
        const urlNode = cur.name === 'URL' ? cur : cur.getChild('URL');
        const raw = urlNode ? view.state.doc.sliceString(urlNode.from, urlNode.to).trim() : '';
        const cleaned = raw.startsWith('<') && raw.endsWith('>') ? raw.slice(1, -1) : raw;
        const safe = isSafeLinkUrl(cleaned);
        if (safe) {
          event.preventDefault();
          window.open(safe, '_blank', 'noopener,noreferrer');
          return true;
        }
        return false;
      }
      if (cur.name === 'HTMLTag') {
        const parsed = parseInlineHtmlTag(view.state.doc.sliceString(cur.from, cur.to));
        if (parsed?.name === 'a' && parsed.attrs.href) {
          const safe = isSafeLinkUrl(parsed.attrs.href);
          if (safe) {
            event.preventDefault();
            window.open(safe, '_blank', 'noopener,noreferrer');
            return true;
          }
        }
      }
      cur = cur.parent;
    }
    return false;
  },
});

const languageFor = (
  on: boolean,
  codeLanguages?: LiveMarkdownOptions['codeLanguages'],
): Extension =>
  on
    ? markdown({
        base: markdownLanguage,
        codeLanguages,
        // The language's own keymap, paste and completion change the text; the preview never does.
        addKeymap: false,
        pasteURLAsLink: false,
        completeHTMLTags: false,
      })
    : [];

/**
 * The extension for one Markdown cell's editor.
 * Zero-argument calls work with sensible defaults; notebook creation passes the
 * language registry, shared MathJax typesetter, and attachment hooks.
 */
export function liveMarkdownPreview(options: LiveMarkdownOptions = {}): Extension {
  const languageSlot = new Compartment();

  const follow = ViewPlugin.fromClass(
    class {
      private readonly onSwitch = (_: unknown, on: boolean) => {
        if (this.view.state.field(liveField).on !== on) {
          this.view.dispatch({
            effects: [
              setLive.of(on),
              languageSlot.reconfigure(languageFor(on, options.codeLanguages)),
            ],
          });
        }
      };

      private readonly unbindAttachments: (() => void) | undefined;

      constructor(private readonly view: EditorView) {
        changed.connect(this.onSwitch);
        this.unbindAttachments = options.onAttachmentsChange?.(() => {
          this.view.dispatch({ effects: bumpAttachments.of() });
        });
      }

      destroy() {
        changed.disconnect(this.onSwitch);
        this.unbindAttachments?.();
      }
    },
  );

  return [
    optionsFacet.of(options),
    liveField,
    linkClickHandler,
    follow,
    languageSlot.of(languageFor(liveMarkdownEnabled(), options.codeLanguages)),
  ];
}
