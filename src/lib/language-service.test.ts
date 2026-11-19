import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import { StateEffect } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { Signal } from '@lumino/signaling';
import { fakeLanguageKernel, type FakeOptions } from '../test/language-kernel';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { NotebookModel } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');
const {
  LANGUAGE_TARGET,
  LANGUAGE_TIMEOUT_MS,
  applyEdits,
  createLanguageService,
  signatureParts,
  toLocations,
  toRenameAnswer,
  toSignature,
  wordAt,
} = await import('./language-service');

const code = (id: string, source: string): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source,
  metadata: {},
  outputs: [],
  execution_count: null,
});

// Widget 0 and 2 are code, 1 is Markdown: a code cell's index in `cells`
// is not its index in the notebook. Cell 0 has an emoji before `total`.
const CELL0 = "const note = '😀'; const total = 1";
const CELL2 = 'console.log(total, total)';
const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    code('a', CELL0),
    { cell_type: 'markdown', id: 'b', source: 'total is one', metadata: {} },
    code('c', CELL2),
  ],
};
/** `total` in CELL0, in code points and in UTF-16 units. */
const T0 = { cp: [24, 29], utf16: [25, 30] };

// ---- pure ----

describe('toSignature', () => {
  it('reads label, documentation, parameters and the active one', () => {
    expect(
      toSignature({
        label: 'f(a: number): void',
        documentation: 'Does f.',
        parameters: [{ label: 'a: number', documentation: 'The a.' }],
        activeParameter: 0,
      }),
    ).toEqual({
      label: 'f(a: number): void',
      documentation: 'Does f.',
      parameters: [{ label: 'a: number', documentation: 'The a.' }],
      activeParameter: 0,
    });
  });

  it('is null for null and for what is not a signature', () => {
    expect(toSignature(null)).toBeNull();
    expect(toSignature('f()')).toBeNull();
    expect(toSignature({ label: '' })).toBeNull();
    expect(toSignature({ label: 'f(a)', parameters: [{ documentation: 'x' }] })).toBeNull();
  });

  it('fills what is missing', () => {
    expect(toSignature({ label: 'f()' })).toEqual({
      label: 'f()',
      documentation: '',
      parameters: [],
      activeParameter: -1,
    });
  });
});

describe('signatureParts', () => {
  const sig = (activeParameter: number) => ({
    label: 'f(f: number, g: string): void',
    documentation: '',
    parameters: [
      { label: 'f: number', documentation: '' },
      { label: 'g: string', documentation: '' },
    ],
    activeParameter,
  });

  it('marks the active parameter, past the function’s own name', () => {
    expect(signatureParts(sig(0))).toEqual({
      before: 'f(',
      active: 'f: number',
      after: ', g: string): void',
    });
    expect(signatureParts(sig(1))).toEqual({
      before: 'f(f: number, ',
      active: 'g: string',
      after: '): void',
    });
  });

  it('marks nothing when the active parameter is past the end', () => {
    expect(signatureParts(sig(2))).toEqual({
      before: 'f(f: number, g: string): void',
      active: '',
      after: '',
    });
  });
});

describe('toLocations', () => {
  const cells = [CELL0, CELL2];

  it('moves a span past the emoji before it, from code points to UTF-16 units', () => {
    expect(toLocations(cells, [{ cell: 0, start: T0.cp[0], end: T0.cp[1] }])).toEqual([
      { cell: 0, from: T0.utf16[0], to: T0.utf16[1] },
    ]);
  });

  it('is null when the kernel can’t tell, and empty for no location', () => {
    expect(toLocations(cells, null)).toBeNull();
    expect(toLocations(cells, 'x')).toBeNull();
    expect(toLocations(cells, [])).toEqual([]);
  });

  it('leaves out a location that does not fit its cell', () => {
    expect(
      toLocations(cells, [
        { cell: 5, start: 0, end: 1 },
        { cell: 0, start: 4, end: 2 },
        { cell: 0, start: 0, end: 999 },
        { cell: 0, start: 'a', end: 1 },
        { cell: 1, start: 0, end: 7 },
      ]),
    ).toEqual([{ cell: 1, from: 0, to: 7 }]);
  });
});

