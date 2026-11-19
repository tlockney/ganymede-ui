import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import { Signal } from '@lumino/signaling';
import { fakeLanguageKernel, type FakeOptions } from '../test/language-kernel';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { NotebookModel, NotebookActions } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');
const { LANGUAGE_TARGET } = await import('./language-service');
const { askNameNear, attachLanguageFeatures, signatureDom } = await import('./language-editor');

const code = (id: string, source: string): nbformat.ICodeCell => ({
  cell_type: 'code',
  id,
  source,
  metadata: {},
  outputs: [],
  execution_count: null,
});

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    code('a', 'function add(a: number, b: number) { return a + b }\nconst total = 1'),
    { cell_type: 'markdown', id: 'b', source: 'add things', metadata: {} },
    code('c', 'add'),
  ],
};

const SIG = {
  label: 'add(a: number, b: number): number',
  documentation: 'Adds.',
  parameters: [
    { label: 'a: number', documentation: 'The first.' },
    { label: 'b: number', documentation: '' },
  ],
  activeParameter: 0,
};

let notebook: Notebook;
let holder: HTMLDivElement;
let features: ReturnType<typeof attachLanguageFeatures>;
const notify = vi.fn<(message: string) => void>();

async function start(options: FakeOptions | null = {}) {
  const k = options && fakeLanguageKernel(LANGUAGE_TARGET, options);
  const owner = {};
  const session = {
    session: k ? { kernel: k.kernel } : null,
    kernelChanged: new Signal(owner),
    sessionChanged: new Signal(owner),
  };
  notebook = createNotebook(createRendermime('', {} as Contents.IManager));
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  notebook.activeCellIndex = 2;
  features = attachLanguageFeatures(notebook, session as unknown as ISessionContext, notify);
  await settle();
  // In edit mode, as when a key is pressed in the cell: Lumino's own focus
  // moves for the mode change are done before the test acts.
  notebook.mode = 'edit';
  await settle();
  return k;
}

const settle = () => vi.advanceTimersByTimeAsync(0);
const cell = (i: number) => notebook.widgets[i]!;
const view = (i: number) => (cell(i).editor as CodeMirrorEditor).editor;
/** Type `text` at the end of cell `i`, as a person types it. */
const type = (i: number, text: string) => {
  const v = view(i);
  const at = v.state.doc.length;
  v.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
    userEvent: 'input.type',
  });
};
const press = (i: number, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  view(i).contentDOM.dispatchEvent(event);
  return event;
};
const tooltip = () => document.querySelector('.cm-signature-help');
const requests = (k: NonNullable<Awaited<ReturnType<typeof start>>>) => k.comms[0]!.sent;

beforeEach(() => {
  notify.mockReset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  features?.dispose();
  document.querySelectorAll('.rename-prompt').forEach(n => n.remove());
  const model = notebook?.model;
  notebook?.dispose();
  model?.dispose();
  holder?.remove();
  vi.useRealTimers();
});

describe('signatureDom', () => {
  it('marks the active parameter and shows its documentation, then the function’s', () => {
    const dom = signatureDom(SIG);
    expect(dom.querySelector('.cm-signature-active')?.textContent).toBe('a: number');
    expect(dom.querySelector('.cm-signature-label')?.textContent).toBe(SIG.label);
    expect(dom.querySelector('.cm-signature-parameter-doc')?.textContent).toBe('The first.');
    expect(dom.querySelector('.cm-signature-doc')?.textContent).toBe('Adds.');
  });

  it('shows text as text, not markup', () => {
    const dom = signatureDom({ ...SIG, documentation: '<img src=x onerror=alert(1)>' });
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('.cm-signature-doc')?.textContent).toBe(
      '<img src=x onerror=alert(1)>',
    );
  });
});

