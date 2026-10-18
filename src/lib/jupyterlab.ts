/**
 * JupyterLab's notebook, used as a library.
 *
 * Inside JupyterLab these pieces come from plugins (rendermime, the
 * CodeMirror registries, the notebook commands and their shortcuts). The app
 * has no plugin system, so they're built here once and shared by every open
 * notebook. Only what a notebook needs: no file browser, launcher, menus,
 * settings registry or document manager.
 */
import type { IYText } from '@jupyter/ydoc';
import type { ISessionContext } from '@jupyterlab/apputils';
import {
  CodeMirrorEditorFactory,
  CodeMirrorMimeTypeService,
  EditorExtensionRegistry,
  EditorLanguageRegistry,
  EditorThemeRegistry,
  ybinding,
} from '@jupyterlab/codemirror';
import {
  Notebook,
  NotebookActions,
  NotebookPanel,
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
import { CommandRegistry } from '@lumino/commands';

// JupyterLab's own stylesheets for the notebook and everything it pulls in
// (cells, output area, CodeMirror, Lumino). Theme variables are injected
// separately; see `src/lib/theme.ts`.
import '@jupyterlab/notebook/style/index.js';
// Not mathjax-extension's style/index.js: that pulls in JupyterLab's whole
// application stylesheet, Font Awesome included.
import '@jupyterlab/mathjax-extension/style/base.css';
import '@jupyterlab/javascript-extension/style/index.js';
import '@jupyterlab/json-extension/style/index.js';

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
