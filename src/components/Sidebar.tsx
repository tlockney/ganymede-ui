import { useCallback, useEffect, useRef, useState } from 'react';
import type { Contents } from '@jupyterlab/services';
import type { Backend } from '../lib/backends';
import { useSignals } from '../lib/useSignal';
import { parentOf } from '../lib/launch';
import { type FileActions, type FileItem, deletePrompt } from '../lib/file-actions';
import { ContextMenu, type MenuItem } from './ContextMenu';
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
  onConnect(): void;
  /** Opens the Settings sheet; no Settings button without it. */
  onSettings?(): void;
  /** Rename, duplicate, delete and new folder (#203); no file menu without them. */
  actions?: FileActions;
};

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
  onConnect,
  onSettings,
  actions,
}: Props) {
  const services = backend?.services;
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

  useSignals(services?.sessions.runningChanged);
  const running = services ? [...services.sessions.running()] : [];

  return (
    <aside className="sidebar">
      <div className="sidebar-titlebar" />
      <div className="sidebar-scroll">
        <div className="sidebar-section-header">
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
        <ul className="source-list">
          {items.map(item => {
            const isNb = item.type === 'notebook';
            const isDir = item.type === 'directory';
            const isFile = item.type === 'file' && !!onOpenFile;
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
                  disabled={!actions && !isNb && !isDir && !isFile}
                  aria-disabled={!isNb && !isDir && !isFile}
                  onClick={() =>
                    isDir
                      ? setDir(item.path)
                      : isNb
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

        {running.length > 0 && (
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
                    <span className="item-meta">{s.kernel?.name}</span>
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
