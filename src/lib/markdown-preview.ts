/**
 * Live Markdown preview (#672): a Markdown cell renders in place as you
 * type, the way Obsidian's live preview does. Headings, emphasis, inline
 * code, links, lists, block quotes, fenced code and horizontal rules show
 * as they will read, and the syntax that makes them is hidden. Where the
 * cursor or the selection is, the Markdown shows raw again. Running the
 * cell gives the full render, as before.
 *
 * It is CodeMirror decorations over the Markdown syntax tree, so the
 * document is never changed: undo, copy, selection and saving see the raw
 * text. Tables, math, images, task boxes and HTML stay raw.
 *
 * What counts as "where the cursor is":
 * - an inline element (emphasis, code, a link) shows raw while a selection
 *   range touches it, its edges included;
 * - a heading, list item, quote line or rule shows raw while a range
 *   touches its line;
 * - a fenced code block shows raw while a range touches any of its lines.
 *
 * The switch ("Live Markdown Preview") is the app's, kept in local storage
 * and off by default: this is a spike. Only Markdown cells' editors get the
 * extension (`jupyterlab.ts`); a code cell's never does.
 */
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxTree } from '@codemirror/language';
import {
  Compartment,
  type EditorState,
  type Extension,
  type Range,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  WidgetType,
} from '@codemirror/view';
import { Signal } from '@lumino/signaling';

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
const line = (cls: string) => Decoration.line({ class: cls });
const mark = (cls: string) => Decoration.mark({ class: cls });

/** A marker and the space after it (`# `, `> `), one range. */
function withSpace(state: EditorState, from: number, to: number): number {
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

/** The decorations for `state`'s Markdown, with the cursor's places left raw. */
export function livePreviewDecorations(state: EditorState): DecorationSet {
  const out: Range<Decoration>[] = [];
  const hide = (from: number, to: number) => {
    if (to > from) out.push(HIDE.range(from, to));
  };

  syntaxTree(state).iterate({
    enter: node => {
      const { name, from, to } = node;
      let m: RegExpExecArray | null;
      if ((m = /^ATXHeading([1-6])$/.exec(name))) {
        out.push(line(`cm-md-h cm-md-h${m[1]}`).range(state.doc.lineAt(from).from));
        if (!touchesLines(state, from, to)) {
          const hash = node.node.getChild('HeaderMark');
          // The closing `#`s of `# Title #` go too.
          if (hash) hide(hash.from, withSpace(state, hash.from, hash.to));
          const last = node.node.lastChild;
          if (last && last.name === 'HeaderMark' && last.from !== hash?.from) {
            const start =
              state.doc.sliceString(last.from - 1, last.from) === ' ' ? last.from - 1 : last.from;
            hide(start, last.to);
          }
        }
      } else if ((m = /^SetextHeading([12])$/.exec(name))) {
        // The underline stays: it's a line of its own, and hiding it would leave a blank one.
        const first = node.node.getChild('HeaderMark');
        const end = first ? state.doc.lineAt(first.from).from - 1 : to;
        for (const n of lineRange(state, from, Math.max(from, end))) {
          out.push(line(`cm-md-h cm-md-h${m[1]}`).range(state.doc.line(n).from));
        }
      } else if (name === 'StrongEmphasis' || name === 'Emphasis' || name === 'Strikethrough') {
        const cls =
          name === 'StrongEmphasis'
            ? 'cm-md-strong'
            : name === 'Emphasis'
              ? 'cm-md-em'
              : 'cm-md-del';
        out.push(mark(cls).range(from, to));
        if (!touches(state, from, to)) {
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'EmphasisMark' || c.name === 'StrikethroughMark') hide(c.from, c.to);
          }
        }
      } else if (name === 'InlineCode') {
        out.push(mark('cm-md-code').range(from, to));
        if (!touches(state, from, to)) {
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'CodeMark') hide(c.from, c.to);
          }
        }
      } else if (name === 'Link') {
        out.push(mark('cm-md-link').range(from, to));
        if (!touches(state, from, to)) {
          for (let c = node.node.firstChild; c; c = c.nextSibling) {
            if (['LinkMark', 'URL', 'LinkLabel', 'LinkTitle'].includes(c.name)) hide(c.from, c.to);
          }
        }
      } else if (name === 'Image') {
        // Images render in a later round: raw, and nothing inside them changes.
        return false;
      } else if (name === 'ListMark') {
        const bullet = node.node.parent?.parent?.name === 'BulletList';
        if (bullet && !touchesLines(state, from, to)) out.push(BULLET.range(from, to));
      } else if (name === 'Blockquote') {
        for (const n of lineRange(state, from, to)) {
          const l = state.doc.line(n);
          if (l.text.trim() !== '') out.push(line('cm-md-quote').range(l.from));
        }
      } else if (name === 'QuoteMark') {
        if (!touchesLines(state, from, to)) hide(from, withSpace(state, from, to));
      } else if (name === 'HorizontalRule') {
        if (!touchesLines(state, from, to)) out.push(RULE.range(from, to));
      } else if (name === 'FencedCode') {
        const raw = touchesLines(state, from, to);
        const lines = lineRange(state, from, to);
        const marks: number[] = [];
        for (let c = node.node.firstChild; c; c = c.nextSibling) {
          if (c.name === 'CodeMark') marks.push(c.from);
        }
        for (const n of lines) {
          const l = state.doc.line(n);
          const fence = n === lines[0] || (marks.length > 1 && n === lines[lines.length - 1]);
          if (fence && !raw) {
            out.push(line('cm-md-codeblock cm-md-fence').range(l.from));
            hide(l.from, l.to);
          } else {
            out.push(line('cm-md-codeblock').range(l.from));
          }
        }
      }
      return undefined;
    },
  });
  return Decoration.set(out, true);
}

