/**
 * The editor side of signature help, go to definition and rename (#676):
 * what each code cell's CodeMirror adds, and the little input that asks
 * for a new name. The comm and the requests are `language-service.ts`.
 *
 * - Signature help is a tooltip above the cursor: it opens when `(` or `,`
 *   is typed, asks again as the cursor or text moves while it shows, and
 *   closes on Escape, on losing focus, or when the cursor leaves the call
 *   (the kernel answers null).
 * - Cmd-click (Ctrl-click elsewhere) and F12 go to the definition.
 * - F2 renames the symbol.
 */
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import type { ISessionContext } from '@jupyterlab/apputils';
import type { Cell } from '@jupyterlab/cells';
import type { CodeMirrorEditor } from '@jupyterlab/codemirror';
import type { Notebook } from '@jupyterlab/notebook';
import { type IDisposable } from '@lumino/disposable';
import {
  createLanguageService,
  signatureParts,
  type LanguageHooks,
  type LanguageService,
  type SignatureHelp,
} from './language-service';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/** The tooltip's content: the label with the active parameter marked, then the documentation. */
export function signatureDom(sig: SignatureHelp): HTMLElement {
  const dom = document.createElement('div');
  dom.className = 'cm-signature-help';
  const label = document.createElement('div');
  label.className = 'cm-signature-label';
  const { before, active, after } = signatureParts(sig);
  label.append(before);
  if (active) {
    const mark = document.createElement('strong');
    mark.className = 'cm-signature-active';
    mark.textContent = active;
    label.append(mark);
  }
  label.append(after);
  dom.append(label);
  const parameter = sig.parameters[sig.activeParameter];
  for (const [className, text] of [
    ['cm-signature-parameter-doc', parameter?.documentation],
    ['cm-signature-doc', sig.documentation],
  ] as const) {
    if (!text) continue;
    const doc = document.createElement('div');
    doc.className = className;
    doc.textContent = text;
    dom.append(doc);
  }
  return dom;
}

const setSignature = StateEffect.define<Tooltip | null>();

const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setSignature)) return e.value;
    return value;
  },
  provide: f => showTooltip.from(f),
});

