/**
 * The example notebooks (#414): TypeScript notebooks in `examples/`, saved
 * with their outputs by `scripts/examples.mjs`, that Open Examples copies
 * into a new folder through the contents API. The notebooks load as their
 * own chunk (`example-notebooks.ts`), on first use.
 */
import type { Contents, KernelSpec } from '@jupyterlab/services';
import { lookUp } from './rename';
import { sampleKernel } from './sample';

/** The folder's name; another copy gets a number (`Examples 2`). */
export const EXAMPLES_FOLDER = 'Examples';

/** How many numbered names to try before giving up. */
const MAX_COPIES = 100;

/** The example notebooks' file names, in order (`01 Start Here.ipynb`, ...). */
export const exampleNames = (notebooks: Record<string, string>): string[] =>
  Object.keys(notebooks).sort();

type Notebook = {
  metadata: Record<string, unknown>;
  cells: { cell_type: string; metadata?: Record<string, unknown> }[];
};

/**
 * The kernel the examples ask for: the one the app runs itself when the
 * backend lists it, since only that one has `device`; else a TypeScript
 * kernel as for the sample.
 */
export function examplesKernel(specs?: KernelSpec.ISpecModels | null) {
  const page = specs?.kernelspecs['cdp-browser'];
  if (page) return { name: page.name, display_name: page.display_name, language: page.language };
  return sampleKernel(specs);
}

/**
 * `text` as the copy to save: asking for `kernelspec`, and with every code
 * cell marked trusted, so a server signs it on save and the outputs, which
 * the app made, render without Trust Notebook.
 */
export function prepare(text: string, kernelspec: ReturnType<typeof examplesKernel>): Notebook {
  const nb = JSON.parse(text) as Notebook;
  nb.metadata = { ...nb.metadata, kernelspec };
  for (const cell of nb.cells) {
    if (cell.cell_type === 'code') cell.metadata = { ...cell.metadata, trusted: true };
  }
  return nb;
}

/** The first of `Examples`, `Examples 2`, ... that is free in `dir`. */
async function freeFolder(contents: Contents.IManager, dir: string): Promise<string> {
  for (let n = 1; n <= MAX_COPIES; n++) {
    const name = n === 1 ? EXAMPLES_FOLDER : `${EXAMPLES_FOLDER} ${n}`;
    const path = dir ? `${dir}/${name}` : name;
    if (!(await lookUp(contents, path))) return path;
  }
  throw new Error(`There are already ${MAX_COPIES} copies of “${EXAMPLES_FOLDER}” here.`);
}

/**
 * Copies the examples into a new folder in `dir` and returns the first
 * notebook's path. An earlier copy, perhaps edited, is left as it is.
 */
export async function copyExamples(
  contents: Contents.IManager,
  dir: string,
  specs?: KernelSpec.ISpecModels | null,
): Promise<string> {
  const { NOTEBOOKS } = await import('./example-notebooks');
  const names = exampleNames(NOTEBOOKS);
  if (!names.length) throw new Error('This build has no example notebooks.');
  const kernelspec = examplesKernel(specs);
  const folder = await freeFolder(contents, dir);
  // A new folder, then its name: both the server and the browser's storage
  // create one this way.
  const made = await contents.newUntitled({ type: 'directory', path: dir });
  try {
    await contents.rename(made.path, folder);
  } catch (err) {
    // Someone took the name in between: don't leave an empty folder behind.
    await contents.delete(made.path).catch(() => undefined);
    throw err;
  }
  for (const name of names) {
    await contents.save(`${folder}/${name}`, {
      type: 'notebook',
      format: 'json',
      content: prepare(NOTEBOOKS[name], kernelspec),
    });
  }
  return `${folder}/${names[0]}`;
}
