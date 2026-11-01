import SwiftUI
#if os(macOS)
import UniformTypeIdentifiers
#endif

@main
struct GanymedeApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    @StateObject private var model = AppModel.shared

    // Separate bodies, since a `#if` inside a scene builder that starts
    // with a postfix member chain does not parse.
    #if os(macOS)
    var body: some Scene {
        // One window per notebook or folder (`WindowTarget`); none shows
        // the last folder. Opening one that is already open brings it front.
        WindowGroup(for: WindowTarget.self) { $target in
            ContentView(target: $target)
                .environmentObject(model)
        }
        .commands {
            CommandGroup(replacing: .saveItem) {
                SaveCommand()
            }
            CommandGroup(after: .newItem) {
                OpenCommands(model: model)
                Divider()
                TerminalCommands(model: model)
            }
            CommandGroup(after: .appSettings) {
                DefaultAppCommand()
            }
            CommandGroup(replacing: .help) {
                Button("Keyboard Shortcuts") {
                    NotificationCenter.default.post(name: .showShortcuts, object: nil)
                }
            }
        }
        WindowGroup("Terminal", for: TerminalRequest.self) { $request in
            TerminalWindow(target: request?.target ?? .local(folder: nil))
                .environmentObject(model)
        }
        // Files opened from the Finder go to notebook windows only.
        .handlesExternalEvents(matching: [])
        Settings {
            RemotesView()
                .environmentObject(model)
                .frame(width: 460)
                .padding()
        }
    }
    #else
    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
    #endif
}

#if os(macOS)
/// File > Open… and Open Folder…, each into its own window.
struct OpenCommands: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel
    @ObservedObject private var recents = Recents.shared

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
    }

    /// Asks to save notebooks with unsaved edits first.
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard PageDocument.hasUnsaved else { return .terminateNow }
        Task { @MainActor in
            sender.reply(toApplicationShouldTerminate: await PageDocument.confirmQuit())
        }
        return .terminateLater
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.stopForQuit()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
#endif
