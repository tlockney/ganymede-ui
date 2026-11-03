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

    /// The visible items in `folder`: folders first, then files, each in
    /// Finder order. Hidden files and packages' insides are left out.
    static func list(_ folder: URL, fileManager: FileManager = .default) throws -> [FolderEntry] {
        let urls = try fileManager.contentsOfDirectory(
            at: folder,
            includingPropertiesForKeys: [.isDirectoryKey, .isPackageKey],
            options: [.skipsHiddenFiles]
        )
        let entries = urls.map { url -> FolderEntry in
            let values = try? url.resourceValues(forKeys: [.isDirectoryKey, .isPackageKey])
            let isDirectory = (values?.isDirectory ?? false) && !(values?.isPackage ?? false)
            return FolderEntry(url: url, isDirectory: isDirectory)
        }
        return entries.sorted { a, b in
            if a.isDirectory != b.isDirectory { return a.isDirectory }
            return a.name.localizedStandardCompare(b.name) == .orderedAscending
        }
    }
}
