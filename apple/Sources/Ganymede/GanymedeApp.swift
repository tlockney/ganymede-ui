import SwiftUI
#if os(macOS)
import UniformTypeIdentifiers
#endif

@main
struct GanymedeApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    private let model = AppModel.shared

    init() {
        // First, so a crash while launching is reported too (#318).
        CrashReports.shared.startIfChosen()
    }

    // Separate bodies, since a `#if` inside a scene builder that starts
    // with a postfix member chain does not parse.
    #if os(macOS)
    var body: some Scene {
        // One window per notebook or folder (`WindowTarget`); none shows
        // the last folder. Opening one that is already open brings it front.
        WindowGroup(id: WorkspaceTabs.sceneID, for: WindowTarget.self) { $target in
            // A connected machine's window is this one too (#740): its
            // sidebar reads the machine through the app's mount.
            ContentView(target: $target)
                .environment(model)
                .settingsOpener()
        }
        // Files opened from the Finder go through the app delegate (#228).
        .handlesExternalEvents(matching: [])
        .commands {
            // The window's sidebar, toolbar and notebook menus (#206, #207).
            SidebarCommands()
            CommandGroup(after: .sidebar) {
                PanelCommands(model: model)
                InspectorCommands()
                StatusBarCommands()
                FillCommands()
                CommandPaletteCommand()
                JournalCommand()
                LiveMarkdownCommand()
                Divider()
                CodeFontSizeCommands()
            }
            CommandGroup(replacing: .newItem) {
                NewCommands(model: model)
            }
            CommandMenu("Cell") {
                CellMenu()
            }
            CommandMenu("Kernel") {
                KernelMenu()
            }
            CommandGroup(after: .newItem) {
                OpenCommands(model: model)
                Divider()
                TerminalCommands(model: model)
            }
            // Release builds only (#411).
            CommandGroup(after: .appInfo) {
                CheckForUpdatesCommand()
            }
            CommandGroup(after: .appSettings) {
                // Tabs of the one Settings window (#206, #332).
                Button("Agent Settings…") {
                    SettingsOpener.show(.agent)
                }
                .keyboardShortcut(",", modifiers: [.command, .option])
                DefaultAppCommand()
                // Only when this build bundles the tool (#686).
                if CommandLineTool.bundledTool() != nil {
                    Button("Install Command Line Tool…") {
                        SettingsOpener.show(.general)
                    }
                }
            }
            CommandGroup(replacing: .help) {
                Button("Keyboard Shortcuts") {
                    SettingsOpener.show(.shortcuts)
                }
                Divider()
                HelpLinkCommands()
            }
        }
        // Terminals and text files open as tabs of the front window (#247).
        WindowGroup("Terminal", for: TerminalRequest.self) { $request in
            TerminalWindow(target: request?.target ?? .local(folder: nil), handoff: request?.id)
                .environment(model)
                .settingsOpener()
                .workspaceTab()
        }
        .handlesExternalEvents(matching: [])
        // Text files opened from a notebook window's sidebar (#122).
        WindowGroup("Editor", for: EditorRequest.self) { $request in
            if let request {
                EditorWindow(request: request)
                    .settingsOpener()
                    .workspaceTab()
            }
        }
        .handlesExternalEvents(matching: [])
        // File > Close, Save, Rename, Download, Export As and Publish
        // (#622). With more than one WindowGroup, SwiftUI on macOS takes the
        // `.saveItem` group from the last one: on the first it is dropped
        // and the system's Close and Close All show instead.
        .commands {
            CommandGroup(replacing: .saveItem) {
                CloseCommand()
                SaveCommand()
                RenameCommand()
                DownloadCommand()
                ExportCommand()
                PublishCommand()
            }
        }
        Settings {
            SettingsWindow()
                .environment(model)
        }
        MenuBarExtra("Ganymede", systemImage: "book.closed") {
            MenuBarMenu(model: model, menuBar: model.menuBar)
        }
    }
    #else
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .crashReportsPrompt()
                // A link goes to the window that shows, not a new one
                // (#640); the Terminal and Editor scenes don't take it.
                .handlesExternalEvents(preferring: ["*"], allowing: ["*"])
        }
        // URLs (Shortcuts callbacks, ganymede-device#40, and `open` links,
        // #640) go to a main window, whose `onOpenURL` handles them, never
        // a Terminal or Editor window.
        .handlesExternalEvents(matching: ["*"])
        // Holding ⌘ lists them, and the iPadOS menu bar shows them (#208).
        .commands { IPadCommands() }
        WindowGroup("Terminal", for: TerminalRequest.self) { $request in
            TerminalScene(request: request)
                .environment(model)
        }
        .handlesExternalEvents(matching: [])
        WindowGroup("Editor", for: EditorRequest.self) { $request in
            EditorScene(request: request)
        }
        .handlesExternalEvents(matching: [])
    }
    #endif
}

