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
    /// A newer release, once a check found it (#411).
    private let updater = AppUpdater.shared

    init(target: Binding<WindowTarget?>) {
        _target = target
        // Read on every init, but `@State` keeps only the first: the one
        // made as this window opens.
        let request = target.wrappedValue == nil ? WorkspaceTabs.pending : nil
        let loaded = target.wrappedValue ?? .folder(request?.folder ?? AppModel.shared.root)
        _loaded = State(initialValue: loaded)
        _sidebarRoot = State(initialValue: loaded.folder)
        _request = State(initialValue: request)
    }
    #endif
    #if os(iOS)
    @Environment(\.scenePhase) private var phase
    @State private var picking = false
    @State private var settings = false
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
    @State private var columns = NavigationSplitViewVisibility.automatic
    /// The iPhone's page, kept while the folder list shows (#209).
    @State private var phonePage = WebViewStore()
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
            NavigatorSidebar(folder: sidebarRoot, page: pageModel, panel: panel) { path in
                openWindow(value: EditorRequest(path: path))
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 240, max: 400)
        } detail: {
            workspace
        }
        .toolbar {
            NotebookToolbar(page: pageModel, document: document, folder: sidebarRoot, panel: panel)
            ToolbarItem {
                Button {
                    panel.toggle(startingOn: .local(folder: sidebarRoot))
                } label: {
                    Label(panel.isShown ? "Hide Terminal Panel" : "Show Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled")
                }
                .help(panel.isShown ? "Hide the terminal panel (⌃`)" : "Show the terminal panel (⌃`)")
            }
            ToolbarItem {
                Button {
                    inspector.toggle()
                } label: {
                    Label(inspector.isShown ? "Hide Inspector" : "Show Inspector", systemImage: "sidebar.right")
                }
                .help(inspector.isShown ? "Hide the inspector (⌥⌘0)" : "Show the inspector (⌥⌘0)")
            }
            if let available = updater.available {
                ToolbarItem {
                    UpdateAvailableButton(available: available)
                }
            }
        }
        .navigationSubtitle(pageModel.state.subtitle)
        .frame(minWidth: 720, minHeight: 480)
        .navigationTitle((target ?? loaded).title)
        .focusedSceneValue(\.windowFolder, sidebarRoot)
        // Notebooks opened from the Finder (#228): the first window to see
        // them takes them. Each opens in a new tab (or brings forward
        // the one showing it), except that the window the app opened on
        // nothing at launch shows the first itself. Later, so the change
        // to `pending` is not made while views update.
        .onChange(of: model.openRequests.pending, initial: true) { _, pending in
            guard !pending.isEmpty else { return }
            DispatchQueue.main.async(execute: takeOpenRequests)
        }
        .onAppear {
            if let request {
                WorkspaceTabs.take(request)
                if target == nil { target = .folder(request.folder) }
            } else if target == nil, let saved = WindowTarget(saved: savedTarget) {
                // A window the system restored, without its value.
                show(saved)
            }
            // A restored window (its value restored or not) gets its
            // sidebar's folder back too.
            if request == nil, WindowTarget(saved: savedTarget) == target {
                restoreSidebar()
            }
            savedSidebar = sidebarRoot.path
            savedTarget = WindowTarget.saved(target)
            model.openRequests.register(windowID, blank: target == nil)
            model.openRequests.openWindow = { [openWindow] in openWindow(value: $0) }
        }
        .onChange(of: target) { _, target in
            model.openRequests.register(windowID, blank: target == nil)
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
            savedSidebar = new.path
            if let window = document.window { noteWindow(window) }
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
        .focusedSceneValue(\.panelController, panel)
    }

    /// `macWindow` with the bottom panel and the keyboard kept in step.
    private var macPanelSync: some View {
        macWindow
        .onAppear {
            panel.resize(to: panelHeight, available: .infinity)
            // Shells don't outlive the app: a panel that was showing comes
            // back with a new one, as ⌃` would start.
            if panelShown { panel.show(startingOn: .local(folder: sidebarRoot)) }
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
                    IPadSidebar(
                        folder: model.root, page: pageModel, openFile: openEditor,
                        opened: { phonePath = [.notebook] }, panel: panel
                    )
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
                .task { model.startIfNeeded() }
                .task(id: model.url) {
                    if let url = model.url {
                        phonePage.load(url, page: pageModel, onOpenFile: openEditor)
                    } else {
                        // Stopped, to restart (Open Folder, Try Again,
                        // remotes, resume): load the new server's page.
                        phonePage.forget(page: pageModel)
                    }
                }
            } else if drawsNativeChrome {
                // The iPad draws the sidebar and toolbar; the page shows the
                // notebook (#208).
                GeometryReader { window in
                    NavigationSplitView(columnVisibility: $columns) {
                        IPadSidebar(
                            folder: model.root, page: pageModel, openFile: openEditor,
                            opened: {
                                openFiles.showNotebook()
                                panelFills = false
                                // In portrait the sidebar covers the notebook:
                                // it gets out of the way once one is opened.
                                if portrait { columns = .detailOnly }
                            },
                            tabbed: true, panel: panel,
                            showTerminal: { id in
                                panel.selection = id
                                panel.isShown = true
                                mainFills = false
                                if portrait { columns = .detailOnly }
                            }
                        )
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
        .modifier(KeychainAlert(model: model))
        // Spotlight (#305): the page's recents are indexed, a save updates
        // its entry, and a result opens here.
        .onChange(of: pageModel.state.recents, initial: true) { _, recents in
            // nil until the page reports: syncing then would drop every
            // entry, to index them all again a moment later.
            guard recents != nil else { return }
            SpotlightSettings.shared.sync(recents: recentFiles)
        }
        .onChange(of: pageModel.state.dirty) { was, now in
            guard was, !now, let path = pageModel.state.path else { return }
            SpotlightSettings.shared.saved(model.serverRootFolder.appendingPathComponent(path, isDirectory: false))
        }
        .onContinueUserActivity(CSSearchableItemActionType) { activity in
            _ = SpotlightSettings.shared.open(activity, with: openFromSpotlight)
        }
        // A Shortcut a cell ran, calling back (ganymede-device#40); the
        // app has no other `ganymede://` URLs here yet.
        .onOpenURL { url in
            KernelHost.shortcuts.handle(url)
        }
        // Opened again from the root, not where the last visit ended.
        .sheet(isPresented: $settings, onDismiss: { settingsPath = [] }) {
            NavigationStack(path: $settingsPath) {
                SettingsScreen(page: pageModel) { settings = false }
            }
            .environment(model)
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
        }
        .fullScreenCover(item: $editing) { request in
            NavigationStack {
                EditorWindow(request: request) { editing = nil }
            }
        }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { result in
            if case .success(let folder) = result {
                model.open(folder: folder)
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
    private func takeOpenRequests() {
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
        sidebarRoot = shown.folder
    }

    /// The sidebar's folder as this window last had it, if it was saved.
    private func restoreSidebar() {
        guard !savedSidebar.isEmpty else { return }
        sidebarRoot = URL(fileURLWithPath: savedSidebar, isDirectory: true)
    }

    /// Its folder, and whether it shows the start screen (no notebook),
    /// for the window that opens after the last one closes (#416).
    private func noteWindow(_ window: NSWindow) {
        var start = true
        if case .file = target ?? loaded { start = false }
        WorkspaceTabs.note(window, folder: sidebarRoot, start: start)
    }

    private func bringForward(_ window: NSWindow) {
        window.makeKeyAndOrderFront(nil)
        model.openRequests.broughtForward()
    }

    private var page: URL? { model.page(for: loaded) }

    /// The notebook, with the bottom panel under it (#248). The panel stays
    /// in the view tree while hidden, so its terminals keep running.
    private var workspace: some View {
        GeometryReader { whole in
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
                if layout.filled == nil, inspector.isShown {
                    Inspector(
                        inspector: inspector, page: pageModel, available: whole.size.width,
                        fills: false, toggleFill: { layout.toggle(.inspector) }
                    )
                } else if layout.folds(.inspector) {
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
        }
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
            items.append(.init(title: (target ?? loaded).title, systemImage: "doc.text") { layout.restore() })
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
                                items: [.init(title: (target ?? loaded).title, systemImage: "doc.text") { layout.restore() }],
                                axis: .horizontal
                            )
                            .background(.bar)
                        }
                    }
                BottomPanel(
                    panel: panel,
                    folder: sidebarRoot,
                    available: area.size.height,
                    kernelID: pageModel.state.kernelID,
                    server: model.serverURL.flatMap(ServerEndpoint.init(serverURL:)),
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
                            panel.show(startingOn: .local(folder: sidebarRoot))
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
        guard let shown, shown != target else { return }
        // A window opened on nothing stays blank on the folder it loaded,
        // so it can still take the Finder's files at launch (#228).
        if target == nil, case .folder = shown, shown.url.path == loaded.url.path { return }
        target = shown
    }
    #else
    private var page: URL? { model.url }

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
                        .navigationDestination(for: String.self) { path in
                            // Close asks to save; the sidebar's notebooks go
                            // back to the notebook, saving on the way.
                            EditorWindow(document: openFiles.document(for: path)) {
                                openFiles.close(path)
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
                IPadPanel(panel: panel, available: area.size.height, shown: panelShown, filling: $panelFills)
                    .frame(height: panelShown ? nil : 0, alignment: .top)
                    .clipped()
                    .opacity(panelShown ? 1 : 0)
                    .allowsHitTesting(panelShown)
                    .accessibilityHidden(!panelShown)
            }
        }
    }

    /// Whether the iPad's bottom panel is on screen.
    private var panelShown: Bool { panel.isShown && !mainFills }

    /// Whether the panel fills the detail area over the notebook.
    private var notebookHidden: Bool { panelFills && panelShown }

    /// The detail area fills the screen, or goes back to how it was.
    private func toggleMainFill() {
        mainFills.toggle()
        columns = mainFills || portrait ? .detailOnly : .automatic
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
                    // The title over the kernel and its state, which the
                    // page's own toolbar showed (the Mac's window subtitle).
                    ToolbarItem(placement: .principal) {
                        VStack(spacing: 0) {
                            Text(title).font(.headline).lineLimit(1)
                            if !pageModel.state.subtitle.isEmpty {
                                Text(pageModel.state.subtitle)
                                    .font(.caption)
                                    .foregroundStyle(pageModel.state.kernelMissing ? AnyShapeStyle(Color.red) : AnyShapeStyle(.secondary))
                                    .lineLimit(1)
                            }
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

    /// The app's own buttons: terminals, Settings, the notebook folder.
    @ViewBuilder
    private var appButtons: some View {
        TerminalMenu(model: model) { request in
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
        Button {
            picking = true
        } label: {
            Label("Open Folder", systemImage: "folder")
        }
    }

    private var title: String {
        if drawsNativeChrome, let path = pageModel.state.path {
            return URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        }
        return model.root.lastPathComponent
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
    /// detail area (#251), full screen on iPhone.
    private func openEditor(_ path: String) {
        if isPhone {
            editing = EditorRequest(path: path)
        } else {
            openFiles.open(path)
            panelFills = false
            if portrait { columns = .detailOnly }
        }
    }

    /// A Spotlight result (#305): its notebook, when it is in the folder
    /// the server serves, opens as one picked in the sidebar would.
    private func openFromSpotlight(_ url: URL) {
        guard let path = NotebookActions.apiPath(for: url, root: model.serverRootFolder) else { return }
        pageModel.run("open", arg: path)
        if isPhone {
            phonePath = [.notebook]
        } else if drawsNativeChrome {
            openFiles.showNotebook()
            panelFills = false
            if portrait { columns = .detailOnly }
        }
    }

    /// The page's recents, as files, for Spotlight (#305).
    private var recentFiles: [URL] {
        (pageModel.state.recents ?? []).map {
            model.serverRootFolder.appendingPathComponent($0, isDirectory: false)
        }
    }
    #endif

    private var content: some View {
        Group {
            if let url = page {
                #if os(macOS)
                WebView(url: url, onNavigate: follow, document: document, page: pageModel) { path in
                    openWindow(value: EditorRequest(path: path))
                }
                #else
                WebView(url: url, page: pageModel, onOpenFile: openEditor, store: isPhone ? phonePage : nil)
                #endif
            } else if model.error != nil {
                startProblem
            } else {
                ProgressView()
            }
        }
        .task { model.startIfNeeded() }
        #if os(macOS)
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
    }
}
