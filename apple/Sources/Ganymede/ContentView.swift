import CoreSpotlight
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @Environment(AppModel.self) private var model
    #if os(macOS)
    /// The notebook or folder the active page tab shows, following the page; nil
    /// for a window opened on nothing until its page opens a notebook.
    @Binding var target: WindowTarget?
    /// Window-owned tab store holding every tab (`.page`, `.terminal`,
    /// `.editor`) uniformly with no Tab 0 special-casing (#904).
    @State private var tabController: WorkspaceTabController
    @Environment(\.openWindow) private var openWindow
    /// This window, for the Finder's open requests (#228).
    @State private var windowID = UUID()
    /// File › New Tab or New Window, when this window is the one they
    /// opened (#247): its folder, and whether it stands alone.
    @State private var request: WorkspaceTabs.Request?
    /// Live session(s) handed off when detaching a tab to a new window or
    /// opening a standalone terminal window (#905).
    @State private var handoff: WorkspaceTabHandoff.PendingWindow?
    @State private var didPositionHandoff = false
    @State private var didRestoreTabs = false
    /// The bottom panel's terminals (#248), and whether it shows and how
    /// tall it is, kept with the window across launches.
    @State private var panel = PanelController()
    /// Ordered tabs, active index, and per-tab sidebar roots kept across launches (#905).
    @SceneStorage("window.tabs") private var savedTabs = ""
    /// Legacy single-tab target kept for backward-compatible fallback (#268).
    @SceneStorage("window.target") private var savedTarget = ""
    /// The sidebar's folder, kept likewise: it can differ from the
    /// notebook's own folder.
    @SceneStorage("window.sidebar") private var savedSidebar = ""
    @SceneStorage("panel.shown") private var panelShown = false
    @SceneStorage("panel.height") private var panelHeight = PanelController.defaultHeight
    /// Whether the sidebar shows, kept with the window across launches (#207).
    @SceneStorage("sidebar.shown") private var sidebarShown = true
    /// The right inspector (#249), and whether it shows, on which tab and
    /// how wide, kept with the window across launches.
    @State private var inspector = InspectorController()
    @SceneStorage("inspector.shown") private var inspectorShown = false
    @SceneStorage("inspector.tab") private var inspectorTab = InspectorTab.outline.rawValue
    @SceneStorage("inspector.width") private var inspectorWidth = InspectorController.defaultWidth
    /// The area filling the window, if any (#250). Not kept across
    /// launches: a window comes back with its usual layout.
    @State private var layout = WindowLayout()
    /// Whether the bottom status bar shows, kept across launches (#882).
    @AppStorage(StatusBarContent.shownKey) private var statusBarShown = true
    /// A newer release, once a check found it (#411).
    private let updater = AppUpdater.shared

    init(target: Binding<WindowTarget?>) {
        _target = target
        // Read on every init, but `@State` keeps only the first: the one
        // made as this window opens.
        let pendingHandoff = target.wrappedValue == nil ? WorkspaceTabHandoff.shared.pending : nil
        if let pendingHandoff {
            _tabController = State(initialValue: WorkspaceTabController(
                sessions: pendingHandoff.sessions,
                selectedID: pendingHandoff.selectedID,
                pageDocumentFactory: { PageDocument() },
                editorDocumentFactory: { EditorDocument($0) }
            ))
            _handoff = State(initialValue: pendingHandoff)
            _request = State(initialValue: nil)
            return
        }
        let request = target.wrappedValue == nil ? WorkspaceTabs.pending : nil
        let loaded = WindowTarget.opening(target.wrappedValue, requested: request?.target, root: AppModel.shared.root)
        // A restored window's machine is checked once, here, before its
        // first load (#883): the page is loaded with the place the check
        // finds, as this Mac's own server's window or a machine's, and is
        // not made again by a check that answers after it. SwiftUI makes a
        // window's `ContentView` more than once and keeps only the first;
        // `AppModel.verifyThisMacNow` sees that, and checks for the first of
        // them in a turn.
        let model = AppModel.shared
        if loaded.place.isMachine { model.verifyThisMacNow() }
        let place = model.place(for: loaded)
        let initialPage = PageTabState(
            target: target.wrappedValue,
            loaded: loaded,
            loadedPlace: place,
            pagePlace: WorkspacePagePlace(place: place, root: model.thisMacRoot(for: place)?.path),
            sidebarRoot: loaded.folder,
            document: PageDocument()
        )
        _tabController = State(initialValue: WorkspaceTabController(
            initialPage: initialPage,
            pageDocumentFactory: { PageDocument() },
            editorDocumentFactory: { EditorDocument($0) }
        ))
        _handoff = State(initialValue: nil)
        _request = State(initialValue: request)
    }
    #endif
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @State private var picking = false
    /// The folder picker for a link, from the Settings sheet or from a
    /// terminal or editor cover, which the window's picker can't show over.
    @State private var settingsPicking = false
    @State private var coverPicking = false
    /// What the folder picker is for (#640).
    @State private var pickPurpose = FolderPick.openFolder
    /// `ganymede://open` links (#640).
    @State private var links = LinkOpener(later: ContentView.afterPresentationEnds)
    /// Saves unsaved edits before switching places (#808).
    @State private var placeSwitchGuard = SwitchSaveCoordinator()
    /// This window, in `OpenTextFiles`.
    @State private var windowID = UUID()
    @State private var settings = false
    /// The place this scene shows (#701): this device, or a connected
    /// machine, whose files and notebooks come through the app's mount. Both
    /// have the app's own sidebar and toolbar (#758); `switchPlace` changes it.
    @State private var place: Place = .thisDevice
    /// What Settings shows over its first screen: the Agent or Keyboard
    /// Shortcuts, when the page asked for them (#332).
    @State private var settingsPath: [SettingsTab] = []
    /// A terminal shown full screen, where the app has one scene.
    @State private var terminal: TerminalRequest?
    /// A text file being edited full screen, where the app has one scene.
    @State private var editing: EditorRequest?
    /// What the page shows, for the native toolbar and menus (#205).
    @State private var pageModel = PageModel()
    /// The iPad's sidebar and notebook columns (#208).
    @State private var columns = SidebarColumns.automatic
    /// The iPhone's page, kept while the folder list shows (#209). A store
    /// is for one place: `switchPlace` makes another.
    @State private var phonePage = WebViewStore(place: .thisDevice, sharesName: true, usesDevice: false)
    /// The iPhone's screens over the folder list: the notebook, or none.
    @State private var phonePath: [PhoneScreen] = []
    /// The iPad's bottom panel (#251): terminals on remotes. The iPhone
    /// has none; its sidebar lists this one's (empty) terminals.
    @State private var panel = PanelController()
    @SceneStorage("panel.height") private var panelHeight = PanelController.defaultHeight
    /// Text files over the notebook in the iPad's detail area (#251).
    @State private var openFiles = IPadOpenFiles()
    /// The iPad's detail area fills the screen: no sidebar or panel.
    @State private var mainFills = false
    /// The bottom panel fills the detail area, the notebook hidden.
    @State private var panelFills = false
    /// Whether the iPad's window is taller than wide.
    @State private var portrait = false
    #if os(iOS)
    /// Compact in Split View, Slide Over or a narrow window, where the
    /// split view is one stack (#762).
    @Environment(\.horizontalSizeClass) private var sizeClass
    #endif
    /// The ⋯ menu's Rename… is asking for a name (#209).
    @State private var renaming = false
    @State private var newName = ""
    /// The iPhone's Outline sheet (#915).
    @State private var phoneOutlineShown = false
    #endif

    #if os(macOS)
    /// The window: split view, toolbar, open requests, tabs.
    private var macWindow: some View {
        // The app draws the sidebar, toolbar and menus; the page shows the
        // notebook (#206, #207).
        NavigationSplitView(columnVisibility: Binding(
            // An area filling the window folds the sidebar (#250);
            // showing it again brings the layout back.
            get: { sidebarShown && layout.filled == nil ? .all : .detailOnly },
            set: { visibility in
                if layout.filled != nil {
                    guard visibility != .detailOnly else { return }
                    layout.restore()
                    sidebarShown = true
                } else {
                    sidebarShown = visibility != .detailOnly
                }
            }
        )) {
            sidebar
                .navigationSplitViewColumnWidth(min: 180, ideal: 240, max: 400)
        } detail: {
            VStack(spacing: 0) {
                WorkspaceTabStrip(
                    tabs: tabController.descriptors,
                    selectedID: tabController.selectedID,
                    newMenu: tabNewMenuItems,
                    controller: tabController,
                    onSelect: { tabController.select($0) },
                    onClose: { tabController.closeTab($0, in: tabController.hostWindow) },
                    onCloseOthers: { tabController.closeOthers(keeping: $0, in: tabController.hostWindow) },
                    onMoveToNewWindow: { sessionID in
                        WorkspaceTabHandoff.shared.detachToNewWindow(
                            sessionID: sessionID,
                            from: tabController
                        )
                    }
                )
                ZStack {
                    workspace
                    if tabController.isShowingOverview {
                        TabOverviewOverlay(
                            controller: tabController,
                            newMenu: tabNewMenuItems,
                            dismiss: { tabController.isShowingOverview = false }
                        )
                    }
                }
            }
        }
        .toolbar {
            WorkspaceToolbar(mode: activeToolbarMode, update: updater.available)
        }
        // The status line (#812). The system draws it and it isn't
        // clickable: the kernel button's popover opens the details. A
        // notebook's window has none: its save part is beside the chip
        // (#867), and `.toolbar(removing: .title)` takes the system title
        // and subtitle away. A machine's window with no notebook keeps
        // "on <machine>".
        .navigationSubtitle(activeSubtitle)
        .frame(minWidth: 720, minHeight: 480)
        // A console's tab is titled with its name (#735), a notebook with
        // its title, or its file's (#867).
        .navigationTitle(activeWindowTitle)
        .modifier(WindowSceneValues(
            place: activePlace,
            folder: activeSidebarRoot,
            panel: activeIsTerminal ? nil : panel,
            enabled: true
        ))
        // A notebook's toolbar item draws the title (#867), so the system's
        // title and subtitle go; its tab keeps the display title, from
        // `.navigationTitle` above. One modifier with an optional kind, not
        // an `if`: two branches would be two views, and switching between
        // them would rebuild the window's web view when a notebook opens or
        // closes in place.
        .toolbar(removing: showsNotebook ? .title : nil)
        // The toolbar's band takes the page's own window colour on a
        // notebook window (#892), so the toolbar and the page read as one
        // surface; a console's, a folder's and a machine's window keep the
        // system's toolbar.
        .modifier(NotebookSurface(notebook: showsNotebook))
        .modifier(KeychainAlert(model: model))
        // Notebooks opened from the Finder (#228): the first window to see
        // them takes them. Each opens in a new tab (or brings forward
        // the one showing it), except that the window the app opened on
        // nothing at launch shows the first itself. Later, so the change
        // to `pending` is not made while views update.
        .onChange(of: model.openRequests.pending, initial: true) { _, pending in
            guard !pending.isEmpty, activePlace.isThisDevice, activePage != nil else { return }
            DispatchQueue.main.async(execute: takeOpenRequests)
        }
        .onAppear {
            if let handoff {
                WorkspaceTabHandoff.shared.take(handoff)
                didRestoreTabs = true
                if let activePage {
                    target = activePage.target
                }
            } else if let request {
                WorkspaceTabs.take(request)
                didRestoreTabs = true
                if let initialTab = tabController.sessions.first?.pageTab, target == nil {
                    target = request.target
                    initialTab.target = request.target
                }
            } else if !didRestoreTabs {
                didRestoreTabs = true
                if let restored = RestorableTabSet.resolve(
                    savedTabs: savedTabs,
                    legacyTarget: savedTarget,
                    legacySidebar: savedSidebar
                ), (!savedTabs.isEmpty || target == nil) {
                    tabController.restore(
                        from: restored,
                        placeResolver: { model.place(for: $0) },
                        machineNameResolver: { $0.machineID.flatMap(model.machineName(_:)) },
                        thisMacRootResolver: { model.thisMacRoot(for: $0) },
                        fallbackRoot: model.root
                    )
                    target = activePage?.target
                } else if let initialTab = tabController.sessions.first?.pageTab,
                          WindowTarget(saved: savedTarget) == target {
                    // Legacy restored window whose value already matched savedTarget.
                    restoreSidebar(in: initialTab)
                }
            }
            savedTabs = restorableSnapshot
            savedSidebar = FolderEntry.storageKey(activeSidebarRoot)
            savedTarget = WindowTarget.saved(target)
            noteOpenRequests()
            model.openRequests.openWindow = { [openWindow] nextTarget in
                WorkspaceTabs.openTarget(nextTarget) { openWindow(value: $0) }
            }
        }
        .onChange(of: restorableSnapshot) { _, snapshot in
            savedTabs = snapshot
        }
        .onChange(of: target) { _, newTarget in
            noteOpenRequests()
            // Restored after the view was made, before the page said
            // anything: show it, not what the page was loaded for.
            if let newTarget,
               handoff == nil,
               savedTabs.isEmpty,
               tabController.sessions.count == 1,
               let onlyPage = activePage,
               !onlyPage.pageReported,
               newTarget != onlyPage.loaded,
               newTarget != onlyPage.target {
                let restored = WindowTarget(saved: savedTarget) == newTarget
                show(newTarget, in: onlyPage)
                if restored { restoreSidebar(in: onlyPage) }
            }
            savedTarget = WindowTarget.saved(newTarget)
            if let window = tabController.hostWindow { noteWindow(window) }
        }
        .onChange(of: tabController.selectedID) { _, _ in
            if let activePage {
                if target != activePage.target { target = activePage.target }
                savedTarget = WindowTarget.saved(activePage.target)
                savedSidebar = FolderEntry.storageKey(activePage.sidebarRoot)
            }
            if activeIsTerminal && layout.filled != nil {
                layout.restore()
            }
            noteOpenRequests()
            syncVariablesInspection()
            if let window = tabController.hostWindow {
                noteWindow(window)
                WorkspaceTabs.markBusy(window, activePage?.page.state.isBusy ?? false)
                tabController.syncWindowChrome(window)
            }
        }
        .onChange(of: tabController.sessions.count) { _, _ in
            noteOpenRequests()
            if let window = tabController.hostWindow { noteWindow(window) }
        }
        .onChange(of: activePage?.target) { _, newPageTarget in
            if let activePage, target != activePage.target {
                target = newPageTarget
            }
            if let activePage {
                savedTarget = WindowTarget.saved(activePage.target)
            }
            noteOpenRequests()
            if let window = tabController.hostWindow { noteWindow(window) }
        }
        .onChange(of: activePage?.sidebarRoot) { _, newRoot in
            guard let newRoot else { return }
            savedSidebar = FolderEntry.storageKey(newRoot)
            if let window = tabController.hostWindow { noteWindow(window) }
        }
        // A notebook that opens or closes in this window changes whether the
        // window is one surface with its toolbar (#892).
        .onChange(of: showsNotebook) { _, _ in
            syncVariablesInspection()
            if let window = tabController.hostWindow { noteSurface(window) }
        }
        .onChange(of: activePage?.document.dirty ?? false) { _, _ in
            tabController.syncWindowChrome()
        }
        .onChange(of: activePage?.document.file) { _, _ in
            tabController.syncWindowChrome()
        }
        .onChange(of: activeEditor?.document.dirty ?? false) { _, _ in
            tabController.syncWindowChrome()
        }
        // Back from Terminal, where a kernelspec may have been installed
        // or removed: the page asks the server for its kernels again
        // (#350). A page still loading fetches them anyway.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            tabController.refreshKernels()
        }
        // Brought forward after launch: restored windows can come back in
        // front of a notebook opened from the Finder (#268).
        .onChange(of: model.openRequests.front, initial: true) { _, front in
            guard let front, front == target, let window = tabController.hostWindow else { return }
            bringForward(window)
        }
        .onDisappear {
            model.openRequests.unregister(windowID)
            if let window = tabController.hostWindow {
                tabController.detachAll(from: window, retireResources: true)
                WorkspaceTabs.unregisterController(tabController, for: window)
            }
        }
        // Notebook windows are tabs too (#247, #905).
        .background(WindowReader { window in
            tabController.attach(to: window)
            WorkspaceTabs.registerController(tabController, for: window)
            // So a terminal tab can move into this panel (#248).
            panel.attach(to: window)
            WorkspaceTabs.join(window, alone: request?.alone ?? false)
            if !didPositionHandoff, let dropPoint = handoff?.dropPoint {
                didPositionHandoff = true
                let screen = NSScreen.screens.first(where: { $0.frame.contains(dropPoint) })
                    ?? window.screen
                    ?? NSScreen.main
                if let visible = screen?.visibleFrame {
                    let origin = TabDragGeometry.detachedWindowOrigin(
                        dropPoint: dropPoint,
                        windowSize: window.frame.size,
                        visibleFrame: visible
                    )
                    window.setFrameOrigin(origin)
                }
            }
            noteWindow(window)
            // A page already running when the window arrives gets its dot.
            WorkspaceTabs.markBusy(window, activePage?.page.state.isBusy ?? false)
            // A window opened as launch ended may get its NSWindow only
            // after `front` was published.
            if let front = model.openRequests.front, front == target {
                DispatchQueue.main.async { bringForward(window) }
            }
        })
        .focusedSceneValue(\.pageDocument, activePage?.document)
        .focusedSceneValue(\.pageModel, activePage?.page)
        .focusedSceneValue(\.editorDocument, activeEditor?.document)
        .focusedSceneValue(\.workspaceTabController, tabController)
    }

    /// `macWindow` with the bottom panel and the keyboard kept in step.
    private var macPanelSync: some View {
        macWindow
        .onAppear {
            panel.resize(to: panelHeight, available: .infinity)
            // Shells don't outlive the app: a panel that was showing comes
            // back with a new one, as ⌃` would start.
            if panelShown { panel.show(startingOn: activeWindowTerminal) }
        }
        .onChange(of: panel.isShown) { _, shown in
            panelShown = shown
            layout.noteChange(of: .panel, shown: shown)
        }
        .onChange(of: panel.height) { _, new in panelHeight = new }
        // The keyboard follows the fill: the notebook under a filled panel
        // or inspector is out of sight, so it mustn't keep the keys
        // (command mode would edit cells unseen). A panel terminal that
        // has them keeps them; restoring gives them back to the notebook.
        .onChange(of: layout.filled) { _, filled in
            guard let window = tabController.hostWindow else { return }
            switch filled {
            case .panel?:
                if !terminalHasKeyboard(in: window) { window.makeFirstResponder(nil) }
            case .inspector?:
                window.makeFirstResponder(nil)
            case .notebook?:
                break
            case nil:
                if window.firstResponder == nil || window.firstResponder === window {
                    returnKeyboardToPage(in: window)
                }
            }
        }
        // A dot on the tab while its kernel runs (#247).
        .onChange(of: activePage?.page.state.isBusy ?? false) { _, busy in
            if let window = tabController.hostWindow { WorkspaceTabs.markBusy(window, busy) }
        }
    }
    #endif

    var body: some View {
        #if os(macOS)
        // In three parts: as one expression the type checker gave up
        // (#356).
        macPanelSync
        .focusedSceneValue(\.inspectorController, activePage != nil ? inspector : nil)
        .modifier(InspectorAvailability(
            inspector: inspector, shows: showsNotebook, fillsWindow: layout.filled == .inspector
        ) { layout.restore() })
        .focusedSceneValue(\.windowFill, activeIsTerminal ? nil : WindowFill(filled: layout.filled) {
            // The area with the keyboard: a panel terminal, or the notebook.
            if layout.filled != nil {
                layout.restore()
            } else if panel.isShown, let window = tabController.hostWindow, terminalHasKeyboard(in: window) {
                layout.toggle(.panel)
            } else {
                layout.toggle(.notebook)
            }
        })
        .onAppear {
            inspector.isShown = inspectorShown
            inspector.tab = InspectorTab(rawValue: inspectorTab) ?? .outline
            inspector.resize(to: inspectorWidth, available: .infinity)
            syncVariablesInspection()
        }
        .onChange(of: inspector.isShown) { _, shown in
            inspectorShown = shown
            layout.noteChange(of: .inspector, shown: shown)
            syncVariablesInspection()
        }
        .onChange(of: inspector.tab) { _, new in
            inspectorTab = new.rawValue
            syncVariablesInspection()
        }
        .onChange(of: inspector.width) { _, new in inspectorWidth = new }
        // A page loaded again forgets it was asked.
        .onChange(of: activePage?.page.state.variables == nil) { _, _ in
            tabController.ensureVariablesInspectionOnReload(wantsVariables: wantsVariables)
        }
        #else
        Group {
            if isPhone {
                // The iPhone: the folder list, and the notebook pushed onto
                // it (#209). The page lives in `phonePage`, so it keeps
                // running while the list shows and the list can open
                // notebooks in it.
                NavigationStack(path: $phonePath) {
                    sidebar(opened: { phonePath = [.notebook] })
                    .toolbar {
                        ToolbarItemGroup(placement: .navigationBarLeading) { appButtons }
                    }
                    .overlay {
                        // The server didn't start: said here, not only on
                        // the notebook screen.
                        if model.url == nil, model.error != nil {
                            startProblem.background(Color(uiColor: .systemBackground))
                        }
                    }
                    // Keeps the page in the window while the list shows.
                    .background(ParkedPage(store: phonePage).frame(width: 1, height: 1))
                    .onAppear { phonePage.park() }
                    .navigationDestination(for: PhoneScreen.self) { _ in notebook }
                }
                // Another place is another page, and another list (#758).
                .id(place)
                .task { model.startIfNeeded() }
                // Each start too: a quick restart can bring the same URL
                // back without `url` being seen to go nil (#640).
                .task(id: "\(model.serverStart) \(page?.absoluteString ?? "") \(place.mountPath)") {
                    if let url = page {
                        phonePage.load(url, page: pageModel, onOpenFile: openEditor)
                    } else {
                        // Stopped, to restart (Open Folder, Try Again,
                        // remotes, resume): load the new server's page.
                        phonePage.forget()
                    }
                }
            } else if drawsNativeChrome {
                // The iPad draws the sidebar and toolbar; the page shows the
                // notebook (#208).
                GeometryReader { window in
                    NavigationSplitView(columnVisibility: Binding(
                        get: { columns.visibility }, set: { columns = SidebarColumns($0) })
                    ) {
                        sidebar(
                            opened: {
                                openFiles.showNotebook()
                                panelFills = false
                                // In portrait the sidebar covers the notebook:
                                // it gets out of the way once one is opened.
                                if portrait { columns = .hidden }
                            },
                            tabbed: true,
                            showTerminal: { id in
                                panel.selection = id
                                panel.isShown = true
                                mainFills = false
                                if portrait { columns = .hidden }
                            })
                    } detail: {
                        iPadWorkspace
                    }
                    .onAppear {
                        portrait = IPadLayout.shouldAutoHideSidebar(
                            width: window.size.width, height: window.size.height)
                        if portrait, !mainFills { columns = .hidden }
                    }
                    // Hide the sidebar in portrait or narrow Split View (< 600pt);
                    // back in wide landscape, restore it unless Fill Screen is on.
                    .onChange(of: window.size) { _, size in
                        let shouldHide = IPadLayout.shouldAutoHideSidebar(
                            width: size.width, height: size.height)
                        guard shouldHide != portrait else { return }
                        portrait = shouldHide
                        if shouldHide {
                            columns = .hidden
                        } else if !mainFills {
                            columns = .automatic
                        }
                    }
                }
                // Keep ⌘, opening Settings even when Settings sits in More (#914).
                .background {
                    Button("Settings") { settings = true }
                        .keyboardShortcut(",")
                        .buttonStyle(.plain)
                        .opacity(0)
                        .accessibilityHidden(true)
                        .frame(width: 0, height: 0)
                }
                // Every scene has the panel: a machine's terminals run on
                // the machine (#858), the rest on remotes.
                .focusedSceneValue(\.iPadPanel, IPadPanelToggle(shown: panelShown, toggle: togglePanel))
                .onAppear { panel.resize(to: panelHeight, available: .infinity) }
                .onChange(of: panel.height) { _, new in panelHeight = new }
                // However the last terminal closed, the next one opens
                // under the notebook, not filling the screen.
                .onChange(of: panel.terminals.isEmpty) { _, empty in
                    if empty { panelFills = false }
                }
            } else {
                NavigationStack { notebook }
            }
        }
        .focusedSceneValue(\.pageModel, pageModel)
        .focusedSceneValue(\.iPadPlace, place)
        .modifier(KeychainAlert(model: model))
        // A link's alert shows on the topmost thing presented: the window,
        // the Settings sheet, or a cover. Only one of them takes it.
        .modifier(LinkAlert(
            links: links, isEnabled: !settings && !coverShown, grant: startGrant, change: changeFolder
        ))
        .modifier(SwitchSaveAlert(coordinator: placeSwitchGuard, isEnabled: !settings && !coverShown))
        .background {
            Color.clear.modifier(
                SwitchSaveAlert(coordinator: model.kernelSwitchGuard, isEnabled: !settings && !coverShown)
            )
        }
        // Spotlight (#305): the page's recents are indexed, a save updates
        // its entry, and a result opens here.
        .onChange(of: pageModel.state.recents, initial: true) { _, recents in
            // nil until the page reports: syncing then would drop every
            // entry, to index them all again a moment later. A machine's
            // notebooks have no files here: not in Spotlight (#758).
            guard recents != nil, place.indexesLocally else { return }
            SpotlightSettings.shared.sync(recents: recentFiles)
        }
        .onChange(of: pageModel.state.dirty) { was, now in
            guard was, !now, place.indexesLocally, let path = pageModel.state.path else { return }
            // The page's paths are from its own server's root (#883).
            SpotlightSettings.shared.saved(pageRoot.file(path))
        }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            _ = SpotlightSettings.shared.open(activity, with: openFromSpotlight)
        }
        // A Shortcut a cell ran, calling back (ganymede-device#40), or a
        // link to open a notebook (#640).
        .onOpenURL { url in
            if LinkOpener.isShortcutsCallback(url) {
                KernelHost.shortcuts.handle(url)
            } else {
                // Nothing closes for a link: it may be from any web page,
                // and a shell, an SSH session or an edit would be lost.
                links.handle(url, root: model.serverRootFolder, served: model.servedRoot, openFiles: { OpenTextFiles.shared.all }, show: showNotebook)
                showThisDeviceForParkedLink()
            }
        }
        // A notebook waiting for another folder's server (#640).
        // The page ready, checked against the folder its server was
        // started on. Only on the transition: a page from before the
        // restart isn't the new folder's.
        .onChange(of: pageModel.ready) { _, ready in
            // This device's page: a machine's is not the folder's server.
            if ready, place.isThisDevice { links.pageReady(served: model.servedRoot, show: showNotebook) }
        }
        // The page goes with its server, on every layout: commands and a
        // waiting notebook wait for the next page's state, not the old
        // page's.
        .onChange(of: model.startsRequested, initial: true) { _, start in
            pageModel.reset(forStart: start)
        }
        .onChange(of: openTextFiles, initial: true) { _, paths in
            OpenTextFiles.shared.set(paths, for: windowID)
        }
        .onDisappear { OpenTextFiles.shared.set([], for: windowID) }
        .onChange(of: model.serverRootFolder) { _, root in links.rootChanged(to: root) }
        .onChange(of: model.startFailures) {
            links.startFailed(on: model.failedRoot, reason: model.error)
        }
        // Opened again from the root, not where the last visit ended.
        .sheet(isPresented: $settings, onDismiss: { settingsPath = [] }) {
            NavigationStack(path: $settingsPath) {
                SettingsScreen(page: pageModel) { settings = false }
            }
            .environment(model)
            .modifier(LinkAlert(links: links, isEnabled: !coverShown, grant: startGrant, change: changeFolder))
            .modifier(SwitchSaveAlert(coordinator: placeSwitchGuard, isEnabled: !coverShown))
            .fileImporter(isPresented: $settingsPicking, allowedContentTypes: [.folder], onCompletion: linkFolderPicked)
        }
        .onReceive(NotificationCenter.default.publisher(for: .showAppSettings)) { note in
            guard note.object as? PageModel === pageModel else { return }
            switch note.userInfo?["tab"] as? SettingsTab {
            case .appearance: settingsPath = [.appearance]
            case .agent: settingsPath = [.agent]
            case .shortcuts: settingsPath = [.shortcuts]
            default: settingsPath = []
            }
            settings = true
        }
        .fullScreenCover(item: $terminal) { request in
            NavigationStack {
                TerminalWindow(target: request.target)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Close") { terminal = nil }
                        }
                    }
            }
            .environment(model)
            .modifier(LinkAlert(links: links, grant: startGrant, change: changeFolder))
            .modifier(SwitchSaveAlert(coordinator: placeSwitchGuard))
            .fileImporter(isPresented: $coverPicking, allowedContentTypes: [.folder], onCompletion: linkFolderPicked)
        }
        .fullScreenCover(item: $editing) { request in
            // A link closes nothing: an editor may have unsaved edits. Its
            // alert, and the folder picker a grant needs, are its own.
            NavigationStack {
                EditorWindow(request: request) { editing = nil }
            }
            .modifier(LinkAlert(links: links, isEnabled: terminal == nil, grant: startGrant, change: changeFolder))
            .modifier(SwitchSaveAlert(coordinator: placeSwitchGuard, isEnabled: terminal == nil))
            .fileImporter(isPresented: $coverPicking, allowedContentTypes: [.folder], onCompletion: linkFolderPicked)
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            switch pickPurpose {
            case .openFolder:
                if case .success(let folder) = result {
                    model.open(folder: folder)
                }
            case .grantForLink:
                linkFolderPicked(result)
            }
        }
        .onChange(of: phase) { _, phase in
            // Files with edits but no screen of their own (a save on the
            // way back to the notebook failed): iOS may end the scene.
            if phase == .background {
                openFiles.saveHidden()
                saveNotebookOnBackground()
            }
            if phase == .active {
                (pageModel.webView?.navigationDelegate as? WebViewCoordinator)?.reloadIfTerminated()
                Task { await model.resume() }
                SpotlightSettings.shared.syncIfStale()
            }
        }
        #endif
    }

    #if os(macOS)
    private var activePage: PageTabState? { tabController.activePage }
    private var activeEditor: EditorTabState? { tabController.activeEditor }
    private var activeTerminal: TerminalTabState? { tabController.activeTerminal }
    private var activeIsTerminal: Bool { activeTerminal != nil }
    private var restorableSnapshot: String { tabController.restorableTabSet.encoded() }

    private var activePlace: Place {
        if let activePage {
            return activePage.place(using: { model.place(for: $0) })
        }
        if let machine = activeEditor?.request.machine,
           let target = WindowTarget.machine(machine, path: "/", isFolder: true) {
            return model.place(for: target)
        }
        if case .server(let id, _) = activeTerminal?.target,
           let target = WindowTarget.machine(id.uuidString, path: "/", isFolder: true) {
            return model.place(for: target)
        }
        return .thisDevice
    }

    private var activeSidebarRoot: URL {
        activePage?.sidebarRoot
            ?? activeEditor?.sidebarRoot
            ?? activeTerminal?.sidebarRoot
            ?? model.root
    }

    private var wantsVariables: Bool {
        inspector.isShown && showsNotebook && inspector.tab == .variables
    }

    private func syncVariablesInspection() {
        tabController.syncVariablesInspection(wantsVariables: wantsVariables)
    }

    private var isBlankWindow: Bool {
        handoff == nil && tabController.sessions.count == 1 && activePage != nil && activePage?.target == nil
    }

    /// Only this device's windows take the Finder's open requests, and only
    /// single blank page windows count as blank (#740, #904).
    private func noteOpenRequests() {
        if activePlace.isThisDevice && activePage != nil {
            model.openRequests.register(windowID, blank: isBlankWindow)
        } else {
            model.openRequests.unregister(windowID)
        }
    }

    private func takeOpenRequests() {
        guard activePlace.isThisDevice, let activePage else { return }
        let (shown, others) = model.openRequests.take(blank: isBlankWindow)
        if let shown { show(shown, in: activePage) }
        for other in others {
            WorkspaceTabs.openOrFocusTab(other, preferredWindow: tabController.hostWindow) { openWindow(value: $0) }
        }
    }

    /// Shows `shown` in `pageTab`: the page loads it.
    private func show(_ shown: WindowTarget, in pageTab: PageTabState) {
        pageTab.show(
            shown,
            placeResolver: { model.place(for: $0) },
            thisMacRoot: { model.thisMacRoot(for: $0) }
        )
        if pageTab.id == tabController.selectedID {
            target = shown
        }
    }

    /// The sidebar's folder as this window last had it, if it was saved.
    /// Only a location of this window's own place.
    private func restoreSidebar(in pageTab: PageTabState) {
        let tabPlace = pageTab.place(using: { model.place(for: $0) })
        guard let saved = FolderEntry.location(storageKey: savedSidebar),
              FolderEntry.isLocation(saved, in: tabPlace)
        else { return }
        pageTab.sidebarRoot = saved
    }

    /// What a new terminal in this window runs on (#858), as File > New
    /// Terminal and the panel's + ask.
    private var activeWindowTerminal: TerminalTarget? {
        if let activePage {
            return activePage.windowTerminal(place: activePlace, remotes: model.remotes)
        }
        if let activeEditor {
            return WindowScope(place: activePlace, serverFolder: FolderEntry.serverPath(activeEditor.sidebarRoot))
                .terminalTarget(notebook: nil, remotes: model.remotes)
        }
        if let activeTerminal {
            return activeTerminal.target
        }
        return nil
    }

    /// A machine's name, for its window's title and subtitle.
    private var activeMachineName: String? {
        activePlace.machineID.flatMap(model.machineName(_:))
    }

    /// The notebook's status line (#812): where it is saved and runs, from
    /// the window's place and the kernel location setting, not the page's
    /// own words; nil with no notebook open.
    private var activeHeaderStatus: HeaderStatus? {
        activePage?.headerStatus(place: activePlace, machineName: activeMachineName, locations: model.kernelLocations)
    }

    /// This window's files: this Mac's disk, or the machine's through the
    /// app's mount. Nil for a machine until the server listens.
    private var fileSource: (any FileSource)? {
        guard let id = activePlace.machineID else { return LocalFileSource() }
        return model.serverURL.map { MachineFileSource(id: id, server: $0) }
    }

    private var sidebar: some View {
        Group {
            if let source = fileSource {
                NavigatorSidebar(
                    folder: activeSidebarRoot,
                    source: source,
                    place: activePlace,
                    page: activePage?.page,
                    panel: activeIsTerminal ? nil : panel,
                    // The column the sidebar's keys bring back (#879): the
                    // window folds it, or an area fills over it.
                    showSidebar: {
                        layout.restore()
                        sidebarShown = true
                    },
                    onOpenNotebook: openNotebookFromSidebar,
                    onNewNotebook: newNotebookFromSidebar
                ) { path in
                    openFile(path, in: activePlace)
                }
                // Tint the system's sidebar glass directly (#896) rather than
                // laying `.background(Color("SidebarTint").ignoresSafeArea())`
                // inside `contentView`: an unclipped SwiftUI background paints
                // over the rounded floating panel on macOS 26 and the top
                // `NSScrollPocket` on macOS 27. The lists hide their own
                // background so the tinted glass shows behind their rows.
                .background(SidebarGlassTint())
                // A restarted server has a new address and token, and switching
                // between machines resets machine-scoped navigator state.
                .id(activePlace.isMachine ? "\(activePlace.mountPath)|\(model.serverURL?.absoluteString ?? "")" : nil)
            } else {
                ProgressView()
            }
        }
    }

    private var tabNewMenuItems: TabNewMenuItems {
        let machines = model.places.filter { $0.place.isMachine }
        return TabNewMenuItems(
            machines: machines,
            onNewNotebook: {
                let nextTarget = WindowTarget.newTab(place: activePlace, folder: activeSidebarRoot, root: model.root)
                let nextPlace = model.place(for: nextTarget)
                let nextMachine = nextPlace.machineID.flatMap(model.machineName(_:))
                tabController.addPageTab(
                    target: nextTarget,
                    place: nextPlace,
                    machineName: nextMachine,
                    thisMacRoot: model.thisMacRoot(for: nextPlace)?.path,
                    reuseExisting: false
                )
            },
            onNewConsole: {
                let localFolder = activePlace.isThisDevice ? activeSidebarRoot : model.root
                let consoleTarget = WindowTarget.console(folder: localFolder, id: UUID())
                tabController.addPageTab(
                    target: consoleTarget,
                    place: .thisDevice,
                    machineName: nil,
                    reuseExisting: false
                )
            },
            onNewTerminal: {
                let terminalTarget = activeWindowTerminal ?? .local(folder: activePlace.isThisDevice ? activeSidebarRoot : model.root)
                tabController.addTerminalTab(target: terminalTarget, sidebarRoot: activeSidebarRoot)
            },
            onOpenMachine: { entry in
                guard let machineTarget = WindowTarget.root(of: entry.place, device: model.root) else { return }
                tabController.addPageTab(
                    target: machineTarget,
                    place: entry.place,
                    machineName: entry.title,
                    thisMacRoot: model.thisMacRoot(for: entry.place)?.path,
                    reuseExisting: true
                )
            }
        )
    }

    private func openNotebookFromSidebar(_ serverPath: String) {
        let target: WindowTarget?
        if let id = activePlace.machineID {
            target = WindowTarget.machine(id, path: serverPath, isFolder: false)
        } else {
            let path = "/" + serverPath.drop { $0 == "/" }
            target = WindowTarget(opening: URL(fileURLWithPath: path))
        }
        guard let target else { return }
        let resolvedPlace = model.place(for: target)
        let resolvedMachine = resolvedPlace.machineID.flatMap(model.machineName(_:))
        tabController.addPageTab(
            target: target,
            place: resolvedPlace,
            machineName: resolvedMachine,
            thisMacRoot: model.thisMacRoot(for: resolvedPlace)?.path,
            reuseExisting: true
        )
    }

    private func newNotebookFromSidebar(_ serverPath: String) {
        let nextTarget = WindowTarget.newTab(place: activePlace, folder: activeSidebarRoot, root: model.root)
        let resolvedPlace = model.place(for: nextTarget)
        let resolvedMachine = resolvedPlace.machineID.flatMap(model.machineName(_:))
        let id = tabController.addPageTab(
            target: nextTarget,
            place: resolvedPlace,
            machineName: resolvedMachine,
            thisMacRoot: model.thisMacRoot(for: resolvedPlace)?.path,
            reuseExisting: false
        )
        if let page = tabController.sessions.first(where: { $0.id == id })?.pageTab?.page {
            page.run("new-notebook", arg: serverPath)
        }
    }

    private func openFile(_ path: String, in place: Place) {
        let request = EditorRequest(path: path, place: place)
        WorkspaceTabs.openEditor(request, preferredWindow: tabController.hostWindow) {
            openWindow(value: $0)
        }
    }

    private func canMoveTerminalToPanel(_ terminalTab: TerminalTabState) -> Bool {
        guard terminalTab.canMoveToPanel, TerminalHandoff.shared.canMove(terminalTab.handoffID) else {
            return false
        }
        if tabController.sessions.count > 1 { return true }
        if let window = tabController.hostWindow {
            return PanelController.nearest(to: window) != nil
        }
        return false
    }

    private func moveTerminalTabToPanel(_ terminalTab: TerminalTabState) {
        let handoff = terminalTab.handoffID
        if tabController.sessions.count > 1 {
            let terminal = PanelTerminal(id: handoff, target: terminalTab.target)
            let panel = self.panel
            let moving = TerminalHandoff.shared.move(handoff) {
                panel.adopt(terminal)
            }
            guard moving else { NSSound.beep(); return }
            _ = tabController.removeSession(terminalTab.id)
            return
        }
        guard let window = tabController.hostWindow,
              let nearest = PanelController.nearest(to: window)
        else {
            NSSound.beep()
            return
        }
        let terminal = PanelTerminal(id: handoff, target: terminalTab.target)
        let targetPanel = nearest.panel
        let moving = TerminalHandoff.shared.move(handoff) { [weak host = nearest.window] in
            targetPanel.adopt(terminal)
            host?.makeKeyAndOrderFront(nil)
        }
        guard moving else { NSSound.beep(); return }
        window.performClose(nil)
    }

    /// Its folder, and whether it shows the start screen (no notebook),
    /// for the window that opens after the last one closes (#416).
    private func noteWindow(_ window: NSWindow) {
        let shown = activePage?.effectiveTarget
        var start = false
        if tabController.sessions.count == 1, let shown {
            start = true
            switch shown {
            case .file, .console, .machineFile: start = false
            default: break
            }
        }
        // A machine's folder is no folder for a start window on this Mac.
        WorkspaceTabs.note(
            window, target: shown, folder: activePlace.isThisDevice ? activeSidebarRoot : nil, start: start)
        noteSurface(window)
    }

    /// A notebook's window is one surface (#892): the window behind the
    /// toolbar and the title-bar band above it take the page's own window
    /// colour, so no strip of the system's near-black or grey sits between
    /// the top edge and the page. A console's, a folder's and a machine's
    /// window go back to the system's window colour.
    ///
    /// Set once per window and state, never on every layout pass: assigning a
    /// window's background colour from a layout or render pass sent AppKit
    /// round in circles, the main thread redrawing the window forever (the
    /// toolbar read the assignment back as a preference change). The set
    /// below is what makes "once" possible — two dynamic catalog colours
    /// never compare equal, so the colour alone can't tell whether this
    /// window already has it.
    private func noteSurface(_ window: NSWindow) {
        if showsNotebook {
            guard let colour = NSColor(named: "WindowBackground"),
                  !NotebookSurfaces.shared.contains(window) else { return }
            NotebookSurfaces.shared.add(window)
            window.backgroundColor = colour
        } else {
            guard NotebookSurfaces.shared.contains(window) else { return }
            NotebookSurfaces.shared.remove(window)
            window.backgroundColor = .windowBackgroundColor
        }
    }

    private func bringForward(_ window: NSWindow) {
        window.makeKeyAndOrderFront(nil)
        model.openRequests.broughtForward()
    }

    /// Whether the active tab shows a notebook, which the inspector is for
    /// (#729): not a console, a data file, an editor, a terminal, or the start screen.
    private var showsNotebook: Bool {
        activePage?.showsNotebook ?? false
    }

    /// What the window and its tab are called.
    private var activeWindowTitle: String {
        if let activePage {
            return activePage.windowTitle(machineName: activeMachineName)
        }
        if let activeEditor {
            return activeEditor.windowTitle(machineName: activeMachineName)
        }
        if let activeTerminal {
            return activeTerminal.windowTitle(defaultTitle: model.title(for: activeTerminal.target))
        }
        return tabController.activeSession?.descriptor.title ?? "Ganymede"
    }

    private var activeSubtitle: String {
        guard activePage != nil else { return "" }
        return showsNotebook ? "" : WindowTarget.subtitle(header: activeHeaderStatus, machineName: activeMachineName)
    }

    private var activeToolbarMode: WorkspaceToolbar.Mode {
        switch tabController.activeSession?.payload {
        case .page(let tab):
            return .page(
                page: tab.page,
                document: tab.document,
                panel: activePlace.isThisDevice ? panel : nil,
                place: activePlace,
                header: activeHeaderStatus,
                title: showsNotebook ? activeWindowTitle : nil,
                inspectorShown: showsNotebook ? inspector.isShown : nil,
                toggleInspector: { inspector.toggle() },
                panelShown: panel.isShown,
                toggleTerminalPanel: { panel.toggle(startingOn: activeWindowTerminal) }
            )
        case .editor(let tab):
            return .editor(document: tab.document)
        case .terminal(let tab):
            return .terminal(canMoveToPanel: canMoveTerminalToPanel(tab)) {
                moveTerminalTabToPanel(tab)
            }
        case nil:
            return .empty
        }
    }

    /// The page asks for a tab (`openTab`): a notebook or data file, or a
    /// new DuckDB console. The server is rooted at `/` on the Mac.
    private func openTab(_ request: TabRequest) {
        let nextTarget = request.target(root: model.serverRootFolder)
        WorkspaceTabs.openOrFocusTab(nextTarget, preferredWindow: tabController.hostWindow) {
            openWindow(value: $0)
        }
    }

    /// Why this window's loopback server wasn't trusted as This Mac (#887);
    /// nil for non-loopback servers, this device, and windows upgraded to
    /// This Mac.
    private var thisMacNotice: String? { model.thisMacNotice(for: activePlace) }

    /// The active tab content, with the bottom panel under it (#248), and the status
    /// bar under the workspace (#882). The panel stays in the view tree
    /// while hidden, so its terminals keep running.
    private var workspace: some View {
        GeometryReader { whole in
            VStack(spacing: 0) {
                if let notice = thisMacNotice {
                    ThisMacNoticeBar(message: notice)
                }
                HStack(spacing: 0) {
                    // Areas folded by another filling the window (#250): one
                    // click brings the layout back with that area showing.
                    if layout.filled != nil, !leadingStrip.isEmpty {
                        FoldedStrip(items: leadingStrip, axis: .vertical)
                        Divider()
                    }
                    ZStack {
                        notebookAndPanel
                            .opacity(layout.filled == .inspector ? 0 : 1)
                            .allowsHitTesting(layout.filled != .inspector)
                            .accessibilityHidden(layout.filled == .inspector)
                        if layout.filled == .inspector, let activePage {
                            Inspector(
                                inspector: inspector, page: activePage.page, available: whole.size.width,
                                fills: true, toggleFill: { layout.toggle(.inspector) }
                            )
                        }
                    }
                    if layout.filled == nil, inspector.isShown, showsNotebook, let activePage {
                        Inspector(
                            inspector: inspector, page: activePage.page, available: whole.size.width,
                            fills: false, toggleFill: { layout.toggle(.inspector) }
                        )
                    } else if layout.folds(.inspector), showsNotebook {
                        Divider()
                        FoldedStrip(
                            items: InspectorTab.allCases.map { tab in
                                FoldedStrip.Item(title: tab.title, systemImage: tab.systemImage) {
                                    layout.restore()
                                    inspector.show(tab)
                                }
                            },
                            axis: .vertical
                        )
                    }
                }
                if statusBarShown {
                    let activeBar = StatusBarContent.showsContent(
                        barShown: statusBarShown, showsNotebook: showsNotebook, filled: layout.filled)
                    let barContent = activePage.map {
                        StatusBarContent.make(header: activeHeaderStatus, state: $0.page.state)
                    } ?? StatusBarContent()
                    StatusBar(
                        active: activeBar,
                        content: barContent,
                        page: activePage?.page
                    )
                }
            }
        }
    }

    /// The notebook's title for its strip while another area fills the
    /// window (#250, #867): the window's own, so a notebook the page
    /// titled says that, not its file's name.
    private var notebookTitle: String {
        activePage?.notebookTitle(machineName: activeMachineName) ?? activeWindowTitle
    }

    /// The leading strip while an area fills the window: the sidebar, and
    /// the notebook when it is folded.
    private var leadingStrip: [FoldedStrip.Item] {
        var items: [FoldedStrip.Item] = []
        if sidebarShown {
            items.append(.init(title: "Sidebar", systemImage: "sidebar.left") { layout.restore() })
        }
        // A filled panel has the notebook's row over it instead.
        if layout.filled == .inspector {
            items.append(.init(title: notebookTitle, systemImage: "doc.text") { layout.restore() })
            if panel.isShown {
                items.append(.init(title: "Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled") {
                    layout.restore()
                })
            }
        }
        return items
    }

    /// The unified tab host ZStack, with the bottom panel under it.
    private var notebookAndPanel: some View {
        GeometryReader { area in
            let showsPanel = !activeIsTerminal
            let panelShows = showsPanel && layout.shows(.panel, normally: panel.isShown)
            let panelFills = showsPanel && layout.filled == .panel
            VStack(spacing: 0) {
                WorkspaceTabHost(
                    controller: tabController,
                    onOpenFile: openFile,
                    onOpenTabRequest: openTab
                )
                    .frame(maxHeight: panelFills ? FoldedStrip.thickness : .infinity)
                    .overlay {
                        if panelFills {
                            FoldedStrip(
                                items: [.init(title: notebookTitle, systemImage: "doc.text") { layout.restore() }],
                                axis: .horizontal
                            )
                            .background(.bar)
                        }
                    }
                BottomPanel(
                    panel: panel,
                    newTerminal: activeWindowTerminal,
                    available: area.size.height,
                    kernelID: activePage?.page.state.kernelID,
                    server: model.serverURL.flatMap(ServerEndpoint.init(serverURL:)),
                    // A machine's kernel is the machine's, whose log this
                    // Mac's server doesn't keep (#858).
                    kernelLog: activePlace.isThisDevice,
                    shown: panelShows,
                    fills: panelFills,
                    toggleFill: { layout.toggle(.panel) },
                    onMoveToTab: { request in
                        tabController.addTerminalTab(
                            target: request.target,
                            handoffID: request.id,
                            sidebarRoot: activeSidebarRoot
                        )
                    }
                )
                    // Top-aligned, so a hidden panel's views (AppKit cursor
                    // rects included) sit below the window, not over the notebook.
                    .frame(height: panelShows ? nil : 0, alignment: .top)
                    .clipped()
                    .opacity(panelShows ? 1 : 0)
                    .allowsHitTesting(panelShows)
                    .accessibilityHidden(!panelShows)
                if showsPanel && layout.filled == .notebook {
                    Divider()
                    FoldedStrip(
                        items: [.init(title: "Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled") {
                            layout.restore()
                            panel.show(startingOn: activeWindowTerminal)
                        }],
                        axis: .horizontal
                    )
                }
            }
        }
    }
    #else
    /// The page this scene loads: the app's own, or the machine's (#701),
    /// with the app's chrome around either (#758). Nil until the server
    /// listens.
    private var page: URL? {
        guard let id = place.machineID else { return model.url }
        return WindowTarget.machine(id, path: "/", isFolder: true).flatMap { model.page(for: $0) }
    }

    /// A machine's name, for the title and the subtitle.
    private var machineName: String? { place.machineID.flatMap(model.machineName(_:)) }

    /// The notebook's status line (#812): where it is saved and runs, from
    /// the window's place and the kernel location setting, not the page's
    /// own words; nil with no notebook open.
    private var headerStatus: HeaderStatus? {
        let names = HeaderStatus.places(
            place: place, machineName: machineName, deviceName: Places.deviceName,
            locations: model.kernelLocations, kernel: pageModel.state.kernel)
        return HeaderStatus.make(state: pageModel.state, savedOn: names.savedOn, runsOn: names.runsOn)
    }

    /// The sidebar's folder and files (#758): this device's notebook folder
    /// (its source is the sidebar's own default), or a machine's root through
    /// `MachineFileSource`. Nil for a machine until the server listens.
    private var sidebarScope: (folder: URL, source: (any FileSource)?)? {
        guard let id = place.machineID else { return (model.root, nil) }
        guard let root = WindowTarget.machine(id, path: "/", isFolder: true)?.folder,
              let server = model.serverURL
        else { return nil }
        return (root, MachineFileSource(id: id, server: server))
    }

    /// The sidebar of both layouts; a progress view for a machine until the
    /// server listens, as the Mac's.
    @ViewBuilder
    private func sidebar(
        opened: @escaping () -> Void, tabbed: Bool = false,
        showTerminal: @escaping (PanelTerminal.ID) -> Void = { _ in }
    ) -> some View {
        if let scope = sidebarScope {
            IPadSidebar(
                folder: scope.folder, fileSource: scope.source, place: place, page: pageModel,
                openFile: openEditor, opened: opened, tabbed: tabbed, panel: panel,
                showTerminal: showTerminal,
                columnShown: NavigatorTab.sidebarColumnShown(
                    columns, portrait: portrait, compact: sizeClass == .compact),
                onPlace: { new in Task { @MainActor in await switchPlace(new) } }
            )
            // Another place is another list, and a restarted server has a
            // new address and token (the split view and its panel stay).
            .id("\(place.mountPath)|\(place.isMachine ? model.serverURL?.absoluteString ?? "" : "")")
        } else {
            ProgressView()
        }
    }

    /// Shows `new` in this scene (#758): saves the open notebook first (#808),
    /// then drops the old web view and forgets the old page's state before
    /// switching `place`. On save failure or timeout, asks the user before
    /// retiring or switching.
    @MainActor
    private func switchPlace(
        _ new: Place,
        onCancel: @escaping @MainActor () -> Void = {},
        then afterSwitch: @escaping @MainActor () -> Void = {}
    ) async {
        guard new != place else {
            afterSwitch()
            return
        }
        await placeSwitchGuard.guardSwitch(
            notebookName: { pageModel.notebookDisplayName },
            save: { await pageModel.save() },
            download: { await pageModel.downloadCopy() },
            onCancel: onCancel,
            commit: {
                guard new != place else {
                    afterSwitch()
                    return
                }
                // Text files saved on the way, as when the notebook comes back; the
                // old place's, so a machine's file isn't left over this device's
                // notebook (#855).
                openFiles.showNotebook()
                phonePath = []
                panelFills = false
                if isPhone {
                    phonePage.retire()
                    phonePage = WebViewStore(
                        place: new, sharesName: sharesName(for: new), usesDevice: usesDevice(for: new))
                }
                pageModel.forgetPage()
                place = new
                afterSwitch()
            }
        )
    }

    /// The iPhone's screens over its folder list (#209).
    enum PhoneScreen: Hashable { case notebook }

    /// The iPad's detail area (#251): the notebook, with text files opened
    /// from the sidebar pushed over it, and the bottom panel under it.
    /// The notebook and the panel's terminals stay in the view tree while
    /// covered, hidden or filled over, so the page and shells keep running.
    private var iPadWorkspace: some View {
        GeometryReader { area in
            VStack(spacing: 0) {
                NavigationStack(path: $openFiles.stack) {
                    iPadNotebook(detailWidth: area.size.width)
                        .navigationDestination(for: EditorRequest.self) { request in
                            // Close asks to save; the sidebar's notebooks go
                            // back to the notebook, saving on the way.
                            EditorWindow(document: openFiles.document(for: request)) {
                                openFiles.close(request)
                            }
                            .navigationBarBackButtonHidden(true)
                            // The terminal, panel and fill buttons, as over
                            // the notebook.
                            .toolbar {
                                ToolbarItemGroup(placement: .primaryAction) { appButtons }
                            }
                        }
                }
                .frame(maxHeight: notebookHidden ? 0 : .infinity)
                .opacity(notebookHidden ? 0 : 1)
                .allowsHitTesting(!notebookHidden)
                .accessibilityHidden(notebookHidden)
                IPadPanel(
                    panel: panel, newTerminal: terminalTarget,
                    available: area.size.height, shown: panelShown, filling: $panelFills
                )
                    .frame(height: panelShown ? nil : 0, alignment: .top)
                    .clipped()
                    .opacity(panelShown ? 1 : 0)
                    .allowsHitTesting(panelShown)
                    .accessibilityHidden(!panelShown)
            }
        }
    }

    /// The redesigned iPad notebook screen (#914): touch tab strip above the
    /// page, display title + kernel chip, orange Run capsule, and Split View
    /// folding below 600pt wide. Separate from `notebook` so the iPhone path
    /// stays independent.
    private func iPadNotebook(detailWidth: CGFloat) -> some View {
        VStack(spacing: 0) {
            if IPadTabStripModel.shouldShow(hasNotebook: pageModel.state.hasNotebook, place: place) {
                IPadTabStrip(
                    tabs: iPadTabs,
                    availableWidth: detailWidth,
                    onSelect: handleIPadTab
                )
            }
            content
        }
        .ignoresSafeArea(.container, edges: .bottom)
        .navigationTitle(iPadDisplayTitle)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(
            pageModel.state.hasNotebook ? AnyShapeStyle(Color("WindowBackground")) : AnyShapeStyle(.bar),
            for: .navigationBar
        )
        .toolbarBackgroundVisibility(
            pageModel.state.hasNotebook ? .visible : .automatic,
            for: .navigationBar
        )
        .toolbar {
            IPadRedesignedToolbar(
                width: detailWidth,
                title: iPadDisplayTitle,
                header: headerStatus,
                machineName: machineName,
                page: pageModel,
                place: place,
                model: model,
                newTerminal: terminalTarget,
                panelShown: panelShown,
                mainFills: mainFills,
                onRename: {
                    newName = title
                    renaming = true
                },
                onOpenTerminal: { request in
                    panel.add(request.target)
                    mainFills = false
                },
                onTogglePanel: togglePanel,
                onToggleMainFill: toggleMainFill,
                onOpenSettings: { settings = true },
                onOpenFolder: {
                    pickPurpose = .openFolder
                    picking = true
                }
            )
        }
        .alert("Rename Notebook", isPresented: $renaming) {
            TextField("Name", text: $newName)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("Rename") {
                let name = newName.trimmingCharacters(in: .whitespaces)
                if !name.isEmpty { pageModel.run("rename", arg: name) }
            }
            Button("Cancel", role: .cancel) {}
        }
    }

    /// Short display title for the iPad toolbar and window (#867, #914).
    private var iPadDisplayTitle: String {
        IPadLayout.displayTitle(
            path: pageModel.state.path,
            metadataTitle: pageModel.state.title,
            isMachine: place.isMachine,
            machineName: machineName,
            folderName: model.root.lastPathComponent
        )
    }

    /// Tabs for the iPad touch tab strip (#914): active notebook or machine,
    /// recent/running notebooks, and connected machines.
    private var iPadTabs: [IPadTabItem] {
        IPadTabStripModel.buildTabs(
            state: pageModel.state,
            place: place,
            machineName: machineName,
            places: model.places
        )
    }

    /// Single-WebView safe tab action on iPadOS (#914).
    private func handleIPadTab(_ action: IPadTabAction) {
        switch action {
        case .notebook(let path):
            openFiles.showNotebook()
            panelFills = false
            pageModel.run("open", arg: path)
        case .place(let targetPlace):
            Task { @MainActor in await switchPlace(targetPlace) }
        }
    }

    /// Whether the iPad's bottom panel is on screen. Every scene has one:
    /// a machine's terminals run on the machine (#858).
    private var panelShown: Bool { panel.isShown && !mainFills }

    /// What a new terminal on this scene's own machine runs on (#858), the
    /// place deciding from the folder of the notebook it shows, as on the
    /// Mac: nil for this device, whose terminals are the remotes' in the
    /// panel, as before.
    private var terminalTarget: TerminalTarget? {
        guard place.isMachine else { return nil }
        return place.terminalTarget(notebook: pageModel.state.path, fallbackFolder: "", remotes: model.remotes)
    }

    /// Whether the panel fills the detail area over the notebook.
    private var notebookHidden: Bool { panelFills && panelShown }

    /// The detail area fills the screen, or goes back to how it was.
    private func toggleMainFill() {
        mainFills.toggle()
        columns = mainFills || portrait ? .hidden : .automatic
    }

    /// The page with its navigation bar: one title, the notebook's, and the
    /// app's own buttons beside the notebook's (on the iPhone, on the list).
    private var notebook: some View {
        content
            // Under the home indicator, except above the iPhone's bottom
            // glass bar.
            .ignoresSafeArea(.container, edges: isPhone ? [] : .bottom)
            .safeAreaInset(edge: .top, spacing: 0) {
                if isPhone {
                    PhoneHeaderStrip(header: headerStatus, page: pageModel, place: place)
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if isPhone {
                    PhoneBottomBar(page: pageModel) { phoneOutlineShown = true }
                }
            }
            .navigationTitle(isPhone ? phoneTitle : title)
            .navigationBarTitleDisplayMode(.inline)
            .modifier(PhoneHeaderBarBackground(hasNotebook: isPhone && pageModel.state.hasNotebook))
            .toolbar {
                if drawsNativeChrome {
                    ToolbarItem(placement: .principal) {
                        if isPhone {
                            PhoneHeaderTitle(
                                title: phoneTitle, header: headerStatus, machineName: machineName)
                        } else {
                            // The title over the status line (#812); tapping the line
                            // opens the file, kernel and where kernels run.
                            NotebookTitle(
                                title: title, header: headerStatus, machineName: machineName,
                                page: pageModel, place: place, phone: false)
                        }
                    }
                    IPadNotebookToolbar(page: pageModel, bottom: isPhone) {
                        newName = title
                        renaming = true
                    }
                }
                // On the iPhone these are on the folder list.
                if !isPhone {
                    ToolbarItemGroup(placement: .primaryAction) { appButtons }
                }
            }
            .sheet(isPresented: $phoneOutlineShown) {
                PhoneOutlineSheet(page: pageModel)
            }
            // The page renames the open notebook: it saves its edits first
            // and keeps the kernel, and adds `.ipynb`.
            .alert("Rename Notebook", isPresented: $renaming) {
                TextField("Name", text: $newName)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                Button("Rename") {
                    // The page judges the name, with a notice for one it
                    // can't use.
                    let name = newName.trimmingCharacters(in: .whitespaces)
                    if !name.isEmpty { pageModel.run("rename", arg: name) }
                }
                Button("Cancel", role: .cancel) {}
            }
    }

    /// Display title for the iPhone notebook navigation bar (#915): prefers
    /// `metadata.title` (or first level-1 heading), else the file name without
    /// a leading date prefix.
    private var phoneTitle: String {
        PhoneChromeState.displayTitle(
            path: drawsNativeChrome ? pageModel.state.path : nil,
            metadataTitle: pageModel.state.title,
            isMachine: place.isMachine,
            machineName: machineName,
            rootName: model.root.lastPathComponent
        )
    }

    /// The app's own buttons: terminals, Settings, the notebook folder. A
    /// machine's scene has terminals, on the machine (#858), and no folder to
    /// open (#758).
    @ViewBuilder
    private var appButtons: some View {
        TerminalMenu(model: model, newTerminal: terminalTarget) { request in
            // In the bottom panel on iPad (#251), full screen on iPhone.
            if isPhone {
                terminal = request
            } else {
                panel.add(request.target)
                mainFills = false
            }
        }
        if !isPhone {
            Button(action: togglePanel) {
                Label(panelShown ? "Hide Terminal Panel" : "Show Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled")
            }
            Button(action: toggleMainFill) {
                Label(
                    mainFills ? "Restore" : "Fill the Screen",
                    systemImage: mainFills ? "arrow.down.right.and.arrow.up.left" : "arrow.up.left.and.arrow.down.right"
                )
            }
        }
        Button {
            settings = true
        } label: {
            Label("Settings", systemImage: "gearshape")
        }
        .keyboardShortcut(",")
        if place.isThisDevice {
            Button {
                pickPurpose = .openFolder
                picking = true
            } label: {
                Label("Open Folder", systemImage: "folder")
            }
        }
    }

    private var title: String {
        if drawsNativeChrome, let path = pageModel.state.path {
            return URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        }
        return place.isMachine ? (machineName ?? "Machine") : model.root.lastPathComponent
    }

    /// Shows or hides the iPad's bottom panel. Shown, it leaves a filled
    /// screen, so it can be seen.
    private func togglePanel() {
        if panelShown {
            panel.isShown = false
            panelFills = false
        } else {
            panel.isShown = true
            mainFills = false
        }
    }

    /// A text file from the sidebar: over the notebook in the iPad's
    /// detail area (#251), full screen on iPhone. The request names the
    /// window's place, so a machine's file opens through its mount (#855).
    private func openEditor(_ path: String) {
        let request = EditorRequest(path: path, place: place)
        if isPhone {
            editing = request
        } else {
            openFiles.open(request)
            panelFills = false
            if portrait { columns = .hidden }
        }
    }

    /// A Spotlight result (#305): its notebook, when it is in the folder
    /// the server serves, opens as one picked in the sidebar would.
    private func openFromSpotlight(_ url: URL) {
        guard let path = NotebookActions.apiPath(for: url, root: model.serverRootFolder) else { return }
        showNotebook(apiPath: path)
    }

    /// Opens the notebook at `path` in the folder the server serves, and
    /// shows it: from Spotlight (#305) or a link (#640).
    private func showNotebook(apiPath path: String) {
        // A notebook of this device, whichever place the scene shows (#758):
        // a machine's page would look for it on the machine.
        Task { @MainActor in
            await switchPlace(.thisDevice, then: {
                pageModel.run("open", arg: path)
                if isPhone {
                    // Behind a cover, if one is up: there when it closes.
                    phonePath = [.notebook]
                } else if drawsNativeChrome {
                    openFiles.showNotebook()
                    panelFills = false
                    if portrait { columns = .hidden }
                }
            })
        }
    }

    /// A link needs a folder granted: the picker, on the topmost thing
    /// presented, after the alert that asked has gone.
    private func startGrant(_ request: AppURL) {
        links.beginGrant(for: request)
        pickPurpose = .grantForLink
        Self.afterPresentationEnds {
            if coverShown {
                coverPicking = true
            } else if settings {
                settingsPicking = true
            } else {
                picking = true
            }
        }
    }

    /// The folder picker answered for a link, wherever it was shown.
    private func linkFolderPicked(_ result: Result<URL, Error>) {
        links.picked(result, root: model.serverRootFolder, served: model.servedRoot, openFiles: { OpenTextFiles.shared.all }, show: showNotebook)
        showThisDeviceForParkedLink()
    }

    /// A link parked for this device's server while a machine shows (#762):
    /// show this device, whose page opens it once ready. The switch makes
    /// the page not ready (`PageModel.forgetPage`), so this device's page
    /// becoming ready is a transition that `pageReady` sees.
    private func showThisDeviceForParkedLink() {
        guard links.waitsForThisDevice(showing: place) else { return }
        Task { @MainActor in
            await switchPlace(.thisDevice, onCancel: { links.cancelPending() })
        }
    }

    /// Whether a terminal or editor is over the window, and the sheet.
    private var coverShown: Bool { terminal != nil || editing != nil }

    /// The text files open for editing: the editor's, and the iPad's. Only
    /// this device's: a folder switch restarts this device's server, and a
    /// machine's file is the machine's, through the mount (#855).
    private var openTextFiles: [String] {
        ((editing.map { [$0] } ?? []) + openFiles.stack).compactMap(\.thisDevicePath)
    }

    /// The person said yes to switching folders for a link.
    private func changeFolder(_ change: LinkOpener.FolderSwitch) {
        // The link's notebook is this device's: show this device's page, so
        // it opens in context and not in a machine's.
        Task { @MainActor in
            await switchPlace(.thisDevice, then: {
                links.confirm(change) { model.open(folder: $0) }
            })
        }
    }

    /// Saves the open notebook before iOS suspends the scene (#808).
    private func saveNotebookOnBackground() {
        guard pageModel.ready, pageModel.webView != nil else { return }
        var taskID: UIBackgroundTaskIdentifier = .invalid
        let endTask: @MainActor () -> Void = {
            if taskID != .invalid {
                UIApplication.shared.endBackgroundTask(taskID)
                taskID = .invalid
            }
        }
        taskID = UIApplication.shared.beginBackgroundTask(withName: "SaveNotebook") {
            Task { @MainActor in endTask() }
        }
        Task { @MainActor in
            _ = await pageModel.save(timeout: .seconds(4))
            endTask()
        }
    }

    /// Runs `work` once a sheet, cover, picker or alert that is closing is
    /// gone. SwiftUI has no signal for that (a binding going false comes
    /// before the animation ends), and an alert or picker shown during it
    /// may be dropped, so this waits a moment.
    private static func afterPresentationEnds(_ work: @escaping @MainActor () -> Void) {
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(300))
            work()
        }
    }

    /// The page's recents, as files, for Spotlight (#305): under the folder
    /// its paths are from, its own server's root (#883).
    private var recentFiles: [URL] {
        pageRoot.files(pageModel.state.recents ?? [])
    }
    #endif

    /// Whether a window of `place` gets the person's name (#842): this
    /// device always does; a machine, when its remote's setting says so.
    private func sharesName(for place: Place) -> Bool {
        model.sharesName(for: place)
    }

    /// Whether a window of `place` may use this device's `device` API
    /// (#877): this device always may; a machine, when its remote's setting
    /// says so. The handlers are made with the page, so a change applies to
    /// the machine's windows opened after it.
    private func usesDevice(for place: Place) -> Bool {
        model.usesDevice(for: place)
    }

    /// The folder a window of `place`'s page paths are from (#883): this
    /// Mac's own server's `root_dir`, else the app server's root.
    #if os(iOS)
    private var pageRoot: PageRoot { model.pageRoot(for: place) }

    private var content: some View {
        Group {
            if let url = page {
                // A page loaded for another place gets its own handlers: this
                // device's page is not a machine's (#758).
                WebView(
                    url: url, page: pageModel, onOpenFile: openEditor, store: isPhone ? phonePage : nil,
                    place: place, sharesName: sharesName(for: place), usesDevice: usesDevice(for: place),
                    pageRoot: pageRoot
                )
                .id(place)
            } else if model.error != nil {
                startProblem
            } else {
                ProgressView()
            }
        }
        .task { model.startIfNeeded() }
        // A check on every appearance keeps the app's answer current; it
        // upgrades the window on its next load and downgrades it at once
        // (#883).
        .onAppear { model.refreshThisMac() }
    }
    #endif

    /// The server didn't start, and why, with Try Again.
    @ViewBuilder
    private var startProblem: some View {
        VStack(spacing: 12) {
            Text("Ganymede could not start").font(.headline)
            Text(model.error ?? "")
                .textSelection(.enabled)
                .multilineTextAlignment(.center)
            Button("Try Again") { model.start() }
        }
        .padding()
    }
}

