import Foundation
import Observation

/// Why a `ganymede://open` link can't open its file on iPad and iPhone
/// (#640). `notGranted` reads the same whether or not the file exists, so
/// a web page that opens links learns nothing about files outside the
/// folders the person granted.
enum LinkFolderError: LocalizedError, Equatable {
    case notGranted
    case ambiguousFolder(String)
    case badPath(String)
    case notFound(String)
    case notNotebook(String)
    /// An iCloud Drive file that isn't on the device yet; its download started.
    case downloading(String)

    var errorDescription: String? {
        switch self {
        case .notGranted:
            "Ganymede can only open files in folders you’ve let it use. Grant access to the folder that holds this notebook."
        case .ambiguousFolder(let name):
            "More than one folder Ganymede can use is called “\(name)”. Use a link with path=, open another folder in Ganymede, or revoke one of them in Settings › Links."
        case .badPath(let text): "“\(text)” isn’t a path Ganymede can open here."
        case .notFound(let name): "Ganymede couldn’t find “\(name)”."
        case .notNotebook: "Links open notebooks (.ipynb) on iPad and iPhone."
        case .downloading(let name): "“\(name)” is downloading from iCloud. Open the link again in a moment."
        }
    }
}

/// Where a `ganymede://open` link may read on iPad and iPhone (#640):
/// inside the folder the app has open or a folder the person granted
/// (`LinkFolderStore`), and nowhere else, however the link spells the
/// path. Pure: it looks at paths, not at the files, except to follow
/// symlinks.
enum LinkFolders {
    /// What a link names: a path, or a granted folder's name and a path in it.
    enum Target: Equatable {
        case path(String)
        case inFolder(folder: String, file: String)
    }

    /// The folder `target` is in, as given (so its access applies), and
    /// the file, with symlinks resolved: the path to read is the path
    /// that was checked. Throws `notGranted` when no candidate folder
    /// holds it. `root` is the folder the app serves; a relative `path`
    /// is relative to it.
    static func resolve(
        _ target: Target, root: URL, granted: [URL]
    ) throws -> (folder: URL, file: URL) {
        let candidates = [root] + granted
        switch target {
        case .path(let path):
            // No home folder on iOS: `~` is never the person's.
            guard !path.isEmpty, !path.contains("\0"), path != "~", !path.hasPrefix("~/") else {
                throw LinkFolderError.badPath(path)
            }
            let file = resolved(AppURL.fileURL(path, root: root, home: root))
            // The most specific folder, when a grant sits inside another.
            let holding = candidates
                .filter { AppURL.isInside(file, anyOf: [$0]) }
                .max { resolved($0).path.count < resolved($1).path.count }
            guard let folder = holding else { throw LinkFolderError.notGranted }
            return (folder, file)

        case .inFolder(let name, let relative):
            guard !relative.isEmpty, !relative.hasPrefix("/"), !relative.contains("\0") else {
                throw LinkFolderError.badPath(relative)
            }
            var matches: [URL] = []
            for folder in candidates where folder.lastPathComponent == name || resolved(folder).lastPathComponent == name {
                // The same folder, granted and open, is one folder.
                if !matches.contains(where: { AppURL.isSame($0, folder) }) {
                    matches.append(folder)
                }
            }
            guard let folder = matches.first else { throw LinkFolderError.notGranted }
            guard matches.count == 1 else { throw LinkFolderError.ambiguousFolder(name) }
            // `..` and symlinks must not leave that folder.
            let file = resolved(folder.appendingPathComponent(relative))
            guard AppURL.isInside(file, anyOf: [folder]) else { throw LinkFolderError.notGranted }
            return (folder, file)
        }
    }