/** Whether the edit typed the start of an argument list or the next argument. */
function typedArgument(update: {
  changes: {
    iterChanges: (
      f: (fa: number, ta: number, fb: number, tb: number, text: { toString(): string }) => void,
    ) => void;
  };
}): boolean {
  let typed = false;
  update.changes.iterChanges((_fa, _ta, _fb, _tb, text) => {
    // `(` with its closing bracket is two characters.
    if (/^(\(|,)/.test(text.toString())) typed = true;
  });
  return typed;
}

/**
 * What a code cell's editor gets: `service` answers for `cell`.
 * Exported for the tests.
 */
export function languageExtension(service: LanguageService, cell: Cell) {
  let epoch = 0;
  /** A request is out and its answer not read yet. */
  let pendingRequest = false;
  const signatureHelp = EditorView.updateListener.of(update => {
    const { view } = update;
    if (!update.docChanged && !update.selectionSet) return;
    const open = update.state.field(signatureField) !== null;
    const wanted =
      open ||
      pendingRequest ||
      (update.docChanged &&
        update.transactions.some(t => t.isUserEvent('input.type')) &&
        typedArgument(update));
    if (!wanted) return;
    const mine = ++epoch;
    pendingRequest = true;
    const head = update.state.selection.main.head;
    void service.signature(cell, head).then(sig => {
      // The cursor or text moved on since: the later request answers.
      if (mine !== epoch) return;
      pendingRequest = false;
      // The pane or the cell went while the kernel answered.
      if (service.isDisposed || cell.isDisposed || !view.dom.isConnected) return;
      view.dispatch({
        effects: setSignature.of(
          sig
            ? {
                pos: head,
                above: true,
                strictSide: true,
                arrow: false,
                create: () => ({ dom: signatureDom(sig) }),
              }
            : null,
        ),
      });
    });
  });
  const hide = (view: EditorView) => {
    epoch++;
    pendingRequest = false;
    if (!view.state.field(signatureField)) return false;
    view.dispatch({ effects: setSignature.of(null) });
    return true;
  };

  return [
    signatureField,
    signatureHelp,
    EditorView.domEventHandlers({
      blur: (_e, view) => {
        hide(view);
        return false;
      },
      mousedown: (e, view) => {
        if (e.button !== 0 || !(IS_MAC ? e.metaKey : e.ctrlKey) || !service.available) return false;
        const pos = view.posAtCoords({ x: e.clientX, y: e.clientY });
        if (pos === null) return false;
        e.preventDefault();
        view.dispatch({ selection: { anchor: pos } });
        void service.goToDefinition(cell);
        return true;
      },
    }),
    Prec.highest(
      keymap.of([
        { key: 'Escape', run: view => hide(view) },
        {
          key: 'F12',
          run: () => {
            if (!service.available) return false;
            void service.goToDefinition(cell);
            return true;
          },
        },
        {
          key: 'F2',
          run: () => {
            if (!service.available) return false;
            // After the key's event has bubbled: the notebook's own keydown
            // handler puts the focus back in the editor, which would take it
            // from the input.
            setTimeout(() => void service.rename(undefined, cell), 0);
            return true;
          },
        },
      ]),
    ),
  ];
}

/** The input that asks for a new name next to the cursor: the name, Enter to rename, Escape to cancel. */
export function askNameNear(
  view: EditorView | undefined,
  current: string,
): { result: Promise<string | null>; cancel(): void } {
  const form = document.createElement('form');
  form.className = 'rename-prompt';
  const label = document.createElement('label');
  label.textContent = 'New name';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = current;
  input.spellcheck = false;
  input.autocomplete = 'off';
  label.append(input);
  form.append(label);
  let at: { left: number; bottom: number } | null | undefined;
  try {
    at = view?.coordsAtPos(view.state.selection.main.head);
  } catch {
    // Not laid out (hidden, or no layout): the corner.
  }
  form.style.left = `${Math.max(0, Math.round(at?.left ?? 24))}px`;
  form.style.top = `${Math.max(0, Math.round((at?.bottom ?? 24) + 4))}px`;
  document.body.append(form);
  let done!: (name: string | null) => void;
  const result = new Promise<string | null>(resolve => {
    done = name => {
      if (!form.isConnected) return;
      form.remove();
      resolve(name);
      view?.focus();
    };
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    done(input.value);
  });
  input.addEventListener('keydown', e => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      done(null);
    }
  });
  input.addEventListener('blur', () => done(null));
  input.focus();
  input.select();
  return { result, cancel: () => done(null) };
}

export interface LanguageFeatures extends IDisposable {
  readonly service: LanguageService;
}

/**
 * Give the code cells of `notebook` signature help, go to definition and
 * rename while their kernel answers the language comm. `notify` shows a
 * message the person should see: a refusal.
 */
export function attachLanguageFeatures(
  notebook: Notebook,
  session: ISessionContext,
  notify: (message: string) => void,
): LanguageFeatures {
  let prompt: { cancel(): void } | undefined;
  const hooks: LanguageHooks = {
    askName: (cell, current) => {
      prompt?.cancel();
      const asking = askNameNear((cell.editor as CodeMirrorEditor | null)?.editor, current);
      prompt = asking;
      return asking.result;
    },
    notify,
  };
  const service = createLanguageService(notebook, session, hooks);
  const injected = new WeakSet<Cell>();
  let disposed = false;

  const inject = () => {
    if (disposed || notebook.isDisposed) return;
    for (const cell of notebook.widgets) {
      if (cell.model.type !== 'code' || injected.has(cell)) continue;
      injected.add(cell);
      void cell.ready.then(() => {
        if (disposed || cell.isDisposed) return;
        (cell.editor as CodeMirrorEditor | null)?.injectExtension(languageExtension(service, cell));
      });
    }
  };

  const onCells = () => {
    inject();
    // The notebook makes the widget for a new cell as it handles the same change.
    queueMicrotask(inject);
  };
  notebook.model?.cells.changed.connect(onCells);
  notebook.activeCellChanged.connect(inject);
  inject();

  return {
    service,
    get isDisposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      prompt?.cancel();
      service.dispose();
      notebook.activeCellChanged.disconnect(inject);
      if (!notebook.isDisposed) notebook.model?.cells.changed.disconnect(onCells);
    },
  };
}
