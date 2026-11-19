import '../test/notebook-env';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forEachDiagnostic } from '@codemirror/lint';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Notebook } from '@jupyterlab/notebook';
import type { Contents } from '@jupyterlab/services';
import type { IDisposable } from '@lumino/disposable';
import { Signal } from '@lumino/signaling';

// JupyterLab's real Notebook and CodeMirror editors in jsdom, with a fake
// kernel that answers the diagnostics comm as the test says.
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const { createNotebook, createRendermime } = await import('./jupyterlab');
const { NotebookModel, NotebookActions } = await import('@jupyterlab/notebook');
const { Widget } = await import('@lumino/widgets');
const {
  TYPE_ERRORS_DELAY_MS,
  TYPE_ERRORS_RETRIES,
  TYPE_ERRORS_RETRY_MS,
  TYPE_ERRORS_TARGET,
  attachTypeErrors,
  codePointToOffset,
  resetTypeErrorsForTests,
  setTypeErrorsEnabled,
  toDiagnostics,
  typeErrorsEnabled,
} = await import('./type-errors');

const CONTENT: nbformat.INotebookContent = {
  nbformat: 4,
  nbformat_minor: 5,
  metadata: {},
  cells: [
    {
      cell_type: 'code',
      id: 'a',
      source: 'const n: string = 1',
      metadata: {},
      outputs: [],
      execution_count: null,
    },
    { cell_type: 'markdown', id: 'b', source: 'Ganymede and Io', metadata: {} },
  ],
};

type Sent = { request: number; code: string };

/** A kernel with the diagnostics comm; `refuse` closes it at once, as one without it does. */
function fakeKernel(
  options: {
    language?: string;
    refuse?: boolean;
    throwOnSend?: boolean;
    deferInfo?: boolean;
    infoFails?: number;
    subshells?: boolean;
    deferSubshell?: boolean;
  } = {},
) {
  const comms: {
    sent: Sent[];
    opened: boolean;
    closed: boolean;
    isDisposed: boolean;
    onMsg: (msg: unknown) => void;
    onClose: (msg: unknown) => void;
  }[] = [];
  let resolveInfo!: () => void;
  const info = { language_info: { name: options.language ?? 'typescript' } };
  // Signals name their sender: the kernel.
  let failures = options.infoFails ?? 0;
  const deferred = options.deferInfo
    ? new Promise<typeof info>(r => (resolveInfo = () => r(info)))
    : undefined;
  let settleSubshell!: (ok: boolean) => void;
  const subshellStarted = options.deferSubshell
    ? new Promise<void>((res, rej) => (settleSubshell = ok => (ok ? res() : rej(new Error('no')))))
    : Promise.resolve();
  const kernel = {
    status: 'idle',
    supportsSubshells: options.subshells ?? false,
    statusChanged: undefined as unknown as Signal<object, string>,
    disposed: undefined as unknown as Signal<object, void>,
    infoReads: 0,
    get info() {
      kernel.infoReads++;
      if (failures-- > 0) return Promise.reject(new Error('no info'));
      return deferred ?? Promise.resolve(info);
    },
    createComm(target: string) {
      expect(target).toBe(TYPE_ERRORS_TARGET);
      const comm = {
        sent: [] as Sent[],
        opened: false,
        closed: false,
        isDisposed: false,
        subshellStarted,
        onMsg: (_msg: unknown) => {},
        onClose: (_msg: unknown) => {},
        open() {
          comm.opened = true;
          if (options.refuse) queueMicrotask(() => comm.onClose({}));
        },
        send(data: Sent) {
          if (options.throwOnSend) throw new Error('disposed');
          comm.sent.push(data);
        },
        close() {
          comm.closed = true;
          comm.isDisposed = true;
        },
      };
      comms.push(comm);
      return comm;
    },
  };
  kernel.statusChanged = new Signal(kernel);
  kernel.disposed = new Signal(kernel);
  return {
    kernel,
    comms,
    resolveInfo: () => resolveInfo(),
    settleSubshell: (ok = true) => settleSubshell(ok),
    /** The kernel's answer to the latest request on the newest comm. */
    answer(diagnostics: unknown, request?: number) {
      const comm = comms.at(-1)!;
      comm.onMsg({
        content: { data: { request: request ?? comm.sent.at(-1)!.request, diagnostics } },
      });
    },
    setStatus(next: string) {
      kernel.status = next;
      kernel.statusChanged.emit(next);
    },
  };
}

