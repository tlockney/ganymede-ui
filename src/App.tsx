import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TOUCH_QUERY, useMedia, useNarrow } from './lib/useNarrow';
import { useJupyterLabTheme } from './lib/theme';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { NotebookPane, type NotebookController } from './components/NotebookPane';
import { ConnectSheet } from './components/ConnectSheet';
import { EmptyState } from './components/EmptyState';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { SettingsSheet } from './components/SettingsSheet';
import { SHOW_SETTINGS_EVENT } from '@ganymede-ui/agent/settings';
import { SHOW_SHORTCUTS_EVENT, matches } from './lib/shortcuts';
import {
  LAUNCH_PARAMS,
  clean,
  type Launch,
  isReload,
  readLaunch,
  titleFor,
  withDir,
  withOpen,
} from './lib/launch';
import {
  canOpenFiles,
  exposeHooks,
  nativeChrome,
  openFile,
  postDocument,
  postState,
  fileMove,
  pageSearch,
  runningSessions,
  searchRequest,
  type RunningSession,
  type PageState,
  type SearchRequest,
} from './lib/native';
import { agentCall } from './lib/native-agent';
import { useSignals } from './lib/useSignal';
import { fileActions } from './lib/file-actions';
import { useFileSearch } from './lib/search';
import {
  clearRecents,
  forgetRecent,
  loadRecents,
  moveRecent,
  recentsKey,
  useRecents,
} from './lib/recents';
import { paletteEntries } from './lib/palette';
import { CommandPalette } from './components/CommandPalette';
import { useFileDrop } from './lib/file-drop';
import { copySample } from './lib/sample';

/**
 * A token in the page URL, as `ganymede serve` prints it, wins once, and so
 * does `kernels=page`, `kernels=both` or `kernels=server`, which the Apple
 * apps add on every launch (`page` on an iPad without a kernel server,
 * `both` on the Mac). Pure, as React
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
    ...(kernels === 'page' || kernels === 'both' ? { kernels } : {}),
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

/** The Apple app's own server: the one this page came from. */
function isAppServer(config: BackendConfig): boolean {
  return config.kind === 'ganymede' && config.url === '';
}

/** Whether two configs reach the same notebooks, whatever the token. */
function sameBackend(a: BackendConfig, b: BackendConfig): boolean {
  if (a.kind !== 'ganymede' || b.kind !== 'ganymede') return a.kind === b.kind;
  return a.url === b.url && a.kernels === b.kernels;
}

