import Foundation
import WebKit

/// The person's name for the notebook rooms (#606): the page sends it in
/// a room's awareness, so the server credits their edits to it and an
/// agent is told who changed a cell (`src/lib/room.ts`). The Mac's
/// account full name; iPad and iPhone have none to give, and the server
/// says "a person".
enum PersonName {
    static var name: String? {
        #if os(macOS)
        let n = NSFullUserName().trimmingCharacters(in: .whitespacesAndNewlines)
        return n.isEmpty ? nil : n
        #else
        return nil
        #endif
    }

    /// The script setting `window.ganymedeUser` for `name`, or nothing.
    static func source(_ name: String?) -> String {
        guard let name,
              let data = try? JSONEncoder().encode(["name": name]),
              let json = String(data: data, encoding: .utf8)
        else { return "" }
        return "window.ganymedeUser = \(json);"
    }

    /// For a web view, before its page loads.
    static var pageScript: WKUserScript {
        WKUserScript(source: source(name), injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }
}
