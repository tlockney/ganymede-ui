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

    private var server: ServerHost?
    private let defaults = UserDefaults.standard
    #if os(iOS)
    /// A folder from the picker, readable only while its security scope
    /// is held.
    private var scoped: URL?
    #endif

    private init() {
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

    /// Starts the server unless it is running.
    func startIfNeeded() {
        if server == nil && error == nil {
            start()
        }
    }

    func start() {
        stop()
        error = nil
        guard let web = Bundle.main.url(forResource: "web", withExtension: nil) else {
            error = "The app bundle has no web folder; build it with apple/scripts/bootstrap.sh."
            return
        }
        var config: [String: Any] = [
            "root_dir": root.path,
            "static_dir": web.path,
            "quiet": true,
        ]
        #if os(iOS)
        if let support = try? FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
        ) {
            config["cookie_secret_file"] = support.appendingPathComponent("cookie_secret").path
        }
        #endif
        // The same port as last time keeps the page's origin, and with it
        // the web app's saved state in local storage; any free port when
        // that one is taken.
        let saved = defaults.integer(forKey: Keys.port)
        do {
            let host: ServerHost
            if saved > 0, let first = try? ServerHost(config: config.merging(["port": saved]) { $1 }) {
                host = first
            } else {
                host = try ServerHost(config: config.merging(["port": 0]) { $1 })
            }
            server = host
            url = host.url
            if let port = host.url.port {
                defaults.set(port, forKey: Keys.port)
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    func stop() {
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
