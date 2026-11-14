import Foundation
import WebKit

/// The person's name for the notebook rooms (#606): the page sends it in
/// a room's awareness, so the server credits their edits to it and an
/// agent is told who changed a cell (`src/lib/room.ts`). The Mac's
/// account full name, for the in-app server only: the script sets it only
/// on a page from the in-app server's origin, and the page sends it
/// only to its own server, never to a remote one. iPad and iPhone have no
/// name to give, and the server says "a person".
enum PersonName {
    static var name: String? {
        #if os(macOS)
        let n = NSFullUserName().trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? nil : n
        #else
        return nil
        #endif
    }

    /// The origin of `url` as a page sees it (`location.origin`), or nil.
    static func origin(_ url: URL?) -> String? {
        guard let url, let scheme = url.scheme, let host = url.host else { return nil }
        let shown = host.contains(":") ? "[\(host)]" : host
        return url.port.map { "\(scheme)://\(shown):\($0)" } ?? "\(scheme)://\(shown)"
    }

    /// The script setting `window.ganymedeUser` for `name` on a page from
    /// `origin` (the in-app server's) alone, or nil without both.
    static func source(_ name: String?, origin: String?) -> String? {
        guard let name, let origin,
              let data = try? JSONEncoder().encode(["name": name]),
              let json = String(data: data, encoding: .utf8),
              let originData = try? JSONEncoder().encode(origin),
              let originJSON = String(data: originData, encoding: .utf8)
        else { return nil }
        return "if (location.origin === \(originJSON)) window.ganymedeUser = \(json);"
    }

    /// For a web view showing the in-app server's page `loaded`, before the
    /// page loads; nil without a name or a page.
    static func pageScript(for loaded: URL?) -> WKUserScript? {
        source(name, origin: origin(loaded)).map {
            WKUserScript(source: $0, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        }
    }
}
