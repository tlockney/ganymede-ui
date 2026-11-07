import type { INotebookModel } from '@jupyterlab/notebook';

/**
 * Give the notebook a cell language before its kernel starts (#352).
 *
 * The editors take their language, and so their highlighting, from
 * `metadata.language_info`, which the kernel's info reply fills in. Kernels
 * start on the first run, so until then a notebook saved without it (or a
 * new one) would edit as plain text. This sets `{ name: language }` from the
 * kernelspec instead; the kernel's full `language_info` replaces it once the
 * kernel starts.
 *
 * With `replace`, a known language is overwritten too: for a
 * kernel picked before the first run. Doesn't mark the model dirty.
 */
export function seedLanguage(
  model: INotebookModel,
  language: string | undefined,
  replace = false,
): void {
  if (!language || model.isDisposed) return;
  const before = model.getMetadata('language_info') as { name?: unknown } | undefined;
  // JupyterLab's model starts with `{ name: '' }`: no language yet.
  const known = typeof before?.name === 'string' && before.name !== '';
  if (known && (!replace || before.name === language)) return;
  const wasDirty = model.dirty;
  model.setMetadata('language_info', { name: language });
  model.dirty = wasDirty;
}