let notebook: Notebook;
let attached: IDisposable;
let holder: HTMLDivElement;
let session: { session: { kernel: unknown } | null; kernelChanged: Signal<object, unknown> };
let owner: object;

function start(kernel: ReturnType<typeof fakeKernel> | null, attach = true) {
  owner = {};
  session = {
    session: kernel ? { kernel: kernel.kernel } : null,
    kernelChanged: new Signal(owner),
    sessionChanged: new Signal(owner),
  } as unknown as typeof session;
  const context = session as unknown as ISessionContext;
  const rendermime = createRendermime('', {} as Contents.IManager);
  notebook = createNotebook(rendermime);
  const model = new NotebookModel();
  model.fromJSON(CONTENT);
  notebook.model = model;
  holder = document.createElement('div');
  document.body.append(holder);
  Widget.attach(notebook, holder);
  notebook.activeCellIndex = 0;
  if (attach) attached = attachTypeErrors(notebook, context);
  return context;
}

/** Let an open that waits for the kernel's info finish. */
const settle = () => vi.advanceTimersByTimeAsync(0);
const pause = () => vi.advanceTimersByTimeAsync(TYPE_ERRORS_DELAY_MS);

const cell = (i: number) => notebook.widgets[i]!;
const setSource = (i: number, text: string) => cell(i).model.sharedModel.setSource(text);
/** Type at the end, as a person does: marks before it stay. */
const append = (i: number, text: string) => {
  const shared = cell(i).model.sharedModel;
  const end = shared.getSource().length;
  shared.updateSource(end, end, text);
};

function marks(i = 0) {
  const view = (cell(i).editor as CodeMirrorEditor).editor;
  const found: { from: number; to: number; severity: string; message: string; source?: string }[] =
    [];
  forEachDiagnostic(view.state, (d, from, to) =>
    found.push({ from, to, severity: d.severity, message: d.message, source: d.source }),
  );
  return found;
}

const error = (start: number, end: number, message = 'Type error', code = 2322) => ({
  start,
  end,
  severity: 'error',
  code,
  message,
});

beforeEach(() => {
  resetTypeErrorsForTests();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  attached?.dispose();
  const model = notebook?.model;
  notebook?.dispose();
  model?.dispose();
  holder?.remove();
  vi.useRealTimers();
  resetTypeErrorsForTests();
});

describe('codePointToOffset', () => {
  it('is the offset itself in text without astral characters', () => {
    expect(codePointToOffset('const n = 1', 6)).toBe(6);
    expect(codePointToOffset('héllo', 2)).toBe(2);
  });

  it('counts an emoji as one code point and two UTF-16 units', () => {
    const code = 'a😀b = 1';
    expect(codePointToOffset(code, 1)).toBe(1);
    expect(codePointToOffset(code, 2)).toBe(3);
    expect(codePointToOffset(code, 3)).toBe(4);
    expect(codePointToOffset('𝐚𝐛', 1)).toBe(2);
  });

  it('clamps to the text', () => {
    expect(codePointToOffset('a😀', 99)).toBe(3);
    expect(codePointToOffset('abc', -1)).toBe(0);
  });
});

describe('toDiagnostics', () => {
  it('moves each mark past the emoji before it, and names the TS code', () => {
    // `1` is code point 31 and, after the emoji's two units, unit 32.
    const code = "const s = '😀'; let n: string = 1";
    const [d] = toDiagnostics(code, [error(31, 32, 'bad')]);
    expect(code.slice(d!.from, d!.to)).toBe('1');
    expect(d).toMatchObject({ severity: 'error', message: 'bad', source: 'TS2322' });
  });

  it('keeps an astral character inside a range whole', () => {
    const code = 'x = "😀😀"';
    const [d] = toDiagnostics(code, [error(4, 8)]);
    expect(code.slice(d!.from, d!.to)).toBe('"😀😀"');
  });

  it('widens an empty range to the character there, or before the end', () => {
    expect(toDiagnostics('a😀', [error(1, 1)])).toMatchObject([{ from: 1, to: 3 }]);
    expect(toDiagnostics('ab', [error(2, 2)])).toMatchObject([{ from: 1, to: 2 }]);
    expect(toDiagnostics('a😀', [error(2, 2)])).toMatchObject([{ from: 1, to: 3 }]);
    expect(toDiagnostics('', [error(0, 0)])).toEqual([]);
  });

  it('maps severities and leaves out entries that are not well formed', () => {
    const out = toDiagnostics('abc', [
      { ...error(0, 1), severity: 'warning' },
      { ...error(1, 2), code: undefined },
      { start: 'x', end: 1, message: 'm' },
      { start: 0, end: 1 },
      null,
    ]);
    expect(out).toMatchObject([{ severity: 'warning', source: 'TS2322' }, { severity: 'error' }]);
    expect(out[1]).not.toHaveProperty('source');
    expect(toDiagnostics('abc', 'nope')).toEqual([]);
  });
});