describe('toRenameAnswer', () => {
  const cells = [CELL0, CELL2];

  it('maps the edits to UTF-16 units and orders them', () => {
    expect(
      toRenameAnswer(cells, {
        edits: [
          { cell: 1, start: 12, end: 17, text: 'sum' },
          { cell: 0, start: T0.cp[0], end: T0.cp[1], text: 'sum' },
        ],
      }),
    ).toEqual({
      kind: 'edits',
      edits: [
        { cell: 0, from: T0.utf16[0], to: T0.utf16[1], text: 'sum' },
        { cell: 1, from: 12, to: 17, text: 'sum' },
      ],
    });
  });

  it('is the refusal’s message for an error', () => {
    expect(toRenameAnswer(cells, { error: '"process" is declared outside the notebook' })).toEqual({
      kind: 'error',
      message: '"process" is declared outside the notebook',
    });
  });

  it('is null when the kernel can’t tell', () => {
    expect(toRenameAnswer(cells, { edits: null })).toBeNull();
    expect(toRenameAnswer(cells, {})).toBeNull();
  });

  it('is null when any edit does not fit, so none of it is used', () => {
    const ok = { cell: 0, start: 0, end: 1, text: 'x' };
    expect(
      toRenameAnswer(cells, { edits: [ok, { cell: 9, start: 0, end: 1, text: 'x' }] }),
    ).toBeNull();
    expect(
      toRenameAnswer(cells, { edits: [ok, { cell: 0, start: 0, end: 999, text: 'x' }] }),
    ).toBeNull();
    expect(toRenameAnswer(cells, { edits: [ok, { cell: 0, start: 0, end: 1 }] })).toBeNull();
    expect(toRenameAnswer(cells, { edits: [ok, 7] })).toBeNull();
  });

  it('is null when two edits overlap in a cell', () => {
    expect(
      toRenameAnswer(cells, {
        edits: [
          { cell: 0, start: 0, end: 5, text: 'x' },
          { cell: 0, start: 3, end: 8, text: 'y' },
        ],
      }),
    ).toBeNull();
  });
});

describe('wordAt', () => {
  it('finds the name at or next to the cursor, past an emoji', () => {
    expect(wordAt(CELL0, T0.utf16[0] + 2)).toBe('total');
    expect(wordAt(CELL0, T0.utf16[0])).toBe('total');
    expect(wordAt(CELL0, T0.utf16[1])).toBe('total');
    expect(wordAt('$el_1 = 2', 2)).toBe('$el_1');
  });

  it('is empty where there is no name', () => {
    expect(wordAt('a + b', 2)).toBe('');
    expect(wordAt('x = 12', 5)).toBe('');
    expect(wordAt('', 0)).toBe('');
  });
});

// ---- the service, with real cells ----

let notebook: Notebook;
let holder: HTMLDivElement;
let session: { session: { kernel: unknown } | null; kernelChanged: Signal<object, unknown> };
let service: IDisposable & ReturnType<typeof createLanguageService>;
const hooks = {
  askName: vi.fn<(cell: unknown, current: string) => Promise<string | null>>(),
  notify: vi.fn<(message: string) => void>(),
};

