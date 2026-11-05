import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
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
    @StateObject private var document = PageDocument()
    /// What the page shows, for the native toolbar and menus (#205).
    @StateObject private var pageModel = PageModel()
    /// This window, for the Finder's open requests (#228).
    @State private var windowID = UUID()
    /// File › New Tab or New Window, when this window is the one they
    /// opened (#247): its folder, and whether it stands alone.
    @State private var request: WorkspaceTabs.Request?
    /// The bottom panel's terminals (#248), and whether it shows and how
    /// tall it is, kept with the window across launches.
    @StateObject private var panel = PanelController()
    /// What the window shows, kept with it so a window the system
    /// restores comes back on it (#268). SwiftUI's own restoring of
    /// `target` brought notebook windows back on the folder.
    @SceneStorage("window.target") private var savedTarget = ""
    /// Whether the page has said what it shows; until then a restored
    /// `target` that comes late still replaces what the page was loaded for.
    @State private var pageReported = false
    @SceneStorage("panel.shown") private var panelShown = false
    @SceneStorage("panel.height") private var panelHeight = PanelController.defaultHeight

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
    @Environment(\.openWindow) private var openWindow
    @State private var picking = false
    @State private var settings = false
    /// Settings' Keyboard Shortcuts was tapped: show the page's sheet when
    /// Settings has gone.
    @State private var shortcutsNext = false
    /// A terminal shown full screen, where the app has one scene.
    @State private var terminal: TerminalRequest?
    /// A text file being edited full screen, where the app has one scene.
    @State private var editing: EditorRequest?
    /// What the page shows, for the native toolbar and menus (#205).
    @StateObject private var pageModel = PageModel()
    /// The iPad's sidebar and notebook columns (#208).
    @State private var columns = NavigationSplitViewVisibility.automatic
    /// The iPhone's page, kept while the folder list shows (#209).
    @StateObject private var phonePage = WebViewStore()
    /// The iPhone's screens over the folder list: the notebook, or none.
    @State private var phonePath: [PhoneScreen] = []
    #endif

    var body: some View {
        #if os(macOS)
        // The app draws the sidebar, toolbar and menus; the page shows the
        // notebook (#206, #207).
        NavigationSplitView {
            NavigatorSidebar(folder: sidebarRoot, page: pageModel) { path in
                openWindow(value: EditorRequest(path: path))
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 240, max: 400)
        } detail: {
            workspace
        }
        .toolbar {
            NotebookToolbar(page: pageModel, document: document, folder: sidebarRoot)
            ToolbarItem {
                Button {
                    panel.toggle(startingOn: .local(folder: sidebarRoot))
                } label: {
                    Label(panel.isShown ? "Hide Terminal Panel" : "Show Terminal Panel", systemImage: "rectangle.bottomthird.inset.filled")
                }
                .help(panel.isShown ? "Hide the terminal panel (⌃`)" : "Show the terminal panel (⌃`)")
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
        .onReceive(model.openRequests.$pending) { pending in
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
            model.openRequests.register(windowID, blank: target == nil)
            model.openRequests.openWindow = { [openWindow] in openWindow(value: $0) }
        }
        .onChange(of: target) { target in
            model.openRequests.register(windowID, blank: target == nil)
            savedTarget = WindowTarget.saved(target)
            // Restored after the view was made, before the page said
            // anything: show it, not what the page was loaded for.
            if let target, !pageReported, target != loaded { show(target) }
        }
        // Brought forward after launch: restored windows can come back in
        // front of a notebook opened from the Finder (#268).
        .onReceive(model.openRequests.$front) { front in
            guard let front, front == target else { return }
            document.window?.makeKeyAndOrderFront(nil)
        }
        .onDisappear { model.openRequests.unregister(windowID) }
        // Notebook windows are tabs too (#247).
        .background(WindowReader { window in
            document.attach(to: window)
            WorkspaceTabs.join(window, alone: request?.alone ?? false)
        })
        .focusedSceneObject(document)
        .focusedSceneObject(pageModel)
        .focusedSceneObject(panel)
        .onAppear {
            panel.resize(to: panelHeight, available: .infinity)
            // Shells don't outlive the app: a panel that was showing comes
            // back with a new one, as ⌃` would start.
            if panelShown { panel.show(startingOn: .local(folder: sidebarRoot)) }
        }
        .onChange(of: panel.isShown) { panelShown = $0 }
        .onChange(of: panel.height) { panelHeight = $0 }
        #else
        Group {
            if isPhone {
                // The iPhone: the folder list, and the notebook pushed onto
                // it (#209). The page lives in `phonePage`, so it keeps
                // running while the list shows and the list can open
                // notebooks in it.
                NavigationStack(path: $phonePath) {
                    IPadSidebar(folder: model.root, page: pageModel, openFile: openEditor) {
                        phonePath = [.notebook]
                    }
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
                        IPadSidebar(folder: model.root, page: pageModel, openFile: openEditor) {
                            // In portrait the sidebar covers the notebook:
                            // it gets out of the way once one is opened.
                            if window.size.width < window.size.height { columns = .detailOnly }
                        }
                    } detail: {
                        NavigationStack { notebook }
                    }
                    // Back in landscape, the sidebar shows again by default.
                    .onChange(of: window.size.width > window.size.height) { landscape in
                        if landscape { columns = .automatic }
                    }
                }
            } else {
                NavigationStack { notebook }
            }
        }
        .focusedSceneObject(pageModel)
        .modifier(KeychainAlert(model: model))
        .sheet(isPresented: $settings, onDismiss: {
            // Keyboard Shortcuts is the page's sheet: once this one is gone.
            if shortcutsNext {
                shortcutsNext = false
                pageModel.run("show-shortcuts")
            }
        }) {
            NavigationStack {
                SettingsScreen(page: pageModel, showShortcuts: shortcutsShown ? {
                    shortcutsNext = true
                    settings = false
                } : nil) { settings = false }
            }
            .environmentObject(model)
        }
        .onReceive(NotificationCenter.default.publisher(for: .showAppSettings)) { note in
            if note.object as? PageModel === pageModel { settings = true }
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
            .environmentObject(model)
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
        .onChange(of: phase) { phase in
            if phase == .active {
                Task { await model.resume() }
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

    private var page: URL? { model.page(for: loaded) }

    /// The notebook, with the bottom panel under it (#248). The panel stays
    /// in the view tree while hidden, so its terminals keep running.
    private var workspace: some View {
        GeometryReader { area in
            VStack(spacing: 0) {
                content
                    .frame(maxHeight: .infinity)
                BottomPanel(panel: panel, folder: sidebarRoot, available: area.size.height)
                    // Top-aligned, so a hidden panel's views (AppKit cursor
                    // rects included) sit below the window, not over the notebook.
                    .frame(height: panel.isShown ? nil : 0, alignment: .top)
                    .clipped()
                    .opacity(panel.isShown ? 1 : 0)
                    .allowsHitTesting(panel.isShown)
                    .accessibilityHidden(!panel.isShown)
            }
        }
    }

    /// The page opened another notebook, or closed it: the window now
    /// shows that, for its title and for the Finder's later opens. The page
    /// stays as it is.
    private func follow(_ url: URL?) {
        guard let url else { return }
        pageReported = true
        if let shown = WindowTarget(page: url) {
            if shown != target { target = shown }
        } else if case .file(let file) = target {
            target = .folder(file.deletingLastPathComponent())
        }
    }
    #else
    private var page: URL? { model.url }

    /// The iPhone's screens over its folder list (#209).
    enum PhoneScreen: Hashable { case notebook }

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
                    IPadNotebookToolbar(page: pageModel, bottom: isPhone)
                }
                // On the iPhone these are on the folder list.
                if !isPhone {
                    ToolbarItemGroup(placement: .primaryAction) { appButtons }
                }
            }
    }

    /// The app's own buttons: terminals, Settings, the notebook folder.
    @ViewBuilder
    private var appButtons: some View {
        TerminalMenu(model: model) { request in
            // A scene of its own beside the notebook on iPad,
            // full screen where there is one scene (iPhone).
            if UIApplication.shared.supportsMultipleScenes {
                openWindow(value: request)
            } else {
                terminal = request
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

    /// Whether a notebook is on screen to show the page's shortcuts sheet
    /// in: on the iPhone the page is parked behind the list until one is
    /// pushed.
    private var shortcutsShown: Bool {
        pageModel.state.hasNotebook && (!isPhone || !phonePath.isEmpty)
    }

    private var title: String {
        if drawsNativeChrome, let path = pageModel.state.path {
            return URL(fileURLWithPath: path).deletingPathExtension().lastPathComponent
        }
        return model.root.lastPathComponent
    }

    /// A text file from the sidebar: beside the notebook on iPad, full
    /// screen on iPhone.
    private func openEditor(_ path: String) {
        let request = EditorRequest(path: path)
        if UIApplication.shared.supportsMultipleScenes {
            openWindow(value: request)
        } else {
            editing = request
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

/// A keychain problem with the remotes' tokens, on the window or, on iOS,
/// the whole app's screen (not only the notebook's, #209).
private struct KeychainAlert: ViewModifier {
    @ObservedObject var model: AppModel

    func body(content: Content) -> some View {
        content.alert(
            "Remotes",
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
