import '../test/notebook-env';
import { describe, expect, it } from 'vitest';
import type * as nbformat from '@jupyterlab/nbformat';
import { NotebookModel } from '@jupyterlab/notebook';
import { createNotebook, createStaticRendermime } from './jupyterlab';
import { seedLanguage } from './language';

function model(metadata: nbformat.INotebookMetadata = {}) {
  const m = new NotebookModel();
  m.fromJSON({ nbformat: 4, nbformat_minor: 5, metadata, cells: [] });
  m.dirty = false;
  return m;
}

describe('seedLanguage', () => {
  it('sets language_info from the kernelspec language without dirtying', () => {
    const m = model();
    seedLanguage(m, 'typescript');
    expect(m.getMetadata('language_info')).toEqual({ name: 'typescript' });
    expect(m.dirty).toBe(false);
  });

  it('keeps an existing language_info unless replacing', () => {
    const m = model({ language_info: { name: 'typescript', version: '5.9' } });
    seedLanguage(m, 'python');
    expect(m.getMetadata('language_info')).toEqual({ name: 'typescript', version: '5.9' });
    seedLanguage(m, 'python', true);
    expect(m.getMetadata('language_info')).toEqual({ name: 'python' });
  });

  it('keeps a full language_info when replacing with the same language', () => {
    const m = model({ language_info: { name: 'typescript', version: '5.9' } });
    seedLanguage(m, 'typescript', true);
    expect(m.getMetadata('language_info')).toEqual({ name: 'typescript', version: '5.9' });
  });

  it('does nothing without a language', () => {
    const m = model();
    seedLanguage(m, undefined);
    expect(m.getMetadata('language_info')).toEqual({ name: '' });
  });

  it("sets the cells' editor language", () => {
    const notebook = createNotebook(createStaticRendermime());
    const m = model();
    notebook.model = m;
    expect(notebook.codeMimetype).toBe('text/plain');
    seedLanguage(m, 'typescript');
    expect(notebook.codeMimetype).not.toBe('text/plain');
    seedLanguage(m, 'python', true);
    expect(notebook.codeMimetype).toMatch(/python/);
    notebook.dispose();
  });
});
