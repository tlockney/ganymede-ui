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
    /// A folder switch would break a text file that is open.
    case openFile(String)

    var errorDescription: String? {
        switch self {
        case .notGranted:
            "Ganymede can only open files in folders you’ve let it use. Grant access to the folder that holds this notebook."
        case .ambiguousFolder(let name):
            "More than one folder Ganymede can use is called “\(name)”. Use a link with path=, open another folder in Ganymede, or revoke one of them in Settings › Link Folders."
        case .badPath(let text): "“\(text)” isn’t a path Ganymede can open here."
        case .notFound(let name): "Ganymede couldn’t find “\(name)”."
        case .notNotebook: "Links open notebooks (.ipynb) on iPad and iPhone."
        case .openFile(let name):
            "Close “\(name)” first: Ganymede switches folders by restarting, and open files would save into the new folder."
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
    /// is relative to it. Each folder and the file are resolved once.
    static func resolve(
        _ target: Target, root: URL, granted: [URL]
    ) throws -> (folder: URL, file: URL) {
        let candidates = ([root] + granted).map { (url: $0, path: AppURL.resolvedURL($0).path) }
        switch target {
        case .path(let path):
            // No home folder on iOS: `~` is never the person's.
            guard !path.isEmpty, !path.contains("\0"), path != "~", !path.hasPrefix("~/") else {
                throw LinkFolderError.badPath(path)
            }
            let file = AppURL.resolvedURL(AppURL.fileURL(path, root: root, home: root))
            // The most specific folder, when a grant sits inside another.
            let holding = candidates
                .filter { AppURL.contains(base: $0.path, file.path) }
                .max { $0.path.count < $1.path.count }
            guard let folder = holding else { throw LinkFolderError.notGranted }
            return (folder.url, file)

        case .inFolder(let name, let relative):
            guard !relative.isEmpty, !relative.hasPrefix("/"), !relative.contains("\0") else {
                throw LinkFolderError.badPath(relative)
            }
            var matches: [(url: URL, path: String)] = []
            for folder in candidates
            where folder.url.lastPathComponent == name || URL(fileURLWithPath: folder.path).lastPathComponent == name {
                // The same folder, granted and open, is one folder.
                if !matches.contains(where: { $0.path == folder.path }) { matches.append(folder) }
            }
            guard let folder = matches.first else { throw LinkFolderError.notGranted }
            guard matches.count == 1 else { throw LinkFolderError.ambiguousFolder(name) }
            // `..` and symlinks must not leave that folder. The folder is
            // there, so no grant would help: the path is the problem.
            let file = AppURL.resolvedURL(URL(fileURLWithPath: folder.path).appendingPathComponent(relative))
            guard AppURL.contains(base: folder.path, file.path) else { throw LinkFolderError.badPath(relative) }
            return (folder.url, file)
        }
    }

    /// `file`'s path in `folder`, as the server rooted there takes it
    /// ("" for the folder itself), or nil when it isn't inside. Both are
    /// resolved, and `folder`'s access must be on.
    static func relativePath(of file: URL, in folder: URL) -> String? {
        let base = AppURL.resolvedURL(folder).path
        let path = AppURL.resolvedURL(file).path
        guard AppURL.contains(base: base, path) else { return nil }
        guard path != base else { return "" }
        return String(path.dropFirst(base.hasSuffix("/") ? base.count : base.count + 1))
    }

    /// `file` must exist and be a notebook. Called once `resolve` has put
    /// it inside a granted folder, with that folder's access on.
    /// A file iCloud Drive keeps off the device is a hidden `.name.icloud`
    /// placeholder where it should be: its download starts, through
    /// `startDownload`, and the error says so.
    static func checkNotebook(
        _ file: URL, fileManager: FileManager = .default,
        isUbiquitous: (URL) -> Bool = LinkFolders.isUbiquitousItem,
        startDownload: (URL) throws -> Void = { try FileManager.default.startDownloadingUbiquitousItem(at: $0) }
    ) throws {
        var isDirectory: ObjCBool = false
        guard fileManager.fileExists(atPath: file.path, isDirectory: &isDirectory) else {
            if isICloudPlaceholder(of: file, fileManager: fileManager, isUbiquitous: isUbiquitous) {
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
    /// placeholder, `.<name>.icloud`, is next to where it should be, and
    /// iCloud manages it (as DeviceBridge's `Folders.placeholder(for:)`
    /// asks), so a hidden file of that name elsewhere is only a file.
    static func isICloudPlaceholder(
        of file: URL, fileManager: FileManager = .default,
        isUbiquitous: (URL) -> Bool = LinkFolders.isUbiquitousItem
    ) -> Bool {
        let stub = file.deletingLastPathComponent()
            .appendingPathComponent("." + file.lastPathComponent + ".icloud")
        return fileManager.fileExists(atPath: stub.path) && isUbiquitous(stub)
    }

    /// Whether iCloud manages `url`.
    static func isUbiquitousItem(_ url: URL) -> Bool {
        (try? url.resourceValues(forKeys: [.isUbiquitousItemKey]))?.isUbiquitousItem == true
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
/// themselves. Settings › Link Folders lists them with Revoke. Used on iOS; it
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

    /// The alert's title when a picked folder can't be added.
    static let addFailureTitle = "Ganymede couldn’t add the folder"

    /// What the folder picker's answer came to.
    enum PickOutcome: Equatable {
        case added, cancelled
        case failed(String)
    }

    /// Grants the folder a picker returned, and says how that went, for
    /// the alert that reports it (the same wherever a picker is shown).
    func add(picked result: Result<URL, Error>) -> PickOutcome {
        switch result {
        case .failure(let error):
            if (error as? CocoaError)?.code == .userCancelled { return .cancelled }
            return .failed(error.localizedDescription)
        case .success(let url):
            do {
                try add(url)
                return .added
            } catch {
                return .failed(error.localizedDescription)
            }
        }
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
