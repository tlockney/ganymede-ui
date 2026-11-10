import CryptoKit
import Foundation
import Observation
#if os(macOS)
import AppKit
import UniformTypeIdentifiers
#endif

/// Owns the app's server. On macOS one server, rooted at `/`, serves
/// every window: each opens a notebook or folder by its absolute path
/// (`WindowTarget`), so opening a file anywhere needs no restart and the
/// page keeps one origin. On iOS it serves the chosen notebook folder.
@MainActor
@Observable
final class AppModel {
    static let shared = AppModel()

    /// The page for the default window (iOS, and terminals' restarts).
    private(set) var url: URL?
    /// The URL the server printed, with its token; windows build their
    /// page from it.
    private(set) var serverURL: URL?
    private(set) var error: String?
    /// The notebook folder: on macOS the last folder opened, which a window
    /// opened on nothing shows; on iOS the folder the server serves.
    private(set) var root: URL
    /// Other machines: servers for kernels and terminals, SSH for shells.
    private(set) var remotes: [Remote]
    /// The remote kernels run on; nil for this device.
    private(set) var kernelRemoteID: UUID?
    /// Set when a token or the remotes could not be saved; the page shows
    /// it in an alert.
    var keychainError: String?
    private let store: RemoteStore
    /// Tokens the keychain refused to store, used until the app quits.
    @ObservationIgnored private var unsavedTokens: [UUID: String] = [:]
    /// The app's SSH key, for SSH remotes on iOS (the Mac uses its own
    /// ssh and keys).
    private(set) var sshKey: Curve25519.Signing.PrivateKey?
    private let sshKeys = SSHKeyStore(secrets: KeychainStore())
    /// Host keys trusted on first use, per remote.
    let hostKeys = HostKeyStore(defaults: .standard)

    @ObservationIgnored private var server: ServerHost?
    /// Server starts and stops, run one after another. Both block (a start
    /// until the server listens, a stop until its kernels are shut down),
    /// so they run off the main actor and only their results come back.
    @ObservationIgnored private var queue: Task<Void, Never>?
    @ObservationIgnored private var queued = 0
    #if os(macOS)
    /// Files the Finder asked to open, for the notebook windows (#228).
    let openRequests = OpenRequests()
    /// The login shell's PATH, which kernels need before the server starts.
    @ObservationIgnored private var pathReady: Task<Void, Never>?
    #endif
    private let defaults = UserDefaults.standard
    /// Where the server is started and stopped: at the QoS of its own
    /// threads (#192).
    nonisolated private static let serverQueue = DispatchQueue(label: "ganymede.server", qos: .default)
    #if os(iOS)
    /// A folder from the picker, readable only while its security scope
    /// is held.
    @ObservationIgnored private var scoped: URL?
    /// While the examples are being added to the app's folder (#463).
    @ObservationIgnored private var addingExamples = false
    /// Bumped when they were, so every window's sidebar lists again.
    private(set) var examplesCopied = 0
    #endif

    private init() {
        let store = RemoteStore(defaults: .standard, secrets: KeychainStore())
        let saved = store.load()
        self.store = store
        remotes = saved.remotes
        kernelRemoteID = saved.kernels
        keychainError = saved.problem
        sshKey = sshKeys.load()
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
            // On a Default-QoS queue, not in a task: the call waits on the
            // server's Rust threads, which run at Default, and a
            // user-initiated thread waiting on them is a priority
            // inversion (#192). A detached task would be escalated to
            // this main-actor task's priority as soon as it is awaited;
            // a continuation does not escalate the queue's work.
            let result: Result<ServerHost, Error> = await withCheckedContinuation { done in
                Self.serverQueue.async {
                    old?.stop()
                    done.resume(returning: Result { try AppModel.launch(settings, saved) })
                }
            }
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
    /// last connection, so it is told every time. The page always offers
    /// its own kernels (cdp-kernel's TypeScript kernel, run in `KernelHost`),
    /// since only those reach the app's bridges, such as ganymede-device's
    /// `device` (#185). iOS can't launch kernel processes, so without a
    /// kernel server they are the only ones; otherwise the server's are
    /// listed beside them.
    private func pageURL(_ url: URL) -> URL {
        guard var parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return url }
        var items = [URLQueryItem(name: "kernels", value: kernels)]
        #if os(iOS)
        // The iPad and iPhone draw the sidebar, toolbar and key commands
        // (#208, #209).
        if drawsNativeChrome { items.append(URLQueryItem(name: "chrome", value: "native")) }
        #endif
        parts.queryItems = (parts.queryItems ?? []) + items
        return parts.url ?? url
    }