    /// `file` must exist and be a notebook. Called once `resolve` has put
    /// it inside a granted folder, with that folder's access on.
    /// A file iCloud Drive keeps off the device is a hidden `.name.icloud`
    /// placeholder where it should be: its download starts, through
    /// `startDownload`, and the error says so.
    static func checkNotebook(
        _ file: URL, fileManager: FileManager = .default,
        startDownload: (URL) throws -> Void = { try FileManager.default.startDownloadingUbiquitousItem(at: $0) }
    ) throws {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: file.path, isDirectory: &isDirectory) else {
            if isICloudPlaceholder(of: file, fileManager: fileManager) {
                try startDownload(file)
                throw LinkFolderError.downloading(file.lastPathComponent)
            }
            throw LinkFolderError.notFound(file.lastPathComponent)
        }
        guard !isDirectory.boolValue, file.pathExtension.lowercased() == "ipynb" else {
            throw LinkFolderError.notNotebook(file.lastPathComponent)
        }
    }

    /// Whether iCloud Drive has `file` but not on this device: its
    /// placeholder, `.<name>.icloud`, is next to where it should be.
    static func isICloudPlaceholder(of file: URL, fileManager: FileManager = .default) -> Bool {
        let placeholder = file.deletingLastPathComponent()
            .appendingPathComponent("." + file.lastPathComponent + ".icloud")
        return fileManager.fileExists(atPath: placeholder.path)
    }

    private static func resolved(_ url: URL) -> URL {
        AppURL.resolvedURL(url)
    }
}

/// A folder the person granted to links.
struct LinkFolder: Identifiable, Equatable {
    /// The bookmark, which names the folder; changes when it is renewed.
    let id: Data
    let name: String
    /// Nil when the bookmark no longer resolves (the folder was deleted,
    /// or its volume is gone): it stays listed, to revoke.
    let url: URL?

    var isAvailable: Bool { url != nil }
}

/// The folders the person granted to `ganymede://open` links on iPad and
/// iPhone (#640), as bookmarks: iOS bookmarks are security-scoped by
/// themselves. Settings › Links lists them with Revoke. Used on iOS; it
/// builds on both, for the tests.
@MainActor
@Observable
final class LinkFolderStore {
    static let shared = LinkFolderStore()
    static let defaultsKey = "linkFolderBookmarks"

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var bookmarks: [Data]
    /// The granted folders, in the order they were added.
    private(set) var folders: [LinkFolder] = []
    /// Why a stale bookmark couldn't be renewed, for Settings; it still
    /// works until the folder moves.
    private(set) var problem: String?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        bookmarks = defaults.array(forKey: Self.defaultsKey) as? [Data] ?? []
        folders = bookmarks.map { Self.describe($0) }
    }

    /// Grants `url`, a folder from the picker. Throws when iOS can't make
    /// a bookmark of it; nothing is kept then. A folder already granted
    /// (by any spelling of its path) isn't added again.
    func add(_ url: URL) throws {
        let started = url.startAccessingSecurityScopedResource()
        defer { if started { url.stopAccessingSecurityScopedResource() } }
        // No `.withSecurityScope`: that is macOS's, and an iOS bookmark
        // carries the scope already.
        let data = try url.bookmarkData()
        let path = Self.key(url)
        guard !folders.contains(where: { $0.url.map(Self.key) == path }) else { return }
        bookmarks.append(data)
        save()
    }

    func remove(_ id: LinkFolder.ID) {
        bookmarks.removeAll { $0 == id }
        save()
    }

    /// Runs `body` with the granted folders' URLs, each opened for access,
    /// and ends that access after. Stale bookmarks are renewed on the way;
    /// ones that no longer resolve are left out (and stay listed).
    func withAccess<T>(_ body: ([URL]) throws -> T) rethrows -> T {
        var urls: [URL] = []
        var started: [URL] = []
        defer {
            for url in started { url.stopAccessingSecurityScopedResource() }
        }
        var renewed = false
        problem = nil
        for (index, data) in bookmarks.enumerated() {
            var stale = false
            guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale) else { continue }
            if url.startAccessingSecurityScopedResource() { started.append(url) }
            urls.append(url)
            guard stale else { continue }
            do {
                bookmarks[index] = try url.bookmarkData()
                renewed = true
            } catch {
                problem = "Ganymede couldn’t renew its access to “\(url.lastPathComponent)”: \(error.localizedDescription)"
            }
        }
        if renewed { save() }
        return try body(urls)
    }

    private func save() {
        defaults.set(bookmarks, forKey: Self.defaultsKey)
        folders = bookmarks.map { Self.describe($0) }
    }

    nonisolated private static func describe(_ data: Data) -> LinkFolder {
        var stale = false
        guard let url = try? URL(resolvingBookmarkData: data, bookmarkDataIsStale: &stale) else {
            return LinkFolder(id: data, name: "Unavailable folder", url: nil)
        }
        return LinkFolder(id: data, name: url.lastPathComponent, url: url)
    }

    nonisolated private static func key(_ url: URL) -> String {
        AppURL.resolvedURL(url).path
    }
}
