import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contents } from '@jupyterlab/services';
import type { Backend } from '../lib/backends';
import { useSignals } from '../lib/useSignal';
import { parentOf } from '../lib/launch';
import { dataKind } from '../lib/data-files';
import { type FileActions, type FileItem, deletePrompt } from '../lib/file-actions';
import { useFileSearch } from '../lib/search';
import { clearRecents, recentsKey, useRecents } from '../lib/recents';
import { useFileDrop } from '../lib/file-drop';
import { ContextMenu, type MenuItem } from './ContextMenu';
import { type PlaceInfo, useReachable } from '../lib/places';
import { type Journal, journalStatus, journalsOf, useRooms } from '../lib/journals';
import { RecentList, SearchField, SearchResults } from './SidebarSearch';
import type { OutlineItem } from '../lib/outline';
import { formatMemory, useKernelMemory } from '../lib/kernel-usage';
import {
  BrowserIcon,
  ChevronLeftIcon,
  ComposeIcon,
  FileIcon,
  FolderIcon,
  MoreIcon,
  NotebookIcon,
  PowerIcon,
  ServerIcon,
  SettingsIcon,
  SidebarIcon,
} from './Icons';

type Props = {
  backend?: Backend;
  connecting: boolean;
  openPath?: string;
  /** The folder to list on the first connection; later ones start at the root (''). */
  root?: string;
  onOpen(path: string): void;
  /** Opens a file that isn't a notebook; without it, such files can't be opened. */
  onOpenFile?(path: string): void;
  onNew(dir: string): void;
  /** Told the folder shown, each time it changes. */
  onDirChange?(dir: string): void;
  onConnect(): void;
  /** Opens the Settings sheet; no Settings button without it. */
  onSettings?(): void;
  /** Rename, duplicate, delete and new folder (#203); no file menu without them. */
  actions?: FileActions;
  /** Hides the sidebar where it covers the notebook (a phone); no close button without it. */
  onClose?(): void;
  /** The open notebook's headings (#212); no Outline section when empty. */
  outline?: OutlineItem[];
  /** Goes to a heading's cell. */
  onOutline?(item: OutlineItem): void;
  /** Whether the sidebar shows; kernel memory is asked for only then. */
  visible?: boolean;
  /** For a connected machine's window: the places to switch to. */
  places?: PlaceInfo[];
  /** Opens a place (null: this device) in its own window. */
  onPlace?(id: string | null): void;
};

type PlaceTab = 'files' | 'journals' | 'running' | 'search';
const PLACE_TABS: { id: PlaceTab; label: string }[] = [
  { id: 'files', label: 'Files' },
  { id: 'journals', label: 'Journals' },
  { id: 'running', label: 'Running' },
  { id: 'search', label: 'Search' },
];

/** The place's name and reachability dot; opens the list of places. */
function PlaceSwitcher({
  name,
  reachable,
  places,
  onPlace,
}: {
  name: string;
  reachable: boolean;
  places: PlaceInfo[];
  onPlace?(id: string | null): void;
}) {
  const [at, setAt] = useState<HTMLElement>();
  return (
    <>
      <button
        type="button"
        className="place-switcher"
        aria-label={`Place: ${name}, ${reachable ? 'reachable' : 'offline'}`}
        aria-haspopup="menu"
        aria-expanded={!!at}
        disabled={!onPlace || places.length === 0}
        onClick={e => setAt(e.currentTarget)}
      >
        <span className="place-name">{name}</span>
        <span className={`status-dot ${reachable ? 's-idle' : 's-dead'}`} aria-hidden />
        <span aria-hidden>▾</span>
      </button>
      {at && (
        <ContextMenu
          at={at}
          label="Places"
          items={places.map(p => ({
            label: p.name,
            checked: p.name === name,
            onSelect: () => onPlace?.(p.id),
          }))}
          onClose={() => setAt(undefined)}
        />
      )}
    </>
  );
}

