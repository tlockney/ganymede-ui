import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import { EditorSelection, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import type { Notebook } from '@jupyterlab/notebook';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import { Widget } from '@lumino/widgets';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;

const {
  LIVE_CLASS,
  liveMarkdownEnabled,
  liveMarkdownPreview,
  livePreviewDecorations,
  resetLiveMarkdownForTests,
  setLiveMarkdownEnabled,
} = await import('./markdown-preview');
const { createNotebook, createRendermime } = await import('./jupyterlab');
const { NotebookModel } = await import('@jupyterlab/notebook');

type Found = { from: number; to: number; kind: string };

/** Each decoration as `kind` (its class, `hide`, `bullet` or `rule`) and range. */
function found(state: EditorState): Found[] {
  const out: Found[] = [];
  const set = livePreviewDecorations(state);
  set.between(0, state.doc.length, (from, to, d) => {
    const spec = d.spec as { class?: string; widget?: { constructor: { name: string } } };
    const kind = spec.class ?? (spec.widget ? spec.widget.constructor.name : 'hide');
    out.push({ from, to, kind });
  });
  return out;
}

/** A state whose document is `doc` with `|` marking the cursor (or `[a|b]` a selection). */
function stateOf(doc: string, selection?: [number, number]): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage })],
    selection: selection ? EditorSelection.single(...selection) : undefined,
  });
  ensureSyntaxTree(state, state.doc.length, 5000);
  return state;
}

const at = (doc: string, cursor: number) => stateOf(doc, [cursor, cursor]);
const kinds = (state: EditorState, kind: string) =>
  found(state)
    .filter(f => f.kind === kind)
    .map(f => [f.from, f.to]);

beforeEach(() => resetLiveMarkdownForTests());
afterEach(() => resetLiveMarkdownForTests());

describe('the switch', () => {
  it('is off until turned on, and remembered', () => {
    expect(liveMarkdownEnabled()).toBe(false);
    setLiveMarkdownEnabled(true);
    expect(liveMarkdownEnabled()).toBe(true);
    expect(localStorage.getItem('ganymede-ui:live-markdown')).toBe('on');
    setLiveMarkdownEnabled(false);
    expect(liveMarkdownEnabled()).toBe(false);
    expect(localStorage.getItem('ganymede-ui:live-markdown')).toBeNull();
  });

  it('holds for the page when local storage throws', () => {
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    Storage.prototype.setItem = () => {
      throw new Error('blocked');
    };
    try {
      setLiveMarkdownEnabled(true);
      expect(liveMarkdownEnabled()).toBe(true);
    } finally {
      Storage.prototype.getItem = get;
      Storage.prototype.setItem = set;
    }
  });
});