export function App() {
  const scheme = useColorScheme();
  useJupyterLabTheme(scheme);
  const [config, setConfig] = useState<BackendConfig | undefined>(initialConfig);
  // The notebook and folder the URL asks for (`?open=`, `?dir=`): a window
  // the Apple apps open on one file.
  const [launch] = useState<Launch>(() => readLaunch(window.location.search));
  // The Apple apps draw the sidebar, toolbar and menus themselves (#205).
  const [native] = useState(() => nativeChrome());
  // On the root, so the sheets (outside the window) lose the toolbar's offset too.
  useEffect(() => {
    document.documentElement.classList.toggle('chrome-native', native);
  }, [native]);
  /**
   * The notebook to open on the first connection, until it is opened or
   * the connect sheet picks another backend.
   */
  const pendingOpen = useRef(launch.open);
  /** The folder the sidebar starts in; the server root once the sheet picks a backend. */
  const [sidebarRoot, setSidebarRoot] = useState(launch.dir);
  /** The folder the sidebar shows, where new notebooks go. */
  const [folder, setFolder] = useState(launch.dir);
  /** Why the last New Notebook failed, until dismissed or the next one. */
  const [newError, setNewError] = useState<string>();
  const [backend, setBackend] = useState<Backend>();
  const backendRef = useRef(backend);
  backendRef.current = backend;
  const [error, setError] = useState<string>();
  const [connecting, setConnecting] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(() => !config);
  // With nothing to connect to yet, first check whether this page's server
  // has us signed in; the sheet waits for the answer.
  const [probing, setProbing] = useState(() => !config);
  // A window opened on one notebook starts on the notebook alone; a reload
  // of any page keeps the usual layout.
  const narrow = useNarrow();
  const [sidebarOpen, setSidebarOpen] = useState(() => !(launch.open && !isReload()) && !narrow);
  // On a phone the sidebar floats over the notebook: it closes when it
  // has done its job (a notebook opened), on a tap outside it, and on Esc.
  // The app draws its own sidebar with `chrome=native`, so the page's never floats.
  const sidebarFloats = !native && narrow && sidebarOpen;
  // The cells' touch controls (#200): on a touch screen, or in a narrow
  // window. Not for narrowness with `chrome=native`, where the web view
  // beside the Mac app's sidebar can be under 720px in a wide window.
  const touch = useMedia(TOUCH_QUERY);
  useEffect(() => {
    document.documentElement.classList.toggle('touch-ui', touch || (narrow && !native));
  }, [touch, narrow, native]);
  const afterPick = useCallback(() => {
    if (narrow) setSidebarOpen(false);
  }, [narrow]);
  const [openPath, setOpenPath] = useState<string>();
  // Not if another notebook was opened while it renamed.
  const followRename = useCallback(
    (from: string, to: string) => setOpenPath(p => (p === from ? to : p)),
    [],
  );
  const [controller, setController] = useState<NotebookController>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

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
    /** Resolves true once the new notebook opens, false if it wasn't created. */
    async (dir: string): Promise<boolean> => {
      if (!backend) return false;
      setNewError(undefined);
      const { services } = backend;
      let model;
      try {
        model = await services.contents.newUntitled({ type: 'notebook', path: dir });
      } catch (e) {
        // Said, not dropped: a click that does nothing reads as a dead button.
        const where = dir ? `“${dir.split('/').pop()}”` : 'this folder';
        setNewError(
          `Couldn’t create a notebook in ${where}: ${e instanceof Error ? e.message : String(e)}`,
        );
        return false;
      }
      // The default kernel, for the first run. Without it the notebook
      // still opens, and its kernel picker asks.
      try {
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
      } catch (e) {
        console.warn(`Couldn’t set the kernel of ${model.path}:`, e);
      }
      setOpenPath(model.path);
      return true;
    },
    [backend],
  );

  // A notebook dropped on the window from Finder or Files is copied into
  // the sidebar's folder and opened (#216).
  const drop = useFileDrop({
    contents: backend?.services.contents,
    dir: folder,
    onCopied: paths => setOpenPath(paths[0]),
    onError: setNewError,
  });

  // A failed New Notebook's notice goes once something else opens.
  useEffect(() => setNewError(undefined), [openPath, backend]);

  // The window title, which the Apple apps show, and `?open=` and `?dir=`
  // in step with the open notebook and the sidebar's folder, so a reload
  // (⌘R, or WebKit restarting the page) comes back to both. A launch file
  // not opened yet stays in the URL.
  useEffect(() => {
    document.title = titleFor(openPath);
    if (!openPath && pendingOpen.current) return;
    const search = withDir(withOpen(window.location.search, openPath), folder);
    if (search !== window.location.search) {
      history.replaceState(null, '', window.location.pathname + search);
    }
  }, [openPath, folder]);

  // The Mac app's window: its title bar's edited dot and proxy icon, and
  // its Save, close and quit prompts.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  // The app's menus and toolbar run the page's commands (#205); a ref, so
  // the hooks stay put while what they act on changes.
  const runCommand = useRef<(id: string, arg?: string) => Promise<boolean>>(async () => false);
  runCommand.current = async (id, arg) => {
    const c = controller;
    switch (id) {
      case 'open': {
        // As `?open=`: the app may pass an absolute path.
        const path = arg && clean(arg);
        if (!backend || !path) return false;
        setOpenPath(path);
        return true;
      }
      case 'close':
        // Without saving: the app closes a notebook it moved to the Trash.
        if (!openPath) return false;
        c?.discard();
        setOpenPath(undefined);
        return true;
      case 'new-notebook':
        if (!backend) return false;
        // A failure shows the page's notice (#195) and returns false.
        return newNotebook(clean(arg ?? ''));
      case 'shutdown-kernel': {
        // By session id, or by the notebook's path as `open` takes it.
        const s = running.find(r => r.id === arg || (!!arg && r.path === clean(arg)));
        if (!backend || !s) return false;
        // False, not a rejection: the app runs commands without waiting.
        return backend.services.sessions.shutdown(s.id).then(
          () => true,
          () => false,
        );
      }
      case 'shutdown-others': {
        if (!backend) return false;
        const others = running.filter(r => r.path !== openPath);
        // Each one tried; false when any failed.
        const done = await Promise.allSettled(
          others.map(r => backend.services.sessions.shutdown(r.id)),
        );
        return done.every(d => d.status === 'fulfilled');
      }
      case 'search': {
        // The app's sidebar searches through the page (#240).
        const request = searchRequest(arg);
        if (!request) return false;
        setNativeSearch(request);
        return true;
      }
      case 'clear-recents':
        if (!backend) return false;
        clearRecents(recentsKey(backend.config));
        return true;
      case 'file-moved': {
        // The app's sidebar renames and deletes with the file system, which
        // the contents manager doesn't hear of (#240).
        // Its sidebar lists the app's own files, so only that server's
        // Recents follow: a remote one may hold the same path.
        const move = fileMove(arg);
        if (!backend || !move || !isAppServer(backend.config)) return false;
        const key = recentsKey(backend.config);
        if (move.to === null) forgetRecent(key, move.from);
        else moveRecent(key, move.from, move.to);
        return true;
      }
      case 'show-shortcuts':
        setShortcutsOpen(true);
        return true;
      case 'show-settings':
        setSettingsOpen(true);
        return true;
      case 'command-palette':
        setPaletteOpen(true);
        return true;
      case 'connect':
        setSheetOpen(true);
        return true;
    }
    if (!c) return false;
    switch (id) {
      case 'save':
        return c.save();
      case 'download':
        c.download();
        return true;
      case 'rename':
        // A new name, as the title takes it: saves first and keeps the
        // kernel, and a failure shows the page's notice.
        if (!arg) return false;
        return c.rename(arg);
      case 'trust':
        await c.trust();
        return true;
      case 'run':
        await c.run();
        return true;
      case 'run-all':
        await c.runAll();
        return true;
      case 'interrupt':
        await c.interrupt();
        return true;
      case 'restart':
        await c.restart();
        return true;
      case 'insert-code':
        c.insert('code');
        return true;
      case 'insert-markdown':
        c.insert('markdown');
        return true;
      case 'cell-type':
        if (arg !== 'code' && arg !== 'markdown' && arg !== 'raw') return false;
        c.changeCellType(arg);
        return true;
      case 'change-kernel':
        if (!arg) return false;
        await c.changeKernel(arg);
        return true;
      default:
        return c.command(id);
    }
  };
  useEffect(
    () =>
      exposeHooks({
        save: async () => {
          const c = controllerRef.current;
          return !c?.dirty || (await c.save());
        },
        command: (id, arg) => runCommand.current(id, arg),
        call: agentCall,
      }),
    [],
  );
  // The Apple apps edit other files in their own editor, on their own
  // server: the one this page came from.
  const editsFiles = canOpenFiles() && !!backend && isAppServer(backend.config);

  const dirty = !!openPath && controller?.path === openPath && controller.dirty;
  useEffect(() => postDocument({ path: openPath ?? null, dirty }), [openPath, dirty]);

  // Everything the app's toolbar and menus show (#205), and its Running
  // list (#225).
  const specs = backend?.services.kernelspecs.specs ?? undefined;
  useSignals(backend?.services.sessions.runningChanged);
  const running = runningSessions(backend?.services.sessions.running() ?? [], specs);
  const runningKey = JSON.stringify(running);
  const shown = !!openPath && controller?.path === openPath ? controller : undefined;
  // The app's sidebar's search and Recents (#240): the page's sidebar has
  // its own, so these run only with `chrome=native`.
  const [nativeSearch, setNativeSearch] = useState<SearchRequest>({ query: '' });
  const found = useFileSearch(
    native ? backend?.services.contents : undefined,
    nativeSearch.dir ?? '',
    nativeSearch.query,
    !!nativeSearch.contents,
  );
  // The hook's state belongs to the last request until its effect has
  // seen this one: until then this is searching, not the old matches
  // under the new query.
  const [settled, setSettled] = useState(nativeSearch);
  useEffect(() => setSettled(nativeSearch), [nativeSearch]);
  const searchKey = useMemo(
    () =>
      JSON.stringify(
        pageSearch(
          nativeSearch.query,
          settled === nativeSearch ? found : { matches: [], searching: true, truncated: false },
          editsFiles,
        ),
      ),
    [nativeSearch, settled, found, editsFiles],
  );
  const recents = useRecents(native ? backend : undefined, openPath);
  const recentsKeyed = JSON.stringify(recents);
  useEffect(() => {
    const kernel = shown?.kernelName ?? null;
    postState({
      path: openPath ?? null,
      dirty,
      status: shown?.status ?? null,
      kernel,
      kernelDisplayName:
        shown?.missingKernel ??
        (kernel ? (specs?.kernelspecs[kernel]?.display_name ?? kernel) : null),
      kernelMissing: !!shown?.missingKernel,
      trusted: shown?.trusted ?? true,
      cellType: shown?.cellType ?? null,
      kernels: Object.values(specs?.kernelspecs ?? {}).flatMap(k =>
        k ? [{ name: k.name, displayName: k.display_name }] : [],
      ),
      backend: backend ? { label: backend.label, detail: backend.detail } : null,
      running: JSON.parse(runningKey) as RunningSession[],
      recents: JSON.parse(recentsKeyed) as string[],
      search: JSON.parse(searchKey) as PageState['search'],
    });
  }, [openPath, dirty, shown, specs, backend, runningKey, recentsKeyed, searchKey]);

  // ⌘S / Ctrl+S saves, as in any document app; ⇧⌘P opens the command
  // palette (#211).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, 'save')) {
        e.preventDefault();
        void controller?.save();
      } else if (matches(e, 'command-palette')) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Esc on a sheet opened from the sidebar closes the sheet, not the sidebar.
  const sheetShown = sheetOpen || shortcutsOpen || settingsOpen || paletteOpen;
  useEffect(() => {
    if (!sidebarFloats || sheetShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarFloats, sheetShown]);

  // From the notebook's H, and the Apple apps' Help menu.
  useEffect(() => {
    const show = () => setShortcutsOpen(true);
    window.addEventListener(SHOW_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, show);
  }, []);

  // From the sidebar, and later the Apple apps' Settings menu (#166).
  useEffect(() => {
    const show = () => setSettingsOpen(true);
    window.addEventListener(SHOW_SETTINGS_EVENT, show);
    return () => window.removeEventListener(SHOW_SETTINGS_EVENT, show);
  }, []);

  return (
    <>
      <div
        className={`window ${sidebarOpen ? '' : 'sidebar-collapsed'} ${native ? 'chrome-native' : ''}`}
        data-scheme={scheme}
      >
        {!native && (
          <Sidebar
            backend={backend}
            connecting={connecting}
            openPath={openPath}
            root={sidebarRoot}
            onOpen={path => {
              setOpenPath(path);
              afterPick();
            }}
            onOpenFile={
              editsFiles
                ? path => {
                    openFile(path);
                    afterPick();
                  }
                : undefined
            }
            // Closes once the notebook opens, so a failure leaves the sidebar up.
            onNew={dir => void newNotebook(dir).then(opened => opened && afterPick())}
            onDirChange={setFolder}
            onClose={sidebarFloats ? () => setSidebarOpen(false) : undefined}
            onConnect={() => setSheetOpen(true)}
            onSettings={() => setSettingsOpen(true)}
            actions={
              backend &&
              fileActions({
                contents: backend.services.contents,
                sessions: backend.services.sessions,
                openPath,
                controller,
                setOpenPath,
              })
            }
          />
        )}
        {sidebarFloats && (
          <div
            className="sidebar-scrim"
            aria-hidden="true"
            data-testid="sidebar-scrim"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className="main">
          {!native && (
            <Toolbar
              controller={controller}
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(o => !o)}
              onShowShortcuts={() => setShortcutsOpen(true)}
              onShowPalette={() => setPaletteOpen(true)}
              specs={specs}
            />
          )}
          <div className={`content ${drop.active ? 'drop-active' : ''}`} {...drop.handlers}>
            {backend && openPath ? (
              <NotebookPane
                key={`${backend.config.kind}:${openPath}`}
                backend={backend}
                path={openPath}
                onController={setController}
                onRenamed={followRename}
              />
            ) : (
              <EmptyState
                backend={backend}
                // Also before the first connection starts, and while the page
                // asks whether this server has us signed in: otherwise the
                // first frames show Connect…, then the welcome.
                connecting={connecting || probing || (!!config && !backend && !error)}
                onNew={() => void newNotebook(folder)}
                onConnect={() => setSheetOpen(true)}
                folder={folder}
                onShowFolder={native || sidebarOpen ? undefined : () => setSidebarOpen(true)}
                onOpenSample={
                  backend &&
                  (async () => {
                    const { contents, kernelspecs } = backend.services;
                    const path = await copySample(contents, folder, kernelspecs.specs);
                    // Not if the backend changed while the copy ran.
                    if (backendRef.current === backend) setOpenPath(path);
                  })
                }
              />
            )}
            {newError && (
              <div className="pane-notice" role="alert">
                <span>{newError}</span>
                <button className="pane-notice-dismiss" onClick={() => setNewError(undefined)}>
                  Dismiss
                </button>
              </div>
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
            // The launch file and folder belong to the first backend: keep
            // them for a retry there (a corrected token) or when this is
            // the first pick, drop them for another.
            if (config && !sameBackend(c, config)) {
              pendingOpen.current = undefined;
              setSidebarRoot('');
              history.replaceState(
                null,
                '',
                window.location.pathname + withDir(withOpen(window.location.search, undefined), ''),
              );
            }
            setConfig({ ...c });
          }}
        />
      )}
      {paletteOpen && (
        <CommandPalette
          entries={paletteEntries({
            path: shown?.path,
            folder,
            kernels: Object.values(specs?.kernelspecs ?? {}).flatMap(k =>
              k ? [{ name: k.name, displayName: k.display_name }] : [],
            ),
            kernel: shown?.kernelName,
            recents: backend ? loadRecents(recentsKey(backend.config)) : [],
            trusted: shown?.trusted ?? true,
            connected: !!backend,
          })}
          onRun={(entry, arg) => {
            setPaletteOpen(false);
            void runCommand.current(entry.id, arg);
          }}
          onClose={() => setPaletteOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsSheet onClose={closeShortcuts} />}
      {settingsOpen && <SettingsSheet onClose={closeSettings} />}
    </>
  );
}