function JournalList({
  settings,
  active,
  onOpen,
}: {
  settings: Backend['services']['serverSettings'];
  active: boolean;
  onOpen(path: string): void;
}) {
  const result = useRooms(settings, active);
  if (!result) return <div className="source-empty">Looking for journals…</div>;
  if (result.kind === 'unsupported') {
    return (
      <div className="source-empty">
        This machine’s Ganymede is too old to list journals. Update it to see them here.
      </div>
    );
  }
  if (result.kind === 'error') return <div className="source-empty">{result.message}</div>;
  const journals: Journal[] = journalsOf(result.rooms);
  if (!journals.length) return <div className="source-empty">No agent is in a notebook now.</div>;
  return (
    <ul className="source-list" aria-label="Journals">
      {journals.map(j => (
        <li key={j.path}>
          <button className="source-item journal-item" onClick={() => onOpen(j.path)}>
            <span className="item-name">{j.name}</span>
            <span className="journal-agent">{j.agent ?? 'agent'}</span>
            <span className={`journal-status ${j.running ? 'running' : ''}`}>
              {journalStatus(j)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** How long a touch is held to open the file menu. */
const LONG_PRESS_MS = 500;

export function Sidebar({
  backend,
  connecting,
  openPath,
  root = '',
  onOpen,
  onOpenFile,
  onNew,
  onDirChange,
  onConnect,
  onSettings,
  actions,
  onClose,
  outline = [],
  onOutline,
  visible = true,
  places = [],
  onPlace,
}: Props) {
  const services = backend?.services;
  // A connected machine (#701): a place switcher with the machine's name
  // and reachability, and Files, Journals, Running and Search as tabs.
  const machine =
    backend?.config.kind === 'ganymede' && backend.config.machine
      ? (backend.config.machineName ?? 'Machine')
      : undefined;
  const reachable = useReachable(machine ? backend?.services.serverSettings : undefined);
  const [tab, setTab] = useState<PlaceTab>('files');
  const inTab = (t: PlaceTab) => !machine || tab === t;
  const [dir, setDir] = useState(root);
  const [items, setItems] = useState<Contents.IModel[]>([]);
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    if (!services) return setItems([]);
    try {
      const listing = await services.contents.get(dir, { content: true });
      const entries = (listing.content as Contents.IModel[])
        .filter(m => !m.name.startsWith('.'))
        .sort((a, b) =>
          a.type === b.type
            ? a.name.localeCompare(b.name)
            : a.type === 'directory'
              ? -1
              : b.type === 'directory'
                ? 1
                : 0,
        );
      setItems(entries);
      setError(undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [services, dir]);

  // The first connection starts in `root`, later ones at the server's root,
  // where another backend's folder may not exist.
  const started = useRef(false);
  useEffect(() => {
    if (!services) return;
    setDir(started.current ? '' : root);
    started.current = true;
  }, [services, root]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => void onDirChange?.(dir), [dir, onDirChange]);
  useEffect(() => {
    if (!services) return;
    const onChange = () => void refresh();
    services.contents.fileChanged.connect(onChange);
    return () => void services.contents.fileChanged.disconnect(onChange);
  }, [services, refresh]);

  /** The file menu: the item, and the point or "…" button it opens at. */
  const [menu, setMenu] = useState<{
    item: FileItem;
    at: { x: number; y: number } | HTMLElement;
  }>();
  /** The item whose name is being edited. */
  const [renaming, setRenaming] = useState<string>();
  /** Why the last file action failed, until dismissed. */
  const [actionError, setActionError] = useState<string>();
  const attempt = async (what: string, action: () => Promise<unknown>) => {
    try {
      setActionError(undefined);
      await action();
    } catch (e) {
      setActionError(`Couldn’t ${what}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // A long press opens the menu on touch screens; the tap that ends it
  // doesn't also open the item.
  const press = useRef<{ timer: number; x: number; y: number; fired: boolean }>(undefined);
  const longPress = (item: FileItem) =>
    actions && {
      onPointerDown(e: React.PointerEvent) {
        // A new press: a long press whose click never came (the menu opened
        // under the finger) doesn't swallow this one.
        if (press.current) clearTimeout(press.current.timer);
        press.current = undefined;
        if (e.pointerType !== 'touch') return;
        const { clientX: x, clientY: y } = e;
        const timer = window.setTimeout(() => {
          press.current!.fired = true;
          setMenu({ item, at: { x, y } });
        }, LONG_PRESS_MS);
        press.current = { timer, x, y, fired: false };
      },
      onPointerMove(e: React.PointerEvent) {
        const p = press.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) clearTimeout(p.timer);
      },
      onPointerUp() {
        if (press.current) clearTimeout(press.current.timer);
      },
      onPointerCancel() {
        if (press.current) clearTimeout(press.current.timer);
      },
      onClickCapture(e: React.MouseEvent) {
        if (!press.current?.fired) return;
        press.current = undefined;
        e.preventDefault();
        e.stopPropagation();
      },
      onContextMenu(e: React.MouseEvent) {
        e.preventDefault();
        // A long press on touch also sends contextmenu: one menu.
        if (press.current?.fired) return;
        setMenu({ item, at: { x: e.clientX, y: e.clientY } });
      },
    };

  const menuItems = (item: FileItem): MenuItem[] => {
    if (!actions) return [];
    const isDir = item.type === 'directory';
    // New things go in the folder itself, or beside the file.
    const folder = isDir ? item.path : parentOf(item.path);
    const inFolder = isDir ? ` in “${item.name}”` : '';
    return [
      { label: 'Rename', onSelect: () => setRenaming(item.path) },
      ...(isDir
        ? []
        : [
            {
              label: 'Duplicate',
              onSelect: () => void attempt(`duplicate ${item.name}`, () => actions.duplicate(item)),
            },
          ]),
      {
        label: 'Delete…',
        destructive: true,
        onSelect: () => {
          if (!window.confirm(deletePrompt(item))) return;
          void attempt(`delete ${item.name}`, () => actions.remove(item));
        },
      },
      'separator',
      { label: `New Notebook${inFolder}`, onSelect: () => onNew(folder) },
      {
        label: `New Folder${inFolder}`,
        onSelect: () =>
          void attempt('make a folder', async () => {
            const path = await actions.newFolder(folder);
            if (folder !== dir) setDir(folder);
            setRenaming(path);
          }),
      },
    ];
  };

  const rename = (item: FileItem, input: string) =>
    void attempt(`rename ${item.name}`, async () => {
      setRenaming(undefined);
      await actions?.rename(item, input);
    });

  // Search in the folder shown and below it, and recently opened notebooks (#215).
  const [query, setQuery] = useState('');
  const [withContents, setWithContents] = useState(false);
  const search = useFileSearch(services?.contents, dir, query, withContents);
  const searching = !!query.trim() && inTab('search');
  const recents = useRecents(backend, openPath);
  // Notebooks dropped from Finder or Files are copied into this folder (#216).
  const drop = useFileDrop({ contents: services?.contents, dir, onError: setActionError });

  useSignals(services?.sessions.runningChanged);
  const running = services ? [...services.sessions.running()] : [];
  // Headings indent from the outline's top level, not from #.
  const minLevel = Math.min(6, ...outline.map(item => item.level));
  // Each kernel's memory, from a server with the metrics endpoint (#241).
  const memory = useKernelMemory(
    // Not for a backend whose kernels all run in the page: the server
    // has none of them.
    backend?.config.kind === 'ganymede' && backend.config.kernels !== 'page'
      ? services?.serverSettings
      : undefined,
    running.flatMap(s => (s.kernel ? [s.kernel.id] : [])),
    visible,
  );

  return (
    <aside className={`sidebar ${drop.active ? 'drop-active' : ''}`} {...drop.handlers}>
      <div className="sidebar-titlebar">
        {onClose && (
          <button
            className="tb-button sidebar-close"
            aria-label="Hide Sidebar"
            title="Hide Sidebar"
            onClick={onClose}
          >
            <SidebarIcon />
          </button>
        )}
      </div>
      <div className="sidebar-scroll">
        {machine && (
          <>
            <PlaceSwitcher name={machine} reachable={reachable} places={places} onPlace={onPlace} />
            <div className="place-tabs" role="tablist" aria-label="Place">
              {PLACE_TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}
        {machine && tab === 'journals' && services && (
          <JournalList settings={services.serverSettings} active={visible} onOpen={onOpen} />
        )}
        {inTab('search') && (
          <SearchField
            query={query}
            onQuery={setQuery}
            withContents={withContents}
            onWithContents={setWithContents}
            disabled={!services}
          />
        )}
        {searching ? (
          <SearchResults
            state={search}
            dir={dir}
            openPath={openPath}
            canOpenFiles={!!onOpenFile}
            onPick={item => {
              if (item.type === 'directory') {
                setDir(item.path);
                setQuery('');
              } else if (item.type === 'notebook' || dataKind(item.path)) onOpen(item.path);
              else onOpenFile?.(item.path);
            }}
          />
        ) : inTab('files') ? (
          <RecentList
            paths={recents}
            openPath={openPath}
            onOpen={onOpen}
            onClear={() => backend && clearRecents(recentsKey(backend.config))}
          />
        ) : null}
        <div className="sidebar-section-header" hidden={searching || !inTab('files')}>
          {dir ? (
            <button className="link-button" onClick={() => setDir(parentOf(dir))}>
              <ChevronLeftIcon width={14} height={14} />
              {dir.split('/').pop()}
            </button>
          ) : (
            <span>Notebooks</span>
          )}
          <button
            className="icon-button"
            title="New Notebook"
            disabled={!services}
            onClick={() => onNew(dir)}
          >
            <ComposeIcon width={16} height={16} />
          </button>
        </div>
        <ul
          className="source-list folder-list"
          aria-label="Files"
          hidden={searching || !inTab('files')}
        >
          {items.map(item => {
            const isNb = item.type === 'notebook';
            const isDir = item.type === 'directory';
            // CSV, TSV, JSON and Parquet files open in the page's data view (#671).
            const isData = item.type === 'file' && !!dataKind(item.path);
            const isFile = item.type === 'file' && !!onOpenFile && !isData;
            const shown = item.name.replace(/\.ipynb$/, '');
            const icon = isDir ? (
              <FolderIcon className="tint" />
            ) : isNb ? (
              <NotebookIcon className="tint" />
            ) : (
              <FileIcon />
            );
            if (renaming === item.path) {
              return (
                <li key={item.path} className="file-item">
                  <div className="source-item selected">
                    {icon}
                    <RenameField
                      name={isNb ? shown : item.name}
                      onDone={input =>
                        input === undefined ? setRenaming(undefined) : rename(item, input)
                      }
                    />
                  </div>
                </li>
              );
            }
            return (
              <li key={item.path} className="file-item">
                <button
                  className={`source-item ${openPath === item.path ? 'selected' : ''}`}
                  // A file that can't be opened still has its menu.
                  disabled={!actions && !isNb && !isDir && !isFile && !isData}
                  aria-disabled={!isNb && !isDir && !isFile && !isData}
                  onClick={() =>
                    isDir
                      ? setDir(item.path)
                      : isNb || isData
                        ? onOpen(item.path)
                        : isFile && onOpenFile?.(item.path)
                  }
                  {...longPress(item)}
                >
                  {icon}
                  <span className="item-name">{shown}</span>
                </button>
                {actions && (
                  <button
                    className="icon-button row-more"
                    aria-label={`Actions for ${shown}`}
                    title="Actions"
                    aria-haspopup="menu"
                    aria-expanded={menu?.item.path === item.path}
                    onClick={e => setMenu({ item, at: e.currentTarget })}
                  >
                    <MoreIcon width={16} height={16} />
                  </button>
                )}
              </li>
            );
          })}
          {services && !items.length && !error && <li className="source-empty">No files</li>}
          {error && <li className="source-empty">{error}</li>}
        </ul>
        {actionError && (
          <div className="sidebar-alert" role="alert">
            <span>{actionError}</span>
            <button className="link-button" onClick={() => setActionError(undefined)}>
              Dismiss
            </button>
          </div>
        )}
        {menu && (
          <ContextMenu
            at={menu.at}
            label={`Actions for ${menu.item.name}`}
            items={menuItems(menu.item)}
            onClose={() => setMenu(undefined)}
          />
        )}

        {outline.length > 0 && onOutline && !searching && inTab('files') && (
          <nav aria-label="Outline">
            <div className="sidebar-section-header">
              <span>Outline</span>
            </div>
            <ul className="source-list outline-list">
              {outline.map((item, i) => (
                <li key={`${item.cell}-${i}`}>
                  <button
                    className="source-item outline-item"
                    style={{ paddingLeft: `${8 + (Math.min(item.level, 6) - minLevel) * 12}px` }}
                    title={item.text}
                    onClick={() => onOutline(item)}
                  >
                    <span className="item-name">{item.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {running.length > 0 && inTab('running') && (
          <>
            <div className="sidebar-section-header">
              <span>Running</span>
            </div>
            <ul className="source-list">
              {running.map(s => (
                <li key={s.id} className="running-item">
                  <button className="source-item" onClick={() => onOpen(s.path)}>
                    <span className="status-dot s-idle" />
                    <span className="item-name">
                      {s.path
                        .split('/')
                        .pop()
                        ?.replace(/\.ipynb$/, '')}
                    </span>
                    <span className="item-meta">
                      {s.kernel?.name}
                      {s.kernel && memory.has(s.kernel.id) && (
                        <span className="kernel-memory" title="Kernel memory">
                          {' · '}
                          {formatMemory(memory.get(s.kernel.id)!)}
                        </span>
                      )}
                    </span>
                  </button>
                  <button
                    className="icon-button hover-only"
                    title="Shut Down"
                    onClick={() => void services?.sessions.shutdown(s.id)}
                  >
                    <PowerIcon width={14} height={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="sidebar-footer">
        {machine ? (
          // The machine is the app's to connect; nothing to pick here.
          <div className="backend-chip" role="status">
            <ServerIcon />
            <span className="chip-text">
              <span className="chip-title">Saved on {machine}</span>
              <span className="chip-detail">
                Ganymede · {running.length} {running.length === 1 ? 'kernel' : 'kernels'}
              </span>
            </span>
            <span className={`status-dot ${reachable ? 's-idle' : 's-dead'}`} />
          </div>
        ) : (
          <button className="backend-chip" onClick={onConnect}>
            {backend?.config.kind === 'browser' ? <BrowserIcon /> : <ServerIcon />}
            <span className="chip-text">
              <span className="chip-title">
                {connecting ? 'Connecting…' : (backend?.label ?? 'Not connected')}
              </span>
              {backend && !connecting && <span className="chip-detail">{backend.detail}</span>}
            </span>
            <span className={`status-dot ${backend && !connecting ? 's-idle' : 's-connecting'}`} />
          </button>
        )}
        {onSettings && (
          <button
            className="icon-button settings-button"
            aria-label="Settings"
            title="Settings"
            onClick={onSettings}
          >
            <SettingsIcon />
          </button>
        )}
      </div>
    </aside>
  );
}

/** The name field of a row being renamed: Enter or a blur renames, Escape cancels. */
function RenameField({ name, onDone }: { name: string; onDone(input?: string): void }) {
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    const f = field.current;
    if (!f) return;
    f.focus();
    // The name without its extension, as Finder selects it.
    const dot = f.value.lastIndexOf('.');
    f.setSelectionRange(0, dot > 0 ? dot : f.value.length);
  }, []);
  const finish = (input?: string) => {
    if (done.current) return;
    done.current = true;
    onDone(input);
  };
  return (
    <input
      ref={field}
      className="rename-field"
      aria-label={`New name for ${name}`}
      defaultValue={name}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      enterKeyHint="done"
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          finish();
        }
      }}
      onBlur={e => finish(e.currentTarget.value)}
    />
  );
}
