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
                FillCommands()
                CommandPaletteCommand()
                Divider()
                CodeFontSizeCommands()
            }
            CommandGroup(replacing: .newItem) {
                NewCommands(model: model)
            }
            CommandGroup(replacing: .saveItem) {
                CloseCommand()
                SaveCommand()
                RenameCommand()
                DownloadCommand()
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
            CommandGroup(after: .appSettings) {
                // Tabs of the one Settings window (#206, #332).
                Button("Agent Settings…") {
                    SettingsOpener.show(.agent)
                }
                .keyboardShortcut(",", modifiers: [.command, .option])
                DefaultAppCommand()
            }
            CommandGroup(replacing: .help) {
                Button("Keyboard Shortcuts") {
                    SettingsOpener.show(.shortcuts)
                }
            }
        }
        // Terminals and text files open as tabs of the front window (#247).
        WindowGroup("Terminal", for: TerminalRequest.self) { $request in
            TerminalWindow(target: request?.target ?? .local(folder: nil))
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
        Settings {
            SettingsWindow()
                .environment(model)
        }
    }
    #else
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(model)
                .crashReportsPrompt()
        }
        // Holding ⌘ lists them, and the iPadOS menu bar shows them (#208).
        .commands { IPadCommands() }
        WindowGroup("Terminal", for: TerminalRequest.self) { $request in
            TerminalScene(request: request)
                .environment(model)
        }
        WindowGroup("Editor", for: EditorRequest.self) { $request in
            EditorScene(request: request)
        }
    }
    #endif
}

#if os(macOS)
/// File > Open… and Open Folder…, each into a new tab of the front window.
struct OpenCommands: View {
    @Environment(\.openWindow) private var openWindow
    var model: AppModel
    private let recents = Recents.shared

    var body: some View {
        Button("Open…") {
            for url in model.chooseNotebooks() {
                openWindow(value: WindowTarget(opening: url))
            }
        }
        .keyboardShortcut("o")
        Menu("Open Recent") {
            ForEach(recents.urls, id: \.self) { url in
                Button(url.lastPathComponent) {
                    openWindow(value: WindowTarget(opening: url))
                }
            }
            Divider()
            Button("Clear Menu") { recents.clear() }
                .disabled(recents.urls.isEmpty)
        }
        Button("Open Folder…") {
            if let folder = model.chooseFolder() {
                openWindow(value: WindowTarget.folder(folder.standardizedFileURL))
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
    }

    /// The Open Documents event's files, for the notebook windows to open
    /// (`OpenRequests`).
    @objc private func openDocuments(_ event: NSAppleEventDescriptor, withReply reply: NSAppleEventDescriptor) {
        let urls = OpenRequests.fileURLs(in: event)
        OpenLog.log.notice("open documents: \(urls.map(\.path).joined(separator: ", "), privacy: .private(mask: .hash))")
        AppModel.shared.openRequests.add(urls)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
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
        }
    }

    /// Asks to save notebooks and text files with unsaved edits first.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard PageDocument.hasUnsaved || EditorDocument.hasUnsaved else { return .terminateNow }
        Task { @MainActor in
            var quit = await PageDocument.confirmQuit()
            if quit { quit = await EditorDocument.confirmQuit() }
            sender.reply(toApplicationShouldTerminate: quit)
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.stopForQuit()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        WorkspaceTabs.quitsAfterLastTab
    }
}
#endif
