/**
 * What the sidebar's file menu does (#203): rename, duplicate and delete a
 * file or folder, and make a folder. The open notebook is handled through
 * its controller, so a rename (of it or a folder holding it) keeps it open
 * at the new path with its kernel, and a delete closes it without saving
 * it back.
 */
import type { Contents } from '@jupyterlab/services';
import type { NotebookController } from '../components/NotebookPane';
import { parentOf } from './launch';
import { renameFile, renamedPath } from './rename';

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
  openPath?: string;
  /** The open notebook's, when it is `openPath`'s. */
  controller?: NotebookController;
  /** App's setter; given an updater, so a move or delete that ends after
   * another notebook was opened leaves that one open. */
  setOpenPath(update: (open: string | undefined) => string | undefined): void;
};

export function fileActions({ contents, openPath, controller, setOpenPath }: Options): FileActions {
  const open = controller?.path === openPath ? controller : undefined;
  return {
    async rename(item, input) {
      // The open notebook renames itself: it saves first and its kernel follows.
      if (open && item.path === openPath) return open.rename(input);
      const next = renamedPath(item.path, input, item.type === 'notebook');
      if (!next) return false;
      const holdsOpen = item.type === 'directory' && within(openPath, item.path);
      // Without the notebook's controller (it is still opening), the move
      // couldn't take its kernel along or stop it saving to the old path.
      if (holdsOpen && !open) throw new Error('The open notebook is still loading; try again.');
      // The edits go with the file.
      if (holdsOpen && open!.dirty && !(await open!.save())) {
        throw new Error('The open notebook couldn’t be saved first.');
      }
      const move = () => renameFile(contents, item.path, next);
      if (!holdsOpen) {
        await move();
        return true;
      }
      // Through the notebook: its saves wait for the move and then go to
      // the new path, and its kernel follows, so it reopens there with its
      // state.
      const moved = next + openPath!.slice(item.path.length);
      await open!.moved(moved, move);
      const from = openPath;
      setOpenPath(p => (p === from ? moved : p));
      return true;
    },

    async duplicate(item) {
      await contents.copy(item.path, parentOf(item.path));
    },

    async remove(item) {
      const holdsOpen = within(openPath, item.path);
      // No saving while it is deleted: that would put the file back. If the
      // delete fails, the notebook stays open with its edits.
      const undo = holdsOpen ? open?.discard() : undefined;
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