/// A keychain problem (remotes' tokens, the SSH key, the MCP token), on
/// the window or, on iOS,
/// the whole app's screen (not only the notebook's, #209).
private struct KeychainAlert: ViewModifier {
    var model: AppModel

    func body(content: Content) -> some View {
        content.alert(
            "Keychain",
            isPresented: Binding(
                get: { model.keychainError != nil },
                set: { if !$0 { model.keychainError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.keychainError ?? "")
        }
        .alert(
            "Connected Machine",
            isPresented: Binding(
                get: { model.machineError != nil },
                set: { if !$0 { model.machineError = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.machineError ?? "")
        }
    }
}

#if os(macOS)
/// The focused window's values for the menus (#740): the place, its server
/// folder and the terminal panel for every window, since a machine's
/// terminals run in its own panel (#858); this Mac's folder only for a
/// window of this device, whose disk it is.
private struct WindowSceneValues: ViewModifier {
    var place: Place
    var folder: URL
    var panel: PanelController?
    var enabled: Bool = true

    func body(content: Content) -> some View {
        let scope = enabled ? WindowScope(place: place, serverFolder: FolderEntry.serverPath(folder)) : nil
        let windowFolder: URL? = (enabled && place.isThisDevice) ? folder : nil
        content
            .focusedSceneValue(\.panelController, panel)
            .focusedSceneValue(\.windowScope, scope)
            .focusedSceneValue(\.windowFolder, windowFolder)
    }
}

/// Keeps the inspector in step with whether the tab shows a notebook
/// (#729): `available` follows it, and an inspector filling the window
/// that goes away gives the layout back.
private struct InspectorAvailability: ViewModifier {
    var inspector: InspectorController
    var shows: Bool
    var fillsWindow: Bool
    var restore: () -> Void

    func body(content: Content) -> some View {
        content
            .onChange(of: shows, initial: true) { _, shows in
                inspector.available = shows
            }
            .onChange(of: inspector.isVisible) { _, visible in
                if !visible, fillsWindow { restore() }
            }
    }
}

/// The toolbar's band on a notebook window (#892): the page's own window
/// colour rather than the system's material, so the toolbar and the page
/// below it read as one surface. Other windows keep the system's toolbar,
/// under its own band and separator.
private struct NotebookSurface: ViewModifier {
    var notebook: Bool

    func body(content: Content) -> some View {
        content
            .toolbarBackground(
                notebook ? AnyShapeStyle(Color("WindowBackground")) : AnyShapeStyle(.bar),
                for: .windowToolbar)
            .toolbarBackgroundVisibility(notebook ? .visible : .automatic, for: .windowToolbar)
    }
}

/// The windows that have taken a notebook's window colour (#892). A weak set,
/// so a closed window leaves it by itself.
@MainActor
private enum NotebookSurfaces {
    static let shared = NSHashTable<NSWindow>.weakObjects()
}
#endif
