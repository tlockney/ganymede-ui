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
    /// A machine's notebook is its `FolderEntry.machineURL`, never a file
    /// URL, so nothing takes it for a file on this device (#740).
    init?(body: Any, root: URL = URL(fileURLWithPath: "/", isDirectory: true), place: Place = .thisDevice) {
        guard let fields = body as? [String: Any], let dirty = fields["dirty"] as? Bool else {
            return nil
        }
        self.dirty = dirty
        if let path = fields["path"] as? String, !path.isEmpty {
            if let id = place.machineID {
                // A malformed id has no URL: no file.
                file = FolderEntry.machineURL(id, path: path)
            } else {
                file = root.appendingPathComponent(path, isDirectory: false).standardizedFileURL
            }
        } else {
            file = nil
        }
    }

    /// The file is a notebook, so it belongs in Open Recent and Spotlight.
    /// A data file shown in the page (#671) is the window's file too, for
    /// its title and proxy icon, but not a document to reopen or index.
    var isNotebook: Bool {
        file?.pathExtension.lowercased() == "ipynb"
    }
}

/// What a document message does to the app outside its window: the one
/// place deciding that a machine's notebook (a machine URL, #740) never
/// reaches native Recents, Spotlight or the window's proxy icon.
struct DocumentEffects: Equatable {
    /// A notebook just opened, for Open Recent (which also indexes it).
    var noteRecent: URL?
    /// A notebook just saved, for Spotlight to read again.
    var indexSaved: URL?
    /// A notebook that just went from saved to edited, for the kept
    /// answers to check it before the next save restamps it (#584).
    var editStarted: URL?

    /// The effects of `message` on a window that showed `file`, with edits
    /// iff `wasDirty`, in `place`.
    static func of(
        _ message: DocumentMessage, previousFile file: URL?, wasDirty: Bool, in place: Place
    ) -> DocumentEffects {
        var effects = DocumentEffects()
        // Local files only: Recents, File > Open Recent and Spotlight keep file URLs.
        guard place.indexesLocally, let url = message.file, url.isFileURL, message.isNotebook else {
            return effects
        }
        if url != file {
            effects.noteRecent = url
        } else if wasDirty, !message.dirty {
            effects.indexSaved = url
        } else if !wasDirty, message.dirty {
            effects.editStarted = url
        }
        return effects
    }

    /// The window's proxy icon: a file on this device only.
    static func representedURL(for file: URL?, in place: Place) -> URL? {
        guard place.indexesLocally, let file, file.isFileURL else { return nil }
        return file
    }
}
