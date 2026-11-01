#if os(macOS)
import SwiftUI

/// Where a terminal window's shell runs.
enum TerminalTarget: String, Codable, Hashable {
    /// The app's own server, on this Mac.
    case local
    /// The kernel server set in Settings.
    case kernelServer
}

/// A terminal window: a shell on the chosen server, through
/// `/api/terminals`. Closing the window ends the shell.
struct TerminalWindow: View {
    @EnvironmentObject private var model: AppModel
    let target: TerminalTarget
    @State private var transport: JupyterTerminalTransport?
    @State private var title = ""

    var body: some View {
        Group {
            if let transport {
                TerminalSurface(transport: transport) { title = $0 }
            } else if let problem {
                Text(problem)
                    .foregroundStyle(.secondary)
                    .padding()
            } else {
                ProgressView()
            }
        }
        .frame(minWidth: 480, minHeight: 280)
        .navigationTitle(title.isEmpty ? defaultTitle : title)
        .onAppear(perform: connect)
        .onChange(of: model.url) { _ in connect() }
    }

    private var endpoint: ServerEndpoint? {
        switch target {
        case .local: model.localServer
        case .kernelServer: model.kernelServer
        }
    }

    private var defaultTitle: String {
        switch target {
        case .local: "Terminal"
        case .kernelServer: "Terminal on \(model.kernelServer?.base.host ?? "kernel server")"
        }
    }

    private var problem: String? {
        switch target {
        case .local: model.error.map { "Ganymede could not start: \($0)" }
        case .kernelServer: model.kernelServer == nil ? "No kernel server is set. Add one in Settings (⌘,)." : nil
        }
    }

    /// Opens the terminal once its server is known. Only once: a window
    /// keeps its shell even if the server restarts under it, and shows
    /// the session ending instead.
    private func connect() {
        guard transport == nil, let endpoint else { return }
        transport = JupyterTerminalTransport(endpoint: endpoint)
    }
}

/// File > New Terminal, for the window scene that `GanymedeApp` declares.
struct TerminalCommands: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel

    var body: some View {
        Button("New Terminal") {
            openWindow(value: TerminalTarget.local)
        }
        .keyboardShortcut("`", modifiers: [.control, .shift])
        Button("New Terminal on Kernel Server") {
            openWindow(value: TerminalTarget.kernelServer)
        }
        .disabled(model.kernelServer == nil)
    }
}
#endif
