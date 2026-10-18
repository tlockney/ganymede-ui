/**
 * JupyterLab's notebook, used as a library.
 *
 * Inside JupyterLab these pieces come from plugins (rendermime, the
 * CodeMirror registries, the notebook commands and their shortcuts). The app
 * has no plugin system, so they're built here once and shared by every open
 * notebook. Only what a notebook needs: no file browser, launcher, menus,
 * settings registry or document manager.
 *
 * `attachEditing` adds what the completer, tooltip, document search and cell
 * toolbar extensions would: Tab completion and Shift+Tab inspection from the
 * kernel, find in notebook, and the active cell's toolbar.
 */
import { fillColor } from '@jupyter/web-components';
import type { IYText } from '@jupyter/ydoc';
import type { ISessionContext } from '@jupyterlab/apputils';
import { CellToolbarTracker } from '@jupyterlab/cell-toolbar';
import type { Cell } from '@jupyterlab/cells';
import type { CodeEditor } from '@jupyterlab/codeeditor';
import {
  CodeMirrorEditorFactory,
  CodeMirrorMimeTypeService,
  EditorExtensionRegistry,
  EditorLanguageRegistry,
  EditorThemeRegistry,
  ybinding,
} from '@jupyterlab/codemirror';
import {
  CompletionProviderManager,
  ContextCompleterProvider,
  KernelCompleterProvider,
} from '@jupyterlab/completer';
import { Text } from '@jupyterlab/coreutils';
import { SearchDocumentModel, SearchDocumentView } from '@jupyterlab/documentsearch';
import {
  Notebook,
  NotebookActions,
  NotebookPanel,
  NotebookSearchProvider,
  StaticNotebook,
  runCell,
  setCellExecutor,
} from '@jupyterlab/notebook';
import {
  type IRenderMimeRegistry,
  RenderMimeRegistry,
  standardRendererFactories,
} from '@jupyterlab/rendermime';
import type { IRenderMime } from '@jupyterlab/rendermime-interfaces';
import type { Contents } from '@jupyterlab/services';
import { createMarkdownParser } from '@jupyterlab/markedparser-extension';
import { MathJaxTypesetter } from '@jupyterlab/mathjax-extension';
import javascriptExtension from '@jupyterlab/javascript-extension';
import jsonExtension from '@jupyterlab/json-extension';
import { Tooltip } from '@jupyterlab/tooltip';
import { ObservableList } from '@jupyterlab/observables';
import {
  type LabIcon,
  ToolbarButton,
  addAboveIcon,
  addBelowIcon,
  deleteIcon,
  duplicateIcon,
  moveDownIcon,
  moveUpIcon,
} from '@jupyterlab/ui-components';
import { CommandRegistry } from '@lumino/commands';
import type { JSONObject } from '@lumino/coreutils';
import type { Message } from '@lumino/messaging';
import { DisposableDelegate, DisposableSet, type IDisposable } from '@lumino/disposable';
import { Widget } from '@lumino/widgets';

// JupyterLab's own stylesheets for the notebook and everything it pulls in
// (cells, output area, CodeMirror, Lumino). Theme variables are injected
// separately; see `src/lib/theme.ts`.
import '@jupyterlab/notebook/style/index.js';
// Not mathjax-extension's style/index.js: that pulls in JupyterLab's whole
// application stylesheet, Font Awesome included.
import '@jupyterlab/mathjax-extension/style/base.css';
import '@jupyterlab/javascript-extension/style/index.js';
import '@jupyterlab/json-extension/style/index.js';
import '@jupyterlab/completer/style/index.js';
import '@jupyterlab/tooltip/style/index.js';
import '@jupyterlab/documentsearch/style/index.js';
import '@jupyterlab/cell-toolbar/style/index.js';

const languages = new EditorLanguageRegistry();
for (const language of EditorLanguageRegistry.getDefaultLanguages()) {
  languages.addLanguage(language);
}

const themes = new EditorThemeRegistry();
for (const theme of EditorThemeRegistry.getDefaultThemes()) {
  themes.addTheme(theme);
}

