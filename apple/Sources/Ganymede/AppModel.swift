import Foundation
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

/// Owns the app's server. On macOS one server, rooted at `/`, serves
/// every window: each opens a notebook or folder by its absolute path
/// (`WindowTarget`), so opening a file anywhere needs no restart and the
/// page keeps one origin. On iOS it serves the chosen notebook folder.
@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    /// The page for the default window (iOS, and terminals' restarts).
    @Published private(set) var url: URL?
    /// The URL the server printed, with its token; windows build their
    /// page from it.
    @Published private(set) var serverURL: URL?
    @Published private(set) var error: String?
    /// The notebook folder: on macOS the last folder opened, which a window
    /// opened on nothing shows; on iOS the folder the server serves.
    @Published private(set) var root: URL
    /// The Jupyter server kernels run on; empty for this device's own.
    @Published private(set) var kernelServerURL: String
    private(set) var kernelServerToken: String
    /// Set when the kernel server's token could not be kept in the
    /// keychain; the page shows it in an alert.
    @Published var keychainError: String?

    private var server: ServerHost?
    /// Server starts and stops, run one after another. Both block (a start
    /// until the server listens, a stop until its kernels are shut down),
    /// so they run off the main actor and only their results come back.
    private var queue: Task<Void, Never>?
    private var queued = 0
    #if os(macOS)
    /// The login shell's PATH, which kernels need before the server starts.
    private var pathReady: Task<Void, Never>?
    #endif
    private let defaults = UserDefaults.standard
    #if os(iOS)
    /// A folder from the picker, readable only while its security scope
    /// is held.
    private var scoped: URL?
    #endif

    private init() {
        kernelServerURL = UserDefaults.standard.string(forKey: Keys.kernelServer) ?? ""
        kernelServerToken = Keychain.get(Keys.kernelServer) ?? ""
        #if os(macOS)
        if let path = UserDefaults.standard.string(forKey: Keys.root),
           FileManager.default.fileExists(atPath: path) {
            root = URL(fileURLWithPath: path, isDirectory: true)
        } else {
            root = FileManager.default.homeDirectoryForCurrentUser
        }
        #else
        // A picked folder is kept as a bookmark, since its path can change
        // between launches; the app's Documents folder otherwise, which
        // the Files app shows under On My iPad.
        var stale = false
        if let bookmark = UserDefaults.standard.data(forKey: Keys.bookmark),
           let folder = try? URL(resolvingBookmarkData: bookmark, bookmarkDataIsStale: &stale),
           folder.startAccessingSecurityScopedResource() {
            root = folder
            scoped = folder
        } else {
            root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        }
        #endif
    }

    #if os(macOS)
    /// Takes PATH from the login shell in the background (see LoginShell);
    /// servers wait for it.
    func adoptLoginShellPath() {
        pathReady = Task.detached(priority: .userInitiated) { LoginShell.adoptPath() }
    }
    #endif

    /// Starts the server unless it is running or about to.
    func startIfNeeded() {
        if server == nil && error == nil && queued == 0 {
            start()
        }
    }

    /// (Re)starts the server. Returns at once: `url` is set when it
    /// listens, `error` if it fails.
    func start() {
        url = nil
        serverURL = nil
        error = nil
        guard let web = Bundle.main.url(forResource: "web", withExtension: nil) else {
            error = "The app bundle has no web folder; build it with apple/scripts/bootstrap.sh."
            return
        }
        var config: [String: any Sendable] = [
            "root_dir": Self.serverRoot(root),
            "static_dir": web.path,
            "quiet": true,
        ]
        if !kernelServerURL.isEmpty {
            config["gateway_url"] = kernelServerURL
            config["gateway_token"] = kernelServerToken
        }
        #if os(iOS)
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) {
            config["cookie_secret_file"] = support.appendingPathComponent("cookie_secret").path
        }
        #endif
        let settings = config
        #if os(macOS)
        let path = pathReady
        #endif
        enqueue { [self] in
            #if os(macOS)
            await path?.value
            #endif
            let old = server
            server = nil
            // The same port as last time keeps the page's origin, and with
            // it the web app's saved state in local storage.
            let saved = defaults.integer(forKey: Keys.port)
            let result = await Task.detached(priority: .userInitiated) {
                old?.stop()
                return Result { try AppModel.launch(settings, saved) }
            }.value
            switch result {
            case .success(let host):
                server = host
                serverURL = host.url
                url = pageURL(host.url)
                if let port = host.url.port {
                    defaults.set(port, forKey: Keys.port)
                }
            case .failure(let failure):
                error = failure.localizedDescription
            }
        }
    }

    /// Starts a server on `saved`, or any free port when that one is taken.
    private nonisolated static func launch(
        _ config: [String: any Sendable], _ saved: Int
    ) throws -> ServerHost {
        if saved > 0, let host = try? ServerHost(config: config.merging(["port": saved]) { $1 }) {
            return host
        }
        return try ServerHost(config: config.merging(["port": 0]) { $1 })
    }

    /// Runs `work` after whatever start is already queued.
    private func enqueue(_ work: @escaping @MainActor @Sendable () async -> Void) {
        let previous = queue
        queued += 1
        queue = Task { [self] in
            await previous?.value
            await work()
            queued -= 1
        }
    }

    /// The page to open, saying where kernels run: the page remembers its
    /// last connection, so it is told every time. iOS can't launch kernel
    /// processes, so without a kernel server the page runs its own
    /// (cdp-kernel's TypeScript kernel in a Worker) and keeps notebooks on
    /// the server.
    private func pageURL(_ url: URL) -> URL {
        #if os(iOS)
        let kernels = kernelServerURL.isEmpty ? "page" : "server"
        #else
        let kernels = "server"
        #endif
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        parts.queryItems = (parts.queryItems ?? []) + [URLQueryItem(name: "kernels", value: kernels)]
        return parts.url ?? url
    }

    /// What the server serves: everything on macOS, where windows open
    /// files by absolute path; the notebook folder on iOS.
    private static func serverRoot(_ folder: URL) -> String {
        #if os(macOS)
        return "/"
        #else
        return folder.path
        #endif
    }

    #if os(macOS)
    /// The page a window loads for `target`, or for the last folder when
    /// it has none; nil until the server listens.
    func page(for target: WindowTarget?) -> URL? {
        guard let serverURL else { return nil }
        return (target ?? .folder(root)).pageURL(server: serverURL, kernels: "server")
    }
    #endif

    /// The app's own server, for clients other than the page (terminals).
    var localServer: ServerEndpoint? {
        server.flatMap { ServerEndpoint(serverURL: $0.url) }
    }

    /// The kernel server from Settings, if one is set.
    var kernelServer: ServerEndpoint? {
        ServerEndpoint(string: kernelServerURL, token: kernelServerToken)
    }

    /// Stops the server as the app quits, shutting down every kernel.
    /// Blocks: the process ends right after. A start still under way is
    /// not waited for; its server ends with the process.
    func stopForQuit() {
        server?.stop()
        server = nil
        url = nil
        serverURL = nil
    }

    /// Makes `folder` the notebook folder. On macOS that is only the folder
    /// a window opened on nothing shows (the server serves everything); on
    /// iOS the server restarts on it, shutting down its kernels.
    func open(folder: URL) {
        #if os(macOS)
        defaults.set(folder.path, forKey: Keys.root)
        root = folder
        #else
        guard folder.startAccessingSecurityScopedResource() else {
            error = "Ganymede was not allowed to open \(folder.lastPathComponent)."
            return
        }
        scoped?.stopAccessingSecurityScopedResource()
        scoped = folder
        if let bookmark = try? folder.bookmarkData() {
            defaults.set(bookmark, forKey: Keys.bookmark)
        }
        root = folder
        start()
        #endif
    }

    /// Runs kernels on the server at `url` (with `token`), or on this
    /// device when `url` is empty. Restarts the server.
    func setKernelServer(url: String, token: String) {
        kernelServerURL = url.trimmingCharacters(in: .whitespaces)
        kernelServerToken = kernelServerURL.isEmpty ? "" : token
        defaults.set(kernelServerURL, forKey: Keys.kernelServer)
        do {
            try Keychain.set(Keys.kernelServer, kernelServerToken)
        } catch {
            keychainError = "Ganymede uses it until it quits, but will start without it next time: "
                + error.localizedDescription
        }
        start()
    }

    #if os(macOS)
    /// File > Open Folder…: the folder to open in a window, which also
    /// becomes the default folder.
    func chooseFolder() -> URL? {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = root
        panel.prompt = "Open"
        panel.message = "Choose a folder of notebooks."
        guard panel.runModal() == .OK, let folder = panel.url else { return nil }
        open(folder: folder)
        return folder
    }

    /// File > Open…: notebooks to open, each in its own window.
    func chooseNotebooks() -> [URL] {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = true
        panel.allowedContentTypes = [.jupyterNotebook]
        panel.directoryURL = root
        guard panel.runModal() == .OK else { return [] }
        return panel.urls
    }
    #endif

    #if os(iOS)
    /// iOS may close the server's socket while the app is suspended.
    /// Back in the foreground, restart the server if it no longer answers;
    /// the port stays the same when it is free, so the page reconnects.
    func resume() async {
        guard let url = server?.url, error == nil else { return }
        var request = URLRequest(url: url.appendingPathComponent("api/status"))
        request.timeoutInterval = 2
        if (try? await URLSession.shared.data(for: request)) == nil {
            start()
        }
    }
    #endif

    private enum Keys {
        static let root = "rootFolder"
        static let bookmark = "rootFolderBookmark"
        static let port = "serverPort"
        static let kernelServer = "kernelServer"
    }
}
