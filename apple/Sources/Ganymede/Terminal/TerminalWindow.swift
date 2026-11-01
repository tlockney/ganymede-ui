#if os(macOS)
import SwiftUI

/// Where a terminal window's shell runs.
enum TerminalTarget: Codable, Hashable {
    /// The app's own server, on this Mac.
    case local
    /// A remote's server, from Settings.
    case server(UUID)
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
        case .server(let id): model.server(of: id)
        }
    }

    private var defaultTitle: String {
        switch target {
        case .local: "Terminal"
        case .server(let id): "Terminal on \(model.remote(id)?.title ?? "remote")"
        }
    }

    private var problem: String? {
        switch target {
        case .local: model.error.map { "Ganymede could not start: \($0)" }
        case .server(let id): model.server(of: id) == nil ? "This remote is gone or has no server. Check Settings (⌘,)." : nil
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

/// File > New Terminal and New Terminal On, for the window scene that
/// `GanymedeApp` declares.
struct TerminalCommands: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel

    var body: some View {
        Button("New Terminal") {
            openWindow(value: TerminalTarget.local)
        }
        .keyboardShortcut("`", modifiers: [.control, .shift])
        Menu("New Terminal On") {
            ForEach(model.remotes.filter(\.hasServer)) { remote in
                Button(remote.title) {
                    openWindow(value: TerminalTarget.server(remote.id))
                }
            }
        }
        .disabled(!model.remotes.contains(where: \.hasServer))
    }
}
#endif