/** Tells the field the switch changed. */
const setLive = StateEffect.define<boolean>();

interface Live {
  on: boolean;
  decorations: DecorationSet;
}

const liveField = StateField.define<Live>({
  create(state) {
    const on = liveMarkdownEnabled();
    return { on, decorations: on ? livePreviewDecorations(state) : Decoration.none };
  },
  update(value, tr) {
    let on = value.on;
    let switched = false;
    for (const e of tr.effects) {
      if (e.is(setLive)) {
        on = e.value;
        switched = true;
      }
    }
    if (!on) return on === value.on ? value : { on, decorations: Decoration.none };
    if (
      !switched &&
      !tr.docChanged &&
      !tr.selection &&
      syntaxTree(tr.state) === syntaxTree(tr.startState)
    ) {
      return value;
    }
    return { on, decorations: livePreviewDecorations(tr.state) };
  },
  provide: f => [
    EditorView.decorations.from(f, v => v.decorations),
    EditorView.contentAttributes.from(f, (v): Record<string, string> =>
      v.on ? { class: LIVE_CLASS } : {},
    ),
  ],
});

/** Follows the switch for as long as the editor lives. */
const follow = ViewPlugin.fromClass(
  class {
    private readonly onSwitch = (_: unknown, on: boolean) => {
      if (this.view.state.field(liveField).on !== on) {
        this.view.dispatch({
          effects: [setLive.of(on), languageSlot.reconfigure(languageFor(on))],
        });
      }
    };
    constructor(private readonly view: EditorView) {
      changed.connect(this.onSwitch);
    }
    destroy() {
      changed.disconnect(this.onSwitch);
    }
  },
);

/**
 * The Markdown syntax tree the preview reads. The app's Markdown cells have
 * no language of their own (their `text/x-ipythongfm` isn't one the editor
 * knows), so the preview brings it, only while it is on: with the switch
 * off a cell's editor is as it always was. GFM, as the rendered cell is.
 */
const languageSlot = new Compartment();
const languageFor = (on: boolean): Extension => (on ? markdown({ base: markdownLanguage }) : []);

/** The extension for one Markdown cell's editor. */
export function liveMarkdownPreview(): Extension {
  return [liveField, follow, languageSlot.of(languageFor(liveMarkdownEnabled()))];
}
