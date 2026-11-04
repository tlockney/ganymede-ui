/**
 * Notebooks dropped in from outside the page (#216): from Finder on a Mac,
 * from the Files app on an iPad, or from another browser window. WebKit
 * hands them over as an HTML5 drop with `File` objects; the file is read
 * here and saved into a folder through the contents API, so it works the
 * same against a server and in the browser's own storage.
 *
 * Dropped on the sidebar, a notebook is copied into the folder it shows.
 * Dropped on the notebook window, it is copied into that folder and opened.
 * A name that is taken gets a "-Copy1" suffix, as Jupyter names a
 * duplicate (the sidebar's Duplicate, #203).
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import type * as nbformat from '@jupyterlab/nbformat';
import type { Contents } from '@jupyterlab/services';

const EXT = '.ipynb';

/** Whether a dropped file is a notebook, by its name (Files gives no type). */
export const isNotebookFile = (file: Pick<File, 'name'>) => file.name.toLowerCase().endsWith(EXT);

/** Whether a drag carries files. Their names aren't readable until the drop. */
export const carriesFiles = (data: Pick<DataTransfer, 'types'> | null | undefined) =>
  !!data && Array.from(data.types).includes('Files');

/**
 * `name`, or the first of `Io-Copy1.ipynb`, `Io-Copy2.ipynb`, … that isn't
 * in `taken`. Compared without case: a Mac's disk doesn't tell `io.ipynb`
 * from `Io.ipynb`, and saving would replace it.
 */
export function freeName(name: string, taken: Iterable<string>): string {
  const used = new Set(Array.from(taken, n => n.toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  const dot = name.toLowerCase().endsWith(EXT) ? name.length - EXT.length : name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  for (let n = 1; ; n++) {
    const next = `${stem}-Copy${n}${ext}`;
    if (!used.has(next.toLowerCase())) return next;
  }
}

/** The notebook in `text`; throws with a readable reason when it isn't one. */
export function parseNotebook(text: string): nbformat.INotebookContent {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('it isn’t a notebook (not JSON)');
  }
  const nb = json as Partial<nbformat.INotebookContent> | null;
  if (!nb || typeof nb !== 'object' || Array.isArray(nb) || typeof nb.nbformat !== 'number') {
    throw new Error('it isn’t a notebook (no nbformat)');
  }
  return nb as nbformat.INotebookContent;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export type DropResult = {
  /** Where the notebooks were saved, in the order dropped. */
  paths: string[];
  /** One line for each file that wasn't, for the user. */
  errors: string[];
};

/**
 * Save the notebooks among `files` into `dir`, each under a free name.
 * Files that aren't notebooks are skipped, and said so.
 */
export async function copyIntoFolder(
  contents: Contents.IManager,
  dir: string,
  files: readonly File[],
): Promise<DropResult> {
  const result: DropResult = { paths: [], errors: [] };
  const notebooks = files.filter(isNotebookFile);
  const others = files.filter(f => !isNotebookFile(f));
  if (others.length) {
    const names = others.map(f => `“${f.name}”`).join(', ');
    result.errors.push(`Only notebooks (.ipynb) can be dropped here, not ${names}.`);
  }
  if (!notebooks.length) return result;
  let taken: string[];
  try {
    const listing = await contents.get(dir, { content: true });
    taken = (listing.content as Contents.IModel[]).map(m => m.name);
  } catch (e) {
    result.errors.push(`Couldn’t read the folder: ${messageOf(e)}`);
    return result;
  }
  for (const file of notebooks) {
    try {
      const content = parseNotebook(await file.text());
      const name = freeName(file.name, taken);
      taken.push(name);
      const path = dir ? `${dir}/${name}` : name;
      await contents.save(path, { type: 'notebook', format: 'json', content });
      result.paths.push(path);
    } catch (e) {
      result.errors.push(`Couldn’t add “${file.name}”: ${messageOf(e)}`);
    }
  }
  return result;
}

type Options = {
  /** No drop target without it (not connected). */
  contents?: Contents.IManager;
  /** The folder dropped notebooks go in. */
  dir: string;
  /** Told the paths of the notebooks saved, when there are any. */
  onCopied?(paths: string[]): void;
  /** Told what went wrong, one line per file. */
  onError(message: string): void;
};

export type FileDrop = {
  /** A drag with files is over the target. */
  active: boolean;
  /** For the target element; capture phase, so a notebook dropped on a
   * cell's editor is ours, not text for CodeMirror to paste. */
  handlers: {
    onDragEnterCapture?(e: DragEvent): void;
    onDragOverCapture?(e: DragEvent): void;
    onDragLeaveCapture?(e: DragEvent): void;
    onDropCapture?(e: DragEvent): void;
    onDrop?(e: DragEvent): void;
  };
};

/**
 * Make an element take notebooks dropped from outside the page. Files that
 * aren't notebooks are left to what is under the pointer (an editor pastes
 * a text file), and otherwise kept from replacing the page.
 */
export function useFileDrop({ contents, dir, onCopied, onError }: Options): FileDrop {
  const [active, setActive] = useState(false);
  // dragenter and dragleave come for every element crossed inside.
  const depth = useRef(0);
  const latest = useRef({ contents, dir, onCopied, onError });
  latest.current = { contents, dir, onCopied, onError };

  const drop = useCallback(async (files: File[]) => {
    const { contents, dir, onCopied, onError } = latest.current;
    if (!contents) return;
    const { paths, errors } = await copyIntoFolder(contents, dir, files);
    if (errors.length) onError(errors.join('\n'));
    if (paths.length) onCopied?.(paths);
  }, []);

  const enabled = !!contents;
  const handlers = useMemo<FileDrop['handlers']>(() => {
    if (!enabled) return {};
    const reset = () => {
      depth.current = 0;
      setActive(false);
    };
    return {
      onDragEnterCapture(e) {
        if (!carriesFiles(e.dataTransfer)) return;
        e.preventDefault();
        depth.current++;
        setActive(true);
      },
      onDragOverCapture(e) {
        if (!carriesFiles(e.dataTransfer)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      },
      onDragLeaveCapture(e) {
        if (!carriesFiles(e.dataTransfer)) return;
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setActive(false);
      },
      onDropCapture(e) {
        if (!carriesFiles(e.dataTransfer)) return;
        reset();
        const files = Array.from(e.dataTransfer.files);
        if (!files.some(isNotebookFile)) return;
        e.preventDefault();
        e.stopPropagation();
        void drop(files);
      },
      // Other files nothing inside took: said so, rather than the web
      // view showing the file in place of the app.
      onDrop(e) {
        if (!carriesFiles(e.dataTransfer) || e.defaultPrevented) return;
        e.preventDefault();
        void drop(Array.from(e.dataTransfer.files));
      },
    };
  }, [enabled, drop]);

  return { active: enabled && active, handlers };
}