describe('the switch', () => {
  it('is on until turned off, and remembered', () => {
    expect(typeErrorsEnabled()).toBe(true);
    setTypeErrorsEnabled(false);
    expect(typeErrorsEnabled()).toBe(false);
    expect(localStorage.getItem('ganymede-ui:type-errors')).toBe('off');
    setTypeErrorsEnabled(true);
    expect(typeErrorsEnabled()).toBe(true);
    expect(localStorage.getItem('ganymede-ui:type-errors')).toBeNull();
  });

  it('holds for the page when local storage fails', () => {
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('private mode');
    });
    try {
      setTypeErrorsEnabled(false);
      expect(typeErrorsEnabled()).toBe(false);
    } finally {
      set.mockRestore();
      get.mockRestore();
    }
  });
});

describe('attachTypeErrors', () => {
  it('opens the comm once the kernel is ready, not before', async () => {
    const k = fakeKernel();
    k.kernel.status = 'starting';
    start(k);
    await settle();
    expect(k.comms).toHaveLength(0);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(1);
    expect(k.comms[0]!.opened).toBe(true);
  });

  it('sends the cell after an edit pauses, once for a burst of edits', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    // The active cell is checked when the comm opens.
    await pause();
    expect(k.comms[0]!.sent).toHaveLength(1);
    setSource(0, 'let a');
    await vi.advanceTimersByTimeAsync(TYPE_ERRORS_DELAY_MS - 1);
    setSource(0, 'let a: string = 1');
    await vi.advanceTimersByTimeAsync(TYPE_ERRORS_DELAY_MS - 1);
    expect(k.comms[0]!.sent).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(k.comms[0]!.sent).toHaveLength(2);
    expect(k.comms[0]!.sent[1]).toMatchObject({ code: 'let a: string = 1' });
    expect(typeof k.comms[0]!.sent[1]!.request).toBe('number');
  });

  it('underlines the answer, past an emoji, with the message and TS code', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    const code = "const s = '😀'; let n: string = 1";
    setSource(0, code);
    await pause();
    k.answer([error(31, 32, "Type 'number' is not assignable to type 'string'.")]);
    expect(marks()).toEqual([
      {
        from: 32,
        to: 33,
        severity: 'error',
        message: "Type 'number' is not assignable to type 'string'.",
        source: 'TS2322',
      },
    ]);
    expect(code.slice(32, 33)).toBe('1');
  });

  it('drops an answer for text that has changed since the request', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    const request = k.comms[0]!.sent.at(-1)!.request;
    setSource(0, 'let n: string = 12');
    k.answer([error(16, 17)], request);
    expect(marks()).toEqual([]);
  });

  it('drops an answer that is not the latest request for its cell', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    const first = k.comms[0]!.sent.at(-1)!.request;
    // The cell is checked again with the same text.
    setSource(0, 'let n: string = 1 ');
    setSource(0, 'let n: string = 1');
    await pause();
    const second = k.comms[0]!.sent.at(-1)!.request;
    expect(second).toBeGreaterThan(first);
    k.answer([error(16, 17, 'old')], first);
    expect(marks()).toEqual([]);
    k.answer([error(16, 17, 'new')], second);
    expect(marks().map(m => m.message)).toEqual(['new']);
  });

  it('keeps the marks when the kernel cannot tell (diagnostics null)', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);
    append(0, ';');
    await pause();
    k.answer(null);
    expect(marks()).toHaveLength(1);
    append(0, ' ');
    await pause();
    k.answer([]);
    expect(marks()).toEqual([]);
  });

  it('asks again, backing off, while the kernel cannot tell yet, and stops on an answer', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    const sent = () => k.comms[0]!.sent.length;
    const before = sent();
    // Loading TypeScript: null, asked again after 1 s, then 2 s.
    k.answer(null);
    await vi.advanceTimersByTimeAsync(TYPE_ERRORS_RETRY_MS - 1);
    expect(sent()).toBe(before);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent()).toBe(before + 1);
    expect(k.comms[0]!.sent.at(-1)).toMatchObject({ code: 'let n: string = 1' });
    k.answer(null);
    await vi.advanceTimersByTimeAsync(2 * TYPE_ERRORS_RETRY_MS - 1);
    expect(sent()).toBe(before + 1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent()).toBe(before + 2);
    // It answers: the marks show, and nothing more is asked.
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent()).toBe(before + 2);
  });

  it('gives up asking again after a few tries, and starts over with an edit', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n = 1');
    await pause();
    const before = k.comms[0]!.sent.length;
    for (let i = 0; i <= TYPE_ERRORS_RETRIES; i++) {
      k.answer(null);
      await vi.advanceTimersByTimeAsync(8000);
    }
    expect(k.comms[0]!.sent.length).toBe(before + TYPE_ERRORS_RETRIES);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(k.comms[0]!.sent.length).toBe(before + TYPE_ERRORS_RETRIES);
    // An edit is new text: it is checked, and retried again if need be.
    append(0, ';');
    await pause();
    expect(k.comms[0]!.sent.length).toBe(before + TYPE_ERRORS_RETRIES + 1);
    k.answer(null);
    await vi.advanceTimersByTimeAsync(TYPE_ERRORS_RETRY_MS);
    expect(k.comms[0]!.sent.length).toBe(before + TYPE_ERRORS_RETRIES + 2);
  });

  it('stops for a kernel that closes the comm, until it restarts', async () => {
    const k = fakeKernel({ refuse: true });
    start(k);
    await settle();
    expect(k.comms).toHaveLength(1);
    setSource(0, 'let a = 1');
    await pause();
    expect(k.comms[0]!.sent).toEqual([]);
    // Another status change doesn't try again.
    k.setStatus('busy');
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(1);
    // A restart is a new kernel process: ask again.
    k.setStatus('restarting');
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
  });

  it('does not open for a kernel of another language', async () => {
    const k = fakeKernel({ language: 'python' });
    start(k);
    await settle();
    expect(k.comms).toHaveLength(0);
    setSource(0, 'x = 1');
    await pause();
    expect(k.comms).toHaveLength(0);
  });

  it('clears the marks on restart and opens the comm again afterwards', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);
    k.setStatus('restarting');
    expect(marks()).toEqual([]);
    // An answer from before the restart can't come back.
    k.answer([error(16, 17)], k.comms[0]!.sent.at(-1)!.request);
    expect(marks()).toEqual([]);
    k.setStatus('starting');
    expect(k.comms).toHaveLength(1);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
    setSource(0, 'let m: string = 2');
    await pause();
    expect(k.comms[1]!.sent.at(-1)).toMatchObject({ code: 'let m: string = 2' });
  });

  it('clears the marks and moves to the new comm when the kernel changes', async () => {
    const first = fakeKernel();
    start(first);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    first.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);

    const second = fakeKernel();
    session.session = { kernel: second.kernel };
    session.kernelChanged.emit({});
    expect(marks()).toEqual([]);
    expect(first.comms[0]!.closed).toBe(true);
    await settle();
    expect(second.comms).toHaveLength(1);

    // No kernel: nothing is sent.
    session.session = null;
    session.kernelChanged.emit({});
    expect(second.comms[0]!.closed).toBe(true);
  });

  it('clears the marks when the cell becomes Markdown', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);
    const request = k.comms[0]!.sent.at(-1)!.request;
    notebook.select(cell(0));
    NotebookActions.changeCellType(notebook, 'markdown');
    await settle();
    expect(cell(0).model.type).toBe('markdown');
    expect(marks()).toEqual([]);
    // An answer that was on its way is dropped, and the cell is not sent.
    k.answer([error(16, 17)], request);
    expect(marks()).toEqual([]);
    const sent = k.comms[0]!.sent.length;
    setSource(0, '# title');
    await pause();
    expect(k.comms[0]!.sent).toHaveLength(sent);
  });

  it('does not check Markdown cells', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    await pause();
    const sent = k.comms[0]!.sent.length;
    setSource(1, 'edited');
    await pause();
    expect(k.comms[0]!.sent).toHaveLength(sent);
  });

  it('turns off and on with the switch: clears, closes the comm, sends nothing, then reopens', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);

    setTypeErrorsEnabled(false);
    expect(marks()).toEqual([]);
    expect(k.comms[0]!.closed).toBe(true);
    setSource(0, 'let n: string = 2');
    await pause();
    expect(k.comms[0]!.sent.at(-1)).toMatchObject({ code: 'let n: string = 1' });
    k.setStatus('busy');
    await settle();
    expect(k.comms).toHaveLength(1);

    setTypeErrorsEnabled(true);
    await settle();
    expect(k.comms).toHaveLength(2);
    await pause();
    expect(k.comms[1]!.sent.at(-1)).toMatchObject({ code: 'let n: string = 2' });
  });

  it('does not open while the switch is off', async () => {
    setTypeErrorsEnabled(false);
    const k = fakeKernel();
    start(k);
    await settle();
    expect(k.comms).toHaveLength(0);
  });

  it('opens one comm when the status changes while it waits for the kernel', async () => {
    const k = fakeKernel();
    k.kernel.status = 'starting';
    start(k);
    k.setStatus('idle');
    k.setStatus('busy');
    await settle();
    expect(k.comms).toHaveLength(1);
  });
  it('opens again after the runtime exits and closes a comm that had answered', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    k.comms[0]!.onClose({});
    expect(marks()).toEqual([]);
    k.setStatus('busy');
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
  });

  it('asks a new kernel after one that refused, or was not TypeScript', async () => {
    for (const first of [fakeKernel({ refuse: true }), fakeKernel({ language: 'python' })]) {
      start(first);
      await settle();
      const second = fakeKernel();
      session.session = { kernel: second.kernel };
      session.kernelChanged.emit({});
      await settle();
      expect(second.comms).toHaveLength(1);
      attached.dispose();
      notebook.dispose();
      holder.remove();
    }
  });

  it('gives up an open that the kernel restarted under', async () => {
    const k = fakeKernel({ deferInfo: true });
    start(k);
    k.setStatus('restarting');
    k.resolveInfo();
    await settle();
    expect(k.comms).toHaveLength(0);
  });

  it('stops when the kernel is disposed', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    k.kernel.disposed.emit();
    expect(marks()).toEqual([]);
    expect(k.comms[0]!.closed).toBe(true);
    setSource(0, 'let m = 1');
    await pause();
    expect(k.comms[0]!.sent).toHaveLength(1);
  });

  it('follows a session that gets its kernel later', async () => {
    start(null);
    await settle();
    const k = fakeKernel();
    session.session = { kernel: k.kernel };
    (session as unknown as { sessionChanged: Signal<object, unknown> }).sessionChanged.emit({});
    await settle();
    expect(k.comms).toHaveLength(1);
  });

  it('drops the comm when sending fails, and opens it again with the next status', async () => {
    const k = fakeKernel({ throwOnSend: true });
    start(k);
    await settle();
    setSource(0, 'let n = 1');
    await pause();
    expect(k.comms[0]!.closed).toBe(true);
    k.setStatus('busy');
    await settle();
    expect(k.comms).toHaveLength(2);
  });

  it('does nothing after dispose, when the switch changes', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    attached.dispose();
    expect(k.comms[0]!.closed).toBe(true);
    setTypeErrorsEnabled(false);
    setTypeErrorsEnabled(true);
    await settle();
    expect(k.comms).toHaveLength(1);
  });

  it('follows the switch changed in another window (the storage event)', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    localStorage.setItem('ganymede-ui:type-errors', 'off');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ganymede-ui:type-errors' }));
    expect(k.comms[0]!.closed).toBe(true);
    localStorage.removeItem('ganymede-ui:type-errors');
    window.dispatchEvent(new StorageEvent('storage', { key: 'ganymede-ui:type-errors' }));
    await settle();
    expect(k.comms).toHaveLength(2);
    // Another key is none of its business.
    window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
    await settle();
    expect(k.comms).toHaveLength(2);
  });
  it('forgets that a comm answered when the kernel changes: a refusal by the next is a refusal', async () => {
    const a = fakeKernel();
    start(a);
    await settle();
    setSource(0, 'let n = 1');
    await pause();
    a.answer([]);
    const b = fakeKernel({ refuse: true });
    session.session = { kernel: b.kernel };
    session.kernelChanged.emit({});
    await settle();
    for (let i = 0; i < 3; i++) {
      b.setStatus('busy');
      b.setStatus('idle');
      await settle();
    }
    expect(b.comms).toHaveLength(1);
  });

  it.each(['autorestarting', 'dead'])('clears the marks and reopens after %s', async status => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    k.answer([error(16, 17)]);
    k.setStatus(status);
    expect(marks()).toEqual([]);
    expect(k.comms[0]!.closed).toBe(true);
    k.setStatus('idle');
    await settle();
    expect(k.comms).toHaveLength(2);
  });

  it('follows a cleared local storage in another window (a storage event with no key)', async () => {
    setTypeErrorsEnabled(false);
    const k = fakeKernel();
    start(k);
    await settle();
    expect(k.comms).toHaveLength(0);
    localStorage.clear();
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    await settle();
    expect(k.comms).toHaveLength(1);
  });

  it('stops listening to the switch once disposed', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    // Kept apart from the kernel: only the switch listener can reopen it.
    attached.dispose();
    const before = k.comms.length;
    k.kernel.status = 'idle';
    const spy = vi.spyOn(k.kernel, 'createComm');
    setTypeErrorsEnabled(false);
    setTypeErrorsEnabled(true);
    await settle();
    expect(spy).not.toHaveBeenCalled();
    expect(k.comms).toHaveLength(before);
  });

  it('disconnects everything it connected when disposed', async () => {
    const k = fakeKernel();
    const context = start(k, false);
    const connect = vi.spyOn(Signal.prototype, 'connect');
    const disconnect = vi.spyOn(Signal.prototype, 'disconnect');
    try {
      attached = attachTypeErrors(notebook, context);
      await settle();
      const ours = ['setKernel', 'onStatus', 'onDisposed', 'onSwitch', 'syncCells', 'onChange'];
      const pairs = connect.mock.calls
        .map((call, i) => [connect.mock.contexts[i], call[0]] as const)
        .filter(([, fn]) => ours.includes((fn as { name: string }).name));
      // The session's two signals, the cells, the kernel's two, the switch.
      expect(pairs.length).toBeGreaterThanOrEqual(6);
      attached.dispose();
      const gone = disconnect.mock.calls.map((call, i) => [disconnect.mock.contexts[i], call[0]]);
      for (const [signal, fn] of pairs) {
        expect(gone.some(([s, f]) => s === signal && f === fn)).toBe(true);
      }
    } finally {
      connect.mockRestore();
      disconnect.mockRestore();
    }
  });

  it('tries again at the next status when the kernel info fails', async () => {
    const k = fakeKernel({ infoFails: 1 });
    start(k);
    await settle();
    expect(k.comms).toHaveLength(0);
    k.setStatus('busy');
    await settle();
    expect(k.comms).toHaveLength(1);
  });

  it('asks a kernel of another language once, not at every status', async () => {
    const k = fakeKernel({ language: 'python' });
    start(k);
    await settle();
    const reads = k.kernel.infoReads;
    k.setStatus('busy');
    k.setStatus('idle');
    await settle();
    expect(k.kernel.infoReads).toBe(reads);
  });

  it('opens the comm only once its subshell has started', async () => {
    const k = fakeKernel({ subshells: true, deferSubshell: true });
    start(k);
    await settle();
    expect(k.comms).toHaveLength(1);
    expect(k.comms[0]!.opened).toBe(false);
    k.settleSubshell();
    await settle();
    expect(k.comms[0]!.opened).toBe(true);
  });

  it('opens on the main shell when the subshell fails, and not at all when dropped meanwhile', async () => {
    const k = fakeKernel({ subshells: true, deferSubshell: true });
    start(k);
    await settle();
    k.settleSubshell(false);
    await settle();
    expect(k.comms[0]!.opened).toBe(true);

    const j = fakeKernel({ subshells: true, deferSubshell: true });
    session.session = { kernel: j.kernel };
    session.kernelChanged.emit({});
    await settle();
    j.setStatus('restarting');
    j.settleSubshell();
    await settle();
    expect(j.comms[0]!.opened).toBe(false);
  });

  it('does not wait for a subshell the kernel does not have', async () => {
    const k = fakeKernel({ deferSubshell: true });
    start(k);
    await settle();
    expect(k.comms[0]!.opened).toBe(true);
  });

  it('checks again after a check that was never answered', async () => {
    const k = fakeKernel();
    start(k);
    await settle();
    setSource(0, 'let n: string = 1');
    await pause();
    append(0, ';');
    await pause();
    k.answer([error(16, 17)]);
    expect(marks()).toHaveLength(1);
  });
});
