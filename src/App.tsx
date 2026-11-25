import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import {
  type Backend,
  type BackendConfig,
  connect,
  SAME_ORIGIN,
  saveConfig,
  signedInHere,
} from './lib/backends';
import { initialConfig, isAppServer, sameBackend } from './lib/app-config';
import { offersDevice } from './lib/kernel-device';
import { reportMoved } from './lib/kernel-relay';
import { useColorScheme } from './lib/useColorScheme';
import { TOUCH_QUERY, useMedia, useNarrow } from './lib/useNarrow';
import { useJupyterLabTheme } from './lib/theme';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { DataPane } from './components/DataPane';
import { DuckdbConsole } from './components/DuckdbConsole';
import {
  clearConsoles,
  listedConsoles,
  loadConsoles,
  moveConsoleFolders,
  renameConsole,
  startConsole,
  useConsoles,
} from './lib/console-recents';
import { NotebookPane, type NotebookController } from './components/NotebookPane';
import { dataKind } from './lib/data-files';
import { ConnectSheet } from './components/ConnectSheet';
import { EmptyState } from './components/EmptyState';
import { ShortcutsSheet } from './components/ShortcutsSheet';
import { HostAccessSheet } from './components/HostAccessSheet';
import { PublishSheet } from './components/PublishSheet';
import { publishAvailable } from './lib/publish';
import {
  hostGrantsAvailable,
  loadHostGrants,
  missingWants,
  saveHostGrant,
} from './lib/host-grants';
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
  canOpenTabs,
  exposeHooks,
  nativeChrome,
  openFile,
  openTab,
  postDocument,
  postState,
  fileMove,
  pageSearch,
  pageVariables,
  variablePath,
  runningSessions,
  searchRequest,
  showAppSettings,
  type RunningSession,
  type PageState,
  type SearchRequest,
} from './lib/native';
import { agentCall } from './lib/native-agent';
import { sendTestReport } from './lib/crash-reports';
import { useSignals } from './lib/useSignal';
import { fileActions, within } from './lib/file-actions';
import { moveChosenViews } from './lib/journal';
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
import { liveMarkdownEnabled, setLiveMarkdownEnabled } from './lib/markdown-preview';
import { setTypeErrorsEnabled, typeErrorsEnabled } from './lib/type-errors';
import { CommandPalette } from './components/CommandPalette';
import { VariablesPanel } from './components/VariablesPanel';
import { useKernelMemory } from './lib/kernel-usage';
import { nodeAt, useVariables } from './lib/useVariables';
import { copyIntoFolder, useFileDrop } from './lib/file-drop';
import { copySample } from './lib/sample';
import { pendingHandoffs } from './lib/rename';
import { SERVER_TIMEOUT_MS } from './lib/server-request';
import { refreshKernelsOnReturn } from './lib/kernel-refresh';
import { StorageNotice } from './components/StorageNotice';
import { RunSheet } from './components/RunSheet';
import { runAvailable, runWithParams } from './lib/run';
import { EXPORT_FORMATS, type ExportFormat } from './lib/export';

/** Keeps the token out of history and the referrer. `open` is kept in step instead. */
function stripLaunchParams(): void {
  const params = new URLSearchParams(window.location.search);
  if (!LAUNCH_PARAMS.some(p => params.has(p))) return;
  LAUNCH_PARAMS.forEach(p => params.delete(p));
  const rest = params.toString();
  history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : ''));
}

type PendingStart = { kind: 'try' } | { kind: 'open'; file: File };