describe('decorations per construct', () => {
  it('hides a heading’s hashes and sizes its line, until the cursor is on the line', () => {
    const doc = 'text\n## Title ##\nmore';
    const away = at(doc, 2);
    expect(kinds(away, 'cm-md-h cm-md-h2')).toEqual([[5, 5]]);
    // `## ` and ` ##`.
    expect(kinds(away, 'hide')).toEqual([
      [5, 8],
      [13, 16],
    ]);
    const on = at(doc, 10);
    expect(kinds(on, 'cm-md-h cm-md-h2')).toEqual([[5, 5]]);
    expect(kinds(on, 'hide')).toEqual([]);
  });

  it('sizes each level', () => {
    for (let n = 1; n <= 6; n++) {
      const doc = `${'#'.repeat(n)} T\n\nx`;
      expect(kinds(at(doc, doc.length), `cm-md-h cm-md-h${n}`)).toEqual([[0, 0]]);
    }
  });

  it('hides emphasis marks until a selection touches the element', () => {
    const doc = 'a **bold** and *it* ~~gone~~ end';
    const away = at(doc, doc.length);
    expect(kinds(away, 'cm-md-strong')).toEqual([[2, 10]]);
    expect(kinds(away, 'cm-md-em')).toEqual([[15, 19]]);
    expect(kinds(away, 'cm-md-del')).toEqual([[20, 28]]);
    expect(kinds(away, 'hide')).toEqual([
      [2, 4],
      [8, 10],
      [15, 16],
      [18, 19],
      [20, 22],
      [26, 28],
    ]);
    // Inside, or at an edge: that element is raw, the others stay rendered.
    expect(kinds(at(doc, 5), 'hide')).toEqual([
      [15, 16],
      [18, 19],
      [20, 22],
      [26, 28],
    ]);
    expect(kinds(at(doc, 2), 'hide')).not.toContainEqual([2, 4]);
    expect(kinds(at(doc, 10), 'hide')).not.toContainEqual([8, 10]);
    // A selection across two elements shows both.
    expect(kinds(stateOf(doc, [5, 17]), 'hide')).toEqual([
      [20, 22],
      [26, 28],
    ]);
  });

  it('hides the backticks of inline code', () => {
    const doc = 'run `ls -l` now';
    expect(kinds(at(doc, 0), 'cm-md-code')).toEqual([[4, 11]]);
    expect(kinds(at(doc, 0), 'hide')).toEqual([
      [4, 5],
      [10, 11],
    ]);
    expect(kinds(at(doc, 7), 'hide')).toEqual([]);
  });

  it('hides a link’s brackets and address, keeping its text', () => {
    const doc = 'see [docs](https://x.dev "t") ok';
    const away = at(doc, doc.length);
    expect(kinds(away, 'cm-md-link')).toEqual([[4, 29]]);
    // `[`, then `](https://x.dev "t")` as its parts.
    expect(kinds(away, 'hide').map(r => doc.slice(r[0], r[1]))).toEqual([
      '[',
      ']',
      '(',
      'https://x.dev',
      '"t"',
      ')',
    ]);
    expect(kinds(at(doc, 6), 'hide')).toEqual([]);
  });

  it('leaves images and autolinks raw', () => {
    const doc = '![**alt**](pic.png) <https://x.dev>';
    expect(found(at(doc, doc.length))).toEqual([]);
  });

  it('shows a bullet for `-`, `*` and `+`, and keeps numbers', () => {
    const doc = '- one\n* two\n+ three\n\n1. four\n2. five';
    const away = at(doc, doc.length);
    expect(kinds(away, 'BulletWidget')).toEqual([
      [0, 1],
      [6, 7],
      [12, 13],
    ]);
    // The cursor's line is raw; the others still show.
    expect(kinds(at(doc, 8), 'BulletWidget')).toEqual([
      [0, 1],
      [12, 13],
    ]);
  });

  it('hides quote marks per line, and lines up the whole quote', () => {
    const doc = '> one\n> two\n\nafter';
    const away = at(doc, doc.length);
    expect(kinds(away, 'cm-md-quote')).toEqual([
      [0, 0],
      [6, 6],
    ]);
    expect(kinds(away, 'hide')).toEqual([
      [0, 2],
      [6, 8],
    ]);
    expect(kinds(at(doc, 3), 'hide')).toEqual([[6, 8]]);
    // The quote's styling stays on the line the cursor is on.
    expect(kinds(at(doc, 3), 'cm-md-quote')).toHaveLength(2);
  });

  it('replaces a rule, until the cursor is on it', () => {
    const doc = 'above\n\n---\n\nbelow';
    expect(kinds(at(doc, 0), 'RuleWidget')).toEqual([[7, 10]]);
    expect(kinds(at(doc, 8), 'RuleWidget')).toEqual([]);
  });

  it('does not take a setext underline for a rule or hide it', () => {
    const doc = 'Title\n---\n\nx';
    const s = at(doc, doc.length);
    expect(kinds(s, 'RuleWidget')).toEqual([]);
    expect(kinds(s, 'cm-md-h cm-md-h2')).toEqual([[0, 0]]);
    expect(kinds(s, 'hide')).toEqual([]);
  });
});

