import Foundation
import SwiftUI
#if os(macOS)
import AppKit
#endif

/// What an editor window opens: a text file on the app's own server, by
/// its path there. Opening a file that is already open brings its window
/// to the front, since the values are equal.
struct EditorRequest: Codable, Hashable, Identifiable {
    var path: String
    var id: String { path }
}

/// One text file being edited (#122): its text as last loaded or saved,
/// whether it has unsaved edits, and whether the file changed on disk
/// since. Reads and writes go through `/api/contents`.
@MainActor
final class EditorDocument: ObservableObject {
    let path: String
    /// The text the view shows after a load; the view owns the text in
    /// between and reports edits with `edited`.
    private(set) var text = ""
    /// Bumped whenever `text` is replaced from the server, so the view
    /// knows to take it.
    @Published private(set) var generation = 0
    @Published private(set) var loaded = false
    @Published private(set) var dirty = false
    /// Why the file could not be read or saved.
    @Published private(set) var problem: String?
    /// The file changed on disk while there were unsaved edits.
    @Published private(set) var changedOnDisk = false
    private var lastModified: String?
    private var busy = false
    private let endpoint: @MainActor () -> ServerEndpoint?
    #if os(macOS)
    private weak var window: NSWindow?
    private var closeGuard: EditorCloseGuard?
    /// Every open editor, for the prompt on quit.
    private static let all = NSHashTable<EditorDocument>.weakObjects()
    #endif

    init(path: String, endpoint: @escaping @MainActor () -> ServerEndpoint?) {
        self.path = path
        self.endpoint = endpoint
        #if os(macOS)
        Self.all.add(self)
        #endif
    }

    var name: String {
        path.split(separator: "/").last.map(String.init) ?? path
    }

    var language: TextLanguage? { TextLanguage(fileName: name) }

    private var client: TextFileClient? {
        endpoint().map { TextFileClient(endpoint: $0, path: path) }
    }

    /// The view's text changed.
    func edited(_ text: String) {
        self.text = text
        if !dirty { dirty = true }
        syncWindow()
    }

    /// Reads the file, replacing any edits.
    func load() async {
        guard let client else {
            problem = "Ganymede's server is not running."
            return
        }
        do {
            let snapshot = try await client.read()
            take(snapshot)
            problem = nil
        } catch {
            problem = error.localizedDescription
        }
    }

    /// Saves the edits; false when they are still unsaved (`problem` or
    /// `changedOnDisk` says why). Refuses when the file changed on disk.
    @discardableResult
    func save() async -> Bool {
        await write(checking: true)
    }

    /// Saves the edits over a file that changed on disk.
    @discardableResult
    func overwrite() async -> Bool {
        await write(checking: false)
    }

    private func write(checking: Bool) async -> Bool {
        guard dirty else { return true }
        guard let client else {
            problem = "Ganymede's server is not running."
            return false
        }
        guard !busy else { return false }
        busy = true
        defer { busy = false }
        let saving = text
        do {
            if checking, let lastModified {
                // jupyter_server ignores `last_modified` on a save, so look first.
                let current = try await client.read(content: false)
                if current.lastModified != lastModified {
                    changedOnDisk = true
                    return false
                }
            }
            let snapshot = try await client.write(saving, lastModified: checking ? lastModified : nil)
            lastModified = snapshot.lastModified
            changedOnDisk = false
            problem = nil
            // Edits made while saving stay unsaved.
            if text == saving {
                dirty = false
                syncWindow()
            }
            return !dirty
        } catch let failure as TextFileClient.Failure where failure.conflict {
            changedOnDisk = true
            return false
        } catch {
            problem = "The file could not be saved: " + error.localizedDescription
            return false
        }
    }

    /// Picks up a change on disk: reloads when there are no edits, else
    /// marks the conflict for the user to settle.
    func checkForChanges() async {
        guard loaded, !busy, !changedOnDisk, let client, let lastModified else { return }
        guard let current = try? await client.read(content: false),
              current.lastModified != lastModified
        else { return }
        if dirty {
            changedOnDisk = true
        } else {
            await load()
        }
    }

