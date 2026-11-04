import Foundation

/// One item in a folder, as the native sidebar lists it (#207).
struct FolderEntry: Identifiable, Hashable {
    let url: URL
    let isDirectory: Bool

    var id: URL { url }
    var name: String { url.lastPathComponent }
    var isNotebook: Bool { !isDirectory && url.pathExtension.lowercased() == "ipynb" }
    /// The name without `.ipynb`, as the sidebar shows notebooks.
    var title: String { isNotebook ? url.deletingPathExtension().lastPathComponent : name }
    /// The item's path on the Mac app's server, which is rooted at `/`.
    var serverPath: String { Self.serverPath(url) }

    /// A file's path on a server rooted at `/`: its absolute path without
    /// the leading slash, as the page and the contents API take it.
    static func serverPath(_ url: URL) -> String {
        String(url.standardizedFileURL.path.drop { $0 == "/" })
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
}
