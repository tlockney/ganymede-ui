/**
 * Renaming the open notebook from its title (#202): the new path from what
 * the user typed, and the rename through the contents API, with messages a
 * person can read.
 */
import type { Contents } from '@jupyterlab/services';
import { parentOf, titleFor } from './launch';
import { status } from './saver';

const EXT = '.ipynb';

/**
 * The path `input` renames `path` to, in the same folder, or undefined when
 * it names the file as it is (or nothing). A notebook's name is shown and
 * typed without `.ipynb`, which is added; another file or folder keeps the
 * name as typed. Throws when it can't be a name.
 */
export function renamedPath(path: string, input: string, notebook = true): string | undefined {
  const name = input.trim();
  const shown = notebook ? titleFor(path) : (path.split('/').pop() ?? path);
  if (!name || name === shown) return undefined;
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('A name can’t contain “/” or “\\”.');
  }
  if (name.startsWith('.')) throw new Error('A name can’t start with “.”.');
  const file = !notebook || name.endsWith(EXT) ? name : name + EXT;
  const dir = parentOf(path);
  const next = dir ? `${dir}/${file}` : file;
  return next === path ? undefined : next;
}

/** Whether an error from the contents API says there is nothing there. */
function notFound(e: unknown): boolean {
  const code = status(e);
  if (code !== undefined) return code === 404;
  // JupyterLite's in-browser drive throws a plain Error.
  return e instanceof Error && /could not find|not found|no such/i.test(e.message);
}

/** What is at `path`, or undefined when nothing is. Other errors are thrown. */
export async function lookUp(
  contents: Contents.IManager,
  path: string,
): Promise<Contents.IModel | undefined> {
  try {
    return await contents.get(path, { content: false });
  } catch (e) {
    if (notFound(e)) return undefined;
    throw e;
  }
}

/**
 * Rename `path` to `next`, refusing to replace a file that is there. A
 * change of case alone is let through when `next` finds this same file,
 * as on a Mac's case-insensitive disk; not when it is another file, as in
 * the browser's case-sensitive storage.
 */
export async function renameFile(
  contents: Contents.IManager,
  path: string,
  next: string,
): Promise<Contents.IModel> {
  const there = await lookUp(contents, next);
  if (there) {
    const self = next.toLowerCase() === path.toLowerCase() && (await lookUp(contents, path));
    const same =
      !!self &&
      self.created === there.created &&
      self.last_modified === there.last_modified &&
      self.name.toLowerCase() === there.name.toLowerCase();
    if (!same) {
      throw new Error(`“${next.split('/').pop()}” already exists. Choose another name.`);
    }
  }
  return contents.rename(path, next);
}
