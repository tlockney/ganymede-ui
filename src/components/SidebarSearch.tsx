/**
 * The sidebar's search field, its results, and the Recents list (#215).
 * The logic is in `lib/search.ts` and `lib/recents.ts`.
 */
import { parentOf } from '../lib/launch';
import type { Found, SearchState } from '../lib/search';
import { FileIcon, FolderIcon, NotebookIcon } from './Icons';

const shown = (name: string) => name.replace(/\.ipynb$/, '');

export function SearchField({
  query,
  onQuery,
  withContents,
  onWithContents,
  disabled,
}: {
  query: string;
  onQuery(query: string): void;
  withContents: boolean;
  onWithContents(on: boolean): void;
  disabled?: boolean;
}) {
  return (
    <div className="sidebar-search">
      <input
        type="search"
        className="sidebar-search-field"
        placeholder="Search"
        aria-label="Search files"
        value={query}
        disabled={disabled}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        enterKeyHint="search"
        onChange={e => onQuery(e.currentTarget.value)}
        onKeyDown={e => {
          if (e.key !== 'Escape' || !query) return;
          // Clears the field; doesn't also close a floating sidebar.
          e.preventDefault();
          e.stopPropagation();
          onQuery('');
        }}
      />
      {query.trim() && (
        <label className="sidebar-search-option">
          <input
            type="checkbox"
            checked={withContents}
            onChange={e => onWithContents(e.currentTarget.checked)}
          />
          Search notebook contents
        </label>
      )}
    </div>
  );
}

export function SearchResults({
  state,
  dir,
  openPath,
  canOpenFiles,
  onPick,
}: {
  state: SearchState;
  /** The folder searched, which result paths are shown relative to. */
  dir: string;
  openPath?: string;
  canOpenFiles: boolean;
  onPick(item: Found): void;
}) {
  const { matches, searching, truncated, error } = state;
  const where = (path: string) => {
    const parent = parentOf(path);
    return dir && parent.startsWith(dir) ? parent.slice(dir.length).replace(/^\//, '') : parent;
  };
  return (
    <>
      <div className="sidebar-section-header">
        <span>{dir ? `Results in “${dir.split('/').pop()}”` : 'Results'}</span>
      </div>
      <ul className="source-list search-results" aria-label="Search results" aria-busy={searching}>
        {matches.map(({ item, snippet }) => {
          const isDir = item.type === 'directory';
          const isNb = item.type === 'notebook';
          const opens = isDir || isNb || canOpenFiles;
          const folder = where(item.path);
          return (
            <li key={item.path} className="search-result">
              <button
                className={`source-item ${openPath === item.path ? 'selected' : ''}`}
                disabled={!opens}
                title={item.path}
                onClick={() => onPick(item)}
              >
                {isDir ? (
                  <FolderIcon className="tint" />
                ) : isNb ? (
                  <NotebookIcon className="tint" />
                ) : (
                  <FileIcon />
                )}
                <span className="result-text">
                  <span className="item-name">{shown(item.name)}</span>
                  {(snippet ?? folder) && (
                    <span className="result-detail">{snippet ?? folder}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
        {searching && <li className="source-empty">Searching…</li>}
        {!searching && !error && !matches.length && <li className="source-empty">No matches</li>}
        {error && <li className="source-empty">{error}</li>}
        {!searching && truncated && (
          <li className="source-empty">Stopped early: the folder has too many files to search.</li>
        )}
      </ul>
    </>
  );
}

export function RecentList({
  paths,
  openPath,
  onOpen,
  onClear,
}: {
  paths: string[];
  openPath?: string;
  onOpen(path: string): void;
  onClear(): void;
}) {
  if (!paths.length) return null;
  return (
    <>
      <div className="sidebar-section-header">
        <span>Recents</span>
        <button className="link-button" onClick={onClear}>
          Clear
        </button>
      </div>
      <ul className="source-list recent-list" aria-label="Recents">
        {paths.map(path => (
          <li key={path}>
            <button
              className={`source-item ${openPath === path ? 'selected' : ''}`}
              title={path}
              onClick={() => onOpen(path)}
            >
              <NotebookIcon className="tint" />
              <span className="item-name">{shown(path.split('/').pop() ?? path)}</span>
              {parentOf(path) && (
                <span className="item-meta">{parentOf(path).split('/').pop()}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