const extensions = new EditorExtensionRegistry();
for (const extension of EditorExtensionRegistry.getDefaultExtensions({ themes })) {
  extensions.addExtension(extension);
}
// Bind each editor to its cell's shared model, as JupyterLab's
// codemirror-extension plugin does; without it edits never reach the model.
extensions.addExtension({
  name: 'shared-model-binding',
  factory: options => {
    const shared = options.model.sharedModel as IYText;
    return EditorExtensionRegistry.createImmutableExtension(
      ybinding({ ytext: shared.ysource, undoManager: shared.undoManager ?? undefined }),
    );
  },
});

const editorServices = {
  factory: new CodeMirrorEditorFactory({ extensions, languages }),
  mimeTypes: new CodeMirrorMimeTypeService(languages),
};

// One executor for every notebook; JupyterLab sets it from a plugin and
// warns on each run when nothing has.
setCellExecutor({ runCell });

/** The default renderers plus JupyterLab's default MIME extensions. */
const mimeExtensions: IRenderMime.IExtension[] = [javascriptExtension, jsonExtension].flatMap(
  e => (Array.isArray(e) ? e : [e]) as IRenderMime.IExtension[],
);

const baseRendermime = new RenderMimeRegistry({
  initialFactories: standardRendererFactories,
  markdownParser: createMarkdownParser(languages),
  latexTypesetter: new MathJaxTypesetter(),
});
for (const extension of mimeExtensions) {
  baseRendermime.addFactory(extension.rendererFactory, extension.rank);
}

/**
 * A rendermime registry for one notebook: relative links and images in
 * Markdown and HTML resolve against the notebook's folder.
 */
export function createRendermime(path: string, contents: Contents.IManager): IRenderMimeRegistry {
  return baseRendermime.clone({
    resolver: new RenderMimeRegistry.UrlResolver({ path, contents }),
  });
}

let notebookCount = 0;

/** A notebook widget with no model yet, with an id safe in selectors. */
export function createNotebook(rendermime: IRenderMimeRegistry): Notebook {
  const notebook = new Notebook({
    rendermime,
    contentFactory: new NotebookPanel.ContentFactory({
      editorFactory: editorServices.factory.newInlineEditor,
    }),
    mimeTypeService: editorServices.mimeTypes,
    notebookConfig: {
      ...StaticNotebook.defaultNotebookConfig,
      // Render every cell. The pane is small, and windowing would keep cells
      // out of the DOM (and out of reach of find-in-page and tests).
      windowingMode: 'none',
      scrollPastEnd: false,
    },
  });
  notebook.id = `notebook-${++notebookCount}`;
  return notebook;
}

/**
 * The notebook commands and the keyboard shortcuts JupyterLab binds to them
 * (from `@jupyterlab/notebook-extension`'s defaults): run, modes, moving,
 * inserting, deleting and changing cells. Bound to one notebook.
 */
