import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { javascript } from '@codemirror/lang-javascript';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import {
  defaultHighlightStyle,
  ensureSyntaxTree,
  forceParsing,
  LanguageDescription,
  syntaxHighlighting,
  syntaxTree,
  syntaxTreeAvailable,
} from '@codemirror/language';
import { EditorSelection, EditorState, type Extension } from '@codemirror/state';
import { EditorView, runScopeHandlers } from '@codemirror/view';
import type { Notebook } from '@jupyterlab/notebook';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import { Widget } from '@lumino/widgets';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();
globalThis.requestIdleCallback ??= ((cb: () => void) =>
  setTimeout(cb, 0)) as unknown as typeof requestIdleCallback;

const {
  LIVE_CLASS,
  liveMarkdownEnabled,
  liveMarkdownPreview,
  liveMarkdownResolver,
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

  it('renders autolinks cleanly without angle brackets and marks bare URLs', () => {
    const doc = 'visit <https://x.dev> and https://y.dev/docs now';
    const away = at(doc, doc.length);
    const links = kinds(away, 'cm-md-link').sort((a, b) => a[0] - b[0]);
    expect(links).toEqual([
      [6, 21],
      [26, 44],
    ]);
    expect(kinds(away, 'hide').map(r => doc.slice(r[0], r[1]))).toEqual(['<', '>']);
    // Cursor touching the autolink reveals `<` and `>`.
    expect(kinds(at(doc, 10), 'hide')).toEqual([]);
  });

  it('shows a bullet for `-`, `*` and `+`, and formats ordered lists', () => {
    const doc = '- one\n* two\n+ three\n\n1. four\n1. five\n\ntail';
    const away = at(doc, doc.length);
    expect(kinds(away, 'BulletWidget')).toEqual([
      [0, 1],
      [6, 7],
      [12, 13],
    ]);
    // Ordered list keeps `1.` styled and normalizes repeated `1.` to `2.` when outside cursor.
    expect(kinds(away, 'cm-md-order')).toEqual([[21, 23]]);
    expect(kinds(away, 'OrderedMarkerWidget')).toEqual([[29, 31]]);
    // Cursor on item 2 reveals its raw `1.` marker instead of `2.`.
    expect(kinds(at(doc, 32), 'OrderedMarkerWidget')).toEqual([]);
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

  it('styles setext headings and collapses their underline until the cursor touches the heading', () => {
    const doc = 'Title\n---\n\nx';
    const away = at(doc, doc.length);
    expect(kinds(away, 'RuleWidget')).toEqual([]);
    expect(kinds(away, 'cm-md-h cm-md-h2')).toEqual([[0, 0]]);
    // Collapses `\n---` cleanly so no blank line remains below the heading.
    expect(kinds(away, 'hide')).toEqual([[5, 9]]);
    expect(kinds(at(doc, 2), 'hide')).toEqual([]);
    expect(kinds(at(doc, 7), 'hide')).toEqual([]);
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

  it('styles every line of a quote, a bare `>` line too', () => {
    const doc = '> one\n>\n> two';
    expect(kinds(at(doc, doc.length), 'cm-md-quote').map(r => r[0])).toEqual([0, 6, 8]);
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

  it('adds no keymap, paste handling or completion: only decorations', () => {
    setLiveMarkdownEnabled(true);
    const doc = '- one';
    const v = view(doc, doc.length);
    // Markdown's own Enter would continue the list with `- `.
    const enter = new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13 });
    expect(runScopeHandlers(v, enter, 'editor')).toBe(false);
    expect(v.state.doc.toString()).toBe(doc);
    // Markdown's own paste would turn a URL over a selection into a link.
    v.dispatch({ selection: { anchor: 2, head: 5 } });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.assign(paste, { clipboardData: { getData: () => 'https://x.dev' } });
    v.contentDOM.dispatchEvent(paste);
    expect(v.state.doc.toString()).toBe('- https://x.dev');
    v.destroy();
  });

  it('decorates what the parser reaches later, with no edit or cursor move', () => {
    setLiveMarkdownEnabled(true);
    const filler = 'plain words in a paragraph\n\n'.repeat(60000);
    const doc = `${filler}a **late** one`;
    // Not `view()`: it parses to the end before the test looks.
    const v = new EditorView({
      parent: document.body,
      state: EditorState.create({ doc, extensions: [liveMarkdownPreview()] }),
    });
    // The first parse stops short, so the end isn't decorated yet.
    expect(syntaxTreeAvailable(v.state, doc.length)).toBe(false);
    expect(hidden(v)).toBe(0);
    forceParsing(v, doc.length, 10_000);
    expect(syntaxTreeAvailable(v.state, doc.length)).toBe(true);
    expect(hidden(v)).toBeGreaterThan(0);
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

  it('wires fenced-code languages and cell attachments inside notebook Markdown cells (#673)', async () => {
    setLiveMarkdownEnabled(true);
    const model = notebook.model!;
    model.sharedModel.addCell({
      cell_type: 'markdown',
      source: 'top\n```python\ndef hi():\n  return 1\n```\n![pic](attachment:a.png)',
      attachments: { 'a.png': { 'image/png': 'iVBORw0KGgo=' } },
    });
    const cellView = (notebook.widgets[2]!.editor as CodeMirrorEditor).editor;
    await vi.waitFor(
      () => {
        ensureSyntaxTree(cellView.state, cellView.state.doc.length, 5000);
        expect(cellView.contentDOM.querySelector('img.cm-md-image-img')?.getAttribute('src')).toBe(
          'data:image/png;base64,iVBORw0KGgo=',
        );
        const codeLine = cellView.contentDOM.querySelectorAll(
          '.cm-md-codeblock:not(.cm-md-fence)',
        )[0];
        expect(codeLine?.querySelectorAll('span').length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
  });
});

describe('follow-up enhancements and review coverage (#673)', () => {
  beforeEach(() => resetLiveMarkdownForTests());
  afterEach(() => resetLiveMarkdownForTests());

  function fakeTypesetter(): {
    typesetter: IRenderMime.ILatexTypesetter;
    calls: string[];
  } {
    const calls: string[] = [];
    const typesetter: IRenderMime.ILatexTypesetter = {
      typeset: async (node: HTMLElement) => {
        const text = node.textContent ?? '';
        calls.push(text);
        const mjx = document.createElement('mjx-container');
        mjx.className = 'MathJax';
        if (text.startsWith('$$')) mjx.setAttribute('display', 'true');
        mjx.textContent = `rendered:${text}`;
        node.replaceChildren(mjx);
      },
    };
    return { typesetter, calls };
  }

  function makeView(
    doc: string,
    cursor = 0,
    options?: Parameters<typeof liveMarkdownPreview>[0],
    extraExtensions: Extension = [],
  ): EditorView {
    const extList = Array.isArray(extraExtensions) ? extraExtensions : [extraExtensions];
    const v = new EditorView({
      parent: document.body,
      state: EditorState.create({
        doc,
        extensions: [liveMarkdownPreview(options), ...extList],
        selection: { anchor: cursor },
      }),
    });
    ensureSyntaxTree(v.state, v.state.doc.length, 5000);
    v.dispatch({ selection: { anchor: cursor } });
    return v;
  }

  it('offers no HTML tag autocompletion from Markdown (completeHTMLTags: false, #674)', () => {
    setLiveMarkdownEnabled(true);
    const v = makeView('<di', 3);
    const sources = v.state.languageDataAt<unknown>('autocomplete', 3);
    expect(sources).toEqual([]);
    v.destroy();
  });

  it('turns off open editors when another window clears localStorage (storage key === null, #674)', () => {
    setLiveMarkdownEnabled(true);
    const v = makeView('# Title\n\n**bold**', 0);
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(true);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(v.contentDOM.classList.contains(LIVE_CLASS)).toBe(false);
    expect(v.contentDOM.querySelector('.cm-md-strong')).toBeNull();
    v.destroy();
  });

  it('renders GFM tables as an aligned grid outside cursor and reveals raw Markdown inside', () => {
    setLiveMarkdownEnabled(true);
    const { typesetter } = fakeTypesetter();
    const doc = [
      'intro',
      '',
      '| Name | Count | Notes |',
      '| :--- | :---: | ---: |',
      '| **alpha** | $x^2$ | `ok` |',
      '| [site](https://x.dev) | 42 | <br>end |',
      '',
      'outro',
    ].join('\n');
    const v = makeView(doc, 0, { latexTypesetter: typesetter });
    const table = v.dom.querySelector<HTMLTableElement>('.cm-md-table');
    expect(table).not.toBeNull();
    const headers = Array.from(table!.querySelectorAll('th'));
    expect(headers.map(h => h.textContent)).toEqual(['Name', 'Count', 'Notes']);
    expect(headers.map(h => h.style.textAlign)).toEqual(['left', 'center', 'right']);
    expect(table!.querySelector('td strong')?.textContent).toBe('alpha');
    expect(table!.querySelector('td code')?.textContent).toBe('ok');
    expect(table!.querySelector<HTMLAnchorElement>('td a')?.getAttribute('href')).toBe(
      'https://x.dev',
    );
    expect(table!.querySelector('td br')).not.toBeNull();

    // Clicking a cell places the cursor inside it and reveals raw pipes.
    const alphaCell = table!.querySelector<HTMLElement>('tbody td')!;
    alphaCell.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(v.dom.querySelector('.cm-md-table')).toBeNull();
    expect(v.state.selection.main.head).toBe(Number(alphaCell.dataset.from));

    // Moving cursor back outside restores the rendered grid.
    v.dispatch({ selection: { anchor: doc.length } });
    expect(v.dom.querySelector('.cm-md-table')).not.toBeNull();
    v.destroy();
  });

  it('renders inline and display MathJax math safely outside cursor, ignoring code and escapes', async () => {
    setLiveMarkdownEnabled(true);
    const { typesetter, calls } = fakeTypesetter();
    const doc = [
      'start',
      '',
      'Inline $a_1 + 2^n$ and literal `$code$` and \\$5.',
      '',
      '$$',
      '\\sum_{i=1}^n x_i',
      '$$',
      '',
      'end',
    ].join('\n');
    const v = makeView(doc, 0, { latexTypesetter: typesetter });

    await vi.waitFor(() => {
      const rendered = v.dom.querySelectorAll('mjx-container');
      expect(rendered.length).toBe(2);
    });
    expect(calls).toEqual(['$a_1 + 2^n$', '$$\n\\sum_{i=1}^n x_i\n$$']);
    // Underscores and carets inside math did not create conflicting emphasis spans.
    expect(v.contentDOM.querySelector('.cm-md-em')).toBeNull();
    // Escaped dollar and inline code stay literal.
    expect(v.contentDOM.textContent).toContain('$code$');
    expect(v.contentDOM.textContent).toContain('\\$5');

    // Touching the inline formula expands it raw while display math stays rendered.
    const inlinePos = doc.indexOf('a_1');
    v.dispatch({ selection: { anchor: inlinePos } });
    expect(v.dom.querySelectorAll('mjx-container').length).toBe(1);
    expect(v.contentDOM.textContent).toContain('$a_1 + 2^n$');

    // Moving away again hits the per-typesetter cache without another typeset call.
    v.dispatch({ selection: { anchor: doc.length } });
    expect(v.dom.querySelectorAll('mjx-container').length).toBe(2);
    expect(calls).toHaveLength(2);
    v.destroy();
  });

  it('renders safe inline images (external, attachment, relative resolver) and blocks unsafe URLs', async () => {
    setLiveMarkdownEnabled(true);
    const pngBase64 = 'iVBORw0KGgo=';
    let attachments: Record<string, Record<string, string>> = {
      'shot.png': { 'image/png': pngBase64 },
    };
    const attachmentListeners = new Set<() => void>();
    const resolver: IRenderMime.IResolver = {
      resolveUrl: async url => `assets/${url}`,
      getDownloadUrl: async path => `/files/${path}`,
    };

    const doc = [
      'top',
      '![ext](https://example.com/a.png "hi")',
      '![att](attachment:shot.png)',
      '![missing](attachment:nope.png)',
      '![rel](chart.png)',
      '![bad1](javascript:alert(1))',
      '![bad2](data:image/svg+xml;base64,PHN2Zz4=)',
      'end',
    ].join('\n');

    const v = makeView(
      doc,
      0,
      {
        attachments: () => attachments,
        onAttachmentsChange: fn => {
          attachmentListeners.add(fn);
          return () => {
            attachmentListeners.delete(fn);
          };
        },
      },
      [liveMarkdownResolver.of(resolver)],
    );

    await vi.waitFor(() => {
      const imgs = Array.from(v.dom.querySelectorAll<HTMLImageElement>('img.cm-md-image-img'));
      expect(imgs.map(i => i.getAttribute('src'))).toEqual([
        'https://example.com/a.png',
        `data:image/png;base64,${pngBase64}`,
        '/files/assets/chart.png',
      ]);
    });
    expect(v.dom.querySelector('.cm-md-image-missing .cm-md-image-fallback')?.textContent).toBe(
      '[image: missing]',
    );
    // Unsafe image schemes stay raw and never create an `<img>` element.
    const imgs = Array.from(v.dom.querySelectorAll<HTMLImageElement>('img.cm-md-image-img'));
    expect(imgs).toHaveLength(3);
    expect(imgs.every(img => !/^javascript:/i.test(img.getAttribute('src') ?? ''))).toBe(true);
    expect(imgs.every(img => !(img.getAttribute('src') ?? '').includes('svg+xml'))).toBe(true);
    expect(v.contentDOM.textContent).toContain('![bad1](javascript:alert(1))');
    expect(v.contentDOM.textContent).toContain('![bad2](data:image/svg+xml;base64,PHN2Zz4=)');

    // Updating cell attachments updates rendered attachment images dynamically.
    attachments = { 'shot.png': { 'image/jpeg': 'AAAA' } };
    for (const fn of attachmentListeners) fn();
    await vi.waitFor(() => {
      const srcs = Array.from(v.dom.querySelectorAll('img.cm-md-image-img')).map(i =>
        i.getAttribute('src'),
      );
      expect(srcs).toContain('data:image/jpeg;base64,AAAA');
    });

    // Cursor inside an image reveals its raw Markdown.
    v.dispatch({ selection: { anchor: doc.indexOf('https://') } });
    expect(v.contentDOM.textContent).toContain('![ext](https://example.com/a.png "hi")');
    v.destroy();
  });

  it('renders interactive task checkboxes without moving the cursor onto the task line', () => {
    setLiveMarkdownEnabled(true);
    const doc = 'top\n- [ ] buy milk\n- [x] ship\n1. [ ] ordered task';
    const v = makeView(doc, 0);
    const boxes = Array.from(v.dom.querySelectorAll<HTMLInputElement>('.cm-md-checkbox'));
    expect(boxes.map(b => b.checked)).toEqual([false, true, false]);
    // Bullet `- ` is hidden on task items, while ordered `1.` remains visible.
    expect(v.dom.querySelectorAll('.cm-md-bullet')).toHaveLength(0);
    expect(v.dom.querySelector('.cm-md-order')?.textContent).toBe('1.');
    expect(v.dom.querySelector('.cm-md-task-done')?.textContent).toContain('ship');

    // Clicking the unchecked box toggles `[ ]` -> `[x]` cleanly in the underlying text.
    boxes[0].checked = true;
    boxes[0].dispatchEvent(new Event('change', { bubbles: true }));
    expect(v.state.doc.toString()).toContain('- [x] buy milk');
    expect(v.state.selection.main.head).toBe(0);

    // Moving cursor onto the task line reveals raw `- [x] buy milk`.
    v.dispatch({ selection: { anchor: doc.indexOf('milk') } });
    expect(v.contentDOM.textContent).toContain('- [x] buy milk');
    v.destroy();
  });

  it('applies hanging indents on wrapped list and quote lines', () => {
    setLiveMarkdownEnabled(true);
    const doc = [
      '0',
      '  - nested wrapped bullet line',
      '',
      '10. double-digit ordered item',
      '',
      '> outer quote',
      '> > nested quote',
    ].join('\n');
    const v = makeView(doc, 0);
    const liLines = Array.from(v.contentDOM.querySelectorAll<HTMLElement>('.cm-line.cm-md-li'));
    expect(liLines).toHaveLength(2);
    for (const el of liLines) {
      expect(el.style.getPropertyValue('--cm-md-indent')).not.toBe('');
      expect(el.style.getPropertyValue('--cm-md-hang')).not.toBe('');
    }
    const quoteLines = Array.from(
      v.contentDOM.querySelectorAll<HTMLElement>('.cm-line.cm-md-quote'),
    );
    expect(quoteLines).toHaveLength(2);
    expect(quoteLines[1].style.getPropertyValue('--cm-md-quote-depth').trim()).toBe('2');
    v.destroy();
  });

  it('highlights fenced code blocks with the configured codeLanguages registry', async () => {
    setLiveMarkdownEnabled(true);
    const jsDesc = LanguageDescription.of({
      name: 'javascript',
      alias: ['js'],
      load: async () => javascript(),
    });
    const doc = 'top\n```js\nconst answer = 42;\n```\nend';
    const v = makeView(doc, 0, { codeLanguages: [jsDesc] }, [
      syntaxHighlighting(defaultHighlightStyle),
    ]);
    await vi.waitFor(
      () => {
        ensureSyntaxTree(v.state, v.state.doc.length, 5000);
        // Code lines contain nested highlight token spans once JS loads.
        const codeLine = v.contentDOM.querySelectorAll('.cm-md-codeblock:not(.cm-md-fence)')[0];
        expect(codeLine?.querySelectorAll('span').length ?? 0).toBeGreaterThan(0);
      },
      { timeout: 4000 },
    );
    v.destroy();
  });

  it('renders safe inline HTML outside cursor and leaves unsafe scripts raw', () => {
    setLiveMarkdownEnabled(true);
    const doc = [
      'top',
      '<b>bold</b> <kbd>⌘K</kbd> <mark>hi</mark> <sub>2</sub> <sup>3</sup> <u>u</u> <a href="https://x.dev">link</a> a<br>b',
      '<a href="javascript:alert(1)">bad</a> <script>evil()</script>',
    ].join('\n');
    const v = makeView(doc, 0);
    expect(v.contentDOM.querySelector('.cm-md-strong')?.textContent).toBe('bold');
    expect(v.contentDOM.querySelector('.cm-md-kbd')?.textContent).toBe('⌘K');
    expect(v.contentDOM.querySelector('.cm-md-mark')?.textContent).toBe('hi');
    expect(v.contentDOM.querySelector('.cm-md-sub')?.textContent).toBe('2');
    expect(v.contentDOM.querySelector('.cm-md-sup')?.textContent).toBe('3');
    expect(v.contentDOM.querySelector('.cm-md-u')?.textContent).toBe('u');
    expect(v.contentDOM.querySelector('.cm-md-link')?.textContent).toBe('link');
    expect(v.contentDOM.querySelector('.cm-md-br br')).not.toBeNull();
    // Tags for safe constructs are hidden while unsafe link/script remain visible & inert.
    expect(v.contentDOM.textContent).not.toContain('<b>');
    expect(v.contentDOM.textContent).toContain('<a href="javascript:alert(1)">bad</a>');
    expect(v.contentDOM.textContent).toContain('<script>evil()</script>');
    expect(v.contentDOM.querySelector('script')).toBeNull();

    v.dispatch({ selection: { anchor: doc.indexOf('bold') } });
    expect(v.contentDOM.textContent).toContain('<b>bold</b>');
    v.destroy();
  });

  it('skips hidden replacement ranges atomically for cursor movement without blocking revealed editing', () => {
    setLiveMarkdownEnabled(true);
    const doc = 'before [go](https://example.com) after';
    const v = makeView(doc, 0);
    const atoms = v.state.facet(EditorView.atomicRanges).flatMap(f => {
      const out: [number, number][] = [];
      f(v).between(0, doc.length, (from, to) => {
        out.push([from, to]);
      });
      return out;
    });
    expect(atoms).toContainEqual([7, 8]); // `[`
    expect(atoms).toContainEqual([10, 32]); // `](https://example.com)`
    // Jumping right over hidden `](https://example.com)` skips the whole URL atomically.
    const afterText = v.moveByChar(EditorSelection.cursor(doc.indexOf('](https://')), true);
    expect(afterText.head).toBe(doc.indexOf(' after'));

    // Stepping into `[go]` reveals the markers and removes their atomic ranges for char editing.
    v.dispatch({ selection: { anchor: 9 } });
    const revealedAtoms = v.state.facet(EditorView.atomicRanges).flatMap(f => {
      const out: number[] = [];
      f(v).between(7, 32, from => void out.push(from));
      return out;
    });
    expect(revealedAtoms).toEqual([]);
    v.destroy();
  });

  it('keeps cursor movement fast on a large multi-thousand-line Markdown cell', () => {
    setLiveMarkdownEnabled(true);
    const chunk =
      '## Heading\n\nParagraph with **bold**, *em*, and [link](https://x.dev).\n\n- item one\n- item two\n\n';
    const doc = chunk.repeat(600); // ~4,800 lines
    const v = makeView(doc, 0);
    ensureSyntaxTree(v.state, doc.length, 5000);
    const start = performance.now();
    for (let i = 0; i < 10; i++) {
      v.dispatch({ selection: { anchor: (i * 500) % doc.length } });
    }
    const elapsedMs = performance.now() - start;
    // Incremental top-level block updates on selection changes avoid full-doc rebuilds.
    expect(elapsedMs).toBeLessThan(1000);
    v.destroy();
  });
});
