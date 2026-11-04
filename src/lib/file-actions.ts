/**
 * What the sidebar's file menu does (#203): rename, duplicate and delete a
 * file or folder, and make a folder. The open notebook is handled through
 * its controller, so a rename (of it or a folder holding it) keeps it open
 * at the new path with its kernel, and a delete closes it without saving
 * it back.
 */
import type { Contents, Session } from '@jupyterlab/services';
import type { NotebookController } from '../components/NotebookPane';
import { parentOf } from './launch';
import { moveSessions, renameFile, renamedPath } from './rename';

export type FileItem = Pick<Contents.IModel, 'path' | 'name' | 'type'>;

export type FileActions = {
  /** False when nothing changed; throws with a readable message when it failed. */
  rename(item: FileItem, input: string): Promise<boolean>;
  duplicate(item: FileItem): Promise<void>;
  remove(item: FileItem): Promise<void>;
  /** Makes an untitled folder in `dir`; its path. */
  newFolder(dir: string): Promise<string>;
};

/** Whether `path` is `at` or inside the folder `at`. */
export const within = (path: string | undefined, at: string) =>
  !!path && (path === at || path.startsWith(`${at}/`));

/** The question before a delete. */
export function deletePrompt(item: FileItem): string {
  const name = item.type === 'notebook' ? item.name.replace(/\.ipynb$/, '') : item.name;
  return item.type === 'directory'
    ? `Delete the folder “${name}” and everything in it?\n\nThis can’t be undone.`
    : `Delete “${name}”?\n\nThis can’t be undone.`;
}

type Options = {
  contents: Contents.IManager;
  /** The running sessions: a renamed notebook's kernel goes with it. */
  sessions?: Pick<Session.IManager, 'running' | 'connectTo'>;
  openPath?: string;
  /** The open notebook's, when it is `openPath`'s. */
  controller?: NotebookController;
  /** App's setter; given an updater, so a move or delete that ends after
   * another notebook was opened leaves that one open. */
  setOpenPath(update: (open: string | undefined) => string | undefined): void;
};

export function fileActions({
  contents,
  sessions,
  openPath,
  controller,
  setOpenPath,
}: Options): FileActions {
  const open = controller?.path === openPath ? controller : undefined;
  /**
   * The open notebook's controller when `item` is or holds it. Without one
   * (it is still opening), a move couldn't take its kernel along or stop it
   * saving to the old path, and a delete couldn't stop it writing the file
   * back, so neither goes ahead.
   */
  const holder = (item: FileItem) => {
    if (!within(openPath, item.path)) return undefined;
    if (!open) throw new Error('The open notebook is still loading; try again.');
    return open;
  };
  return {
    async rename(item, input) {
      const held = holder(item);
      // The open notebook renames itself: it saves first and its kernel
      // follows. It says why it failed in the pane, which the sidebar can
      // cover (on a phone), so the sidebar says it too.
      if (held && item.path === openPath) return held.rename(input, { throws: true });
      const next = renamedPath(item.path, input, item.type === 'notebook');
      if (!next) return false;
      const holdsOpen = !!held;
      // The edits go with the file.
      if (holdsOpen && open!.dirty && !(await open!.save())) {
        throw new Error('The open notebook couldn’t be saved first.');
      }
      const move = () => renameFile(contents, item.path, next);
      // The kernels of the notebooks that aren't open go along too, so
      // Running doesn't point at a missing file (#224).
      const others = () => sessions && moveSessions(sessions, item.path, next, openPath);
      if (!holdsOpen) {
        await move();
        await others();
        return true;
      }
      // Through the notebook: its saves wait for the move and then go to
      // the new path, and its kernel follows, so it reopens there with its
      // state.
      const moved = next + openPath!.slice(item.path.length);
      await open!.moved(moved, move);
      const from = openPath;
      setOpenPath(p => (p === from ? moved : p));
      await others();
      return true;
    },

    async duplicate(item) {
      // The copy has the open notebook's unsaved edits too.
      if (item.path === openPath && open?.dirty && !(await open.save())) {
        throw new Error('The open notebook couldn’t be saved first.');
      }
      await contents.copy(item.path, parentOf(item.path));
    },

    async remove(item) {
      const held = holder(item);
      const holdsOpen = !!held;
      // No saving while it is deleted: that would put the file back. If the
      // delete fails, the notebook stays open with its edits.
      const undo = held?.discard();
      try {
        await contents.delete(item.path);
      } catch (e) {
        undo?.();
        throw e;
      }
      if (holdsOpen) setOpenPath(p => (within(p, item.path) ? undefined : p));
    },

    async newFolder(dir) {
      const model = await contents.newUntitled({ type: 'directory', path: dir });
      return model.path;
    },
  };
}