export function createCommands(notebook: Notebook, session: ISessionContext): CommandRegistry {
  const commands = new CommandRegistry();
  const add = (id: string, execute: () => unknown) =>
    commands.addCommand(id, { execute: () => void execute() });

  add('run-cell', () => NotebookActions.run(notebook, session));
  add('run-and-advance', () => NotebookActions.runAndAdvance(notebook, session));
  add('run-and-insert', () => NotebookActions.runAndInsert(notebook, session));
  add('run-all', () => NotebookActions.runAll(notebook, session));
  add('command-mode', () => {
    notebook.mode = 'command';
    notebook.node.focus();
  });
  add('edit-mode', () => (notebook.mode = 'edit'));
  add('select-above', () => NotebookActions.selectAbove(notebook));
  add('select-below', () => NotebookActions.selectBelow(notebook));
  add('extend-above', () => NotebookActions.extendSelectionAbove(notebook));
  add('extend-below', () => NotebookActions.extendSelectionBelow(notebook));
  add('insert-above', () => NotebookActions.insertAbove(notebook));
  add('insert-below', () => NotebookActions.insertBelow(notebook));
  add('delete', () => NotebookActions.deleteCells(notebook));
  add('cut', () => NotebookActions.cut(notebook));
  add('copy', () => NotebookActions.copy(notebook));
  add('paste', () => NotebookActions.paste(notebook, 'below'));
  add('undo', () => NotebookActions.undo(notebook));
  add('redo', () => NotebookActions.redo(notebook));
  add('to-code', () => NotebookActions.changeCellType(notebook, 'code'));
  add('to-markdown', () => NotebookActions.changeCellType(notebook, 'markdown'));
  add('to-raw', () => NotebookActions.changeCellType(notebook, 'raw'));
  add('move-up', () => NotebookActions.moveUp(notebook));
  add('move-down', () => NotebookActions.moveDown(notebook));
  add('select-all', () => NotebookActions.selectAll(notebook));

  const id = notebook.id;
  const edit = `#${id}.jp-mod-editMode`;
  const command = `#${id}.jp-mod-commandMode :focus`;
  const both = [edit, command];
  const bind = (keys: string[], cmd: string, selectors: string[]) =>
    selectors.forEach(selector => commands.addKeyBinding({ keys, command: cmd, selector }));

  bind(['Shift Enter'], 'run-and-advance', both);
  bind(['Accel Enter'], 'run-cell', both);
  bind(['Alt Enter'], 'run-and-insert', both);
  bind(['Escape'], 'command-mode', [edit]);
  bind(['Ctrl M'], 'command-mode', [edit]);
  bind(['Enter'], 'edit-mode', [`#${id}.jp-mod-commandMode .jp-Cell:focus`]);
  bind(['ArrowUp'], 'select-above', [command]);
  bind(['K'], 'select-above', [command]);
  bind(['ArrowDown'], 'select-below', [command]);
  bind(['J'], 'select-below', [command]);
  bind(['Shift ArrowUp'], 'extend-above', [command]);
  bind(['Shift K'], 'extend-above', [command]);
  bind(['Shift ArrowDown'], 'extend-below', [command]);
  bind(['Shift J'], 'extend-below', [command]);
  bind(['A'], 'insert-above', [command]);
  bind(['B'], 'insert-below', [command]);
  bind(['D', 'D'], 'delete', [command]);
  bind(['X'], 'cut', [command]);
  bind(['C'], 'copy', [command]);
  bind(['V'], 'paste', [command]);
  bind(['Z'], 'undo', [command]);
  bind(['Shift Z'], 'redo', [command]);
  bind(['Y'], 'to-code', [command]);
  bind(['M'], 'to-markdown', [command]);
  bind(['R'], 'to-raw', [command]);
  bind(['Ctrl Shift ArrowUp'], 'move-up', [command]);
  bind(['Ctrl Shift ArrowDown'], 'move-down', [command]);
  bind(['Accel A'], 'select-all', [command]);
  return commands;
}

/**
 * Completion providers, shared by every notebook, as completer-extension
 * sets them up: the kernel's `complete_request`, and words from the
 * notebook's own text.
 */
const completion = new CompletionProviderManager();
completion.registerProvider(new KernelCompleterProvider());
completion.registerProvider(new ContextCompleterProvider());
// completer-extension's default `providerTimeout`.
completion.setTimeout(1000);

type CellAction = (notebook: Notebook) => void;

/** The buttons on the active cell: JupyterLab's default cell toolbar. */
const CELL_TOOLBAR: [name: string, icon: LabIcon, tooltip: string, action: CellAction][] = [
  ['duplicate-cell', duplicateIcon, 'Duplicate cell', n => NotebookActions.duplicate(n, 'belowSelected')],
  ['move-cell-up', moveUpIcon, 'Move cell up', n => NotebookActions.moveUp(n)],
  ['move-cell-down', moveDownIcon, 'Move cell down', n => NotebookActions.moveDown(n)],
  ['insert-cell-above', addAboveIcon, 'Insert cell above', n => NotebookActions.insertAbove(n)],
  ['insert-cell-below', addBelowIcon, 'Insert cell below', n => NotebookActions.insertBelow(n)],
  ['delete-cell', deleteIcon, 'Delete cell', n => NotebookActions.deleteCells(n)],
];

