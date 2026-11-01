import { useCallback, useEffect, useRef, useState } from 'react';
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
import { LAUNCH_PARAMS, type Launch, readLaunch, titleFor, withOpen } from './lib/launch';

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

/** Keeps the token out of history and the referrer. `open` is kept in step instead. */
function stripLaunchParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!LAUNCH_PARAMS.some(p => params.has(p))) return;
  LAUNCH_PARAMS.forEach(p => params.delete(p));
  const rest = params.toString();
  history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

export function App() {
  const scheme = useColorScheme();
  useJupyterLabTheme(scheme);
  const [config, setConfig] = useState<BackendConfig | undefined>(initialConfig);
  // The notebook and folder the URL asks for (`?open=`, `?dir=`): a window
  // the Apple apps open on one file.
  const [launch] = useState<Launch>(() => readLaunch(window.location.search));
  /**
   * The notebook to open on the first connection, until it is opened or
   * the connect sheet picks another backend.
   */
  const pendingOpen = useRef(launch.open);
  /** The folder the sidebar starts in; the server root once the sheet picks a backend. */
  const [sidebarRoot, setSidebarRoot] = useState(launch.dir);
  const [backend, setBackend] = useState<Backend>();
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(() => !config);
  // With nothing to connect to yet, first check whether this page's server
  // has us signed in; the sheet waits for the answer.
  const [probing, setProbing] = useState(() => !config);
  // A window opened on one notebook starts on the notebook alone.
  const [sidebarOpen, setSidebarOpen] = useState(() => !launch.open && window.innerWidth > 720);
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
        if (pendingOpen.current) {
          setOpenPath(pendingOpen.current);
          pendingOpen.current = undefined;
        }
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

  // The window title, which the Apple apps show, and `?open=` in step with
  // the open notebook, so a reload (⌘R, or WebKit restarting the page)
  // comes back to it. A launch file not opened yet stays in the URL.
  useEffect(() => {
    document.title = titleFor(openPath);
    if (!openPath && pendingOpen.current) return;
    const search = withOpen(window.location.search, openPath);
    if (search !== window.location.search) {
      history.replaceState(null, '', window.location.pathname + search);
    }
  }, [openPath]);

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
          root={sidebarRoot}
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
          onConnect={c => {
            // The launch file and folder belong to the first backend.
            pendingOpen.current = undefined;
            setSidebarRoot('');
            history.replaceState(
              null,
              '',
              window.location.pathname + withOpen(window.location.search, undefined),
            );
            setConfig({ ...c });
          }}
        />
      )}
      {shortcutsOpen && <ShortcutsSheet onClose={closeShortcuts} />}
    </>
  );
}
