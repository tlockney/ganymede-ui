import CoreSpotlight
import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @Environment(AppModel.self) private var model
    #if os(macOS)
    /// The notebook or folder this window shows, following the page; nil
    /// for a window opened on nothing, until its page opens a notebook.
    @Binding var target: WindowTarget?
    /// What the page was loaded for. A window opened on nothing keeps the
    /// folder that was the default then, so a later Open Folder… (which
    /// changes the default) leaves it alone.
    @State private var loaded: WindowTarget
    /// The place this window's page was loaded with (#883): a check that
    /// verifies its machine is this Mac's own upgrades the window on its
    /// next load, and a check that stops verifying it downgrades the window
    /// at once, in place. `place` reads it.
    @State private var loadedPlace: Place?
    /// What the window's web view is made for (#883): its place and the
    /// folder a this-Mac server is rooted at. An upgrade to this Mac's own
    /// server, and a server restarted on another folder, are another web
    /// view's; a downgrade is not, since making the web view again would
    /// load the page again and drop its unsaved edits.
    @State private var pagePlace: PagePlace
    /// The folder the sidebar lists and New Notebook uses. It stays put
    /// when the page opens a notebook in a subfolder, which moves `target`.
    @State private var sidebarRoot: URL
    @Environment(\.openWindow) private var openWindow
    /// The open notebook's file and unsaved edits, as the page reports them.
    @State private var document = PageDocument()
    /// What the page shows, for the native toolbar and menus (#205).
    @State private var pageModel = PageModel()
    /// This window, for the Finder's open requests (#228).
    @State private var windowID = UUID()
    /// File › New Tab or New Window, when this window is the one they
    /// opened (#247): its folder, and whether it stands alone.
    @State private var request: WorkspaceTabs.Request?
    /// The bottom panel's terminals (#248), and whether it shows and how
    /// tall it is, kept with the window across launches.
    @State private var panel = PanelController()
    /// What the window shows, kept with it so a window the system
    /// restores comes back on it (#268). SwiftUI's own restoring of
    /// `target` brought notebook windows back on the folder.
    @SceneStorage("window.target") private var savedTarget = ""
    /// The sidebar's folder, kept likewise: it can differ from the
    /// notebook's own folder.
    @SceneStorage("window.sidebar") private var savedSidebar = ""
    /// Whether the page has said what it shows; until then a restored
    /// `target` that comes late still replaces what the page was loaded for.
    @State private var pageReported = false
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
    /// Experimental Step 6 custom tab strip (#903), off by default.
    @AppStorage(SettingsTab.customTabsKey) private var customTabStrip = false
    @AppStorage(SettingsTab.customTabsSamplesKey) private var customTabSamples = false

    init(target: Binding<WindowTarget?>) {
        _target = target
        // Read on every init, but `@State` keeps only the first: the one
        // made as this window opens.
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
        _loaded = State(initialValue: loaded)
        _loadedPlace = State(initialValue: place)
        _pagePlace = State(initialValue: ContentView.PagePlace(place: place, root: model.thisMacRoot(for: place)?.path))
        _sidebarRoot = State(initialValue: loaded.folder)
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
            WorkspaceTabHost(
                enabled: customTabStrip,
                samples: customTabSamples,
                target: target ?? loaded,
                place: place,
                machineName: machineName,
                metadataTitle: shownTitle,
                windowTitle: windowTitle,
                page: pageModel,
                document: document,
                sidebarRoot: sidebarRoot,
                windowTerminal: windowTerminal,
                onOpenFile: { path in
                    openWindow(value: EditorRequest(path: path, place: place))
                },
                onOpenTabRequest: openTab
            ) {
                workspace
            }
        }
        .toolbar {
            NotebookToolbar(
                page: pageModel, document: document,
                // The kernel popover's Kernel Log is this device's window's
                // alone (#858), so a machine's window passes no panel to it.
                panel: place.isThisDevice ? panel : nil, place: place, header: headerStatus,
                // A notebook's title, drawn with the kernel's button beside
                // it (#867); a console or a folder keeps the system's.
                title: showsNotebook ? windowTitle : nil,
                // The right group's inspector toggle, and More's terminal
                // panel item (#892): the panel is every window's — a
                // machine's terminals run on the machine (#858), and a
                // machine whose remote is gone keeps its panel too, empty,
                // for the remotes' terminals there. Only a tab with a
                // notebook has an inspector (#729).
                inspectorShown: showsNotebook ? inspector.isShown : nil,
                toggleInspector: { inspector.toggle() },
                panelShown: panel.isShown,
                toggleTerminalPanel: { panel.toggle(startingOn: windowTerminal) },
                // An update that's ready sits at the end of the toolbar's
                // leading region, so its arrival moves nothing to its right
                // (#812).
                update: updater.available)
        }
        // The status line (#812). The system draws it and it isn't
        // clickable: the kernel button's popover opens the details. A
        // notebook's window has none: its save part is beside the chip
        // (#867), and `.toolbar(removing: .title)` takes the system title
        // and subtitle away. A machine's window with no notebook keeps
        // "on <machine>".
        .navigationSubtitle(
            showsNotebook ? "" : WindowTarget.subtitle(header: headerStatus, machineName: machineName))
        .frame(minWidth: 720, minHeight: 480)
        // A console's tab is titled with its name (#735), a notebook with
        // its title, or its file's (#867).
        .navigationTitle(windowTitle)
        .modifier(WindowSceneValues(place: place, folder: sidebarRoot, panel: panel))
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
        // Notebooks opened from the Finder (#228): the first window to see
        // them takes them. Each opens in a new tab (or brings forward
        // the one showing it), except that the window the app opened on
        // nothing at launch shows the first itself. Later, so the change
        // to `pending` is not made while views update.
        .onChange(of: model.openRequests.pending, initial: true) { _, pending in
            guard !pending.isEmpty, place.isThisDevice else { return }
            DispatchQueue.main.async(execute: takeOpenRequests)
        }
        .onAppear {
            if let request {
                WorkspaceTabs.take(request)
                if target == nil { target = request.target }
            } else if target == nil, let saved = WindowTarget(saved: savedTarget) {
                // A window the system restored, without its value.
                show(saved)
            }
            // A restored window (its value restored or not) gets its
            // sidebar's folder back too.
            if request == nil, WindowTarget(saved: savedTarget) == target {
                restoreSidebar()
            }
            savedSidebar = FolderEntry.storageKey(sidebarRoot)
            savedTarget = WindowTarget.saved(target)
            noteOpenRequests()
            model.openRequests.openWindow = { [openWindow] in openWindow(value: $0) }
        }
        .onChange(of: target) { _, target in
            noteOpenRequests()
            // Restored after the view was made, before the page said
            // anything: show it, not what the page was loaded for.
            if let target, !pageReported, target != loaded {
                let restored = WindowTarget(saved: savedTarget) == target
                show(target)
                if restored { restoreSidebar() }
            }
            savedTarget = WindowTarget.saved(target)
            if let window = document.window { noteWindow(window) }
        }
        .onChange(of: sidebarRoot) { _, new in
            savedSidebar = FolderEntry.storageKey(new)
            if let window = document.window { noteWindow(window) }
        }
        // A notebook that opens or closes in this window changes whether the
        // window is one surface with its toolbar (#892).
        .onChange(of: showsNotebook) { _, _ in
            if let window = document.window { noteSurface(window) }
        }
        // Back from Terminal, where a kernelspec may have been installed
        // or removed: the page asks the server for its kernels again
        // (#350). A page still loading fetches them anyway.
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            pageModel.refreshKernels()
        }
        // Brought forward after launch: restored windows can come back in
        // front of a notebook opened from the Finder (#268).
        .onChange(of: model.openRequests.front, initial: true) { _, front in
            guard let front, front == target, let window = document.window else { return }
            bringForward(window)
        }
        .onDisappear { model.openRequests.unregister(windowID) }
        // Notebook windows are tabs too (#247).
        .background(WindowReader { window in
            document.attach(to: window)
            // So a terminal tab can move into this panel (#248).
            panel.attach(to: window)
            WorkspaceTabs.join(window, alone: request?.alone ?? false)
            noteWindow(window)
            // A page already running when the window arrives gets its dot.
            WorkspaceTabs.markBusy(window, pageModel.state.isBusy)
            // A window opened as launch ended may get its NSWindow only
            // after `front` was published.
            if let front = model.openRequests.front, front == target {
                DispatchQueue.main.async { bringForward(window) }
            }
        })
        .focusedSceneValue(\.pageDocument, document)
        .focusedSceneValue(\.pageModel, pageModel)
    }

    /// `macWindow` with the bottom panel and the keyboard kept in step.
    private var macPanelSync: some View {
        macWindow
        .onAppear {
            panel.resize(to: panelHeight, available: .infinity)
            // Shells don't outlive the app: a panel that was showing comes
            // back with a new one, as ⌃` would start.
            if panelShown { panel.show(startingOn: windowTerminal) }
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
            guard let window = document.window else { return }
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
        .onChange(of: pageModel.state.isBusy) { _, busy in
            if let window = document.window { WorkspaceTabs.markBusy(window, busy) }
        }
    }
    #endif

    var body: some View {
        #if os(macOS)
        // In three parts: as one expression the type checker gave up
        // (#356).
        macPanelSync
        .focusedSceneValue(\.inspectorController, inspector)
        .modifier(InspectorAvailability(
            inspector: inspector, shows: showsNotebook, fillsWindow: layout.filled == .inspector
        ) { layout.restore() })
        .focusedSceneValue(\.windowFill, WindowFill(filled: layout.filled) {
            // The area with the keyboard: a panel terminal, or the notebook.
            if layout.filled != nil {
                layout.restore()
            } else if panel.isShown, let window = document.window, terminalHasKeyboard(in: window) {
                layout.toggle(.panel)
            } else {
                layout.toggle(.notebook)
            }
        })
        .onAppear {
            inspector.isShown = inspectorShown
            inspector.tab = InspectorTab(rawValue: inspectorTab) ?? .outline
            inspector.resize(to: inspectorWidth, available: .infinity)
            if inspector.wantsVariables { pageModel.run("inspect-variables", arg: "on") }
        }
        .onChange(of: inspector.isShown) { _, shown in
            inspectorShown = shown
            layout.noteChange(of: .inspector, shown: shown)
        }
        .onChange(of: inspector.tab) { _, new in inspectorTab = new.rawValue }
        .onChange(of: inspector.width) { _, new in inspectorWidth = new }
        // The page reads the variables only while the inspector shows them.
        .onChange(of: inspector.wantsVariables) { _, wants in
            pageModel.run("inspect-variables", arg: wants ? "on" : "off")
        }
        // A page loaded again forgets it was asked.
        .onChange(of: pageModel.state.variables == nil) { _, none in
            if none, inspector.wantsVariables {
                pageModel.run("inspect-variables", arg: "on")
            }
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
                    .onAppear { portrait = window.size.width < window.size.height }
                    // Back in landscape, the sidebar shows again by default.
                    .onChange(of: window.size.width < window.size.height) { _, tall in
                        portrait = tall
                        if !tall, !mainFills { columns = .automatic }
                    }
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
            .fileImporter(isPresented: $coverPicking, allowedContentTypes: [.folder], onCompletion: linkFolderPicked)
        }
        .fullScreenCover(item: $editing) { request in
            // A link closes nothing: an editor may have unsaved edits. Its
            // alert, and the folder picker a grant needs, are its own.
            NavigationStack {
                EditorWindow(request: request) { editing = nil }
            }
            .modifier(LinkAlert(links: links, isEnabled: terminal == nil, grant: startGrant, change: changeFolder))
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
            if phase == .background { openFiles.saveHidden() }
            if phase == .active {
                Task { await model.resume() }
                SpotlightSettings.shared.syncIfStale()
            }
        }
        #endif
    }

    #if os(macOS)
    /// Only this device's windows take the Finder's open requests, and only
    /// they count as blank (#740).
    private func noteOpenRequests() {
        if place.isThisDevice {
            model.openRequests.register(windowID, blank: target == nil)
        } else {
            model.openRequests.unregister(windowID)
        }
    }

    private func takeOpenRequests() {
        guard place.isThisDevice else { return }
        let (shown, others) = model.openRequests.take(blank: target == nil)
        if let shown { show(shown) }
        for other in others {
            openWindow(value: other)
        }
    }

    /// Shows `shown` in this window: the page loads it.
    private func show(_ shown: WindowTarget) {
        target = shown
        loaded = shown
        // Another load: the page is loaded with the place the app finds
        // now (#883), so a check that verified its machine applies here.
        let place = model.place(for: shown)
        loadedPlace = place
        pagePlace = PagePlace(place: place, root: model.thisMacRoot(for: place)?.path)
        sidebarRoot = shown.folder
    }

    /// The sidebar's folder as this window last had it, if it was saved.
    /// Only a location of this window's own place.
    private func restoreSidebar() {
        guard let saved = FolderEntry.location(storageKey: savedSidebar),
              FolderEntry.isLocation(saved, in: place)
        else { return }
        sidebarRoot = saved
    }

    /// What the app says this window's place is now (#883).
    private var currentPlace: Place { model.place(for: loaded) }

    /// The place this window is (#883): the one its page was loaded with,
    /// upgraded to this Mac's own on its next load, and downgraded at once
    /// when the check stops verifying the server — in place, without the
    /// web view being made again, so the page keeps its unsaved edits.
    private var place: Place { Place.window(loaded: loadedPlace, current: currentPlace) }

    /// The page loaded (#883): its place is read again, so a check that
    /// verified the window's machine applies on this load. The web view's
    /// identity follows it, which is a load's business (a page loading
    /// again, another page, another window), never a downgrade's: that is
    /// taken in place, and this runs only after a load committed.
    private func readPlace() {
        let now = currentPlace
        if loadedPlace != now { loadedPlace = now }
        let made = PagePlace(place: now, root: model.thisMacRoot(for: now)?.path)
        if pagePlace != made { pagePlace = made }
    }

    /// What a new terminal in this window runs on (#858), as File > New
    /// Terminal and the panel's + ask: the place decides, from the folder of
    /// the notebook the window shows, else the folder the window is on. Nil
    /// for a machine whose remote was removed or has no server.
    private var windowTerminal: TerminalTarget? {
        WindowScope(place: place, serverFolder: FolderEntry.serverPath(sidebarRoot))
            .terminalTarget(notebook: pageModel.state.path, remotes: model.remotes)
    }

    /// A machine's name, for its window's title and subtitle.
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

    /// This window's files: this Mac's disk, or the machine's through the
    /// app's mount. Nil for a machine until the server listens.
    private var fileSource: (any FileSource)? {
        guard let id = place.machineID else { return LocalFileSource() }
        return model.serverURL.map { MachineFileSource(id: id, server: $0) }
    }

    private var sidebar: some View {
        Group {
            if let source = fileSource {
                NavigatorSidebar(
                    folder: sidebarRoot, source: source, place: place, page: pageModel,
                    panel: panel,
                    // The column the sidebar's keys bring back (#879): the
                    // window folds it, or an area fills over it.
                    showSidebar: {
                        layout.restore()
                        sidebarShown = true
                    }
                ) { path in
                    openWindow(value: EditorRequest(path: path, place: place))
                }
                // The navy glass (#873): a pale navy, or the navy itself in
                // the dark, over the system's sidebar material and through the
                // whole column. The lists hide their own background so this
                // shows behind their rows.
                .background(Color("SidebarTint").ignoresSafeArea())
                // A restarted server has a new address and token.
                .id(place.isMachine ? model.serverURL : nil)
            } else {
                ProgressView()
            }
        }
    }

    /// Its folder, and whether it shows the start screen (no notebook),
    /// for the window that opens after the last one closes (#416).
    private func noteWindow(_ window: NSWindow) {
        var start = true
        switch target ?? loaded {
        case .file, .console, .machineFile: start = false
        default: break
        }
        // A machine's folder is no folder for a start window on this Mac.
        WorkspaceTabs.note(window, folder: place.isThisDevice ? sidebarRoot : nil, start: start)
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

    private var page: URL? { model.page(for: loaded) }

    /// Whether this tab shows a notebook, which the inspector is for
    /// (#729): not a console, a data file or the start screen.
    private var showsNotebook: Bool {
        InspectorController.showsNotebook(
            state: pageModel.state, pageReported: pageModel.ready, target: target ?? loaded
        )
    }

    /// What the window and its tab are called: a console by its name
    /// (#735), a notebook by its `metadata.title` or its file's, the rest
    /// by their folder's (#867).
    private var windowTitle: String {
        (target ?? loaded).tabTitle(
            consoleName: pageModel.state.console?.name, machineName: machineName,
            metadataTitle: shownTitle)
    }

    /// The page's `metadata.title`, once the page reports the file this
    /// window is for (#871).
    private var shownTitle: String? {
        WindowTarget.shownTitle(
            target: target ?? loaded, pagePath: pageModel.state.path, metadataTitle: pageModel.state.title)
    }

    /// The page asks for a tab (`openTab`): a notebook or data file, or a
    /// new DuckDB console. The server is rooted at `/` on the Mac.
    private func openTab(_ request: TabRequest) {
        openWindow(value: request.target(root: model.serverRootFolder))
    }

    /// The notebook, with the bottom panel under it (#248), and the status
    /// bar under the workspace (#882). The panel stays in the view tree
    /// while hidden, so its terminals keep running.
    private var workspace: some View {
        GeometryReader { whole in
            VStack(spacing: 0) {
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
                        if layout.filled == .inspector {
                            Inspector(
                                inspector: inspector, page: pageModel, available: whole.size.width,
                                fills: true, toggleFill: { layout.toggle(.inspector) }
                            )
                        }
                    }
                    if layout.filled == nil, inspector.isShown, showsNotebook {
                        Inspector(
                            inspector: inspector, page: pageModel, available: whole.size.width,
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
                    StatusBar(
                        active: StatusBarContent.showsContent(
                            barShown: statusBarShown, showsNotebook: showsNotebook, filled: layout.filled),
                        content: StatusBarContent.make(header: headerStatus, state: pageModel.state),
                        page: pageModel
                    )
                }
            }
        }
    }

    /// The notebook's title for its strip while another area fills the
    /// window (#250, #867): the window's own, so a notebook the page
    /// titled says that, not its file's name.
    private var notebookTitle: String {
        (target ?? loaded).displayTitle(machineName: machineName, metadataTitle: pageModel.state.title)
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

    /// The notebook, with the bottom panel under it.
    private var notebookAndPanel: some View {
        GeometryReader { area in
            let panelShows = layout.shows(.panel, normally: panel.isShown)
            let panelFills = layout.filled == .panel
            VStack(spacing: 0) {
                content
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
                    newTerminal: windowTerminal,
                    available: area.size.height,
                    kernelID: pageModel.state.kernelID,
                    server: model.serverURL.flatMap(ServerEndpoint.init(serverURL:)),
                    // A machine's kernel is the machine's, whose log this
                    // Mac's server doesn't keep (#858).
                    kernelLog: place.isThisDevice,
                    fills: panelFills,
                    toggleFill: { layout.toggle(.panel) }
                )
                    // Top-aligned, so a hidden panel's views (AppKit cursor
                    // rects included) sit below the window, not over the notebook.
                    .frame(height: panelShows ? nil : 0, alignment: .top)
                    .clipped()
                    .opacity(panelShows ? 1 : 0)
                    .allowsHitTesting(panelShows)
                    .accessibilityHidden(!panelShows)
                if layout.filled == .notebook {
                    Divider()
                    FoldedStrip(
                        items: [.init(title: "Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled") {
                            layout.restore()
                            panel.show(startingOn: windowTerminal)
                        }],
                        axis: .horizontal
                    )
                }
            }
        }
    }

    /// The page opened another notebook, closed it, or moved to another
    /// folder (#220): the window now shows that, for its title, the
    /// folder restored on relaunch and the Finder's later opens. The page
    /// stays as it is.
    private func follow(_ url: URL?) {
        guard let url else { return }
        let shown = WindowTarget(page: url)
        // Not the app's own load of `loaded`, which this KVO also reports:
        // only the page moving elsewhere.
        if shown?.url.standardizedFileURL.path != loaded.url.standardizedFileURL.path {
            pageReported = true
        }
        // A page can't turn itself into another place's window (#701). A
        // machine the app checked is this Mac's own (#883) is that place
        // here, though the page names it as a machine.
        guard let shown, model.place(for: shown) == place else { return }
        // A console's page reports its folder, not the tab's own id.
        if let target, target.shows(shown) { return }
        // A window opened on nothing stays blank on the folder it loaded,
        // so it can still take the Finder's files at launch (#228).
        if target == nil, case .folder = shown, shown.url.path == loaded.url.path { return }
        target = shown
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
                onPlace: switchPlace
            )
            // Another place is another list, and a restarted server has a
            // new address and token (the split view and its panel stay).
            .id("\(place.mountPath)|\(place.isMachine ? model.serverURL?.absoluteString ?? "" : "")")
        } else {
            ProgressView()
        }
    }

    /// Shows `new` in this scene (#758): the page for that place loads,
    /// with its own handlers (a coordinator's place is fixed, so the
    /// iPad's web view is made again, and the iPhone's store replaced). What
    /// the old place had open, and the old page's state, are dropped first:
    /// the shared `pageModel` must not carry its notebook into the new place
    /// (it forgets the page before the new one loads).
    private func switchPlace(_ new: Place) {
        guard new != place else { return }
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
                    notebook
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
            // toolbar.
            .ignoresSafeArea(.container, edges: isPhone ? [] : .bottom)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if drawsNativeChrome {
                    // The title over the status line (#812); tapping the line
                    // opens the file, kernel and where kernels run.
                    ToolbarItem(placement: .principal) {
                        NotebookTitle(
                            title: title, header: headerStatus, machineName: machineName,
                            page: pageModel, place: place, phone: isPhone)
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
        switchPlace(.thisDevice)
        pageModel.run("open", arg: path)
        if isPhone {
            // Behind a cover, if one is up: there when it closes.
            phonePath = [.notebook]
        } else if drawsNativeChrome {
            openFiles.showNotebook()
            panelFills = false
            if portrait { columns = .hidden }
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
        if links.waitsForThisDevice(showing: place) { switchPlace(.thisDevice) }
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
        switchPlace(.thisDevice)
        links.confirm(change) { model.open(folder: $0) }
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

    /// What a window's page is made for (#883): its place, and the folder a
    /// this-Mac server is rooted at, whose notebooks its ledger keeps. A
    /// server restarted with another `root_dir` keeps notebooks by other
    /// paths, so the page is made again for it.
    private struct PagePlace: Hashable {
        var place: Place
        var root: String?
    }

    /// The folder a window of `place`'s page paths are from (#883): this
    /// Mac's own server's `root_dir`, else the app server's root.
    private var pageRoot: PageRoot { model.pageRoot(for: place) }

    private var content: some View {
        Group {
            if let url = page {
                #if os(macOS)
                WebView(
                    url: url, onNavigate: follow, document: document, page: pageModel,
                    onOpenTab: openTab,
                    onOpenFile: { path in
                        openWindow(value: EditorRequest(path: path, place: place))
                    },
                    place: place, sharesName: sharesName(for: place), usesDevice: usesDevice(for: place),
                    pageRoot: pageRoot,
                    onLoad: readPlace
                )
                // A page loaded for another place, or for a server rooted
                // elsewhere, gets its own handlers. A downgrade keeps the
                // one it has (#883): its handlers go in place instead.
                .id(pagePlace)
                #else
                // A page loaded for another place gets its own handlers: this
                // device's page is not a machine's (#758).
                WebView(
                    url: url, page: pageModel, onOpenFile: openEditor, store: isPhone ? phonePage : nil,
                    place: place, sharesName: sharesName(for: place), usesDevice: usesDevice(for: place),
                    pageRoot: pageRoot
                )
                .id(place)
                #endif
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
        #if os(macOS)
        .onChange(of: currentPlace) { _, now in
            // A downgrade is kept, so a check that verifies the server
            // again waits for the next load to apply (#883): the web view
            // took the downgrade in place, and an upgrade is a load's.
            guard let held = loadedPlace, held.isThisMac, !now.isThisMac else { return }
            loadedPlace = now
        }
        .modifier(KeychainAlert(model: model))
        #endif
    }

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
    var panel: PanelController

    func body(content: Content) -> some View {
        let scope = WindowScope(place: place, serverFolder: FolderEntry.serverPath(folder))
        let window = content
            .focusedSceneValue(\.panelController, panel)
            .focusedSceneValue(\.windowScope, scope)
        if place.isThisDevice {
            window.focusedSceneValue(\.windowFolder, folder)
        } else {
            window
        }
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
