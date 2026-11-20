import Foundation

/// One item in a folder, as the native sidebar lists it (#207). Its `url`
/// is an opaque location (#737): a file URL on this device, or a machine's
/// `ganymede-machine://<id>/<path>` (`machineURL`), which nothing hands to
/// `FileManager`. The `FileSource` of its place reads and changes it.
struct FolderEntry: Identifiable, Hashable {
    let url: URL
    let isDirectory: Bool

    var id: URL { url }
    var name: String { url.lastPathComponent }
    var isNotebook: Bool { !isDirectory && url.pathExtension.lowercased() == "ipynb" }
    /// The extensions the page shows as data, not in the text editor (#671):
    /// `dataKind` in `src/lib/data-files.ts`.
    static let dataExtensions: Set<String> = ["csv", "tsv", "json", "parquet"]
    /// A CSV, TSV, JSON or Parquet file, which the page opens in its data view.
    var isData: Bool { !isDirectory && Self.dataExtensions.contains(url.pathExtension.lowercased()) }
    /// Opened by the page (`open`), as notebooks and data files are, not in the editor.
    var opensInPage: Bool { isNotebook || isData }
    /// The name without `.ipynb`, as the sidebar shows notebooks.
    var title: String { isNotebook ? url.deletingPathExtension().lastPathComponent : name }
    /// The item's path on the Mac app's server, which is rooted at `/`.
    var serverPath: String { Self.serverPath(url) }

    /// A file's path on a server rooted at `/`: its absolute path without
    /// the leading slash, as the page and the contents API take it. For a
    /// machine's URL, its path on that machine, relative; "" for the root.
    static func serverPath(_ url: URL) -> String {
        if let location = machineLocation(url) { return location.path }
        return String(url.standardizedFileURL.path.drop { $0 == "/" })
    }

    // MARK: A machine's items

    /// The scheme of a machine's item URL.
    static let machineScheme = "ganymede-machine"

    /// The URL of the item at `path` (relative, no leading slash; "" for the
    /// root) on machine `id`: `ganymede-machine://<id>/<path>`, each segment
    /// percent-encoded. Nil for a malformed id, so a URL is never built
    /// from one.
    static func machineURL(_ id: String, path: String) -> URL? {
        guard Place.isValidMachineID(id) else { return nil }
        var parts = URLComponents()
        parts.scheme = machineScheme
        parts.host = id
        // Encoded by hand with a strict set: `URLComponents.path` leaves
        // `;` and the like as they are, which don't survive a round trip.
        let segments = path.split(separator: "/", omittingEmptySubsequences: true).map {
            String($0).addingPercentEncoding(withAllowedCharacters: segmentAllowed) ?? String($0)
        }
        parts.percentEncodedPath = "/" + segments.joined(separator: "/")
        return parts.url
    }

    /// ASCII letters, digits and `-._~`: what stays in a machine path's segment.
    static let segmentAllowed = CharacterSet(
        charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    /// The machine and the relative path (decoded; "" for the root) of a
    /// `machineURL`; nil for any other URL.
    static func machineLocation(_ url: URL) -> (id: String, path: String)? {
        guard url.scheme == machineScheme, let id = url.host, Place.isValidMachineID(id) else { return nil }
        let encoded = URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedPath ?? ""
        let segments = encoded.split(separator: "/", omittingEmptySubsequences: true).map {
            String($0).removingPercentEncoding ?? String($0)
        }
        return (id, segments.joined(separator: "/"))
    }

    /// The path of the folder holding the item at relative `path`; "" for
    /// the root, which is its own parent.
    static func parentPath(_ path: String) -> String {
        var segments = path.split(separator: "/")
        if !segments.isEmpty { segments.removeLast() }
        return segments.joined(separator: "/")
    }

    /// The folder holding the item at `url`: a file URL's parent, or the
    /// parent of a machine's item; the root is its own parent.
    static func parent(of url: URL) -> URL {
        guard let location = machineLocation(url) else { return url.deletingLastPathComponent() }
        return machineURL(location.id, path: parentPath(location.path)) ?? url
    }

    /// A file's path on a server rooted at `root`, as the iPad's is at its
    /// notebook folder (#208): relative, with no leading slash; "" for the
    /// root itself. Symlinks are resolved on both sides, since iOS lists
    /// `/private/var/…` for a folder it hands over as `/var/…`.
    static func serverPath(_ url: URL, root: URL) -> String {
        let base = root.standardizedFileURL.resolvingSymlinksInPath().path
        let path = url.standardizedFileURL.resolvingSymlinksInPath().path
        guard path != base else { return "" }
        let prefix = base.hasSuffix("/") ? base : base + "/"
        guard path.hasPrefix(prefix) else { return serverPath(url) }
        return String(path.dropFirst(prefix.count))
    }

    /// The visible items in `folder`: folders first, then files, each in
    /// Finder order. Hidden files and packages' insides are left out.
    static func list(_ folder: URL, fileManager: FileManager = .default) throws -> [FolderEntry] {
        let urls = try fileManager.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.isDirectoryKey, .isPackageKey],
            options: [.skipsHiddenFiles]
        )
        let entries = urls.map { url -> FolderEntry in
            // Through a symlink, so a linked folder expands as the contents API's did.
            let values = try? url.resolvingSymlinksInPath()
                .resourceValues(forKeys: [.isDirectoryKey, .isPackageKey])
            let isDirectory = (values?.isDirectory ?? false) && !(values?.isPackage ?? false)
            return FolderEntry(url: url, isDirectory: isDirectory)
        }
        return entries.sorted { a, b in
            if a.isDirectory != b.isDirectory { return a.isDirectory }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }

    /// Where Duplicate puts a copy of `url`: "Io copy.ipynb", then
    /// "Io copy 2.ipynb" and so on, as Finder names them.
    static func duplicateURL(for url: URL, exists: (URL) -> Bool) -> URL {
        let dir = url.deletingLastPathComponent()
        let ext = url.pathExtension
        let base = ext.isEmpty ? url.lastPathComponent : url.deletingPathExtension().lastPathComponent
        var n = 1
        while true {
            let name = n == 1 ? "\(base) copy" : "\(base) copy \(n)"
            let candidate = dir.appendingPathComponent(ext.isEmpty ? name : "\(name).\(ext)")
            if !exists(candidate) { return candidate }
            n += 1
        }
    }

    /// Whether `path` (a server path) is `entry` or inside it.
    static func path(_ path: String?, isAt entry: String) -> Bool {
        guard let path else { return false }
        return path == entry || path.hasPrefix(entry + "/")
    }

    /// `path` after the item at `old` moved to `new`, or nil when it isn't there.
    static func path(_ path: String?, movedFrom old: String, to new: String) -> String? {
        guard let path, Self.path(path, isAt: old) else { return nil }
        return new + path.dropFirst(old.count)
    }

    /// The expanded folders' paths from what the sidebar stores: one path
    /// per line (#207).
    static func expandedPaths(_ stored: String) -> Set<String> {
        Set(stored.split(separator: "\n").map(String.init))
    }

    /// `stored` with `path` expanded or collapsed, its lines sorted so the
    /// same set is always stored the same way.
    static func expandedPaths(_ stored: String, setting path: String, to expanded: Bool) -> String {
        var paths = expandedPaths(stored)
        if expanded { paths.insert(path) } else { paths.remove(path) }
        return paths.sorted().joined(separator: "\n")
    }
}
