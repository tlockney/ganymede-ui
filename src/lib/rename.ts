/**
 * Renaming the open notebook from its title (#202): the new path from what
 * the user typed, and the rename through the contents API, with messages a
 * person can read; and what a rename takes along (#224): the outgoing
 * pane's last save, and the sessions of notebooks that aren't open.
 */
import type { Contents, Session } from '@jupyterlab/services';
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
export function notFound(e: unknown): boolean {
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

/**
 * What a notebook pane on its way out leaves for the pane that opens its
 * file next, by the file's path (after a rename, the new one): its last
 * save, which the next pane loads after so it neither misses those edits
 * nor saves over them, and why that save failed, which the next pane shows.
 */
const handoffs = new Map<string, Promise<string | undefined>>();

/**
 * Leave `work` for the next pane at `path`: a save, resolving with why it
 * failed (a notice), or undefined when it didn't. It is dropped once it is
 * done: a pane opening the file later has nothing to wait for.
 */
export function handOff(path: string, work: Promise<string | undefined>): void {
  const before = handoffs.get(path);
  const all = before ? Promise.all([before, work]).then(([a, b]) => b ?? a) : work;
  handoffs.set(path, all);
  void all.then(() => {
    if (handoffs.get(path) === all) handoffs.delete(path);
  });
}

/**
 * For a pane opening `path`: what the last one there left, to wait for
 * before loading the file, or undefined when nothing is pending. Left in
 * place, not taken: under StrictMode the pane's effect runs twice, and
 * the second run has to wait too.
 */
export function handedOff(path: string): Promise<string | undefined> | undefined {
  return handoffs.get(path);
}

/**
 * After `from` (a file or folder) was renamed to `to`, point the sessions
 * of the notebooks in it at their new paths, so Running shows where they
 * are and reopening one rejoins its kernel. `skip` is a path whose session
 * moves another way (the open notebook's, with its pane). A session that
 * can't be moved stays where it was; the file has moved regardless.
 */
export async function moveSessions(
  sessions: Pick<Session.IManager, 'running' | 'connectTo'>,
  from: string,
  to: string,
  skip?: string,
): Promise<void> {
  const inside = (p: string) => p === from || p.startsWith(`${from}/`);
  const models = [...sessions.running()].filter(m => inside(m.path) && m.path !== skip);
  await Promise.all(
    models.map(async model => {
      const path = to + model.path.slice(from.length);
      const session = sessions.connectTo({ model });
      try {
        await session.setPath(path);
        await session.setName(path.split('/').pop() ?? path);
      } catch (e) {
        console.warn(`Couldn’t move the session to ${path}:`, e);
      } finally {
        session.dispose();
      }
    }),
  );
}
