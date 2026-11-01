import Foundation

/// What the page posts to the Mac app's `document` message handler
/// (ganymede-ui's `src/lib/native.ts`, #132): the notebook it has open and
/// whether that has unsaved edits.
struct DocumentMessage: Equatable {
    /// The open notebook's file; nil when none is open.
    var file: URL?
    var dirty: Bool

    init(file: URL?, dirty: Bool) {
        self.file = file
        self.dirty = dirty
    }

    /// From a message body, `{ path: string | null, dirty: boolean }`.
    /// `path` is the notebook's path on the server, relative to its root
    /// (`/` on macOS).
    init?(body: Any, root: URL = URL(fileURLWithPath: "/", isDirectory: true)) {
        guard let fields = body as? [String: Any], let dirty = fields["dirty"] as? Bool else {
            return nil
        }
        self.dirty = dirty
        if let path = fields["path"] as? String, !path.isEmpty {
            file = root.appendingPathComponent(path, isDirectory: false).standardizedFileURL
        } else {
            file = nil
        }
    }
}
