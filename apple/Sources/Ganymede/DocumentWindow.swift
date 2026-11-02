#if os(macOS)
import AppKit
import SwiftUI
import WebKit

/// One notebook window's document, as its page reports it (#132): the
/// window's proxy icon and edited dot, File > Save, Open Recent, and the
/// Save / Don't Save prompts when the window closes or the app quits.
@MainActor
final class PageDocument: ObservableObject {
    @Published private(set) var file: URL?
    @Published private(set) var dirty = false
    /// The page, which saves through `window.ganymede.save()`.
    weak var webView: WKWebView?
    private weak var window: NSWindow?
    private var closeGuard: CloseGuard?

    /// Every window's document, for the prompt on quit.
    private static let all = NSHashTable<PageDocument>.weakObjects()

    init() {
        Self.all.add(self)
    }

    var name: String {
        file?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    func update(_ message: DocumentMessage) {
        if let opened = message.file, opened != file {
            Recents.shared.note(opened)
        }
        file = message.file
        dirty = message.dirty
        syncWindow()
    }

    /// The window this document is shown in; asks before it closes with
    /// unsaved edits.
    func attach(to window: NSWindow) {
        guard self.window !== window else { return }
        self.window = window
        let closeGuard = CloseGuard(document: self, original: window.delegate)
        window.delegate = closeGuard
        self.closeGuard = closeGuard
        syncWindow()
    }

    private func syncWindow() {
        window?.isDocumentEdited = dirty
        // The proxy icon: drag the file, ⌘-click for its folder.
        window?.representedURL = file
    }

    /// Saves through the page; true when there is nothing left unsaved.
    @discardableResult
    func save() async -> Bool {
        guard let webView else { return !dirty }
        do {
            let saved = try await webView.callAsyncJavaScript(
                "return window.ganymede ? await window.ganymede.save() : true",
                arguments: [:],
                in: nil,
                contentWorld: .page
            )
            return saved as? Bool ?? false
        } catch {
            return false
        }
    }

    /// Asks whether to save before `window` closes, then closes it unless
    /// cancelled or the save failed (the page says why).
    func confirmClose(_ window: NSWindow) {
        let alert = Self.savePrompt(
            "Do you want to save the changes you made to “\(name)”?", save: "Save")
        alert.beginSheetModal(for: window) { response in
            Task { @MainActor in
                switch response {
                case .alertFirstButtonReturn:
                    if await self.save() { window.close() }
                case .alertThirdButtonReturn:
                    window.close()
                default:
                    break
                }
            }
        }
    }

    /// Before the app quits: true to quit. Asks once for every window with
    /// unsaved edits.
    static func confirmQuit() async -> Bool {
        let unsaved = all.allObjects.filter { $0.dirty && $0.window?.isVisible == true }
        guard let first = unsaved.first else { return true }
        let alert = unsaved.count == 1
            ? savePrompt("Do you want to save the changes you made to “\(first.name)”?", save: "Save")
            : savePrompt(
                "You have \(unsaved.count) notebooks with unsaved changes. Do you want to save them before quitting?",
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

    static var hasUnsaved: Bool {
        all.allObjects.contains { $0.dirty && $0.window?.isVisible == true }
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
}

/// Stands in as the window's delegate to ask before a window with unsaved
/// edits closes; everything else goes to SwiftUI's own delegate.
@MainActor
private final class CloseGuard: NSObject, NSWindowDelegate {
    private weak var document: PageDocument?
    nonisolated(unsafe) private weak var original: NSWindowDelegate?

    init(document: PageDocument, original: NSWindowDelegate?) {
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

/// File > Open Recent: the notebooks opened lately, kept by AppKit.
@MainActor
final class Recents: ObservableObject {
    static let shared = Recents()
    @Published private(set) var urls = NSDocumentController.shared.recentDocumentURLs

    func note(_ url: URL) {
        NSDocumentController.shared.noteNewRecentDocumentURL(url)
        urls = NSDocumentController.shared.recentDocumentURLs
    }

    func clear() {
        NSDocumentController.shared.clearRecentDocuments(nil)
        urls = []
    }
}

/// Hands over the window a view is in, once it is in one.
struct WindowReader: NSViewRepresentable {
    let onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> Probe {
        let probe = Probe()
        probe.onWindow = onWindow
        return probe
    }

    func updateNSView(_ probe: Probe, context: Context) {
        probe.onWindow = onWindow
        if let window = probe.window { onWindow(window) }
    }

    final class Probe: NSView {
        var onWindow: ((NSWindow) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { onWindow?(window) }
        }
    }
}

/// File > Save (⌘S), for the front notebook or text file window.
struct SaveCommand: View {
    @FocusedObject private var document: PageDocument?
    @FocusedObject private var editor: EditorDocument?

    var body: some View {
        Button("Save") {
            if let editor {
                Task { await editor.save() }
            } else {
                Task { await document?.save() }
            }
        }
        .keyboardShortcut("s")
        .disabled(editor == nil && document?.file == nil)
    }
}
#endif
