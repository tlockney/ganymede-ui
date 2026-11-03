/**
 * What the sidebar's file menu does (#203): rename, duplicate and delete a
 * file or folder, and make a folder. The open notebook is handled through
 * its controller, so a rename keeps it open (and its kernel) at the new
 * path, and a delete closes it without saving it back.
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
  setOpenPath(path: string | undefined): void;
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
      // The edits go with the file; once moved, the pane stops saving to
      // the old path and reopens at the new one.
      if (holdsOpen && open?.dirty && !(await open.save())) {
        throw new Error('The open notebook couldn’t be saved first.');
      }
      await renameFile(contents, item.path, next);
      if (holdsOpen) {
        open?.discard();
        setOpenPath(next + openPath!.slice(item.path.length));
      }
      return true;
    },

    async duplicate(item) {
      await contents.copy(item.path, parentOf(item.path));
    },

    async remove(item) {
      if (within(openPath, item.path)) {
        // Closed without saving: that would put the file back.
        open?.discard();
        setOpenPath(undefined);
      }
      await contents.delete(item.path);
    },

    async newFolder(dir) {
      const model = await contents.newUntitled({ type: 'directory', path: dir });
      return model.path;
    },
  };
}
