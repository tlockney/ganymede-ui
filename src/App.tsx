import { useCallback, useEffect, useState } from 'react';
import { JupyterReactTheme } from '@datalayer/jupyter-react';
import {
  type Backend,
  type BackendConfig,
  connect,
  loadConfig,
  saveConfig,
} from './lib/backends';
import { useColorScheme } from './lib/useColorScheme';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { NotebookPane, type NotebookController } from './components/NotebookPane';
import { ConnectSheet } from './components/ConnectSheet';
import { EmptyState } from './components/EmptyState';

/** A token in the page URL, as `ganymede serve` prints it, wins once. */
function initialConfig(): BackendConfig | undefined {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token !== null) {
    params.delete('token');
    const rest = params.toString();
    history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
    return { kind: 'ganymede', url: '', token };
  }
  return loadConfig();
}

export function App() {
  const scheme = useColorScheme();
  const [config, setConfig] = useState<BackendConfig | undefined>(initialConfig);
  const [backend, setBackend] = useState<Backend>();
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(() => !config);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720);
  const [openPath, setOpenPath] = useState<string>();
  const [controller, setController] = useState<NotebookController>();

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setConnecting(true);
    setError(undefined);
    setOpenPath(undefined);
    connect(config)
      .then(b => {
        if (cancelled) {
          b.services.dispose();
          return;
        }
        saveConfig(config);
        setBackend(prev => {
          prev?.services.dispose();
          return b;
        });
        setSheetOpen(false);
      })
      .catch(e => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setSheetOpen(true);
      })
      .finally(() => !cancelled && setConnecting(false));
    return () => {
      cancelled = true;
    };
  }, [config]);

  const newNotebook = useCallback(
    async (dir: string) => {
      if (!backend) return;
      const { services } = backend;
      const model = await services.contents.newUntitled({ type: 'notebook', path: dir });
      const spec = services.kernelspecs.specs;
      const name = spec?.default;
      if (name && spec?.kernelspecs[name]) {
        const ks = spec.kernelspecs[name]!;
        const nb = await services.contents.get(model.path, { content: true });
        nb.content.metadata = {
          ...nb.content.metadata,
          kernelspec: { name, display_name: ks.display_name, language: ks.language },
        };
        await services.contents.save(model.path, {
          type: 'notebook',
          format: 'json',
          content: nb.content,
        });
      }
      setOpenPath(model.path);
    },
    [backend],
  );

  // ⌘S / Ctrl+S saves, as in any document app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void controller?.save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  return (
    <JupyterReactTheme colormode={scheme} backgroundColor="transparent">
      <div className={`window ${sidebarOpen ? '' : 'sidebar-collapsed'}`} data-scheme={scheme}>
        <Sidebar
          backend={backend}
          connecting={connecting}
          openPath={openPath}
          onOpen={setOpenPath}
          onNew={newNotebook}
          onConnect={() => setSheetOpen(true)}
        />
        <main className="main">
          <Toolbar
            controller={controller}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(o => !o)}
            specs={backend?.services.kernelspecs.specs ?? undefined}
          />
          <div className="content">
            {backend && openPath ? (
              <NotebookPane
                key={`${backend.config.kind}:${openPath}`}
                backend={backend}
                path={openPath}
                onController={setController}
              />
            ) : (
              <EmptyState
                backend={backend}
                connecting={connecting}
                onNew={() => newNotebook('')}
                onConnect={() => setSheetOpen(true)}
              />
            )}
          </div>
        </main>
      </div>
      {sheetOpen && (
        <ConnectSheet
          initial={config}
          error={error}
          connecting={connecting}
          canCancel={!!backend}
          onCancel={() => setSheetOpen(false)}
          onConnect={c => setConfig({ ...c })}
        />
      )}
    </JupyterReactTheme>
  );
}