describe('fenced code across lines', () => {
  const doc = 'before\n```ts\nconst a = `x`;\nlet b;\n```\nafter';
  // Lines start at 0, 7, 13, 28, 35, 39.
  const lines = [7, 13, 28, 35];

  it('boxes every line and hides both fences while the cursor is outside', () => {
    const away = at(doc, 2);
    expect(kinds(away, 'cm-md-codeblock').map(r => r[0])).toEqual([13, 28]);
    expect(kinds(away, 'cm-md-codeblock cm-md-fence').map(r => r[0])).toEqual([7, 35]);
    expect(kinds(away, 'hide')).toEqual([
      [7, 12],
      [35, 38],
    ]);
  });

  it('shows the fences when the cursor is on any line of the block', () => {
    for (const cursor of lines.map(l => l + 2)) {
      const s = at(doc, cursor);
      expect(kinds(s, 'cm-md-codeblock').map(r => r[0])).toEqual(lines);
      expect(kinds(s, 'cm-md-codeblock cm-md-fence')).toEqual([]);
      expect(kinds(s, 'hide')).toEqual([]);
    }
  });

  it('shows the fences when a selection from outside reaches into the block', () => {
    expect(kinds(stateOf(doc, [2, 20]), 'hide')).toEqual([]);
  });

  it('decorates the code inside as code, not as Markdown', () => {
    // The backticks in the code line are not inline code.
    expect(kinds(at(doc, 2), 'cm-md-code')).toEqual([]);
  });

  it('an unclosed fence hides only its opening line', () => {
    const open = 'a\n```\ncode\nmore';
    const s = at(open, 0);
    expect(kinds(s, 'cm-md-codeblock').map(r => r[0])).toEqual([6, 11]);
    expect(kinds(s, 'cm-md-codeblock cm-md-fence').map(r => r[0])).toEqual([2]);
  });
});

describe('multi-line constructs', () => {
  it('shows a multi-line emphasis raw while the cursor is on any of its lines', () => {
    const doc = 'start *one\ntwo* end';
    expect(kinds(at(doc, doc.length), 'hide')).toHaveLength(2);
    expect(kinds(at(doc, 13), 'hide')).toEqual([]);
  });

  it('keeps a multi-line list’s other items rendered', () => {
    const doc = '- a\n- b\n- c';
    expect(kinds(at(doc, 5), 'BulletWidget')).toEqual([
      [0, 1],
      [8, 9],
    ]);
  });
});

