/**
 * The example notebooks (#414): TypeScript notebooks in `examples/`, saved
 * with their outputs by `scripts/examples.mjs`, that Open Examples copies
 * into a new folder through the contents API. The notebooks load as their
 * own chunk (`example-notebooks.ts`), on first use.
 */
import type { Contents, KernelSpec } from '@jupyterlab/services';
import { lookUp, renameFile } from './rename';
import { freePath, sampleKernel } from './sample';

/** The folder's name; another copy gets a number (`Examples 2`). */
export const EXAMPLES_FOLDER = 'Examples';

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

/**
 * Copies the examples into a new folder in `dir` and returns the first
 * notebook's path. An earlier copy, perhaps edited, is left as it is.
 */
export async function copyExamples(
  contents: Contents.IManager,
  dir: string,
  specs?: KernelSpec.ISpecModels | null,
): Promise<string> {
  return copyInto(contents, dir, await freePath(contents, dir, EXAMPLES_FOLDER), specs);
}

/** Copies the examples into the new folder `folder` in `dir`; the first notebook's path. */
async function copyInto(
  contents: Contents.IManager,
  dir: string,
  folder: string,
  specs?: KernelSpec.ISpecModels | null,
): Promise<string> {
  const { NOTEBOOKS } = await import('./example-notebooks');
  const names = exampleNames(NOTEBOOKS);
  if (!names.length) throw new Error('This build has no example notebooks.');
  const kernelspec = examplesKernel(specs);
  // A new folder, then its name: both the server and the browser's storage
  // create one this way.
  const made = await contents.newUntitled({ type: 'directory', path: dir });
  try {
    // Refuses a name taken in between: browser storage's rename would replace it.
    await renameFile(contents, made.path, folder);
  } catch (err) {
    // Don't leave an empty folder behind.
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

/**
 * Copies the examples into `Examples` in `dir` unless a folder by that name
 * is there, without opening any (#463): the iPhone and iPad add them to
 * the app's own folder once. Returns the folder's path, or null when one
 * was there. A partial copy (the app quit while saving) counts as there:
 * the window is short, and a second folder beside it would be worse.
 * Beside a file named `Examples`, the copy goes to `Examples 2` (the first
 * name that isn't a file), and a folder there counts the same way.
 */
export async function addExamples(
  contents: Contents.IManager,
  dir: string,
  specs?: KernelSpec.ISpecModels | null,
): Promise<string | null> {
  for (let n = 1; n <= MAX_EXAMPLE_NAMES; n++) {
    const name = n === 1 ? EXAMPLES_FOLDER : `${EXAMPLES_FOLDER} ${n}`;
    const target = dir ? `${dir}/${name}` : name;
    const there = await lookUp(contents, target);
    if (there?.type === 'directory') return null;
    if (there) continue;
    await copyInto(contents, dir, target, specs);
    return target;
  }
  throw new Error(`There are already ${MAX_EXAMPLE_NAMES} files named “${EXAMPLES_FOLDER}” here.`);
}

/** How many names `addExamples` tries. */
const MAX_EXAMPLE_NAMES = 20;
