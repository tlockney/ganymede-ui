/**
 * The sidebar's search (#215): file names in a folder and its subfolders,
 * and optionally what the notebooks there say. Everything goes through the
 * Jupyter contents API, which has no search of its own, so the folder tree
 * is listed one directory at a time (within `LIMITS`) and each notebook is
 * fetched for a content search.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contents } from '@jupyterlab/services';
import type { FileItem } from './file-actions';

/** How far a search goes, so a huge folder doesn't stall the server or the page. */
export const LIMITS = {
  /** Folder levels below the one searched. */
  depth: 6,
  /** Directories listed. */
  dirs: 300,
  /** Files and folders found. */
  entries: 5000,
  /** Notebooks fetched for a content search. */
  notebooks: 200,
};

/** Requests in flight at once. */
const PARALLEL = 4;
/** How long typing pauses before a search starts. */
export const DEBOUNCE_MS = 250;

export type Found = FileItem & { last_modified?: string };
export type Listing = { items: Found[]; truncated: boolean };
export type Match = {
  item: Found;
  /** The line that matched, for a content match. */ snippet?: string;
};

/** Thrown when a search is cancelled by a newer one. */
export class Cancelled extends Error {
  constructor() {
    super('Search cancelled');
  }
}

const check = (signal?: AbortSignal) => {
  if (signal?.aborted) throw new Cancelled();
};

/** Runs `fn` over `items`, `limit` at a time. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]!);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * Every file and folder in `root` and its subfolders, breadth first, without
 * hidden ones. `truncated` says a limit stopped it. A subfolder that can't
 * be listed is skipped; `root` itself failing throws.
 */
export async function listTree(
  contents: Contents.IManager,
  root: string,
  { signal, limits = LIMITS }: { signal?: AbortSignal; limits?: typeof LIMITS } = {},
): Promise<Listing> {
  const items: Found[] = [];
  let truncated = false;
  let listed = 0;
  let level: string[] = [root];
  for (let depth = 0; level.length && !truncated; depth++) {
    const below: string[] = [];
    if (listed + level.length > limits.dirs) {
      level = level.slice(0, limits.dirs - listed);
      truncated = true;
    }
    listed += level.length;
    await pool(level, PARALLEL, async dir => {
      check(signal);
      let listing: Contents.IModel;
      try {
        listing = await contents.get(dir, { content: true });
      } catch (e) {
        if (dir === root) throw e;
        return;
      }
      check(signal);
      for (const m of (listing.content as Contents.IModel[] | null) ?? []) {
        if (m.name.startsWith('.')) continue;
        if (items.length >= limits.entries) {
          truncated = true;
          return;
        }
        items.push({ path: m.path, name: m.name, type: m.type, last_modified: m.last_modified });
        if (m.type !== 'directory') continue;
        if (depth < limits.depth) below.push(m.path);
        else truncated = true;
      }
    });
    level = below;
  }
  // Requests finish in any order: sort for a stable list.
  items.sort((a, b) => a.path.localeCompare(b.path));
  return { items, truncated };
}

/** Whether `text` contains `query`, ignoring case. */
export const contains = (text: string, query: string) =>
  text.toLowerCase().includes(query.trim().toLowerCase());

/** The items whose names contain `query`, ignoring case; notebooks without `.ipynb`. */
export function matchNames(items: Found[], query: string): Match[] {
  if (!query.trim()) return [];
  return items
    .filter(i => contains(i.type === 'notebook' ? i.name.replace(/\.ipynb$/, '') : i.name, query))
    .map(item => ({ item }));
}

/** A notebook's cell sources, as a contents model holds them. */
export function cellSources(notebook: unknown): string[] {
  const cells = (notebook as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) return [];
  return cells.map(c => {
    const source = (c as { source?: unknown } | null)?.source;
    return Array.isArray(source) ? source.join('') : typeof source === 'string' ? source : '';
  });
}

/** The line of `sources` that first contains `query`, shortened around it; undefined if none. */
export function findSnippet(sources: string[], query: string, width = 80): string | undefined {
  const q = query.trim().toLowerCase();
  if (!q) return undefined;
  for (const source of sources) {
    for (const line of source.split('\n')) {
      const at = line.toLowerCase().indexOf(q);
      if (at < 0) continue;
      const text = line.trim();
      if (text.length <= width) return text;
      const from = Math.max(0, at - Math.floor((width - q.length) / 2));
      const cut = line.slice(from, from + width).trim();
      return `${from > 0 ? '…' : ''}${cut}${from + width < line.length ? '…' : ''}`;
    }
  }
  return undefined;
}

/** Notebook sources fetched earlier, by path, while unchanged. */
export type SourceCache = Map<string, { modified?: string; sources: string[] }>;

