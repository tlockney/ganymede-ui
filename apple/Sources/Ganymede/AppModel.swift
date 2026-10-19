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

    private init() {
        if let path = UserDefaults.standard.string(forKey: Keys.root),
           FileManager.default.fileExists(atPath: path) {
            root = URL(fileURLWithPath: path, isDirectory: true)
        } else {
            root = FileManager.default.homeDirectoryForCurrentUser
        }
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
        let config: [String: Any] = [
            "root_dir": root.path,
            "static_dir": web.path,
            "quiet": true,
        ]
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
        root = folder
        defaults.set(folder.path, forKey: Keys.root)
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

    private enum Keys {
        static let root = "rootFolder"
        static let port = "serverPort"
    }
}
