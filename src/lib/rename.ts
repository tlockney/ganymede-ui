/**
 * Renaming the open notebook from its title (#202): the new path from what
 * the user typed, and the rename through the contents API, with messages a
 * person can read.
 */
import type { Contents } from '@jupyterlab/services';
import { parentOf } from './launch';

const EXT = '.ipynb';

/** The name shown in the title: the file name without `.ipynb`. */
export const titleName = (path: string) => (path.split('/').pop() ?? path).replace(/\.ipynb$/, '');

/**
 * The path `input` renames `path` to, in the same folder, or undefined when
 * it names the file as it is (or nothing). Throws when it can't be a name.
 */
export function renamedPath(path: string, input: string): string | undefined {
  const name = input.trim();
  if (!name || name === titleName(path)) return undefined;
  if (name.includes('/') || name.includes('\\')) {
    throw new Error('A name can’t contain “/” or “\\”.');
  }
  if (name.startsWith('.')) throw new Error('A name can’t start with “.”.');
  const file = name.endsWith(EXT) ? name : name + EXT;
  if (file === EXT) return undefined;
  const dir = parentOf(path);
  const next = dir ? `${dir}/${file}` : file;
  return next === path ? undefined : next;
}

/** Whether something is at `path` already. */
async function exists(contents: Contents.IManager, path: string): Promise<boolean> {
  try {
    await contents.get(path, { content: false });
    return true;
  } catch {
    return false;
  }
}

/**
 * Rename `path` to `next`, refusing to replace a file that is there. A
 * change of case alone is let through: on a Mac's file system that file
 * is this one.
 */
export async function renameFile(
  contents: Contents.IManager,
  path: string,
  next: string,
): Promise<void> {
  const caseOnly = next.toLowerCase() === path.toLowerCase();
  if (!caseOnly && (await exists(contents, next))) {
    throw new Error(`“${next.split('/').pop()}” already exists. Choose another name.`);
  }
  await contents.rename(path, next);
}
