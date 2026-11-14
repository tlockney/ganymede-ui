import Foundation
import WebKit

/// The person's name for the notebook rooms (#606): the page sends it in
/// a room's awareness, so the server credits their edits to it and an
/// agent is told who changed a cell (`src/lib/room.ts`). The Mac's
/// account full name, for the in-app server only: the script sets it only
/// on a page from this Mac (the in-app server's), and the page sends it
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

    /// The script setting `window.ganymedeUser` for `name` on a page served
    /// from this machine, or nil without a name.
    static func source(_ name: String?) -> String? {
        guard let name,
              let data = try? JSONEncoder().encode(["name": name]),
              let json = String(data: data, encoding: .utf8)
        else { return nil }
        return """
            if (["127.0.0.1", "localhost", "[::1]"].includes(location.hostname)) \
            window.ganymedeUser = \(json);
            """
    }

    /// For a web view, before its page loads; nil without a name.
    static var pageScript: WKUserScript? {
        source(name).map {
            WKUserScript(source: $0, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        }
    }
}