describe('signature help in a cell', () => {
  it('opens when ( is typed, with the signature the kernel answers, and asks with the cell’s text', async () => {
    const k = (await start({ answer: () => ({ signature: SIG }) }))!;
    type(2, '(');
    await settle();
    expect(requests(k)).toEqual([
      { request: expect.any(Number), op: 'signature', code: 'add(', cursor: 4 },
    ]);
    expect(tooltip()?.querySelector('.cm-signature-active')?.textContent).toBe('a: number');
  });

  it('opens on a comma, and does not open for other typing', async () => {
    const k = (await start({ answer: () => ({ signature: SIG }) }))!;
    type(2, 'x');
    await settle();
    expect(requests(k)).toEqual([]);
    expect(tooltip()).toBeNull();
    type(2, ',');
    await settle();
    expect(requests(k)).toHaveLength(1);
    expect(tooltip()).not.toBeNull();
  });

  it('follows the cursor while open: asks again, and shows the new active parameter', async () => {
    let active = 0;
    const k = (await start({
      answer: () => ({ signature: { ...SIG, activeParameter: active } }),
    }))!;
    type(2, '(');
    await settle();
    active = 1;
    type(2, '1, ');
    await settle();
    expect(requests(k)).toHaveLength(2);
    expect(tooltip()?.querySelector('.cm-signature-active')?.textContent).toBe('b: number');
  });

  it('closes when the cursor leaves the call (the kernel answers null)', async () => {
    let sig: unknown = SIG;
    await start({ answer: () => ({ signature: sig }) });
    type(2, '(');
    await settle();
    expect(tooltip()).not.toBeNull();
    sig = null;
    type(2, ')');
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('closes on Escape, and does not open from an answer that arrives after it', async () => {
    const k = (await start())!;
    type(2, '(');
    await settle();
    k.reply({ signature: SIG });
    await settle();
    expect(tooltip()).not.toBeNull();
    press(2, 'Escape');
    expect(tooltip()).toBeNull();
    // A request that was out when Escape came is not shown.
    type(2, '(');
    await settle();
    press(2, 'Escape');
    k.reply({ signature: SIG });
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('is silent against a kernel without the comm', async () => {
    const k = (await start({ refuse: true }))!;
    type(2, '(');
    await settle();
    expect(k.comms[0]!.sent).toEqual([]);
    expect(tooltip()).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('is in a code cell inserted later, and not in a Markdown cell', async () => {
    const k = (await start({ answer: () => ({ signature: SIG }) }))!;
    notebook.activeCellIndex = 2;
    NotebookActions.insertBelow(notebook);
    await settle();
    expect(notebook.widgets).toHaveLength(4);
    type(3, 'f');
    type(3, '(');
    await settle();
    expect(requests(k)).toHaveLength(1);
    expect(tooltip()).not.toBeNull();
  });
});

describe('definition and rename keys', () => {
  it('F12 asks for the definition from the cell’s cursor', async () => {
    const k = (await start({ answer: () => ({ locations: [{ cell: 0, start: 9, end: 12 }] }) }))!;
    view(2).dispatch({ selection: { anchor: 2 } });
    const event = press(2, 'F12');
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(requests(k)).toEqual([
      {
        request: expect.any(Number),
        op: 'definition',
        cells: [CONTENT.cells[0]!.source, 'add'],
        cell: 1,
        cursor: 2,
      },
    ]);
    // It went to the function's name in the first code cell.
    expect(notebook.activeCellIndex).toBe(0);
    expect(view(0).state.sliceDoc(9, 12)).toBe('add');
    expect(view(0).state.selection.main.from).toBe(9);
  });

  it('Ctrl-click asks for the definition at the click, and a plain click does not', async () => {
    const k = (await start({ answer: () => ({ locations: [] }) }))!;
    view(2).posAtCoords = () => 1;
    view(2).contentDOM.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
    );
    await settle();
    expect(requests(k)).toEqual([]);
    const click = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    view(2).contentDOM.dispatchEvent(click);
    await settle();
    expect(click.defaultPrevented).toBe(true);
    expect(view(2).state.selection.main.head).toBe(1);
    expect(requests(k)).toEqual([
      expect.objectContaining({ op: 'definition', cell: 1, cursor: 1 }),
    ]);
  });

  it('F2 asks for the name in an input, and Enter renames with it', async () => {
    const k = (await start({
      answer: () => ({ edits: [{ cell: 1, start: 0, end: 3, text: 'plus' }] }),
    }))!;
    view(2).dispatch({ selection: { anchor: 1 } });
    press(2, 'F2');
    await settle();
    const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
    expect(input).not.toBeNull();
    expect(input.value).toBe('add');
    input.value = 'plus';
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('.rename-prompt')).toBeNull();
    expect(requests(k)).toEqual([
      expect.objectContaining({ op: 'rename', newName: 'plus', cell: 1, cursor: 1 }),
    ]);
    expect(cell(2).model.sharedModel.getSource()).toBe('plus');
  });

  it('F2 then Escape asks the kernel nothing', async () => {
    const k = (await start())!;
    press(2, 'F2');
    await settle();
    const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    );
    await settle();
    expect(document.querySelector('.rename-prompt')).toBeNull();
    expect(requests(k)).toEqual([]);
  });

  it('shows a refusal through notify', async () => {
    await start({ answer: () => ({ error: 'not declared in the notebook' }) });
    view(2).dispatch({ selection: { anchor: 1 } });
    press(2, 'F2');
    await settle();
    const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
    input.value = 'plus';
    input.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(notify).toHaveBeenCalledWith('Can’t rename: not declared in the notebook');
    expect(cell(2).model.sharedModel.getSource()).toBe('add');
  });

  it('leave the keys alone against a kernel without the comm', async () => {
    await start({ refuse: true });
    expect(press(2, 'F12').defaultPrevented).toBe(false);
    expect(press(2, 'F2').defaultPrevented).toBe(false);
    await settle();
    expect(document.querySelector('.rename-prompt')).toBeNull();
    expect(notify).not.toHaveBeenCalled();
  });

  it('are not bound in a Markdown cell', async () => {
    const k = (await start())!;
    notebook.activeCellIndex = 1;
    expect(await features.service.goToDefinition()).toBe(false);
    expect(requests(k)).toEqual([]);
  });
});

describe('askNameNear', () => {
  it('resolves with the name on submit, once, and takes the input away', async () => {
    const { result } = askNameNear(undefined, 'old');
    const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
    expect(input.value).toBe('old');
    expect(document.activeElement).toBe(input);
    input.value = 'new';
    input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(await result).toBe('new');
    expect(document.querySelector('.rename-prompt')).toBeNull();
  });

  it('resolves null on Escape, on losing focus and when cancelled', async () => {
    const a = askNameNear(undefined, 'old');
    document
      .querySelector('.rename-prompt input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(await a.result).toBeNull();
    const b = askNameNear(undefined, 'old');
    document.querySelector('.rename-prompt input')!.dispatchEvent(new FocusEvent('blur'));
    expect(await b.result).toBeNull();
    const c = askNameNear(undefined, 'old');
    c.cancel();
    expect(await c.result).toBeNull();
    expect(document.querySelector('.rename-prompt')).toBeNull();
  });
});
