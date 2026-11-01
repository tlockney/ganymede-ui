import SwiftUI

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
        window
            .commands {
                CommandGroup(after: .newItem) {
                    Button("Open Folder…") { model.chooseFolder() }
                        .keyboardShortcut("o", modifiers: [.command, .shift])
                    Divider()
                    TerminalCommands(model: model)
                }
                CommandGroup(replacing: .help) {
                    Button("Keyboard Shortcuts") {
                        NotificationCenter.default.post(name: .showShortcuts, object: nil)
                    }
                }
            }
        WindowGroup("Terminal", for: TerminalTarget.self) { $target in
            TerminalWindow(target: target ?? .local)
                .environmentObject(model)
        }
        Settings {
            RemotesView()
                .environmentObject(model)
                .frame(width: 460)
                .padding()
        }
    }
    #else
    var body: some Scene {
        window
    }
    #endif

    private var window: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}

#if os(macOS)
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        AppModel.shared.adoptLoginShellPath()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.stopForQuit()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
#endif
