import { useCallback, useEffect, useState } from 'react';
import type { Contents } from '@jupyterlab/services';
import type { Backend } from '../lib/backends';
import { useSignals } from '../lib/useSignal';
import {
  BrowserIcon,
  ChevronLeftIcon,
  ComposeIcon,
  FileIcon,
  FolderIcon,
  NotebookIcon,
  PowerIcon,
  ServerIcon,
} from './Icons';

type Props = {
  backend?: Backend;
  connecting: boolean;
  openPath?: string;
  onOpen(path: string): void;
  onNew(dir: string): void;
  onConnect(): void;
};

const parent = (dir: string) => dir.split('/').slice(0, -1).join('/');

export function Sidebar({ backend, connecting, openPath, onOpen, onNew, onConnect }: Props) {
  const services = backend?.services;
  const [dir, setDir] = useState('');
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

  useEffect(() => setDir(''), [services]);
  useEffect(() => void refresh(), [refresh]);
  useEffect(() => {
    if (!services) return;
    const onChange = () => void refresh();
    services.contents.fileChanged.connect(onChange);
    return () => void services.contents.fileChanged.disconnect(onChange);
  }, [services, refresh]);

  useSignals(services?.sessions.runningChanged);
  const running = services ? [...services.sessions.running()] : [];

  return (
    <aside className="sidebar">
      <div className="sidebar-titlebar" />
      <div className="sidebar-scroll">
        <div className="sidebar-section-header">
          {dir ? (
            <button className="link-button" onClick={() => setDir(parent(dir))}>
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
            return (
              <li key={item.path}>
                <button
                  className={`source-item ${openPath === item.path ? 'selected' : ''}`}
                  disabled={!isNb && !isDir}
                  onClick={() => (isDir ? setDir(item.path) : onOpen(item.path))}
                >
                  {isDir ? (
                    <FolderIcon className="tint" />
                  ) : isNb ? (
                    <NotebookIcon className="tint" />
                  ) : (
                    <FileIcon />
                  )}
                  <span className="item-name">{item.name.replace(/\.ipynb$/, '')}</span>
                </button>
              </li>
            );
          })}
          {services && !items.length && !error && <li className="source-empty">No files</li>}
          {error && <li className="source-empty">{error}</li>}
        </ul>

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
    </aside>
  );
}
