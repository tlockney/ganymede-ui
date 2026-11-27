/**
 * Finding in the open notebook (#879): the cells whose source holds the
 * query, each with the nearest heading above it and the line that matched.
 * The page searches on the Mac app's `find-in-notebook` command, so its
 * Find tab has one field over the notebook and the folder's files.
 */

import { headingsOf } from './outline';

/** What `findInNotebook` reads from each cell. */
export type FindCell = { type: string; source: string };

/** One matching cell: where it is, the heading above it, and its line. */
export type FindMatch = { cell: number; heading: string | null; snippet: string };

/** The page's answer to `find-in-notebook`, posted as `PageState.notebookFind`. */
export type NotebookFind = { query: string; matches: FindMatch[]; more: number };

/** How much of the matching line a snippet keeps. */
const SNIPPET_CHARS = 60;

/**
 * The line around the match, in one line (#879): trimmed, and cut to about
 * 60 characters with "…" where it was, so a long cell line reads in a row.
 */
export function findSnippet(line: string, query: string): string {
  const text = line.trim();
  if (text.length <= SNIPPET_CHARS) return text;
  const at = text.toLowerCase().indexOf(query.toLowerCase());
  // Centred on the match where the line is long enough either side.
  const start = Math.max(
    0,
    Math.min(at - Math.floor(SNIPPET_CHARS / 2), text.length - SNIPPET_CHARS),
  );
  const end = start + SNIPPET_CHARS;
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

/**
 * The cells of `cells` whose source holds `query`, case-insensitively and in
 * order, each with the nearest heading at or above it (from `headingsOf`)
 * and a one-line snippet around the first matching line. An empty query
 * finds nothing. At most `cap` cells are listed; `more` counts the rest.
 */
export function findInNotebook(cells: Iterable<FindCell>, query: string, cap = 50): NotebookFind {
  const trimmed = query.trim();
  if (!trimmed) return { query: trimmed, matches: [], more: 0 };
  const needle = trimmed.toLowerCase();
  const matches: FindMatch[] = [];
  let more = 0;
  let heading: string | null = null;
  let index = 0;
  for (const cell of cells) {
    const lines = cell.source.split(/\r?\n/);
    const at = lines.findIndex(line => line.toLowerCase().includes(needle));
    if (at >= 0) {
      // The heading at or above the matching line: one in this cell before
      // it, else the last in a cell above.
      const above = cell.type === 'markdown' ? headingsOf(lines.slice(0, at + 1).join('\n')) : [];
      const match: FindMatch = {
        cell: index,
        heading: above.at(-1)?.text ?? heading,
        snippet: findSnippet(lines[at], trimmed),
      };
      if (matches.length < cap) matches.push(match);
      else more++;
    }
    // This cell's headings are above every cell after it.
    if (cell.type === 'markdown') {
      const found = headingsOf(cell.source);
      if (found.length) heading = found[found.length - 1].text;
    }
    index++;
  }
  return { query: trimmed, matches, more };
}
