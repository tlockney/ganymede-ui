import SwiftUI

@main
struct GanymedeApp: App {
    #if os(macOS)
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    #endif
    @StateObject private var model = AppModel.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
        #if os(macOS)
        .commands {
            CommandGroup(after: .newItem) {
                Button("Open Folder…") { model.chooseFolder() }
                    .keyboardShortcut("o", modifiers: [.command, .shift])
            }
        }
        Settings {
            KernelServerView()
                .environmentObject(model)
                .frame(width: 460)
                .padding()
        }
        #endif
    }
}

#if os(macOS)
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationWillFinishLaunching(_ notification: Notification) {
        LoginShell.adoptPath()
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.stop()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }
}
#endif
