#if os(macOS)
import SwiftUI

/// Where a terminal window's shell runs.
enum TerminalTarget: Codable, Hashable {
    /// The app's own server, on this Mac, starting in `folder` (the
    /// default folder when nil).
    case local(folder: URL?)
    /// A remote's server, from Settings.
    case server(UUID)
    /// A remote over SSH, with /usr/bin/ssh.
    case ssh(UUID)
}

/// What a terminal window is opened with. `openWindow` brings a window
/// whose value equals the one asked for to the front instead of opening
/// another, so each request has its own id.
struct TerminalRequest: Codable, Hashable {
    var id = UUID()
    var target: TerminalTarget
}

/// The folder of the focused notebook window: its notebook's folder, or
/// the folder it shows. New Terminal starts there.
struct WindowFolderKey: FocusedValueKey {
    typealias Value = URL
}

extension FocusedValues {
    var windowFolder: URL? {
        get { self[WindowFolderKey.self] }
        set { self[WindowFolderKey.self] = newValue }
    }
}

/// A terminal window: a shell on the chosen server, through
/// `/api/terminals`, or on a remote over SSH. Closing the window ends the
/// shell.
struct TerminalWindow: View {
    @EnvironmentObject private var model: AppModel
    let target: TerminalTarget
    @State private var transport: TerminalTransport?
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

    /// The transport for the target, once what it needs is known.
    private func makeTransport() -> TerminalTransport? {
        switch target {
        case .local(let folder):
            guard let endpoint = model.localServer else { return nil }
            // The server is rooted at `/`, so an absolute path is the cwd.
            return JupyterTerminalTransport(endpoint: endpoint, cwd: (folder ?? model.root).path)
        case .server(let id):
            guard let endpoint = model.server(of: id) else { return nil }
            return JupyterTerminalTransport(endpoint: endpoint)
        case .ssh(let id):
            guard let ssh = model.remote(id)?.ssh else { return nil }
            return ProcessTerminalTransport(executable: "/usr/bin/ssh", arguments: ssh.arguments)
        }
    }

    private var defaultTitle: String {
        switch target {
        case .local(let folder): "Terminal in \((folder ?? model.root).lastPathComponent)"
        case .server(let id): "Terminal on \(model.remote(id)?.title ?? "remote")"
        case .ssh(let id): "SSH to \(model.remote(id)?.title ?? "remote")"
        }
    }

    private var problem: String? {
        switch target {
        case .local: model.error.map { "Ganymede could not start: \($0)" }
        case .server(let id): model.remote(id)?.hasServer != true ? "This remote is gone or has no server. Check Settings (⌘,)." : nil
        case .ssh(let id): model.remote(id)?.ssh == nil ? "This remote is gone or has no SSH host. Check Settings (⌘,)." : nil
        }
    }

    /// Opens the terminal once its server is known. Only once: a window
    /// keeps its shell even if the server restarts under it, and shows
    /// the session ending instead.
    private func connect() {
        guard transport == nil, problem == nil else { return }
        transport = makeTransport()
    }
}

/// File > New Terminal and New Terminal On, for the window scene that
/// `GanymedeApp` declares.
struct TerminalCommands: View {
    @Environment(\.openWindow) private var openWindow
    @ObservedObject var model: AppModel
    @FocusedValue(\.windowFolder) private var folder

    var body: some View {
        Button("New Terminal") {
            open(.local(folder: folder ?? model.root))
        }
        .keyboardShortcut("`", modifiers: [.control, .shift])
        // One item per way in: a remote with both a server and SSH gets two.
        Menu("New Terminal On") {
            ForEach(model.remotes) { remote in
                if remote.ssh != nil {
                    Button("\(remote.title) (SSH)") {
                        open(.ssh(remote.id))
                    }
                }
                if remote.hasServer {
                    Button("\(remote.title) (Server)") {
                        open(.server(remote.id))
                    }
                }
            }
        }
        .disabled(!model.remotes.contains { $0.hasServer || $0.ssh != nil })
    }

    private func open(_ target: TerminalTarget) {
        openWindow(value: TerminalRequest(target: target))
    }
}
#endif