function start(options: FakeOptions | null = {}, content = CONTENT) {
  const k = options && fakeLanguageKernel(LANGUAGE_TARGET, options);
  const owner = {};
  session = {
    session: k ? { kernel: k.kernel } : null,
    kernelChanged: new Signal(owner),
    sessionChanged: new Signal(owner),
  } as unknown as typeof session;
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(content);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  notebook.activeCellIndex = 0;
  service = createLanguageService(notebook, session as unknown as ISessionContext, hooks);
  return k;
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const cell = (i: number) => notebook.widgets[i]!;
const text = (i: number) => cell(i).model.sharedModel.getSource();
const view = (i: number) => (cell(i).editor as CodeMirrorEditor).editor;
/** Put the cursor of cell `i` at a UTF-16 offset. */
const cursorAt = (i: number, at: number) => view(i).dispatch({ selection: { anchor: at } });

beforeEach(() => {
  hooks.askName.mockReset();
  hooks.notify.mockReset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  service?.dispose();
  const model = notebook?.model;
  notebook?.dispose();
  model?.dispose();
  holder?.remove();
  vi.useRealTimers();
});

describe('the language comm’s lifecycle', () => {
  it('opens once the kernel is ready, not before', async () => {
    const k = fakeLanguageKernel(LANGUAGE_TARGET);
    k.kernel.status = 'starting';
    session = {
      session: { kernel: k.kernel },
      kernelChanged: new Signal({}),
      sessionChanged: new Signal({}),
    } as never;
    notebook = createNotebook(createRendermime('', {} as Contents.IManager));
    service = createLanguageService(notebook, session as never, hooks);
    await settle();
    expect(k.comms).toHaveLength(0);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(1);
    expect(k.comms[0]!.opened).toBe(true);
    expect(service.available).toBe(true);
  });

  it('waits for the subshell to start', async () => {
    const k = start({ subshells: true, deferSubshell: true })!;
    await settle();
    expect(k.comms[0]!.opened).toBe(false);
    expect(service.available).toBe(false);
    k.settleSubshell();
    await settle();
    expect(k.comms[0]!.opened).toBe(true);
    expect(service.available).toBe(true);
  });

  it('treats a close before any answer as a refusal: no UI, no retries', async () => {
    const k = start({ refuse: true })!;
    await settle();
    expect(service.available).toBe(false);
    cursorAt(0, T0.utf16[0]);
    expect(await Promise.all([service.goToDefinition(), service.rename('sum')])).toEqual([
      false,
      false,
    ]);
    k.setStatus('idle');
    k.setStatus('busy');
    await settle();
    expect(k.comms).toHaveLength(1);
    expect(k.comms[0]!.sent).toEqual([]);
    expect(hooks.notify).not.toHaveBeenCalled();
    expect(hooks.askName).not.toHaveBeenCalled();
  });

  it('opens again at the next idle after a close that followed an answer', async () => {
    const k = start({ answer: () => ({ locations: [] }) })!;
    await settle();
    cursorAt(0, T0.utf16[0]);
    await service.goToDefinition();
    k.comms[0]!.onClose({});
    expect(service.available).toBe(false);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
    expect(service.available).toBe(true);
  });

  it('drops the comm on a restart and opens a new one when the kernel is back', async () => {
    const k = start()!;
    await settle();
    k.setStatus('restarting');
    expect(service.available).toBe(false);
    expect(k.comms[0]!.closed).toBe(true);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
    expect(service.available).toBe(true);
  });

  it('moves to a new kernel, and asks it afresh after one that refused', async () => {
    start({ refuse: true });
    await settle();
    const next = fakeLanguageKernel(LANGUAGE_TARGET);
    session.session = { kernel: next.kernel };
    session.kernelChanged.emit({});
    await settle();
    expect(next.comms).toHaveLength(1);
    expect(service.available).toBe(true);
  });

  it('does not open for a kernel of another language', async () => {
    const k = start({ language: 'python' })!;
    await settle();
    expect(k.comms).toHaveLength(0);
    expect(service.available).toBe(false);
  });

  it('answers an unanswered request with nothing when the comm goes, not hang', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, T0.utf16[0]);
    const done = service.goToDefinition();
    await settle();
    expect(k.comms[0]!.sent).toHaveLength(1);
    k.setStatus('restarting');
    expect(await done).toBe(false);
  });

  it('gives up on a request the kernel never answers', async () => {
    start()!;
    await settle();
    cursorAt(0, T0.utf16[0]);
    const done = service.goToDefinition();
    await vi.advanceTimersByTimeAsync(LANGUAGE_TIMEOUT_MS);
    expect(await done).toBe(false);
  });

  it('ignores an answer to a request it did not make', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, T0.utf16[0]);
    const done = service.goToDefinition();
    await settle();
    k.reply({ locations: [{ cell: 1, start: 0, end: 3 }] }, 999);
    k.reply({ locations: [] });
    expect(await done).toBe(false);
    expect(notebook.activeCellIndex).toBe(0);
  });
});