/**
 * documentsearch's find bar, rendered only while it is in the page. The
 * stock view re-renders on every search-state change, closed or not, into
 * a fresh React root on its detached node; one such render, pending when
 * the notebook closes, then runs against the disposed (null) model.
 */
class FindBar extends SearchDocumentView {
  protected onUpdateRequest(msg: Message): void {
    if (this.isAttached && this.model) super.onUpdateRequest(msg);
  }
}

/**
 * The parts of a `NotebookPanel` that the search provider and the cell
 * toolbar read: the notebook (`content`), its model, id and `revealed`. The
 * app shows a bare `Notebook`; a real panel needs a document context.
 */
function panelOf(notebook: Notebook): NotebookPanel {
  return {
    id: notebook.id,
    content: notebook,
    revealed: Promise.resolve(),
    get model() {
      return notebook.model;
    },
    get isDisposed() {
      return notebook.isDisposed;
    },
  } as unknown as NotebookPanel;
}

/**
 * What JupyterLab's completer, tooltip, document search and cell toolbar
 * extensions add to a notebook, wired by hand onto its command registry:
 *
 * - Tab in edit mode completes from the kernel (`complete_request`); Enter
 *   picks the highlighted item.
 * - Shift+Tab shows the kernel's inspection of the name at the cursor
 *   (`inspect_request`) in a tooltip; Escape dismisses it.
 * - Accel+F opens the find bar over the notebook, Accel+G and Shift+Accel+G
 *   step through the matches (as do Enter and Shift+Enter in the bar),
 *   Escape closes it.
 * - The active cell gets JupyterLab's cell toolbar (duplicate, move, insert,
 *   delete).
 */