describe('the extension on an editor', () => {
  function view(doc: string, cursor = 0) {
    const v = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc,
        extensions: [liveMarkdownPreview()],
        selection: { anchor: cursor },
      }),
    });
    ensureSyntaxTree(v.state, v.state.doc.length, 5000);
    // Re-dispatch so the field sees the finished tree.
    v.dispatch({ selection: { anchor: cursor } });
    return v;
  }
  const hidden = (v: EditorView) => {
    let n = 0;
    const field = v.state.facet(EditorView.decorations);
    for (const f of field) {
      const set = typeof f === 'function' ? f(v) : f;
      set.between(0, v.state.doc.length, () => void n++);
    }
    return n;
  };

  it('does nothing while the switch is off', () => {
    const v = view('# T\n\n**b**');
    expect(hidden(v)).toBe(0);
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(false);
    v.destroy();
  });

  it('follows the switch live, in editors already open', () => {
    const v = view('# T\n\n**b**', 9);
    setLiveMarkdownEnabled(true);
    expect(hidden(v)).toBeGreaterThan(0);
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(true);
    setLiveMarkdownEnabled(false);
    expect(hidden(v)).toBe(0);
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(false);
    v.destroy();
  });

  it('follows another window’s change', () => {
    const v = view('# T\n\nx', 5);
    localStorage.setItem('ganymede-ui:live-markdown', 'on');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ganymede-ui:live-markdown' }));
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(true);
    v.destroy();
  });

  it('starts rendered when the switch is already on, and moves with the cursor', () => {
    setLiveMarkdownEnabled(true);
    const doc = 'x\n\n**bold**';
    const v = view(doc, 0);
    expect(v.contentDOM.querySelector('.cm-md-strong')).not.toBeNull();
    // Hidden marks leave only the text; the cursor inside brings them back.
    expect(v.contentDOM.textContent).toBe('xbold');
    v.dispatch({ selection: { anchor: 6 } });
    expect(v.contentDOM.textContent).toContain('**bold**');
    v.destroy();
  });

  it('leaves the document alone: edits, undo text and copy see the raw Markdown', () => {
    setLiveMarkdownEnabled(true);
    const doc = '# T\n\n**b**';
    const v = view(doc, 0);
    expect(v.state.doc.toString()).toBe(doc);
    expect(v.state.sliceDoc(0, v.state.doc.length)).toBe(doc);
    v.dispatch({ changes: { from: 0, insert: 'x' } });
    expect(v.state.doc.toString()).toBe('x' + doc);
    v.destroy();
  });

  it('disconnects from the switch when the editor is destroyed', () => {
    setLiveMarkdownEnabled(true);
    const v = view('# T', 0);
    const dispatch = vi.spyOn(v, 'dispatch');
    v.destroy();
    // Nothing is dispatched into a destroyed view.
    setLiveMarkdownEnabled(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('Markdown cells and code cells of a notebook', () => {
  let notebook: Notebook;
  let holder: HTMLDivElement;

  beforeEach(() => {
    notebook = createNotebook(createRendermime('', {} as never));
    const model = new NotebookModel();
    model.fromJSON({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: {},
      cells: [
        {
          cell_type: 'code',
          id: 'a',
          source: '# not markdown\nx = **2',
          metadata: {},
          outputs: [],
          execution_count: null,
        },
        { cell_type: 'markdown', id: 'b', source: '# Title\n\n**bold**', metadata: {} },
      ],
    });
    notebook.model = model;
    holder = document.createElement('div');
    document.body.append(holder);
    Widget.attach(notebook, holder);
    notebook.activeCellIndex = 0;
  });
  afterEach(() => {
    notebook.dispose();
    holder.remove();
  });

  const content = (i: number) =>
    (notebook.widgets[i]!.editor as CodeMirrorEditor).editor.contentDOM;

  it('previews Markdown cells only, while the switch is on', () => {
    setLiveMarkdownEnabled(true);
    // The editors made while it is on, and the ones already there, both follow.
    expect(content(1).classList.contains(LIVE_CLASS)).toBe(true);
    expect(content(0).classList.contains(LIVE_CLASS)).toBe(false);
    setLiveMarkdownEnabled(false);
    expect(content(1).classList.contains(LIVE_CLASS)).toBe(false);
  });

  it('leaves a Markdown cell’s editor as it was while the switch is off', () => {
    const state = (notebook.widgets[1]!.editor as CodeMirrorEditor).editor.state;
    expect(syntaxTree(state).type.name).not.toBe('Document');
    expect(content(1).querySelector('.cm-md-strong, .cm-md-h1')).toBeNull();
    expect(content(1).textContent).toBe('# Title**bold**');
  });

  it('a Markdown cell made while the switch is on is rendered from the start', async () => {
    setLiveMarkdownEnabled(true);
    const model = notebook.model!;
    model.sharedModel.addCell({ cell_type: 'markdown', source: '*em*' });
    expect(content(2).classList.contains(LIVE_CLASS)).toBe(true);
    // The Markdown language loads after the editor is made; the preview follows it.
    await vi.waitFor(() => expect(content(2).querySelector('.cm-md-em')).not.toBeNull());
  });
});