describe('signature', () => {
  const SIG = {
    label: 'f(a: number): void',
    documentation: 'Does f.',
    parameters: [{ label: 'a: number', documentation: 'The a.' }],
    activeParameter: 0,
  };

  it('sends the cell and the cursor in code points, and reads the answer', async () => {
    const k = start({ answer: () => ({ signature: SIG }) })!;
    await settle();
    const got = await service.signature(cell(0), T0.utf16[1]);
    expect(k.comms[0]!.sent).toEqual([
      { request: expect.any(Number), op: 'signature', code: CELL0, cursor: T0.cp[1] },
    ]);
    expect(got).toEqual(SIG);
  });

  it('is null when the cursor is not in a call (signature null), or the answer is malformed', async () => {
    let answer: Record<string, unknown> = { signature: null };
    start({ answer: () => answer });
    await settle();
    expect(await service.signature(cell(0), 3)).toBeNull();
    answer = { signature: { nope: 1 } };
    expect(await service.signature(cell(0), 3)).toBeNull();
    answer = { error: 'unknown op' };
    expect(await service.signature(cell(0), 3)).toBeNull();
  });

  it('asks nothing for a Markdown cell or without the comm', async () => {
    const k = start({ answer: () => ({ signature: SIG }) })!;
    await settle();
    expect(await service.signature(cell(1), 2)).toBeNull();
    expect(k.comms[0]!.sent).toEqual([]);
    const none = start(null);
    expect(none).toBeNull();
    expect(await service.signature(cell(0), 3)).toBeNull();
  });
});

describe('go to definition', () => {
  const locate = (cellIndex: number, start: number, end: number) => ({
    locations: [{ cell: cellIndex, start, end }],
  });

  it('sends the code cells with their current text, the code cell index and the cursor in code points', async () => {
    const k = start({ answer: () => locate(0, T0.cp[0], T0.cp[1]) })!;
    await settle();
    // Cell 2 is the second code cell: index 1 of `cells`.
    cursorAt(2, 'console.log('.length);
    await service.goToDefinition(cell(2));
    expect(k.comms[0]!.sent).toEqual([
      {
        request: expect.any(Number),
        op: 'definition',
        cells: [CELL0, CELL2],
        cell: 1,
        cursor: 12,
      },
    ]);
  });

  it('counts the cursor in code points past an emoji', async () => {
    const k = start({ answer: () => ({ locations: [] }) })!;
    await settle();
    cursorAt(0, T0.utf16[0] + 1);
    await service.goToDefinition();
    expect(k.comms[0]!.sent[0]).toMatchObject({ cell: 0, cursor: T0.cp[0] + 1 });
  });

  it('selects the span in its cell, by the notebook’s cell index, in UTF-16 units', async () => {
    start({ answer: () => locate(0, T0.cp[0], T0.cp[1]) });
    await settle();
    cursorAt(2, 14);
    notebook.activeCellIndex = 2;
    expect(await service.goToDefinition()).toBe(true);
    expect(notebook.activeCellIndex).toBe(0);
    const { anchor, head } = view(0).state.selection.main;
    expect([anchor, head]).toEqual(T0.utf16);
    expect(view(0).state.sliceDoc(anchor, head)).toBe('total');
  });

  it('jumps to a later code cell by its notebook index (Markdown between)', async () => {
    start({ answer: () => locate(1, 12, 17) });
    await settle();
    expect(await service.goToDefinition()).toBe(true);
    expect(notebook.activeCellIndex).toBe(2);
    expect(view(2).state.sliceDoc(12, 17)).toBe('total');
    expect(view(2).state.selection.main.from).toBe(12);
  });

  it('does nothing for no location (a library), a null answer, or a location outside its cell', async () => {
    let answer: Record<string, unknown> = { locations: [] };
    start({ answer: () => answer });
    await settle();
    cursorAt(0, 3);
    expect(await service.goToDefinition()).toBe(false);
    answer = { locations: null };
    expect(await service.goToDefinition()).toBe(false);
    answer = locate(7, 0, 1);
    expect(await service.goToDefinition()).toBe(false);
    expect(notebook.activeCellIndex).toBe(0);
    expect(view(0).state.selection.main.head).toBe(3);
    expect(hooks.notify).not.toHaveBeenCalled();
  });

  it('does nothing when the text changed since the request', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, 3);
    const done = service.goToDefinition();
    await settle();
    cell(2).model.sharedModel.setSource('console.log(1)');
    k.reply(locate(1, 12, 17));
    expect(await done).toBe(false);
    expect(notebook.activeCellIndex).toBe(0);
  });

  it('does nothing in a Markdown cell', async () => {
    const k = start({ answer: () => locate(0, 0, 1) })!;
    await settle();
    notebook.activeCellIndex = 1;
    expect(await service.goToDefinition()).toBe(false);
    expect(k.comms[0]!.sent).toEqual([]);
  });
});