export function attachEditing(
  notebook: Notebook,
  session: ISessionContext,
  rendermime: IRenderMimeRegistry,
  commands: CommandRegistry,
): IDisposable {
  const disposables = new DisposableSet();
  const id = notebook.id;

  // Completion. The manager keeps one completer per notebook (by widget id)
  // and disposes it with the notebook; point it at the active cell's editor
  // and the current session, as completer-extension's notebook plugin does.
  const updateCompleter = async () => {
    const cell = notebook.activeCell;
    if (cell) await cell.ready;
    if (notebook.isDisposed || cell !== notebook.activeCell) return;
    await completion.updateCompleter({
      widget: notebook,
      editor: cell?.editor ?? null,
      session: session.session,
      sanitizer: rendermime.sanitizer,
    });
  };
  const onCompleterContext = () => void updateCompleter();
  notebook.activeCellChanged.connect(onCompleterContext);
  session.sessionChanged.connect(onCompleterContext);
  onCompleterContext();
  disposables.add(
    new DisposableDelegate(() => {
      notebook.activeCellChanged.disconnect(onCompleterContext);
      session.sessionChanged.disconnect(onCompleterContext);
    }),
  );
  commands.addCommand('completer:invoke', { execute: () => completion.invoke(id) });
  commands.addCommand('completer:select', { execute: () => completion.select(id) });

  // Inspection tooltip, as tooltip-extension does it.
  let tooltip: Tooltip | undefined;
  const dismissTooltip = () => {
    tooltip?.dispose();
    tooltip = undefined;
  };
  commands.addCommand('tooltip:launch', {
    execute: async () => {
      dismissTooltip();
      const editor: CodeEditor.IEditor | null | undefined = notebook.activeCell?.editor;
      const kernel = session.session?.kernel;
      if (!editor || !kernel) return;
      const code = editor.model.sharedModel.getSource();
      const offset = Text.jsIndexToCharIndex(editor.getOffsetAt(editor.getCursorPosition()), code);
      const reply = await kernel.requestInspect({ code, cursor_pos: offset, detail_level: 0 });
      const content = reply.content;
      if (content.status !== 'ok' || !content.found) return;
      // Give up if the user moved to another cell while the kernel answered.
      if (notebook.isDisposed || notebook.activeCell?.editor !== editor) return;
      dismissTooltip();
      tooltip = new Tooltip({
        anchor: notebook,
        bundle: content.data as JSONObject,
        editor,
        rendermime,
      });
      Widget.attach(tooltip, document.body);
    },
  });
  commands.addCommand('tooltip:dismiss', { execute: dismissTooltip });
  disposables.add(new DisposableDelegate(dismissTooltip));

  // Find: documentsearch's bar over the notebook's own search provider,
  // built on first use.
  let search: { view: SearchDocumentView; model: SearchDocumentModel } | undefined;
  const openSearch = async () => {
    if (!search) {
      const provider = new NotebookSearchProvider(panelOf(notebook));
      const model = new SearchDocumentModel(provider, 500);
      const view = new FindBar(model, undefined, {
        next: commands.keyBindings.find(b => b.command === 'find-next'),
        previous: commands.keyBindings.find(b => b.command === 'find-previous'),
      });
      view.id = `${id}-search`;
      view.closed.connect(() => {
        if (!notebook.isDisposed) notebook.activate();
      });
      search = { view, model };
      disposables.add(
        new DisposableDelegate(() => {
          view.dispose();
          model.dispose();
          provider.dispose();
        }),
      );
    }
    const { view, model } = search;
    view.setSearchText(model.suggestedInitialQuery);
    // Next to the notebook rather than in it: the notebook scrolls itself.
    const host = notebook.node.parentElement;
    if (!view.isAttached && host) Widget.attach(view, host);
    await view.renderPromise;
    view.focusSearchInput();
  };
  const searching = () => !!search?.view.isAttached;
  commands.addCommand('find', { execute: openSearch });
  // Accel+G with the bar closed opens it, as in a browser.
  commands.addCommand('find-next', {
    execute: () => (searching() ? search?.model.highlightNext() : openSearch()),
  });
  commands.addCommand('find-previous', {
    execute: () => (searching() ? search?.model.highlightPrevious() : openSearch()),
  });
  commands.addCommand('find-close', {
    isEnabled: searching,
    execute: () => search?.view.close(),
  });

  // The active cell's toolbar. Without the settings registry, the items are
  // built here instead of from the "Cell" toolbar setting.
  const cellToolbar = new CellToolbarTracker(panelOf(notebook), undefined, (cell: Cell) => {
    // The toolbar is a `jp-toolbar`, which derives its fill color from its
    // parent's when it connects. If the parent (the cell's input area) has
    // no design-token node yet, FAST creates one mid-derivation and recurses
    // until the stack overflows (with JupyterLab's theme applied, any parent
    // below <body>). Resolve the parent's first; the tracker attaches the
    // toolbar after `cell.ready`, so this runs before.
    void cell.ready.then(() => {
      if (cell.inputArea) fillColor.getValueFor(cell.inputArea.node);
    });
    const items = new ObservableList<{ name: string; widget: Widget }>();
    items.pushAll(
      CELL_TOOLBAR.map(([name, icon, tooltip, action]) => ({
        name,
        widget: new ToolbarButton({
          icon,
          tooltip,
          // cell-toolbar's stylesheet only shows buttons marked for the
          // cell's type.
          className: 'jp-cell-all',
          onClick: () => action(notebook),
        }),
      })),
    );
    return items;
  });
  disposables.add(cellToolbar);

  const edit = `#${id}.jp-mod-editMode`;
  const searchBar = `#${id}-search`;
  const bind = (keys: string[], command: string, selector: string) =>
    disposables.add(commands.addKeyBinding({ keys, command, selector }));
  bind(['Tab'], 'completer:invoke', `${edit} .jp-mod-completer-enabled`);
  bind(['Enter'], 'completer:select', `#${id} .jp-mod-completer-active`);
  bind(
    ['Shift Tab'],
    'tooltip:launch',
    `${edit} .jp-InputArea-editor:not(.jp-mod-has-primary-selection)` +
      ':not(.jp-mod-in-leading-whitespace):not(.jp-mod-completer-active)',
  );
  bind(['Escape'], 'tooltip:dismiss', `body.jp-mod-tooltip #${id}`);
  for (const selector of [`#${id}`, searchBar]) {
    bind(['Accel F'], 'find', selector);
    bind(['Accel G'], 'find-next', selector);
    bind(['Accel Shift G'], 'find-previous', selector);
  }
  bind(['Escape'], 'find-close', searchBar);
  return disposables;
}