#if os(macOS)
/// Content of the Mac `MenuBarExtra` (#924): Open Window, Settings, server
/// status (background or embedded, MCP, Tailnet), running kernels, and Quit.
struct MenuBarMenu: View {
    var model: AppModel
    var menuBar: MenuBarController
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings

    private var snapshot: MenuBarSnapshot {
        menuBar.snapshot(
            backgroundRunning: !model.verifiedBackgroundServers.isEmpty,
            embeddedRunning: model.serverURL != nil,
            embeddedError: model.error,
            mcpMode: model.mcpMode,
            tailnetShare: model.tailnetShare,
            tailnetURL: model.tailnetURL,
            tailnetError: model.tailnetError
        )
    }

    var body: some View {
        Button("Open Window") {
            WorkspaceTabs.focusOrOpen(folder: model.root) { openWindow(id: $0) }
        }
        Button("Settings…") {
            NSApp.activate()
            openSettings()
        }
        Divider()
        Section("Server") {
            Text(snapshot.serverLine)
            Text(snapshot.mcpLine)
            Text(snapshot.tailnetLine)
        }
        Divider()
        Section(snapshot.kernelsHeader) {
            if let actionError = snapshot.actionError {
                Text(actionError)
            }
            if snapshot.kernels.isEmpty {
                Text(snapshot.emptyKernelsLine)
            } else {
                ForEach(snapshot.kernels) { kernel in
                    Menu(kernel.label) {
                        Button("Interrupt") {
                            Task { await menuBar.perform(.interrupt, on: kernel) }
                        }
                        Button("Restart") {
                            Task { await menuBar.perform(.restart, on: kernel) }
                        }
                        Divider()
                        Button("Shut Down") {
                            Task { await menuBar.perform(.shutDown, on: kernel) }
                        }
                    }
                }
            }
        }
        if snapshot.showRecentExecutions {
            Divider()
            Section("Recent Executions") {
                if let executions = snapshot.executions, !executions.isEmpty {
                    ForEach(executions) { execution in
                        Text(execution.label())
                    }
                } else {
                    Text(snapshot.emptyExecutionsLine)
                }
            }
        }
        Divider()
        Button("Quit Ganymede") {
            NSApp.terminate(nil)
        }
        .keyboardShortcut("q")
    }
}

/// File > Open… and Open Folder…, each into a new tab of the front window.
struct OpenCommands: View {
    @Environment(\.openWindow) private var openWindow
    var model: AppModel
    private let recents = Recents.shared
    @FocusedValue(\.pageModel) private var page
    @FocusedValue(\.windowScope) private var scope