describe('applyEdits', () => {
  it('replaces each cell’s spans in one change, at their positions in the text before', () => {
    start();
    applyEdits(
      [cell(0), cell(2)],
      [
        { cell: 0, from: T0.utf16[0], to: T0.utf16[1], text: 'sum' },
        { cell: 1, from: 12, to: 17, text: 'sum' },
        { cell: 1, from: 19, to: 24, text: 'sum' },
      ],
    );
    expect(text(0)).toBe("const note = '😀'; const sum = 1");
    expect(text(2)).toBe('console.log(sum, sum)');
  });

  it('makes one change per cell, however many spans it replaces', () => {
    start();
    const changes: number[] = [0, 0, 0];
    for (const i of [0, 2]) {
      view(i).dispatch({
        effects: StateEffect.appendConfig.of(
          EditorView.updateListener.of(u => u.docChanged && changes[i]!++),
        ),
      });
    }
    applyEdits(
      [cell(0), cell(2)],
      [
        { cell: 0, from: T0.utf16[0], to: T0.utf16[1], text: 'sum' },
        { cell: 1, from: 12, to: 17, text: 'sum' },
        { cell: 1, from: 19, to: 24, text: 'sum' },
      ],
    );
    expect(changes).toEqual([1, 0, 1]);
  });

  it('is one undo step per cell', () => {
    start();
    applyEdits(
      [cell(0), cell(2)],
      [
        { cell: 0, from: T0.utf16[0], to: T0.utf16[1], text: 'sum' },
        { cell: 1, from: 12, to: 17, text: 'sum' },
        { cell: 1, from: 19, to: 24, text: 'sum' },
      ],
    );
    (cell(2).editor as CodeMirrorEditor).undo();
    expect(text(2)).toBe(CELL2);
    expect(text(0)).toBe("const note = '😀'; const sum = 1");
    (cell(0).editor as CodeMirrorEditor).undo();
    expect(text(0)).toBe(CELL0);
  });
});

describe('applyEdits without an editor', () => {
  it('goes through the model, in one change, at the positions of the text before', () => {
    start();
    // A cell that has no editor view (not set up yet).
    Object.defineProperty(cell(2), 'editor', { get: () => null, configurable: true });
    const changes: unknown[] = [];
    cell(2).model.sharedModel.changed.connect((_, c) => changes.push(c));
    applyEdits(
      [cell(0), cell(2)],
      [
        { cell: 1, from: 12, to: 17, text: 'sum' },
        { cell: 1, from: 19, to: 24, text: 'summation' },
      ],
    );
    delete (cell(2) as { editor?: unknown }).editor;
    expect(text(2)).toBe('console.log(sum, summation)');
    expect(changes).toHaveLength(1);
  });
});

