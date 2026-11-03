import Foundation
import UniformTypeIdentifiers

/// The preview page's files (`npm run build:quicklook`, bundled in the
/// extension as `quicklook/`), served to the web view under a scheme of
/// the extension's own (#135). Module scripts don't load from `file:`
/// URLs in WebKit, and there is no server to serve them.
enum PreviewResources {
    static let scheme = "ganymede-preview"
    static let host = "app"
    static let pageURL = URL(string: "\(scheme)://\(host)/preview.html")!

    /// The file under `root` that `url` asks for, or nil when it names
    /// anything else: another scheme or host, a folder, or a path that
    /// leaves `root`.
    static func file(for url: URL, in root: URL) -> URL? {
        guard url.scheme == scheme, url.host == host else { return nil }
        let parts = url.path.split(separator: "/", omittingEmptySubsequences: false).dropFirst()
        guard !parts.isEmpty, !parts.contains(where: { $0.isEmpty || $0 == "." || $0 == ".." }) else {
            return nil
        }
        let file = parts.reduce(root) { $0.appendingPathComponent(String($1)) }
        // Symbolic links inside the bundle could still point out of it.
        let base = root.resolvingSymlinksInPath().path
        guard file.resolvingSymlinksInPath().path.hasPrefix(base + "/") else { return nil }
        return file
    }

    /// The Content-Type for a file, by its extension. WebKit runs a module
    /// script only when it is served as JavaScript.
    static func mimeType(for file: URL) -> String {
        switch file.pathExtension.lowercased() {
        case "js", "mjs": return "text/javascript"
        case "html": return "text/html"
        case "css": return "text/css"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        default:
            return UTType(filenameExtension: file.pathExtension)?.preferredMIMEType
                ?? "application/octet-stream"
        }
    }
}