    var body: some View {
        Button("Open…") {
            for url in model.chooseNotebooks() {
                WorkspaceTabs.openOrFocusTab(WindowTarget(opening: url)) { openWindow(value: $0) }
            }
        }
        .keyboardShortcut("o")
        Menu("Open Recent") {
            ForEach(recents.urls, id: \.self) { url in
                Button(url.lastPathComponent) {
                    WorkspaceTabs.openOrFocusTab(WindowTarget(opening: url)) { openWindow(value: $0) }
                }
            }
            Divider()
            Button("Clear Menu") { recents.clear() }
                .disabled(recents.urls.isEmpty)
        }
        // This Mac's notebooks: not from a connected machine's window (#740).
        // This Mac's own server's window lists them, they being this Mac's
        // (#883), so `indexesLocally` decides, not `isMachine`.
        .disabled(scope?.place.indexesLocally == false)
        // The page's recent DuckDB consoles (#735): each opens as a tab, or
        // brings forward the tab showing it.
        let consoles = page?.state.consoles ?? []
        // The consoles' folders are the page's paths, from its own server's
        // root: a this-Mac window's from its `root_dir` (#883).
        let root = model.pageRoot(for: scope?.place ?? .thisDevice).url
        Menu("Open Recent Console") {
            ForEach(consoles) { recent in
                Button(recent.menuTitle) {
                    let target = TabRequest.duckdbConsole(
                        folder: recent.folder, session: UUID(uuidString: recent.id)
                    ).target(root: root)
                    WorkspaceTabs.openOrFocusTab(target) { openWindow(value: $0) }
                }
            }
            Divider()
            Button("Clear Recent Consoles") { page?.run("clear-recent-consoles") }
                .disabled(consoles.isEmpty)
        }
        .disabled(page == nil || scope?.place.indexesLocally == false)
        Button("Open Folder…") {
            if let folder = model.chooseFolder() {
                WorkspaceTabs.openOrFocusTab(WindowTarget.folder(folder.standardizedFileURL)) {
                    openWindow(value: $0)
                }
            }
        }
        .keyboardShortcut("o", modifiers: [.command, .shift])
    }
}

/// Ganymede > Make Default App for Notebooks: double-clicking an .ipynb
/// file in the Finder then opens it here.
struct DefaultAppCommand: View {
    var body: some View {
        Button("Make Default App for Notebooks") {
            Task { await DefaultApp.claimNotebooks() }
        }
    }
}

@MainActor
enum DefaultApp {
    /// The type the system gives `.ipynb` files: ours (`org.jupyter.ipynb`)
    /// unless another installed app exports a different one.
    static var notebookType: UTType {
        UTType(filenameExtension: "ipynb") ?? .jupyterNotebook
    }

    static func claimNotebooks() async {
        let alert = NSAlert()
        do {
            try await NSWorkspace.shared.setDefaultApplication(
                at: Bundle.main.bundleURL, toOpen: notebookType
            )
            alert.messageText = "Ganymede now opens notebooks"
            alert.informativeText = "Double-click an .ipynb file in the Finder to open it here."
        } catch {
            alert.alertStyle = .warning
            alert.messageText = "Ganymede couldn’t become the default app for notebooks"
            alert.informativeText = error.localizedDescription
                + "\n\nIn the Finder, choose File > Get Info on a notebook, pick Ganymede under "
                + "Open with, and click Change All."
        }
        alert.runModal()
    }
}
#endif