describe('rename', () => {
  const EDITS = {
    edits: [
      { cell: 0, start: T0.cp[0], end: T0.cp[1], text: 'sum' },
      { cell: 1, start: 12, end: 17, text: 'sum' },
      { cell: 1, start: 19, end: 24, text: 'sum' },
    ],
  };

  it('asks for the name, sends the cells, and applies the edits across cells', async () => {
    const k = start({ answer: () => EDITS })!;
    await settle();
    hooks.askName.mockResolvedValue('sum');
    cursorAt(0, T0.utf16[0] + 2);
    expect(await service.rename()).toBe(true);
    expect(hooks.askName).toHaveBeenCalledWith(cell(0), 'total');
    expect(k.comms[0]!.sent).toEqual([
      {
        request: expect.any(Number),
        op: 'rename',
        cells: [CELL0, CELL2],
        cell: 0,
        cursor: T0.cp[0] + 2,
        newName: 'sum',
      },
    ]);
    expect(text(0)).toBe("const note = '😀'; const sum = 1");
    expect(text(2)).toBe('console.log(sum, sum)');
    expect(text(1)).toBe('total is one');
  });

  it('takes the name as given (the palette’s prompt) without asking', async () => {
    start({ answer: () => EDITS });
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    expect(await service.rename('sum')).toBe(true);
    expect(hooks.askName).not.toHaveBeenCalled();
    expect(text(2)).toBe('console.log(sum, sum)');
  });

  it('undoes per cell', async () => {
    start({ answer: () => EDITS });
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    await service.rename('sum');
    (cell(0).editor as CodeMirrorEditor).undo();
    expect(text(0)).toBe(CELL0);
    expect(text(2)).toBe('console.log(sum, sum)');
  });

  it('shows a refusal as a message and applies nothing', async () => {
    start({ answer: () => ({ error: '"process" is declared outside the notebook' }) });
    await settle();
    cursorAt(0, 3);
    expect(await service.rename('x')).toBe(false);
    expect(hooks.notify).toHaveBeenCalledWith(
      'Can’t rename: "process" is declared outside the notebook',
    );
    expect(text(0)).toBe(CELL0);
    expect(text(2)).toBe(CELL2);
  });

  it('says so when the kernel can’t tell (edits null), and applies nothing', async () => {
    start({ answer: () => ({ edits: null }) });
    await settle();
    cursorAt(0, 3);
    expect(await service.rename('x')).toBe(false);
    expect(hooks.notify).toHaveBeenCalledTimes(1);
    expect(text(0)).toBe(CELL0);
  });

  it('applies none of an answer with an edit that does not fit', async () => {
    start({
      answer: () => ({
        edits: [
          { cell: 0, start: T0.cp[0], end: T0.cp[1], text: 'sum' },
          { cell: 1, start: 12, end: 999, text: 'sum' },
        ],
      }),
    });
    await settle();
    cursorAt(0, 3);
    expect(await service.rename('sum')).toBe(false);
    expect(text(0)).toBe(CELL0);
    expect(text(2)).toBe(CELL2);
    expect(hooks.notify).toHaveBeenCalledTimes(1);
  });

  it('applies nothing when a cell changed while the kernel answered', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, 3);
    const done = service.rename('sum');
    await settle();
    cell(2).model.sharedModel.setSource('console.log(total, total) // edited');
    k.reply(EDITS);
    expect(await done).toBe(false);
    expect(text(0)).toBe(CELL0);
    expect(text(2)).toBe('console.log(total, total) // edited');
    expect(hooks.notify).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });

  it('applies nothing when a code cell was added while the kernel answered', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, 3);
    const done = service.rename('sum');
    await settle();
    notebook.model!.sharedModel.insertCell(1, { cell_type: 'code', source: 'total + 1' });
    await settle();
    k.reply(EDITS);
    expect(await done).toBe(false);
    expect(text(0)).toBe(CELL0);
    expect(hooks.notify).toHaveBeenCalledWith(expect.stringContaining('changed'));
  });

  it('sends nothing when the name is cancelled, empty, or the same', async () => {
    const k = start({ answer: () => EDITS })!;
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    hooks.askName.mockResolvedValueOnce(null);
    expect(await service.rename()).toBe(false);
    expect(await service.rename('   ')).toBe(false);
    expect(await service.rename('total')).toBe(false);
    expect(k.comms[0]!.sent).toEqual([]);
  });

  it('does nothing in a kernel without the comm: no prompt, no message', async () => {
    start({ refuse: true });
    await settle();
    cursorAt(0, 3);
    expect(await service.rename()).toBe(false);
    expect(hooks.askName).not.toHaveBeenCalled();
    expect(hooks.notify).not.toHaveBeenCalled();
  });

  it('applies nothing for an empty list of edits', async () => {
    start({ answer: () => ({ edits: [] }) });
    await settle();
    cursorAt(0, 3);
    expect(await service.rename('x')).toBe(false);
    expect(text(0)).toBe(CELL0);
  });

  it('asks for what the notebook says after the name was typed', async () => {
    const k = start({ answer: () => EDITS })!;
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    let typed!: (name: string) => void;
    hooks.askName.mockReturnValue(new Promise<string | null>(r => (typed = r)));
    const done = service.rename();
    await settle();
    cell(2).model.sharedModel.setSource('console.log(total, total) // edited');
    typed('sum');
    expect(await done).toBe(true);
    expect(k.comms[0]!.sent).toEqual([
      expect.objectContaining({
        op: 'rename',
        cells: [CELL0, 'console.log(total, total) // edited'],
        newName: 'sum',
      }),
    ]);
    expect(text(2)).toBe('console.log(sum, sum) // edited');
  });

  it('asks nothing when the cursor moved while the name was typed', async () => {
    const k = start({ answer: () => EDITS })!;
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    let typed!: (name: string) => void;
    hooks.askName.mockReturnValue(new Promise<string | null>(r => (typed = r)));
    const done = service.rename();
    await settle();
    cursorAt(0, 3);
    typed('sum');
    expect(await done).toBe(false);
    expect(k.comms[0]!.sent).toEqual([]);
    expect(text(0)).toBe(CELL0);
  });

  it('does nothing when the service is disposed while the name was typed', async () => {
    const k = start({ answer: () => EDITS })!;
    await settle();
    cursorAt(0, T0.utf16[0] + 2);
    let typed!: (name: string) => void;
    hooks.askName.mockReturnValue(new Promise<string | null>(r => (typed = r)));
    const done = service.rename();
    await settle();
    service.dispose();
    typed('sum');
    expect(await done).toBe(false);
    expect(k.comms[0]!.sent).toEqual([]);
  });

  it('applies nothing from an answer that arrives as the service is disposed', async () => {
    const k = start()!;
    await settle();
    cursorAt(0, 3);
    const done = service.rename('sum');
    await settle();
    k.reply(EDITS);
    service.dispose();
    expect(await done).toBe(false);
    expect(text(0)).toBe(CELL0);
    expect(hooks.notify).not.toHaveBeenCalled();
  });
});

describe('go to definition and the service’s end', () => {
  it('does not move to an answer that arrives as the service is disposed', async () => {
    const k = start()!;
    await settle();
    cursorAt(2, 2);
    notebook.activeCellIndex = 2;
    const done = service.goToDefinition();
    await settle();
    k.reply({ locations: [{ cell: 0, start: T0.cp[0], end: T0.cp[1] }] });
    service.dispose();
    expect(await done).toBe(false);
    expect(notebook.activeCellIndex).toBe(2);
    expect(view(0).state.selection.main.from).toBe(0);
  });
});
