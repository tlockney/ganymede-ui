/**
 * Shared CodeMirror registries for JupyterLab notebook cells and the
 * expanded source view (#822), kept separate from `jupyterlab.ts` so UI
 * tests that mock JupyterLab notebooks keep real syntax highlighting.
 */
import {
  EditorExtensionRegistry,
  EditorLanguageRegistry,
  EditorThemeRegistry,
  type IEditorLanguage,
} from '@jupyterlab/codemirror';
import { withDuckdbSql } from './sql-languages';

export const editorLanguages = new EditorLanguageRegistry();
for (const language of withDuckdbSql(EditorLanguageRegistry.getDefaultLanguages())) {
  editorLanguages.addLanguage(language);
}

export const editorThemes = new EditorThemeRegistry();
for (const theme of EditorThemeRegistry.getDefaultThemes()) {
  editorThemes.addTheme(theme);
}

/** Builds JupyterLab's default CodeMirror extension registry, optionally extended by callers. */
export function createEditorExtensions(
  configure?: (extensions: EditorExtensionRegistry) => void,
): EditorExtensionRegistry {
  const extensions = new EditorExtensionRegistry();
  for (const extension of EditorExtensionRegistry.getDefaultExtensions({ themes: editorThemes })) {
    extensions.addExtension(extension);
  }
  configure?.(extensions);
  return extensions;
}

/** Resolves a language spec by MIME type or notebook/cell language name. */
export function findEditorLanguage(mimeOrName?: string): IEditorLanguage | null {
  if (!mimeOrName) return null;
  return editorLanguages.findByMIME(mimeOrName) ?? editorLanguages.findBest(mimeOrName, false);
}
