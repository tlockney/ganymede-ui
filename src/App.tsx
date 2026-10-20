import { useCallback, useEffect, useState } from 'react';
import {
  type Backend,
  type BackendConfig,
  connect,
  loadConfig,
  SAME_ORIGIN,
  saveConfig,
  signedInHere,
} from './lib/backends';
import { useColorScheme } from './lib/useColorScheme';
import { useJupyterLabTheme } from './lib/theme';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { NotebookPane, type NotebookController } from './components/NotebookPane';
import { ConnectSheet } from './components/ConnectSheet';
import { EmptyState } from './components/EmptyState';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { SHOW_SHORTCUTS_EVENT, matches } from './lib/shortcuts';

/**
 * A token in the page URL, as `ganymede serve` prints it, wins once, and so
 * does `kernels=page` or `kernels=server`, which the Apple apps add on
 * every launch (`page` on an iPad without a kernel server). Pure, as React
 * may call a state initializer twice (#60); `stripLaunchParams` takes them
 * out of the URL afterwards.
 */
function initialConfig(): BackendConfig | undefined {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const kernels = params.get('kernels');
  if (token === null && kernels === null) return loadConfig();
  return {
    kind: 'ganymede',
    url: '',
    token: token ?? '',
    ...(kernels === 'page' ? { kernels: 'page' as const } : {}),
  };
}

/** Keeps the token out of history and the referrer. */
function stripLaunchParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('token') && !params.has('kernels')) return;
  params.delete('token');
  params.delete('kernels');
  const rest = params.toString();
  history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

export function App() {
  const scheme = useColorScheme();
  useJupyterLabTheme(scheme);
  const [config, setConfig] = useState<BackendConfig | undefined>(initialConfig);
  const [backend, setBackend] = useState<Backend>();
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(() => !config);
  // With nothing to connect to yet, first check whether this page's server
  // has us signed in; the sheet waits for the answer.
  const [probing, setProbing] = useState(() => !config);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 720);
  const [openPath, setOpenPath] = useState<string>();
  const [controller, setController] = useState<NotebookController>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);

  useEffect(stripLaunchParams, []);

  useEffect(() => {
    if (!probing) return;
    let cancelled = false;
    void signedInHere().then(ok => {
      if (cancelled) return;
      if (ok) {
        setConfig(SAME_ORIGIN);
        setSheetOpen(false);
      }
      setProbing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [probing]);

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
      if (matches(e, 'save')) {
        e.preventDefault();
        void controller?.save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // From the notebook's H, and the Apple apps' Help menu.
  useEffect(() => {
    const show = () => setShortcutsOpen(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
  }, []);

  return (
    <>
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
            onShowShortcuts={() => setShortcutsOpen(true)}
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
      {sheetOpen && !probing && (
        <ConnectSheet
          initial={config}
          error={error}
          connecting={connecting}
          canCancel={!!backend}
          onCancel={() => setSheetOpen(false)}
          onConnect={c => setConfig({ ...c })}
        />
      )}
      {shortcutsOpen && <ShortcutsSheet onClose={closeShortcuts} />}
    </>
  );
}
