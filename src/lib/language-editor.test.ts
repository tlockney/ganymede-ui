import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import { EditorView, showTooltip } from '@codemirror/view';
import type { LanguageService } from './language-service';
import { Signal } from '@lumino/signaling';
import { fakeLanguageKernel, type FakeOptions } from '../test/language-kernel';

Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { attachEditing, createCommands, createNotebook, createRendermime } =
  await import('./jupyterlab');
const { NotebookModel, NotebookActions } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');
const { LANGUAGE_TARGET } = await import('./language-service');
const { askNameNear, attachLanguageFeatures, languageExtension, signatureDom } =
  await import('./language-editor');

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
let session: ISessionContext;
let rendermime: ReturnType<typeof createRendermime>;
let editing: { dispose(): void } | undefined;
const notify = vi.fn<(message: string) => void>();

async function start(options: FakeOptions | null = {}) {
  const k = options && fakeLanguageKernel(LANGUAGE_TARGET, options);
  const owner = {};
  session = {
    session: k ? { kernel: k.kernel } : null,
    kernelChanged: new Signal(owner),
    sessionChanged: new Signal(owner),
  } as unknown as ISessionContext;
  rendermime = createRendermime('', {} as Contents.IManager);
  notebook = createNotebook(rendermime);
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  notebook.activeCellIndex = 2;
  features = attachLanguageFeatures(notebook, session, notify);
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
  // Lumino reads `keyCode`, which jsdom leaves at 0 unless given.
  const keyCode = { Escape: 27, F2: 113, F12: 123 }[key] ?? 0;
  const event = new KeyboardEvent('keydown', {
    key,
    keyCode,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  view(i).contentDOM.dispatchEvent(event);
  return event;
};
/** The notebook's keys as NotebookPane wires them: Lumino's commands, in the capture phase. */
function wireKeys() {
  const commands = createCommands(notebook, session);
  const attached = attachEditing(notebook, session, rendermime, commands);
  const onKey = (e: KeyboardEvent) => commands.processKeydownEvent(e);
  document.addEventListener('keydown', onKey, true);
  editing = {
    dispose() {
      document.removeEventListener('keydown', onKey, true);
      attached.dispose();
    },
  };
}
const tooltip = () => document.querySelector('.cm-signature-help');
const tooltipAt = () =>
  view(2)
    .state.facet(showTooltip)
    .find(t => t)?.pos;
const requests = (k: NonNullable<Awaited<ReturnType<typeof start>>>) => k.comms[0]!.sent;

beforeEach(() => {
  notify.mockReset();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  editing?.dispose();
  editing = undefined;
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

  it('consumes Escape only while signature help shows', async () => {
    const k = (await start())!;
    // Nothing shows: this keymap leaves Escape to the others.
    expect(press(2, 'Escape').defaultPrevented).toBe(false);
    type(2, '(');
    await settle();
    k.reply({ signature: SIG });
    await settle();
    expect(tooltip()).not.toBeNull();
    expect(press(2, 'Escape').defaultPrevented).toBe(true);
    expect(tooltip()).toBeNull();
    expect(press(2, 'Escape').defaultPrevented).toBe(false);
  });

  it('closes when the cell loses focus', async () => {
    await start({ answer: () => ({ signature: SIG }) });
    type(2, '(');
    await settle();
    expect(tooltip()).not.toBeNull();
    view(2).contentDOM.dispatchEvent(new FocusEvent('blur'));
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

  it('follows a rebinding of F12 in the Shortcuts sheet', async () => {
    const { resetKeys, setKeys } = await import('./shortcuts');
    const k = (await start({ answer: () => ({ locations: [] }) }))!;
    try {
      setKeys('go-to-definition', [['Accel Shift D']]);
      expect(press(2, 'F12').defaultPrevented).toBe(false);
      await settle();
      expect(requests(k)).toEqual([]);
    } finally {
      resetKeys();
    }
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

  it('resolves null on Escape and when cancelled', async () => {
    const a = askNameNear(undefined, 'old');
    document
      .querySelector('.rename-prompt input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(await a.result).toBeNull();
    const c = askNameNear(undefined, 'old');
    c.cancel();
    expect(await c.result).toBeNull();
    expect(document.querySelector('.rename-prompt')).toBeNull();
  });

  describe('focus', () => {
    let elsewhere: HTMLButtonElement;
    beforeEach(() => {
      elsewhere = document.createElement('button');
      document.body.append(elsewhere);
    });
    afterEach(() => elsewhere.remove());

    it('still renames when the focus moved away and the submit follows in the same task', async () => {
      // As Enter does: the notebook's capture handler moves the focus, then the form submits.
      const { result } = askNameNear(undefined, 'old');
      const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
      input.value = 'new';
      elsewhere.focus();
      expect(document.activeElement).toBe(elsewhere);
      input.form!.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.advanceTimersByTimeAsync(0);
      expect(await result).toBe('new');
    });

    it('cancels when the focus is still elsewhere after the tick', async () => {
      const { result } = askNameNear(undefined, 'old');
      elsewhere.focus();
      // Not yet: the blur is judged after the task.
      expect(document.querySelector('.rename-prompt')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(0);
      expect(await result).toBeNull();
      expect(document.querySelector('.rename-prompt')).toBeNull();
    });

    it('stays when the focus came back to the input in the same task', async () => {
      const { result, cancel } = askNameNear(undefined, 'old');
      const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
      elsewhere.focus();
      input.focus();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.rename-prompt')).not.toBeNull();
      cancel();
      expect(await result).toBeNull();
    });
  });

  it('keeps the input’s keys from the notebook’s shortcuts (the event stops at the input)', () => {
    askNameNear(undefined, 'old');
    const input = document.querySelector<HTMLInputElement>('.rename-prompt input')!;
    const reached = vi.fn();
    document.addEventListener('keydown', reached);
    for (const key of ['a', 'Enter', 'Escape']) {
      input.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
    document.removeEventListener('keydown', reached);
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('Escape with signature help open, through the notebook’s keys', () => {
  it('closes the tooltip and keeps the cell in edit mode; a later answer does not reopen it', async () => {
    const k = (await start())!;
    wireKeys();
    type(2, '(');
    await settle();
    k.reply({ signature: SIG });
    await settle();
    expect(tooltip()).not.toBeNull();
    expect(notebook.mode).toBe('edit');
    // A request is out when Escape comes.
    type(2, ',');
    await settle();
    const event = press(2, 'Escape');
    expect(event.defaultPrevented).toBe(true);
    expect(tooltip()).toBeNull();
    expect(notebook.mode).toBe('edit');
    k.reply({ signature: SIG });
    await settle();
    expect(tooltip()).toBeNull();
    // With no tooltip, the next Escape leaves the cell as it always did.
    press(2, 'Escape');
    expect(notebook.mode).toBe('command');
  });

  it('leaves edit mode on Escape when no signature help is open', async () => {
    await start();
    wireKeys();
    press(2, 'Escape');
    expect(notebook.mode).toBe('command');
  });
});

describe('Cmd/Ctrl-click and the right button', () => {
  const click = (init: MouseEventInit) => {
    const e = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init });
    view(2).contentDOM.dispatchEvent(e);
    return e;
  };
  // CodeMirror itself prevents the default of a mousedown in jsdom, so
  // `defaultPrevented` can't tell ours from its: the click is compared with
  // a plain one, and what ours would do is the selection and the request.
  const setup = () => {
    view(2).posAtCoords = () => 1;
    view(2).dispatch({ selection: { anchor: 3 } });
    return { plain: click({ button: 0 }).defaultPrevented };
  };

  it('Ctrl-click against a kernel without the comm is left alone', async () => {
    const k = (await start({ refuse: true }))!;
    const { plain } = setup();
    const e = click({ button: 0, ctrlKey: true });
    await settle();
    expect(e.defaultPrevented).toBe(plain);
    // Ours would have moved the cursor to the click.
    expect(view(2).state.selection.main.head).toBe(3);
    expect(requests(k)).toEqual([]);
  });

  it('the right button with Ctrl is left alone too', () => {
    // The notebook stops a right-button mousedown before the editor's handlers
    // (CodeMirror skips them for a prevented event), so the guard is tried on
    // a bare editor with the extension.
    const goToDefinition = vi.fn(async () => true);
    const service = { available: true, goToDefinition } as unknown as LanguageService;
    const host = document.createElement('div');
    document.body.append(host);
    const v = new EditorView({
      parent: host,
      doc: 'add(1)',
      selection: { anchor: 3 },
      extensions: [languageExtension(service, {} as never)],
    });
    v.posAtCoords = () => 1;
    const press = (init: MouseEventInit) =>
      v.contentDOM.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init }),
      );
    press({ button: 2, ctrlKey: true, metaKey: true });
    expect(goToDefinition).not.toHaveBeenCalled();
    expect(v.state.selection.main.head).toBe(3);
    // The left button with the same modifiers is the one that goes.
    press({ button: 0, ctrlKey: true, metaKey: true });
    expect(goToDefinition).toHaveBeenCalledOnce();
    expect(v.state.selection.main.head).toBe(1);
    v.destroy();
    host.remove();
  });
});

describe('signature help: when it asks and shows', () => {
  it('does not open for a pasted ( (only typing opens it)', async () => {
    const k = (await start({ answer: () => ({ signature: SIG }) }))!;
    const v = view(2);
    v.dispatch({
      changes: { from: 3, insert: '(' },
      selection: { anchor: 4 },
      userEvent: 'input.paste',
    });
    await settle();
    expect(requests(k)).toEqual([]);
    expect(tooltip()).toBeNull();
  });

  it('asks again for each edit while its first answer is out, and shows the latest', async () => {
    const k = (await start())!;
    type(2, '(');
    await settle();
    // Not open yet: the answer is out. Typing on must not leave the cursor’s old place as the answer’s.
    type(2, 'x');
    await settle();
    expect(requests(k)).toHaveLength(2);
    const [first, second] = requests(k).map(r => r.request as number) as [number, number];
    k.reply({ signature: SIG }, first);
    await settle();
    expect(tooltip()).toBeNull();
    k.reply({ signature: SIG }, second);
    await settle();
    expect(tooltip()).not.toBeNull();
    expect(tooltipAt()).toBe(view(2).state.selection.main.head);
  });

  it('keeps the tooltip at its place in the text when text before it is deleted', async () => {
    await start({ answer: () => ({ signature: SIG }) });
    type(2, '(');
    await settle();
    expect(tooltipAt()).toBe(4);
    view(2).dispatch({ changes: { from: 0, to: 2 }, userEvent: 'delete.backward' });
    // Before the kernel's next answer: 'd(' is 2 long.
    expect(view(2).state.doc.length).toBe(2);
    expect(tooltipAt()).toBe(2);
  });

  it('shows nothing from an answer that arrives after the service is disposed', async () => {
    const k = (await start())!;
    type(2, '(');
    await settle();
    k.reply({ signature: SIG });
    features.dispose();
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('shows nothing from an answer that arrives after the editor left the page', async () => {
    const k = (await start())!;
    type(2, '(');
    await settle();
    k.reply({ signature: SIG });
    view(2).dom.remove();
    await settle();
    expect(tooltip()).toBeNull();
  });

  it('shows nothing from an answer that arrives after its cell is disposed', async () => {
    const k = (await start())!;
    type(2, '(');
    await settle();
    const v = view(2);
    k.reply({ signature: SIG });
    cell(2).dispose();
    await settle();
    expect(document.querySelector('.cm-signature-help')).toBeNull();
    expect(v.state.facet(showTooltip).find(t => t)).toBeUndefined();
  });
});

describe('which cells get the extensions', () => {
  it('a code cell added to the model without changing the active cell has them', async () => {
    const k = (await start({ answer: () => ({ signature: SIG }) }))!;
    notebook.model!.sharedModel.addCell({ cell_type: 'code', source: '' });
    await settle();
    expect(notebook.widgets).toHaveLength(4);
    expect(notebook.activeCellIndex).toBe(2);
    type(3, 'f');
    type(3, '(');
    await settle();
    expect(requests(k)).toHaveLength(1);
    expect(tooltip()).not.toBeNull();
  });

  it('cells of a model set after the features were attached have them', async () => {
    const k = fakeLanguageKernel(LANGUAGE_TARGET, { answer: () => ({ signature: SIG }) });
    const owner = {};
    session = {
      session: { kernel: k.kernel },
      kernelChanged: new Signal(owner),
      sessionChanged: new Signal(owner),
    } as unknown as ISessionContext;
    notebook = createNotebook(createRendermime('', {} as Contents.IManager));
    holder = document.createElement('div');
    document.body.append(holder);
    Widget.attach(notebook, holder);
    features = attachLanguageFeatures(notebook, session, notify);
    const model = new NotebookModel();
    model.fromJSON(CONTENT);
    notebook.model = model;
    notebook.activeCellIndex = 2;
    await settle();
    notebook.mode = 'edit';
    await settle();
    type(2, '(');
    await settle();
    expect(k.comms[0]!.sent).toHaveLength(1);
    expect(tooltip()).not.toBeNull();
  });
});

describe('the rename input and the features’ lifetime', () => {
  it('a second F2 takes the first input away and leaves one', async () => {
    await start();
    view(2).dispatch({ selection: { anchor: 1 } });
    const first = features.service.rename(undefined, cell(2));
    expect(document.querySelectorAll('.rename-prompt')).toHaveLength(1);
    // At once, before any blur of the first input could be judged.
    const second = features.service.rename(undefined, cell(2));
    expect(document.querySelectorAll('.rename-prompt')).toHaveLength(1);
    expect(await first).toBe(false);
    features.dispose();
    expect(await second).toBe(false);
  });

  it('disposing the features takes the input away', async () => {
    await start();
    view(2).dispatch({ selection: { anchor: 1 } });
    press(2, 'F2');
    await settle();
    expect(document.querySelector('.rename-prompt')).not.toBeNull();
    features.dispose();
    expect(document.querySelector('.rename-prompt')).toBeNull();
  });
});