/**
 * The notebooks among `items` whose cells contain `query`, each reported to
 * `onMatch` as it is found. Fetches at most `limits.notebooks`; `truncated`
 * says there were more.
 */
export async function searchContents(
  contents: Contents.IManager,
  items: Found[],
  query: string,
  {
    signal,
    cache,
    onMatch,
    limits = LIMITS,
  }: {
    signal?: AbortSignal;
    cache?: SourceCache;
    onMatch?(match: Match): void;
    limits?: typeof LIMITS;
  } = {},
): Promise<{ matches: Match[]; truncated: boolean }> {
  const notebooks = items.filter(i => i.type === 'notebook');
  const searched = notebooks.slice(0, limits.notebooks);
  const matches: Match[] = [];
  await pool(searched, PARALLEL, async item => {
    check(signal);
    let sources = cache?.get(item.path);
    if (!sources || sources.modified !== item.last_modified || !item.last_modified) {
      try {
        const model = await contents.get(item.path, { content: true, type: 'notebook' });
        sources = { modified: model.last_modified, sources: cellSources(model.content) };
        cache?.set(item.path, sources);
      } catch {
        // Unreadable (not valid JSON, gone since listed): not a match.
        return;
      }
    }
    check(signal);
    const snippet = findSnippet(sources.sources, query);
    if (snippet === undefined) return;
    const match = { item, snippet };
    matches.push(match);
    onMatch?.(match);
  });
  return { matches, truncated: notebooks.length > searched.length };
}

export type SearchState = {
  matches: Match[];
  searching: boolean;
  /** A limit stopped the search short. */
  truncated: boolean;
  error?: string;
};

const IDLE: SearchState = { matches: [], searching: false, truncated: false };

/**
 * Searches `dir` and its subfolders for `query`, after typing pauses: names,
 * and with `withContents` what the notebooks say. A newer query cancels an
 * older one. The folder tree is listed once and reused until something
 * changes on disk or the folder does.
 */
export function useFileSearch(
  contents: Contents.IManager | undefined,
  dir: string,
  query: string,
  withContents: boolean,
): SearchState {
  const [state, setState] = useState<SearchState>(IDLE);
  const tree = useRef<{ key: string; listing: Promise<Listing>; abort(): void }>(undefined);
  const cache = useRef<SourceCache>(new Map());
  // Bumped when a file is added, renamed or deleted, so the search re-runs.
  const [changes, setChanges] = useState(0);
  const forget = useCallback(() => {
    tree.current?.abort();
    tree.current = undefined;
  }, []);

  useEffect(() => {
    if (!contents) return;
    const onChange = (_: unknown, change: Contents.IChangedArgs) => {
      // A save doesn't change the tree; the source cache checks last_modified.
      if (change.type === 'save') return;
      forget();
      setChanges(n => n + 1);
    };
    contents.fileChanged.connect(onChange);
    return () => {
      contents.fileChanged.disconnect(onChange);
      forget();
    };
  }, [contents, forget]);

  useEffect(() => {
    const q = query.trim();
    if (!contents || !q) {
      // A cleared field ends the search: the next one lists afresh, which
      // picks up changes made outside this page, and the sources go.
      forget();
      cache.current.clear();
      setState(IDLE);
      return;
    }
    const ctrl = new AbortController();
    const { signal } = ctrl;
    // The last query's matches would be wrong for this one: clear them.
    setState({ matches: [], searching: true, truncated: false });
    const run = async () => {
      try {
        if (tree.current?.key !== dir) {
          forget();
          const listing = new AbortController();
          tree.current = {
            key: dir,
            listing: listTree(contents, dir, { signal: listing.signal }),
            abort: () => listing.abort(),
          };
        }
        const { items, truncated } = await tree.current.listing;
        check(signal);
        const named = matchNames(items, q);
        setState({ matches: named, searching: withContents, truncated });
        if (!withContents) return;
        const seen = new Set(named.map(m => m.item.path));
        const found = await searchContents(
          contents,
          items.filter(i => !seen.has(i.path)),
          q,
          {
            signal,
            cache: cache.current,
            onMatch: m => !signal.aborted && setState(s => ({ ...s, matches: [...s.matches, m] })),
          },
        );
        check(signal);
        setState(s => ({ ...s, searching: false, truncated: s.truncated || found.truncated }));
      } catch (e) {
        if (signal.aborted) return;
        // The listing was dropped by a change on disk: list again.
        if (e instanceof Cancelled) return run();
        forget();
        setState({ ...IDLE, error: e instanceof Error ? e.message : String(e) });
      }
    };
    const timer = window.setTimeout(() => void run(), DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [contents, dir, query, withContents, forget, changes]);

  return state;
}