#if os(macOS)
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        AppModel.shared.adoptLoginShellPath()
        // A page's Settings, Keyboard Shortcuts or Connect (#332).
        SettingsOpener.listen()
        // Files opened from the Finder (double-click, Open With, the Dock)
        // come as an Open Documents Apple Event, and the app takes it
        // itself. With SwiftUI's lifecycle, AppKit's handler sends it to
        // SwiftUI's own delegate, which did not pass it on to this one's
        // `application(_:open:)`: the app came forward and the notebook
        // never opened (#228, #266). Installed here, before launch
        // finishes, this replaces AppKit's handler, and also gets the
        // files the app was launched to open.
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(openDocuments(_:withReply:)),
            forEventClass: AEEventClass(kCoreEventClass),
            andEventID: AEEventID(kAEOpenDocuments)
        )
        // `ganymede://` URLs (#303), the same way, so one the app was
        // launched to open is not lost either.
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(getURL(_:withReply:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    @objc private func getURL(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        guard let url = AppURLHandler.url(in: event) else { return }
        // A Shortcut a cell ran, calling back (ganymede-device#40).
        if KernelHost.shortcuts.handle(url) { return }
        AppURLHandler.handle(url)
    }

    /// The Open Documents event's files, for the notebook windows to open
    /// (`OpenRequests`).
    @objc private func openDocuments(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        let urls = OpenRequests.fileURLs(in: event)
        OpenLog.log.notice("open documents: \(urls.map(\.path).joined(separator: ", "), privacy: .private(mask: .hash))")
        AppModel.shared.openRequests.add(urls)
    }

    /// Set while the app quits, so windows closing then open no other.
    private var quitting = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Release builds look for a newer release once a day (#411).
        AppUpdater.shared.start()
        // Check this Mac's servers at start, including restarting a
        // background server whose version differs from the bundled tool (#912).
        AppModel.shared.refreshThisMac()
        // Keep the menu bar's server status and running kernels list fresh (#924).
        AppModel.shared.menuBar.start { AppModel.shared.activeKernelEndpoints }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(windowWillClose(_:)),
            name: NSWindow.willCloseNotification,
            object: nil
        )
        // Windows the system restores have come back by now (#247). Files
        // the app was launched to open can come after this method (seen on
        // a Mac, #266), so they count as opened at launch until then too:
        // the window the app opened on nothing shows the first, instead of
        // staying beside it as a stray tab.
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            WorkspaceTabs.launching = false
            AppModel.shared.openRequests.finishLaunching()
            // Asked once, after the windows are up (#318).
            CrashReportsPrompt.askIfNeeded()
            // Files changed, moved or deleted while the app was away (#305),
            // unless becoming active already checked.
            SpotlightSettings.shared.syncIfStale()
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(didBecomeActive(_:)),
            name: NSApplication.didBecomeActiveNotification,
            object: nil
        )
    }

    /// Back in front: notebooks may have changed, moved or gone meanwhile,
    /// so Spotlight's entries are checked again (#305).
    @objc private func didBecomeActive(_ notification: Notification) {
        SpotlightSettings.shared.syncIfStale()
        AppModel.shared.menuBar.refreshNow()
    }

    /// A Spotlight result (#305): its notebook opens in a window.
    func application(
        _ application: NSApplication,
        continue userActivity: NSUserActivity,
        restorationHandler: @escaping ([any NSUserActivityRestoring]) -> Void
    ) -> Bool {
        SpotlightSettings.shared.open(userActivity) { url in
            NSApp.activate()
            AppModel.shared.openRequests.add([url])
        }
    }

    /// The last notebook, text file or terminal tab closed: a new window
    /// on its folder shows the start screen (#407). Closing the start
    /// screen itself leaves the app with no window (#416); the Dock icon
    /// or File › New Tab opens one.
    @objc private func windowWillClose(_ notification: Notification) {
        guard let window = notification.object as? NSWindow,
              case .some(let folder) = WorkspaceTabs.windows.closing(window),
              !quitting
        else { return }
        // Once it has gone, and if no other window opened meanwhile.
        DispatchQueue.main.async { [self] in
            guard !quitting, !WorkspaceTabs.anyOpen else { return }
            WorkspaceTabs.openStart(folder: folder ?? AppModel.shared.root)
        }
    }

    /// Asks to save notebooks and text files with unsaved edits first.
    /// Then stops the server off the main thread, so the app's own kernels
    /// can answer their shutdown (ganymede#266).
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        quitting = true
        Task { @MainActor in
            var quit = true
            if PageDocument.hasUnsaved || EditorDocument.hasUnsaved {
                quit = await PageDocument.confirmQuit()
                if quit { quit = await EditorDocument.confirmQuit() }
            }
            if !quit {
                quitting = false
                // Windows saved and closed during the prompts opened no
                // start window; if none is left, open one now (#416).
                if !WorkspaceTabs.anyOpen { WorkspaceTabs.openStart(folder: AppModel.shared.root) }
            } else {
                await AppModel.shared.stopServer()
            }
            sender.reply(toApplicationShouldTerminate: quit)
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.menuBar.stop()
        AppModel.shared.stopForQuit()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        WorkspaceTabs.quitsAfterLastTab
    }
}
#endif
