/**
 * The editor side of signature help, go to definition and rename (#676):
 * what each code cell's CodeMirror adds, and the little input that asks
 * for a new name. The comm and the requests are `language-service.ts`.
 *
 * - Signature help is a tooltip above the cursor: it opens when `(` or `,`
 *   is typed, asks again as the cursor or text moves while it shows, and
 *   closes on Escape, on losing focus, or when the cursor leaves the call
 *   (the kernel answers null).
 * - Cmd-click (Ctrl-click elsewhere) and F12 go to the definition. In a
 *   cell the kernel answers for, the click replaces CodeMirror's
 *   add-a-cursor click; Alt-drag still selects a rectangle.
 * - F2 renames the symbol. F12 and F2 are the defaults of the shortcuts
 *   table's `go-to-definition` and `rename-symbol`, so a rebinding applies.
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
import { IS_MAC, matches } from './shortcuts';

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

/** Closes the signature tooltip from outside the editor's own keymap. */
const closeSignature = StateEffect.define<null>();

const signatureField = StateField.define<Tooltip | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setSignature)) return e.value;
      if (e.is(closeSignature)) return null;
    }
    // The text moved under the tooltip (an edit, a rename): it stays at its place in the text.
    return value && tr.docChanged ? { ...value, pos: tr.changes.mapPos(value.pos) } : value;
  },
  provide: f => [
    showTooltip.from(f),
    // Marks the editor while the tooltip shows, so the notebook's Escape
    // binding (which runs first, in the capture phase) can yield to it.
    EditorView.editorAttributes.of(view =>
      view.state.field(f) ? { class: SIGNATURE_OPEN } : null,
    ),
  ],
});

/** The class an editor has while it shows signature help. */
export const SIGNATURE_OPEN = 'gm-mod-signature-help';

/**
 * Closes the signature help shown in an editor under `root`; the
 * notebook's Escape binding for an editor with SIGNATURE_OPEN.
 */
export function dismissSignatureHelp(root: Element): boolean {
  const el = root.querySelector(`.cm-editor.${SIGNATURE_OPEN}`);
  const view = el instanceof HTMLElement ? EditorView.findFromDOM(el) : null;
  if (!view) return false;
  view.dispatch({ effects: closeSignature.of(null) });
  return true;
}

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
    if (update.transactions.some(t => t.effects.some(e => e.is(closeSignature)))) {
      epoch++;
      pendingRequest = false;
      return;
    }
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
      // The pane or the cell went while the kernel answered (a cell that
      // went has its editor, and so its DOM, gone with it).
      if (service.isDisposed || !view.dom.isConnected) return;
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
    // The keys' bindings are the shortcuts table's, which a person can change.
    Prec.highest(
      EditorView.domEventHandlers({
        keydown: e => {
          if (!service.available) return false;
          if (matches(e, 'go-to-definition')) {
            void service.goToDefinition(cell);
            return true;
          }
          if (matches(e, 'rename-symbol')) {
            // After the key's event has bubbled: the notebook's own keydown
            // handler puts the focus back in the editor, which would take it
            // from the input.
            setTimeout(() => void service.rename(undefined, cell), 0);
            return true;
          }
          return false;
        },
      }),
    ),
    Prec.highest(keymap.of([{ key: 'Escape', run: view => hide(view) }])),
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
  // Deferred: the notebook's capture-phase keydown handler can take the
  // focus while Enter is on its way to the form, and the submit that
  // follows must still win.
  input.addEventListener('blur', () =>
    setTimeout(() => {
      if (document.activeElement !== input) done(null);
    }, 0),
  );
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

  // The notebook connected to the model's cells before this did, so a new
  // cell's widget is there when `inject` runs. A model set after this is
  // attached is not watched: its first active cell is the signal.
  const onCells = () => inject();
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
