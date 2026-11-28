#if os(macOS)
import Foundation

/// The Mac app's `[host]` defaults for its server (#585). The server's
/// root is `/`, so its own default read grant, the root, would let every
/// notebook's code read every notebook on the disk. The app passes the
/// folders in Settings instead, as API paths. A notebook may still read
/// itself, and its own grant (Notebook Access) still replaces this
/// default. iOS keeps the server's default: its root is the notebook
/// folder.
enum HostDefaults {
    static func serverConfig(folders: [URL]) -> [String: any Sendable] {
        ["read": folders.map { FolderEntry.serverPath($0) }]
    }

    /// Converts `[host] read` API paths from `ganymede.toml` back into folder
    /// URLs on macOS, where the app's server is rooted at `/`. Empty entries
    /// (`""`, the whole root) are skipped so Spotlight never walks `/`.
    static func folders(fromRead paths: [String]) -> [URL] {
        var seen = Set<URL>()
        var result: [URL] = []
        for raw in paths {
            let trimmed = raw.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            guard !trimmed.isEmpty else { continue }
            let url = URL(fileURLWithPath: "/" + trimmed, isDirectory: true).standardizedFileURL
            if seen.insert(url).inserted {
                result.append(url)
            }
        }
        return result
    }
}
#endif