    /// The page's `kernels=`: where its kernels run.
    private var kernels: String {
        #if os(iOS)
        kernelRemote == nil ? "page" : "both"
        #else
        "both"
        #endif
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
    /// The page a window loads for `target`; nil until the server listens.
    func page(for target: WindowTarget) -> URL? {
        guard let serverURL else { return nil }
        // The window draws the sidebar, toolbar and menus (#206, #207).
        return target.pageURL(server: serverURL, kernels: kernels, nativeChrome: true)
    }
    #endif

    /// The app's own server, for clients other than the page (terminals).
    var localServer: ServerEndpoint? {
        server.flatMap { ServerEndpoint(serverURL: $0.url) }
    }

    /// The folder the app's server serves, which its API paths are under:
    /// `/` on macOS, the notebook folder on iOS.
    var serverRootFolder: URL {
        URL(fileURLWithPath: Self.serverRoot(root), isDirectory: true)
    }

    /// The app's own server once it listens, started if it isn't, for
    /// Shortcuts (#302), which can run before any window has started it.
    func readyServer(timeout: Duration = .seconds(30)) async throws -> ServerEndpoint {
        // A failed start is tried again: nothing else would, until a
        // window restarts the server.
        if error != nil && queued == 0 { start() } else { startIfNeeded() }
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: timeout)
        while clock.now < deadline {
            // Not while a restart is queued: it stops the server it replaces.
            if queued == 0, let localServer { return localServer }
            if queued == 0, let error { throw ServerHost.StartError(message: error) }
            try await Task.sleep(for: .milliseconds(100))
        }
        throw ServerHost.StartError(message: "Ganymede’s server didn’t start in time.")
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

    /// The app's public key, for authorized_keys on SSH remotes.
    var sshPublicKey: String? {
        sshKey.map { SSHKeyStore.publicLine($0.publicKey, comment: "ganymede") }
    }

    func generateSSHKey() {
        do {
            sshKey = try sshKeys.generate()
        } catch {
            keychainError = "The SSH key could not be saved in the keychain: " + error.localizedDescription
        }
    }

    /// Imports an unencrypted OpenSSH ed25519 key; throws when it can't be
    /// read, for the import sheet to show.
    func importSSHKey(_ text: String) throws {
        sshKey = try sshKeys.importOpenSSH(text)
    }

    func removeSSHKey() {
        do {
            try sshKeys.remove()
            sshKey = nil
        } catch {
            keychainError = "The SSH key could not be removed from the keychain: " + error.localizedDescription
        }
    }

    /// Removes a remote and its token. Kernels move to this device if they
    /// ran there.
    func delete(remote id: UUID) {
        remotes.removeAll { $0.id == id }
        unsavedTokens[id] = nil
        hostKeys.forget(id)
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

    /// File > Open…: notebooks to open, each in a new tab.
    func chooseNotebooks() -> [URL] {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = true
        // Ours, and the one the system gives `.ipynb` when another app
        // exports its own.
        panel.allowedContentTypes = [.jupyterNotebook, DefaultApp.notebookType]
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

    #if os(iOS)
    /// Adds the example notebooks to the app's own folder once, the first
    /// time it is open with the page ready (#463): on a fresh install, and
    /// on the first launch after an update that brings this. Not to a
    /// folder the person picked, and not again after they delete them.
    /// Every sidebar lists again when it copied them (`examplesCopied`).
    func addExamplesIfNeeded(page: PageModel) async {
        guard scoped == nil, !addingExamples, !defaults.bool(forKey: Keys.examplesAdded) else {
            return
        }
        // Two iPad windows get ready together: one copy.
        addingExamples = true
        defer { addingExamples = false }
        do {
            // The folder's path, or null when an `Examples` folder is there.
            let added = try await page.call("add-examples", arg: "")
            defaults.set(true, forKey: Keys.examplesAdded)
            if added is String { examplesCopied += 1 }
        } catch {
            // Tried again when the page is next ready: after a reload, a
            // server restart or the next launch.
        }
    }
    #endif

    private enum Keys {
        static let root = "rootFolder"
        static let bookmark = "rootFolderBookmark"
        static let port = "serverPort"
        static let examplesAdded = "examplesAdded"
    }
}
