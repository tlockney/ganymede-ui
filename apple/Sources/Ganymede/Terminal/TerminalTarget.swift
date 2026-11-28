import Foundation

/// Where a terminal window's shell runs.
enum TerminalTarget: Codable, Hashable {
    /// The app's own server, on this Mac, starting in `folder` (the
    /// default folder when nil). The iOS server has no terminals.
    case local(folder: URL?)
    /// A remote's server, from Settings, or the machine a window shows
    /// (#858): its shell starts in `folder`, a path on that server which the
    /// Ganymede server resolves against its root (the root when nil, or when
    /// the folder isn't there).
    case server(UUID, folder: String? = nil)
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

extension TerminalTarget {
    /// The transport a machine's terminal opens on `endpoint`, the server it
    /// runs on (#858). Its `folder` is the shell's cwd, a path on that server
    /// which the Ganymede server resolves against its root (nil is that
    /// root), so a terminal saved with a folder still opens where it did.
    /// Here, in a file the tests compile, rather than in the view, so a test
    /// sees the cwd the panel sends. Nil for any other target: this Mac's
    /// shell and SSH are not a server's.
    @MainActor
    func serverTransport(on endpoint: ServerEndpoint, session: URLSession = .shared) -> JupyterTerminalTransport? {
        guard case .server(_, let folder) = self else { return nil }
        return JupyterTerminalTransport(endpoint: endpoint, cwd: folder, session: session)
    }

    /// What runs a shell on this target, once what it needs is known (#860):
    /// a terminal on this Mac's own server, on a machine's, or over SSH. Nil
    /// while what the target needs isn't there, and on iOS for `.local`,
    /// whose server starts no shell. Here, in a file the tests compile, so a
    /// test sees which transport each target opens rather than the view.
    @MainActor
    func transport(on host: any TerminalHost, session: URLSession = .shared) -> TerminalTransport? {
        switch self {
        case .local(let folder):
            #if os(iOS)
            return nil
            #else
            guard let endpoint = host.localServer else { return nil }
            // The server is rooted at `/`, so an absolute path is the cwd.
            return JupyterTerminalTransport(endpoint: endpoint, cwd: (folder ?? host.root).path, session: session)
            #endif
        case .server(let id, _):
            // A path on the server: the Ganymede server resolves a machine's
            // relative folder against its root, and falls back to the root
            // when it isn't there (#858).
            guard let endpoint = host.server(of: id) else { return nil }
            return serverTransport(on: endpoint, session: session)
        case .ssh(let id):
            return host.sshTransport(for: id)
        }
    }
}

/// What a terminal's transport needs from the app (#860): the app's own
/// server and the remotes' it knows. Behind a protocol so a test makes its
/// own, as `ThisMacCheckWorld`'s is (`AppModel` is the app's), and sees the
/// target-to-transport switch without an app model.
@MainActor
protocol TerminalHost {
    /// The app's own server; nil before it listens. On iOS
    /// `TerminalTarget.transport(on:)` doesn't read it, since that server
    /// starts no shell. A `.local` folder is a path under `root`.
    var localServer: ServerEndpoint? { get }
    /// The folder that server serves.
    var root: URL { get }
    /// A remote's server, once its token is read: nil for a remote that is
    /// gone, or has none.
    func server(of id: UUID) -> ServerEndpoint?
    /// The transport a remote's SSH opens, which differs by platform
    /// (`/usr/bin/ssh` on the Mac, swift-nio-ssh on iOS): nil where this
    /// device can't start one.
    func sshTransport(for id: UUID) -> TerminalTransport?
}