    private func take(_ snapshot: TextFileClient.Snapshot) {
        text = snapshot.text ?? ""
        lastModified = snapshot.lastModified
        dirty = false
        changedOnDisk = false
        loaded = true
        generation += 1
        syncWindow()
    }

    #if os(macOS)
    /// The window this file is shown in: its edited dot, and a prompt
    /// before it closes with unsaved edits.
    func attach(to window: NSWindow) {
        guard self.window !== window else { return }
        self.window = window
        let closeGuard = EditorCloseGuard(document: self, original: window.delegate)
        window.delegate = closeGuard
        self.closeGuard = closeGuard
        // The proxy icon. The Mac's server is rooted at `/`.
        window.representedURL = URL(fileURLWithPath: "/" + path)
        syncWindow()
    }

    private func syncWindow() {
        window?.isDocumentEdited = dirty
    }

    func confirmClose(_ window: NSWindow) {
        let alert = Self.savePrompt("Do you want to save the changes you made to “\(name)”?", save: "Save")
        alert.beginSheetModal(for: window) { response in
            Task { @MainActor in
                switch response {
                case .alertFirstButtonReturn:
                    if await self.save() { window.close() }
                case .alertThirdButtonReturn:
                    self.dirty = false
                    window.close()
                default:
                    break
                }
            }
        }
    }

    static var hasUnsaved: Bool {
        all.allObjects.contains { $0.dirty && $0.window?.isVisible == true }
    }

    /// Before the app quits: true to quit. Asks once for every file with
    /// unsaved edits.
    static func confirmQuit() async -> Bool {
        let unsaved = all.allObjects.filter { $0.dirty && $0.window?.isVisible == true }
        guard let first = unsaved.first else { return true }
        let alert = unsaved.count == 1
            ? savePrompt("Do you want to save the changes you made to “\(first.name)”?", save: "Save")
            : savePrompt(
                "You have \(unsaved.count) files with unsaved changes. Do you want to save them before quitting?",
                save: "Save All")
        switch alert.runModal() {
        case .alertFirstButtonReturn:
            for document in unsaved {
                let saved = await document.save()
                if !saved {
                    document.window?.makeKeyAndOrderFront(nil)
                    return false
                }
            }
            return true
        case .alertThirdButtonReturn:
            return true
        default:
            return false
        }
    }

    /// Save, Cancel, Don't Save (⌘D), as document apps ask.
    private static func savePrompt(_ message: String, save: String) -> NSAlert {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = "Your changes will be lost if you don’t save them."
        alert.addButton(withTitle: save)
        alert.addButton(withTitle: "Cancel")
        let discard = alert.addButton(withTitle: "Don’t Save")
        discard.keyEquivalent = "d"
        discard.keyEquivalentModifierMask = [.command]
        return alert
    }
    #else
    private func syncWindow() {}
    #endif
}

#if os(macOS)
/// Stands in as the window's delegate to ask before an editor with unsaved
/// edits closes; everything else goes to SwiftUI's own delegate.
@MainActor
private final class EditorCloseGuard: NSObject, NSWindowDelegate {
    private weak var document: EditorDocument?
    nonisolated(unsafe) private weak var original: NSWindowDelegate?

    init(document: EditorDocument, original: NSWindowDelegate?) {
        self.document = document
        self.original = original
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if let document, document.dirty {
            document.confirmClose(sender)
            return false
        }
        return original?.windowShouldClose?(sender) ?? true
    }

    nonisolated override func responds(to selector: Selector!) -> Bool {
        super.responds(to: selector) || original?.responds(to: selector) == true
    }

    nonisolated override func forwardingTarget(for selector: Selector!) -> Any? {
        original?.responds(to: selector) == true ? original : nil
    }
}
#endif
