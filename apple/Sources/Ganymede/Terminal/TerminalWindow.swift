import SwiftUI

/// Where a terminal window's shell runs.
enum TerminalTarget: Codable, Hashable {
    /// The app's own server, on this Mac, starting in `folder` (the
    /// default folder when nil). The iOS server has no terminals.
    case local(folder: URL?)
    /// A remote's server, from Settings.
    case server(UUID)
    /// A remote over SSH: /usr/bin/ssh on the Mac, swift-nio-ssh on iOS.
    case ssh(UUID)
}

/// What a terminal window is opened with. `openWindow` brings a window
/// whose value equals the one asked for to the front instead of opening
/// another, so each request has its own id.
struct TerminalRequest: Codable, Hashable, Identifiable {
    var id = UUID()
    var target: TerminalTarget
}

#if os(macOS)
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
#endif

/// A terminal window: a shell on the chosen server, through
/// `/api/terminals`, or on a remote over SSH. Closing the window ends the
/// shell. When the session ends (on iOS, also when the system drops the
/// connection in the background) it offers to reconnect.
struct TerminalWindow: View {
    @EnvironmentObject private var model: AppModel
    let target: TerminalTarget
    @State private var transport: TerminalTransport?
    @State private var title = ""
    /// Why the session ended, once it has.
    @State private var ended: String?
    /// Bumped on reconnect, so the terminal view is made anew.
    @State private var generation = 0

    var body: some View {
        VStack(spacing: 0) {
            if let transport {
                TerminalSurface(transport: transport, onTitle: { title = $0 }, onEnd: { ended = $0 ?? "Session ended." })
                    .id(generation)
            } else if let problem {
                Text(problem)
                    .foregroundStyle(.secondary)
                    .padding()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            if let ended, transport != nil {
                HStack {
                    Text(ended)
                        .font(.callout)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                    Spacer()
                    Button("Reconnect", action: reconnect)
                }
                .padding(8)
                .background(.bar)
            }
        }
        #if os(macOS)
        .frame(minWidth: 480, minHeight: 280)
        #endif
        .navigationTitle(title.isEmpty ? defaultTitle : title)
        .onAppear(perform: connect)
        .onChange(of: model.url) { _ in connect() }
    }

    private func reconnect() {
        // Say why when what the session needs is gone (the key, the user,
        // or the remote itself).
        if let problem {
            ended = problem
            return
        }
        guard let next = makeTransport() else { return }
        ended = nil
        title = ""
        generation += 1
        transport = next
    }

    /// The transport for the target, once what it needs is known.
    private func makeTransport() -> TerminalTransport? {
        switch target {
        case .local(let folder):
            #if os(iOS)
            return nil
            #else
            guard let endpoint = model.localServer else { return nil }
            // The server is rooted at `/`, so an absolute path is the cwd.
            return JupyterTerminalTransport(endpoint: endpoint, cwd: (folder ?? model.root).path)
            #endif
        case .server(let id):
            guard let endpoint = model.server(of: id) else { return nil }
            return JupyterTerminalTransport(endpoint: endpoint)
        case .ssh(let id):
            guard let ssh = model.remote(id)?.ssh else { return nil }
            #if os(macOS)
            return ProcessTerminalTransport(executable: "/usr/bin/ssh", arguments: ssh.arguments)
            #else
            guard let key = model.sshKey, !ssh.user.isEmpty else { return nil }
            return SSHTerminalTransport(
                target: .init(remote: id, host: ssh.host, port: ssh.port ?? 22, user: ssh.user),
                key: key,
                hostKeys: model.hostKeys
            )
            #endif
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
        case .local:
            #if os(iOS)
            return "This device has no local terminal."
            #else
            return model.error.map { "Ganymede could not start: \($0)" }
            #endif
        case .server(let id):
            return model.remote(id)?.hasServer != true ? "This remote is gone or has no server. \(settings)" : nil
        case .ssh(let id):
            guard let ssh = model.remote(id)?.ssh else {
                return "This remote is gone or has no SSH host. \(settings)"
            }
            #if os(iOS)
            if ssh.user.isEmpty { return "Set the SSH user for this remote. \(settings)" }
            if model.sshKey == nil { return "Generate or import an SSH key first. \(settings)" }
            #else
            _ = ssh
            #endif
            return nil
        }
    }

    private var settings: String {
        #if os(macOS)
        "Check Settings (⌘,)."
        #else
        "Check Remotes."
        #endif
    }

    /// Opens the terminal once its server is known. Only once: a window
    /// keeps its shell even if the server restarts under it, and shows
    /// the session ending instead.
    private func connect() {
        guard transport == nil, problem == nil else { return }
        transport = makeTransport()
    }
}

#if os(iOS)
/// The toolbar's terminal menu: each remote with SSH or a server.
struct TerminalMenu: View {
    @ObservedObject var model: AppModel
    let open: (TerminalRequest) -> Void

    var body: some View {
        Menu {
            ForEach(model.remotes) { remote in
                if remote.ssh != nil {
                    Button("\(remote.title) (SSH)") { open(TerminalRequest(target: .ssh(remote.id))) }
                }
                if remote.hasServer {
                    Button("\(remote.title) (Server)") { open(TerminalRequest(target: .server(remote.id))) }
                }
            }
        } label: {
            Label("Terminal", systemImage: "terminal")
        }
        .disabled(!model.remotes.contains { $0.hasServer || $0.ssh != nil })
    }
}

/// A terminal scene of its own on iPad.
struct TerminalScene: View {
    @EnvironmentObject private var model: AppModel
    let request: TerminalRequest?

    var body: some View {
        NavigationStack {
            if let request {
                TerminalWindow(target: request.target)
                    .navigationBarTitleDisplayMode(.inline)
            } else {
                Text("This terminal was closed.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}
#endif

#if os(macOS)
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