export function App() {
  const scheme = useColorScheme();
  useJupyterLabTheme(scheme);
  const [config, setConfig] = useState<BackendConfig | undefined>(initialConfig);
  // A connected machine's window (#701): its name. The app's native menus
  // switch places (the page's sidebar is not drawn there, `chrome=native`).
  const machineName =
    config?.kind === 'ganymede' && config.machine ? (config.machineName ?? 'machine') : undefined;
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
  /**
   * The Mac app opens a DuckDB console in a tab of its own (#729): its page
   * is loaded with `console=duckdb`, shows the console for `dir` once
   * connected, and asks the app for a tab to open a notebook or a new
   * console, so the console keeps running. A browser or the iPad app, with
   * no `openTab` handler, opens them in the page as before.
   */
  const [consoleTab] = useState(() => launch.console === 'duckdb' && canOpenTabs());
  /** The folder of the console to show on the first connection. */
  const pendingConsole = useRef(launch.console === 'duckdb' ? launch.dir : undefined);
  /** The record of the console to show on the first connection: the tab's own id (#735). */
  const pendingSession = useRef(launch.session);
  const [openPath, setOpenPathState] = useState<string>();
  /**
   * The DuckDB console (#679) shows in the page where a notebook would, in
   * this folder. It has no path: the app's state says no notebook is open,
   * so its notebook menus disable, as they do for a data file. Opening
   * anything closes it, except in a console tab (`consoleTab`), where the
   * app opens a tab for it.
   */
  const [duckFolder, setDuckFolder] = useState<string>();
  /**
   * Sets the open path; a path opened closes the console, here and now, not
   * from an effect after the render: an effect could run after a console
   * shown since and close that one.
   */
  const setOpenPath = useCallback((next: SetStateAction<string | undefined>) => {
    if (typeof next === 'string' && next) setDuckFolder(undefined);
    setOpenPathState(next);
  }, []);
  /**
   * Opens a notebook or data file: in the page, or in a tab of its own from a
   * console tab, which keeps its console (#729).
   */
  const openNotebook = useCallback(
    (path: string) => (consoleTab ? openTab({ path }) : setOpenPath(path)),
    [consoleTab, setOpenPath],
  );
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
  // Never open at the start: with nothing saved, the start screen offers
  // Try a Notebook, Open a Notebook… and Connect to a Server… (#815), and
  // the sheet opens behind the last. The Apple apps always have a config.
  const [sheetOpen, setSheetOpen] = useState(false);
  /**
   * What the start screen asked for, to run once its browser backend
   * connects: the sample, or a notebook file the person picked. Dropped when
   * the sheet picks a backend (a retry after a failed connection too), so a
   * later connection never runs a start nobody is waiting for.
   */
  const pendingStart = useRef<PendingStart | undefined>(undefined);
  // With nothing to connect to yet, first check whether this page's server
  // has us signed in; the start screen waits for the answer.
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
  /**
   * Bumped by each New DuckDB Console: a new console is a new engine with
   * nothing read, even on the same folder. A move of the folder keeps it.
   */
  const [duckId, setDuckId] = useState(0);
  /** The shown console's record (#735): its id, which is the tab's on the Mac, and its name. */
  const [duck, setDuck] = useState<{ id: string; name: string }>();
  /** Shows a console in the page, on `folder`: a fresh engine, for the record `of` names. */
  const showConsole = useCallback(
    (of: { id: string; name: string }, folder: string) => {
      setOpenPath(undefined);
      setDuck({ id: of.id, name: of.name });
      setDuckFolder(folder);
      setDuckId(n => n + 1);
    },
    [setOpenPath],
  );
  /**
   * A move of the console's folder, or one it is in, keeps the console and
   * moves it along; a delete closes it, as it closes an open data file.
   */
  const followFolder = useCallback((from: string, to: string | null) => {
    // The view chosen for a notebook goes with it.
    const b = backendRef.current;
    if (b) {
      moveChosenViews(recentsKey(b.config), from, to);
      // The recent consoles in it follow, as the one shown does (#735).
      moveConsoleFolders(recentsKey(b.config), from, to);
    }
    setDuckFolder(f =>
      f === undefined || !within(f, from) ? f : to === null ? undefined : to + f.slice(from.length),
    );
  }, []);
  // Not if another notebook was opened while it renamed.
  // A run going on keeps going through a rename or move (of the notebook
  // or a folder it's in): its sheet and parameters follow the name.
  const followRun = useCallback((from: string, to: string) => {
    const moved = (p: string) => to + p.slice(from.length);
    setRunFor(r => (r && within(r.path, from) ? { ...r, path: moved(r.path) } : r));
    for (const [p, params] of [...lastParams.current]) {
      if (!within(p, from)) continue;
      lastParams.current.delete(p);
      lastParams.current.set(moved(p), params);
    }
  }, []);
  const followRename = useCallback(
    (from: string, to: string) => {
      const b = backendRef.current;
      if (b) moveChosenViews(recentsKey(b.config), from, to);
      setOpenPath(p => (p === from ? to : p));
      followRun(from, to);
    },
    [followRun, setOpenPath],
  );
  const [controller, setController] = useState<NotebookController>();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /** The Variables view beside the notebook (#242). */
  const [variablesOpen, setVariablesOpen] = useState(false);
  /** The app's Running list shows (#241): the page asks for each kernel's memory for it. */
  const [watchMemory, setWatchMemory] = useState(false);
  /** The app's inspector shows its Variables view (#249): the page reads them for it. */
  const [appVariables, setAppVariables] = useState(false);
  const otherSheetShown = useRef(false);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  /** Notebook Access, for the notebook open when it was asked for. */
  const [accessFor, setAccessFor] = useState<{ path: string; name: string; wants: string[] }>();
  /** Publish as Web Page, for the notebook open when it was asked for (#563). */
  const [publishFor, setPublishFor] = useState<{ path: string; name: string }>();
  const closePublish = useCallback(() => setPublishFor(undefined), []);
  const [runFor, setRunFor] = useState<{ path: string; name: string; params: string }>();
  const closeRun = useCallback(() => setRunFor(undefined), []);
  // Closing the notebook (or opening another) closes its sheet, which
  // stops a run in progress.
  useEffect(() => {
    if (runFor && runFor.path !== openPath) setRunFor(undefined);
  }, [runFor, openPath]);
  /** The parameters each notebook last ran with from the sheet, by path. */
  const lastParams = useRef(new Map<string, string>());
  // Paths are the server's: another server's notebook starts afresh.
  useEffect(() => {
    lastParams.current.clear();
  }, [backend]);
  const closeAccess = useCallback(() => {
    setAccessFor(undefined);
    setAccessChecked(n => n + 1);
  }, []);
  // What the open notebook asks for that its grant doesn't give: the
  // toolbar shows Notebook Access while there is any. Checked again when
  // the sheet closes.
  const [accessMissing, setAccessMissing] = useState<string[]>([]);
  const [accessChecked, setAccessChecked] = useState(0);
  // In the Apple apps these are tabs of the app's one Settings (#332); the
  // page's sheets are for the browser.
  const openShortcuts = useCallback(() => {
    if (!showAppSettings('shortcuts')) setShortcutsOpen(true);
  }, []);
  const openSettings = useCallback(() => {
    if (!showAppSettings('agent')) setSettingsOpen(true);
  }, []);
  // The app picks where kernels run in Settings › Kernels.
  const openConnect = useCallback(() => {
    if (!showAppSettings('kernels')) setSheetOpen(true);
  }, []);

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
    // A console is of the server it started on: its folder is that one's.
    setDuckFolder(undefined);
    connect(config)
      .then(b => {
        if (cancelled) {
          b.services.dispose();
          return;
        }
        saveConfig(config);
        // The old backend's services go once the panes closed on it are
        // done with them (the effect on `backend` below).
        setBackend(b);
        setSheetOpen(false);
        if (pendingOpen.current) {
          setOpenPath(pendingOpen.current);
          pendingOpen.current = undefined;
        } else if (pendingConsole.current !== undefined) {
          // A tab's own record, if it has one (a restored tab, a reopened
          // console), else a new console with the tab's id (#735).
          const c = startConsole(
            recentsKey(b.config),
            pendingSession.current,
            pendingConsole.current,
          );
          setDuck({ id: c.id, name: c.name });
          setDuckFolder(c.folder);
        }
        pendingConsole.current = undefined;
        pendingSession.current = undefined;
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
  }, [config, setOpenPath]);

  // The start screen's pick, once its browser backend is up (#815). An
  // effect on the backend rather than a step of the connection's success
  // path: it runs once per backend whatever the connection effect's
  // StrictMode reruns or cancellations did, and a backend replaced while
  // the copy runs (the cleanup) drops the notebook it would open. The copy
  // is async, so a failure is set after the effect that clears the last
  // notice has run. A failed connection leaves the pick in place: the next
  // connection comes from the start screen (a new pick) or the sheet
  // (`switchBackend`, which drops it).
  useEffect(() => {
    const start = pendingStart.current;
    if (!backend || !start) return;
    pendingStart.current = undefined;
    let current = true;
    const { contents, kernelspecs } = backend.services;
    void (async () => {
      try {
        if (start.kind === 'try') {
          const path = await copySample(contents, '', kernelspecs.specs);
          if (current) openNotebook(path);
        } else {
          const { paths, errors } = await copyIntoFolder(contents, '', [start.file]);
          if (!current) return;
          if (errors.length) setNewError(errors.join('\n'));
          if (paths.length) openNotebook(paths[0]);
        }
      } catch (e) {
        if (current) {
          const what = start.kind === 'try' ? 'the sample notebook' : `“${start.file.name}”`;
          setNewError(`Couldn’t start with ${what}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [backend, openNotebook]);

  // A backend another took the place of is disposed once the last saves
  // of the panes that closed on it are done (#792): they save through its
  // services. The cleanup runs after the commit that showed the new
  // backend, so those panes have handed off their saves by then. Not on
  // unmount, or StrictMode's second run, where the backend is still the
  // current one.
  useEffect(() => {
    const b = backend;
    if (!b) return;
    return () => {
      if (backendRef.current === b) return;
      // Not forever: a save the server never answers would keep the old
      // services polling it.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<void>(resolve => {
        timer = setTimeout(resolve, SERVER_TIMEOUT_MS);
      });
      void Promise.race([Promise.allSettled(pendingHandoffs()), late]).then(() => {
        clearTimeout(timer);
        b.services.dispose();
      });
    };
  }, [backend]);

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
      openNotebook(model.path);
      return true;
    },
    [backend, openNotebook],
  );

  const copyingExamples = useRef(false);
  const openExamples = useCallback(
    /** Copies the examples into a new folder in `dir` and opens the first (#414). */
    async (dir: string): Promise<boolean> => {
      // One copy at a time: a double click shouldn't make two folders.
      if (!backend || copyingExamples.current) return false;
      copyingExamples.current = true;
      setNewError(undefined);
      try {
        const { copyExamples } = await import('./lib/examples');
        const { contents, kernelspecs } = backend.services;
        const path = await copyExamples(contents, dir, kernelspecs.specs);
        // Not if the backend changed while the copy ran.
        if (backendRef.current === backend) openNotebook(path);
        return true;
      } catch (e) {
        setNewError(`Couldn’t copy the examples: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      } finally {
        copyingExamples.current = false;
      }
    },
    [backend, openNotebook],
  );

  // A notebook dropped on the window from Finder or Files is copied into
  // the sidebar's folder and opened (#216).
  const drop = useFileDrop({
    contents: backend?.services.contents,
    dir: folder,
    onCopied: paths => openNotebook(paths[0]),
    onError: setNewError,
  });

  // A failed New Notebook's notice goes once something else opens.
  useEffect(() => setNewError(undefined), [openPath, backend]);

  // The window title, which the Apple apps show, and `?open=` and `?dir=`
  // in step with the open notebook and the sidebar's folder, so a reload
  // (⌘R, or WebKit restarting the page) comes back to both. A launch file
  // not opened yet stays in the URL.
  useEffect(() => {
    document.title = titleFor(openPath, machineName);
    if (!openPath && pendingOpen.current) return;
    const search = withDir(withOpen(window.location.search, openPath), folder);
    if (search !== window.location.search) {
      history.replaceState(null, '', window.location.pathname + search);
    }
  }, [openPath, folder, machineName]);

  // The Mac app's window: its title bar's edited dot and proxy icon, and
  // its Save, close and quit prompts.
  const controllerRef = useRef(controller);
  controllerRef.current = controller;
  /**
   * Connect to what the sheet picked. The launch file and folder belong to
   * the first backend: kept for a retry there (a corrected token) or when
   * this is the first pick, dropped for another.
   */
  const switchBackend = (c: BackendConfig) => {
    // The sheet's pick replaces a start screen pick still connecting (#815).
    pendingStart.current = undefined;
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
  };
  /** Bumped by each Connect and Cancel in the sheet: a save that ends after either is stale. */
  const switchTry = useRef(0);
  /** The open notebook is saving before the sheet connects (#792). */
  const [savingForSwitch, setSavingForSwitch] = useState(false);
  /**
   * A connect the open notebook's save didn't let through (#792): the
   * sheet asks to keep editing, download a copy, or switch without saving.
   * `why` when the pane can't say: the save didn't finish in time.
   */
  const [blockedSwitch, setBlockedSwitch] = useState<{
    config: BackendConfig;
    controller: NotebookController;
    why?: string;
  }>();
  /**
   * Connecting closes the open notebook, and its services with the old
   * backend, so its edits are saved first (#792): only once they are does
   * the sheet connect. A failed save (the pane says why), or one the
   * server doesn't answer in time, leaves the choice to the person.
   */
  const connectFromSheet = async (c: BackendConfig) => {
    const attempt = ++switchTry.current;
    const open = controllerRef.current;
    // The controller outlives its pane: a data file or console opened since has none.
    if (open && open.path === openPath && open.dirty) {
      setSavingForSwitch(true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const late = new Promise<'late'>(resolve => {
        timer = setTimeout(() => resolve('late'), SERVER_TIMEOUT_MS);
      });
      const saved = await Promise.race([open.save(), late]).finally(() => clearTimeout(timer));
      if (switchTry.current !== attempt) return;
      setSavingForSwitch(false);
      if (saved !== true) {
        setBlockedSwitch({
          config: c,
          controller: open,
          why: saved === 'late' ? 'The server didn’t answer in time.' : undefined,
        });
        return;
      }
    }
    switchBackend(c);
  };

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
        // A console tab keeps its console: the notebook gets a tab (#729).
        openNotebook(path);
        return true;
      }
      case 'new-duckdb-console':
        if (!backend) return false;
        // The app opens a console tab, with a new engine, and this page's
        // own content stays (#729).
        if (canOpenTabs()) {
          openTab({ console: 'duckdb', folder: clean(arg ?? folder) });
          return true;
        }
        // A notebook open goes the way another notebook's opening takes it.
        {
          const dir = clean(arg ?? folder);
          showConsole(startConsole(recentsKey(backend.config), undefined, dir), dir);
        }
        return true;
      case 'open-console': {
        // A recent console again (#735): a tab on the Mac, else in the page.
        const found = backend
          ? loadConsoles(recentsKey(backend.config)).find(r => r.id === arg)
          : undefined;
        if (!backend || !found) return false;
        if (canOpenTabs()) {
          openTab({ console: 'duckdb', folder: found.folder, session: found.id });
          return true;
        }
        // Already the one shown: it keeps its engine and scrollback.
        if (duck?.id === found.id && !openPath && duckFolder !== undefined) return true;
        showConsole(found, found.folder);
        return true;
      }
      case 'clear-recent-consoles':
        if (!backend) return false;
        clearConsoles(recentsKey(backend.config));
        return true;
      case 'rename':
        // The shown console's name; a notebook's is below.
        if (backend && duck && !openPath && duckFolder !== undefined) {
          const name = arg?.trim();
          if (!name) return false;
          renameConsole(recentsKey(backend.config), duck.id, name, duckFolder);
          setDuck({ ...duck, name });
          return true;
        }
        break;
      case 'close':
        // The tab's console stays until the tab closes.
        if (consoleTab) return false;
        if (!openPath && duckFolder !== undefined) {
          setDuckFolder(undefined);
          return true;
        }
        // Without saving: the app closes a notebook it moved to the Trash.
        if (!openPath) return false;
        c?.discard();
        setOpenPath(undefined);
        return true;
      case 'new-notebook':
        if (!backend) return false;
        // A failure shows the page's notice (#195) and returns false.
        return newNotebook(clean(arg ?? ''));
      case 'open-examples':
        return openExamples(clean(arg ?? ''));
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
      case 'go-to-cell': {
        // A heading in the app's Outline (#212): the cell's index.
        const index = Number(arg);
        if (!c || arg === undefined || arg === '' || !Number.isInteger(index)) return false;
        return c.goToCell(index);
      }
      case 'refresh-kernels':
        // The app came to the front (#350): kernelspecs may have changed.
        if (!backend) return false;
        return backend.services.kernelspecs.refreshSpecs().then(
          () => true,
          () => false,
        );
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
        followFolder(move.from, move.to);
        if (move.to === null) forgetRecent(key, move.from);
        else {
          moveRecent(key, move.from, move.to);
          // Kept device permissions follow too (#383).
          reportMoved(move.from, move.to);
          // The app opens the moved notebook next, in a later task: move
          // the open path now, so no render between the two sees the
          // run's sheet on another path and closes it. A run keeps going.
          const { from, to } = move;
          setOpenPath(p => (p && within(p, from) ? to + p.slice(from.length) : p));
          followRun(from, to);
        }
        return true;
      }
      case 'show-shortcuts':
        openShortcuts();
        return true;
      case 'show-settings':
        openSettings();
        return true;
      case 'command-palette':
        if (!otherSheetShown.current) setPaletteOpen(true);
        return true;
      case 'toggle-variables':
        setVariablesOpen(o => !o);
        return true;
      case 'toggle-journal':
        if (!c) return false;
        c.toggleJournal();
        return true;
      case 'toggle-type-errors':
        setTypeErrorsEnabled(!typeErrorsEnabled());
        return true;
      case 'go-to-definition':
        return c ? c.goToDefinition() : false;
      case 'rename-symbol':
        // With a new name when the palette asked for it, else the cursor's input.
        return c ? c.renameSymbol(arg) : false;
      case 'toggle-live-markdown':
        setLiveMarkdownEnabled(!liveMarkdownEnabled());
        return true;
      case 'watch-memory':
        if (arg !== 'on' && arg !== 'off') return false;
        setWatchMemory(arg === 'on');
        return true;
      case 'inspect-variables':
        if (arg !== 'on' && arg !== 'off') return false;
        setAppVariables(arg === 'on');
        return true;
      case 'toggle-variable': {
        const path = variablePath(arg);
        const vars = appVariablesRef.current;
        const node =
          path && vars.state.kind === 'ready' ? nodeAt(vars.state.variables, path) : undefined;
        if (!node) return false;
        await vars.toggle(node);
        return true;
      }
      case 'connect':
        openConnect();
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
      case 'publish':
        if (!publishAvailable(backend)) return false;
        setPublishFor({ path: c.path, name: c.name });
        return true;
      case 'export':
        if (!publishAvailable(backend) || !EXPORT_FORMATS.includes(arg as ExportFormat)) {
          return false;
        }
        await c.exportAs(arg as ExportFormat);
        return true;
      case 'run-with-params':
        if (!runAvailable(backend)) return false;
        setRunFor({
          path: c.path,
          name: c.name,
          params: lastParams.current.get(c.path) ?? c.recordedParams(),
        });
        return true;
      case 'notebook-access':
        if (!hostGrantsAvailable(backend)) return false;
        setAccessFor({ path: c.path, name: c.name, wants: c.hostWants() });
        return true;
      case 'run':
        await c.run();
        return true;
      case 'run-all':
        await c.runAll();
        return true;
      case 'clear-outputs':
        c.clearOutputs();
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
        call: (id, arg) => {
          // `test-crash-report`: the app's debug menu checks that reports arrive (#318, #319).
          if (id === 'test-crash-report') return sendTestReport();
          // `add-examples`: the iPhone and iPad add the examples to their
          // own folder on first launch (#463). The folder's path, or null.
          if (id === 'add-examples') {
            const b = backendRef.current;
            // Only the app's own server: not a remote the page connected to.
            if (!b || !isAppServer(b.config)) {
              return Promise.reject(new Error('Not connected to the app’s server.'));
            }
            const { contents, kernelspecs } = b.services;
            return import('./lib/examples').then(({ addExamples }) =>
              addExamples(contents, clean(arg ?? ''), kernelspecs.specs),
            );
          }
          return agentCall(id, arg);
        },
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
  // The kernel list follows kernelspecs installed or removed while the
  // page is open (#350): the manager's poll, a return to the page, or the
  // app's `refresh-kernels`.
  const specs = backend?.services.kernelspecs.specs ?? undefined;
  useSignals(backend?.services.sessions.runningChanged, backend?.services.kernelspecs.specsChanged);
  useEffect(
    () => (backend ? refreshKernelsOnReturn(backend.services.kernelspecs) : undefined),
    [backend],
  );
  const sessions = [...(backend?.services.sessions.running() ?? [])];
  // Each kernel's memory for the app's Running list (#241), as the page's
  // sidebar asks for it: not from a backend whose kernels all run in the page.
  const memory = useKernelMemory(
    backend?.config.kind === 'ganymede' && backend.config.kernels !== 'page'
      ? backend.services.serverSettings
      : undefined,
    sessions.flatMap(s => (s.kernel ? [s.kernel.id] : [])),
    native && watchMemory,
  );
  const running = runningSessions(sessions, specs, memory);
  const runningKey = JSON.stringify(running);
  const shown = !!openPath && controller?.path === openPath ? controller : undefined;
  const shownPath = shown?.path;
  const wantsKey = JSON.stringify(shown?.hostWants() ?? []);
  const accessPath = useRef<string | undefined>(undefined);
  useEffect(() => {
    const wants = JSON.parse(wantsKey) as string[];
    const none = (m: string[]) => (m.length ? [] : m);
    if (!shownPath || !backend || !hostGrantsAvailable(backend) || wants.length === 0) {
      setAccessMissing(none);
      return;
    }
    // Another notebook: drop the last one's list until this one's loads.
    // A recheck of the same notebook keeps it, so the button doesn't flicker.
    if (accessPath.current !== shownPath) setAccessMissing(none);
    accessPath.current = shownPath;
    let cancelled = false;
    loadHostGrants(backend, shownPath).then(
      grants => !cancelled && setAccessMissing(missingWants(wants, grants)),
      () => !cancelled && setAccessMissing(none),
    );
    return () => {
      cancelled = true;
    };
  }, [shownPath, backend, wantsKey, accessChecked]);
  const accessKey = JSON.stringify(accessMissing);
  const showVariables = variablesOpen && !!shown;
  // The app's inspector's Variables view (#249), for the notebook shown.
  const inspected = useVariables(shown?.kernel, shown?.status, appVariables);
  const appVariablesRef = useRef(inspected);
  appVariablesRef.current = inspected;
  const variablesKey = appVariables
    ? JSON.stringify(pageVariables(inspected.state, inspected.expanded))
    : 'null';
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
  // The recent consoles (#735): for the app's File > Open Recent Console and the palette.
  const consoles = listedConsoles(useConsoles(backend));
  const consolesKeyed = JSON.stringify(
    consoles.map(c => ({ id: c.id, name: c.name, folder: c.folder })),
  );
  const consoleShown = !!backend && !openPath && duckFolder !== undefined && !!duck;
  const consoleKeyed = JSON.stringify(consoleShown && duck ? duck : null);
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
      kernelVersionLine: shown?.kernelVersionLine ?? null,
      kernelMissing: !!shown?.missingKernel,
      trusted: shown?.trusted ?? true,
      hostGrants: hostGrantsAvailable(backend),
      publish: publishAvailable(backend),
      runParams: runAvailable(backend),
      accessWanted: JSON.parse(accessKey) as string[],
      cellType: shown?.cellType ?? null,
      journal: shown?.journal ?? false,
      kernels: Object.values(specs?.kernelspecs ?? {}).flatMap(k =>
        k ? [{ name: k.name, displayName: k.display_name, device: offersDevice(k) }] : [],
      ),
      backend: backend ? { label: backend.label, detail: backend.detail } : null,
      running: JSON.parse(runningKey) as RunningSession[],
      recents: JSON.parse(recentsKeyed) as string[],
      console: JSON.parse(consoleKeyed) as PageState['console'],
      consoles: native ? (JSON.parse(consolesKeyed) as PageState['consoles']) : [],
      search: JSON.parse(searchKey) as PageState['search'],
      outline: shown?.outline ?? [],
      variables: JSON.parse(variablesKey) as PageState['variables'],
    });
  }, [
    openPath,
    dirty,
    shown,
    specs,
    backend,
    runningKey,
    recentsKeyed,
    consoleKeyed,
    consolesKeyed,
    native,
    searchKey,
    variablesKey,
    accessKey,
  ]);

  // ⌘S / Ctrl+S saves, as in any document app; ⇧⌘P opens the command
  // palette (#211).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (matches(e, 'save')) {
        e.preventDefault();
        void controller?.save();
      } else if (matches(e, 'command-palette')) {
        e.preventDefault();
        // Not over another sheet: its Esc would close it, not the palette.
        if (!otherSheetShown.current) setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  // Esc on a sheet opened from the sidebar closes the sheet, not the sidebar.
  // Notebook Access or Publish.
  const notebookSheetOpen = !!accessFor || !!publishFor || !!runFor;
  const sheetShown = sheetOpen || shortcutsOpen || settingsOpen || notebookSheetOpen || paletteOpen;
  otherSheetShown.current = sheetOpen || shortcutsOpen || settingsOpen || notebookSheetOpen;
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
    window.addEventListener(SHOW_SHORTCUTS_EVENT, openShortcuts);
    return () => window.removeEventListener(SHOW_SHORTCUTS_EVENT, openShortcuts);
  }, [openShortcuts]);

  // From the sidebar, and later the Apple apps' Settings menu (#166).
  useEffect(() => {
    window.addEventListener(SHOW_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(SHOW_SETTINGS_EVENT, openSettings);
  }, [openSettings]);

  return (
    <>
      <div
        className={`window ${sidebarOpen ? '' : 'sidebar-collapsed'} ${native ? 'chrome-native' : ''}`}
        data-scheme={scheme}
      >
        {!native && (
          <Sidebar
            backend={backend}
            visible={sidebarOpen}
            connecting={connecting}
            openPath={openPath}
            root={sidebarRoot}
            onOpen={path => {
              openNotebook(path);
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
            outline={shown?.outline}
            onOutline={item => {
              shown?.goToCell(item.cell);
              if (sidebarFloats) setSidebarOpen(false);
            }}
            onClose={sidebarFloats ? () => setSidebarOpen(false) : undefined}
            onConnect={openConnect}
            onSettings={openSettings}
            actions={
              backend &&
              fileActions({
                contents: backend.services.contents,
                sessions: backend.services.sessions,
                openPath,
                controller,
                setOpenPath,
                onMoved: followFolder,
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
              onShowShortcuts={openShortcuts}
              onShowPalette={() => setPaletteOpen(true)}
              onToggleJournal={() => void runCommand.current('toggle-journal')}
              onToggleVariables={() => setVariablesOpen(o => !o)}
              variablesOpen={variablesOpen}
              specs={specs}
              accessMissing={accessMissing}
              onNotebookAccess={() => void runCommand.current('notebook-access')}
              onPublish={
                publishAvailable(backend) ? () => void runCommand.current('publish') : undefined
              }
              onRunWithParams={
                runAvailable(backend) ? () => void runCommand.current('run-with-params') : undefined
              }
              onExport={
                publishAvailable(backend)
                  ? format => void runCommand.current('export', format)
                  : undefined
              }
            />
          )}
          <div
            className={`content${drop.active ? ' drop-active' : ''}${showVariables ? ' with-inspector' : ''}`}
            {...drop.handlers}
          >
            {backend && openPath && dataKind(openPath) ? (
              // CSV, TSV, JSON and Parquet files show their data (#671).
              <DataPane
                key={`${backend.config.kind}:${openPath}`}
                backend={backend}
                path={openPath}
                onOpenAsText={editsFiles ? () => openFile(openPath) : undefined}
                onOpenNotebook={setOpenPath}
              />
            ) : backend && duckFolder !== undefined && duck ? (
              <DuckdbConsole
                key={`${backend.config.kind}:duck:${duckId}`}
                backend={backend}
                folder={duckFolder}
                id={duck.id}
                name={duck.name}
                onRename={name => void runCommand.current('rename', name)}
                onOpenConsole={id => void runCommand.current('open-console', id)}
                onOpenNotebook={openNotebook}
              />
            ) : backend && openPath ? (
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
                onOpenExamples={() => void openExamples(folder)}
                onConnect={openConnect}
                native={native}
                onTry={() => {
                  // As the sheet does for another backend: a launch file or
                  // console belongs to the first one.
                  pendingOpen.current = undefined;
                  pendingConsole.current = undefined;
                  pendingStart.current = { kind: 'try' };
                  setConfig({ kind: 'browser' });
                }}
                onOpenFile={file => {
                  pendingOpen.current = undefined;
                  pendingConsole.current = undefined;
                  pendingStart.current = { kind: 'open', file };
                  setConfig({ kind: 'browser' });
                }}
                folder={folder}
                onShowFolder={native || sidebarOpen ? undefined : () => setSidebarOpen(true)}
                onOpenSample={
                  backend &&
                  (async () => {
                    const { contents, kernelspecs } = backend.services;
                    const path = await copySample(contents, folder, kernelspecs.specs);
                    // Not if the backend changed while the copy ran.
                    if (backendRef.current === backend) openNotebook(path);
                  })
                }
              />
            )}
            {showVariables && (
              <VariablesPanel
                kernel={shown?.kernel}
                status={shown?.status}
                onClose={() => setVariablesOpen(false)}
              />
            )}
            {
              // Where browser work is kept, before the first edit (#815): for
              // a notebook, once its pane's controller is in (a data file or
              // the console has none), and not in the Apple apps, which keep
              // notebooks on their server.
              !native &&
                backend?.config.kind === 'browser' &&
                openPath &&
                controller?.path === openPath && (
                  <StorageNotice key={openPath} onDownload={() => controller.download()} />
                )
            }
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
          // Without a backend, Cancel goes back to the start screen. The
          // Apple apps never show it (they always have a config), so a
          // failed connection there keeps the sheet.
          canCancel={!!backend || !native}
          saving={savingForSwitch}
          unsaved={blockedSwitch?.controller.name}
          unsavedWhy={blockedSwitch?.why}
          onCancel={() => {
            switchTry.current++;
            setSavingForSwitch(false);
            setBlockedSwitch(undefined);
            setSheetOpen(false);
          }}
          onConnect={c => void connectFromSheet(c)}
          onDownloadCopy={() => blockedSwitch?.controller.download()}
          onSwitchAnyway={() => {
            if (!blockedSwitch) return;
            const { config: next, controller: c } = blockedSwitch;
            setBlockedSwitch(undefined);
            // Stops its saves, so the teardown lets the edits go. Any of
            // the pane's controllers will do: the pane rebuilds it on each
            // change of state, and they share what `discard` sets.
            c.discard();
            switchBackend(next);
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
            consoles: consoles.filter(c => !(consoleShown && c.id === duck?.id)),
            journal: shown?.journal ?? false,
            trusted: shown?.trusted ?? true,
            hostGrants: hostGrantsAvailable(backend),
            publish: publishAvailable(backend),
            runParams: runAvailable(backend),
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
      {accessFor && backend && (
        <HostAccessSheet
          key={accessFor.path}
          name={accessFor.name}
          wants={accessFor.wants}
          load={() => loadHostGrants(backend, accessFor.path)}
          save={grant => saveHostGrant(backend, accessFor.path, grant)}
          onClose={closeAccess}
        />
      )}
      {publishFor && (
        <PublishSheet
          key={publishFor.path}
          name={publishFor.name}
          publish={async opts => {
            // The notebook it was opened for, not one opened since.
            const c = controllerRef.current;
            if (c?.path !== publishFor.path) {
              throw new Error(`${publishFor.name} isn’t open any more.`);
            }
            await c.publish(opts);
          }}
          onClose={closePublish}
        />
      )}
      {runFor && backend && (
        <RunSheet
          name={runFor.name}
          initialParams={runFor.params}
          run={(params, opts) => {
            lastParams.current.set(runFor.path, JSON.stringify(params, null, 2));
            return runWithParams(
              backend.services.contents.serverSettings,
              runFor.path,
              params,
              opts,
            );
          }}
          onClose={closeRun}
        />
      )}
    </>
  );
}
