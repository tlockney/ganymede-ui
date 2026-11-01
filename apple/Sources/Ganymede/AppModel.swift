import Foundation
#if os(macOS)
import AppKit
#endif

/// Owns the server for the chosen notebook folder.
@MainActor
final class AppModel: ObservableObject {
    static let shared = AppModel()

    @Published private(set) var url: URL?
    @Published private(set) var error: String?
    @Published private(set) var root: URL
    /// Other machines: servers for kernels and terminals, SSH for shells.
    @Published private(set) var remotes: [Remote]
    /// The remote kernels run on; nil for this device.
    @Published private(set) var kernelRemoteID: UUID?
    /// Set when a token or the remotes could not be saved; the page shows
    /// it in an alert.
    @Published var keychainError: String?
    private let store: RemoteStore
    /// Tokens the keychain refused to store, used until the app quits.
    private var unsavedTokens: [UUID: String] = [:]

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
        let store = RemoteStore(defaults: .standard, secrets: KeychainStore())
        let saved = store.load()
        self.store = store
        remotes = saved.remotes
        kernelRemoteID = saved.kernels
        keychainError = saved.problem
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
        error = nil
        guard let web = Bundle.main.url(forResource: "web", withExtension: nil) else {
            error = "The app bundle has no web folder; build it with apple/scripts/bootstrap.sh."
            return
        }
        var config: [String: any Sendable] = [
            "root_dir": root.path,
            "static_dir": web.path,
            "quiet": true,
        ]
        if let remote = kernelRemote {
            config["gateway_url"] = remote.serverURL
            config["gateway_token"] = token(for: remote.id)
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
        let kernels = kernelRemote == nil ? "page" : "server"
        #else
        let kernels = "server"
        #endif
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        parts.queryItems = (parts.queryItems ?? []) + [URLQueryItem(name: "kernels", value: kernels)]
        return parts.url ?? url
    }

    /// The app's own server, for clients other than the page (terminals).
    var localServer: ServerEndpoint? {
        server.flatMap { ServerEndpoint(serverURL: $0.url) }
    }

    /// The remote kernels run on, if one is chosen.
    var kernelRemote: Remote? {
        remotes.first { $0.id == kernelRemoteID && $0.hasServer }
    }

    func remote(_ id: UUID) -> Remote? {
        remotes.first { $0.id == id }
    }

    /// A remote's server, for terminals, if it has one.
    func server(of id: UUID) -> ServerEndpoint? {
        guard let remote = remote(id), remote.hasServer else { return nil }
        return ServerEndpoint(string: remote.serverURL, token: token(for: id))
    }

    func token(for id: UUID) -> String {
        unsavedTokens[id] ?? store.token(for: id)
    }

    /// Stops the server as the app quits, shutting down every kernel.
    /// Blocks: the process ends right after. A start still under way is
    /// not waited for; its server ends with the process.
    func stopForQuit() {
        server?.stop()
        server = nil
        url = nil
    }

    /// Serves another folder. Kernels of the current one are shut down.
    func open(folder: URL) {
        #if os(macOS)
        defaults.set(folder.path, forKey: Keys.root)
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
        #endif
        root = folder
        start()
    }

    /// Adds `remote`, or replaces the one with its id. `token` replaces
    /// the server's token unless nil. Restarts the server if kernels run
    /// on this remote and its server changed.
    func save(_ remote: Remote, token: String?) {
        var remote = remote
        remote.name = remote.name.trimmingCharacters(in: .whitespaces)
        remote.serverURL = remote.serverURL.trimmingCharacters(in: .whitespaces)
        let oldURL = self.remote(remote.id)?.serverURL
        let oldToken = self.token(for: remote.id)
        let newToken = remote.hasServer ? (token ?? oldToken) : ""
        if let index = remotes.firstIndex(where: { $0.id == remote.id }) {
            remotes[index] = remote
        } else {
            remotes.append(remote)
        }
        if newToken != oldToken {
            do {
                try store.setToken(newToken, for: remote.id)
                unsavedTokens[remote.id] = nil
            } catch {
                unsavedTokens[remote.id] = newToken
                keychainError = "Ganymede uses the token for \(remote.title) until it quits, but could "
                    + "not save it in the keychain: " + error.localizedDescription
            }
        }
        var restart = false
        if kernelRemoteID == remote.id {
            // Kernels move to this device when the remote loses its server.
            if !remote.hasServer { kernelRemoteID = nil }
            restart = oldURL != remote.serverURL || newToken != oldToken
        }
        persist()
        if restart { start() }
    }

    /// Removes a remote and its token. Kernels move to this device if they
    /// ran there.
    func delete(remote id: UUID) {
        remotes.removeAll { $0.id == id }
        unsavedTokens[id] = nil
        do {
            try store.setToken("", for: id)
        } catch {
            keychainError = "Its token could not be removed from the keychain: " + error.localizedDescription
        }
        let restart = kernelRemoteID == id
        if restart { kernelRemoteID = nil }
        persist()
        if restart { start() }
    }

    /// Runs kernels on the remote's server, or on this device when nil.
    /// Restarts the server.
    func useForKernels(_ id: UUID?) {
        let id = id.flatMap { self.remote($0)?.hasServer == true ? $0 : nil }
        guard id != kernelRemoteID else { return }
        kernelRemoteID = id
        persist()
        start()
    }

    private func persist() {
        do {
            try store.save(remotes, kernels: kernelRemoteID)
        } catch {
            keychainError = "The remotes could not be saved: " + error.localizedDescription
        }
    }

    #if os(macOS)
    func chooseFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.directoryURL = root
        panel.prompt = "Open"
        panel.message = "Choose the folder of notebooks to work in. Running kernels will be shut down."
        if panel.runModal() == .OK, let folder = panel.url {
            open(folder: folder)
        }
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
    }
}
