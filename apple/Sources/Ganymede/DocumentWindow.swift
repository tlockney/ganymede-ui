#if os(macOS)
import AppKit
import SwiftUI
import WebKit

/// One notebook window's document, as its page reports it (#132): the
/// window's proxy icon and edited dot, File > Save, Open Recent, and the
/// Save / Don't Save prompts when the window closes or the app quits.
@MainActor
@Observable
final class PageDocument {
    private(set) var file: URL?
    private(set) var dirty = false
    /// The place of the page that last reported.
    @ObservationIgnored private var place = Place.thisDevice
    /// The page, which saves through `window.ganymede.save()`.
    @ObservationIgnored weak var webView: WKWebView?
    @ObservationIgnored private(set) weak var window: NSWindow?
    /// Whether this tab is currently active in `window`: background tabs remain
    /// attached to `window` for quit tracking (`confirmQuit`), while only the
    /// active tab drives `window.isDocumentEdited` and `window.representedURL` (#904).
    @ObservationIgnored var isActiveInWindow = true {
        didSet {
            if isActiveInWindow { syncWindow() }
        }
    }
    @ObservationIgnored private var closeGuard: CloseGuard?
    @ObservationIgnored private let noteRecent: @MainActor (URL, Place) -> Void
    @ObservationIgnored private let indexSaved: @MainActor (URL) -> Void

    /// Every window's document, for the prompt on quit.
    private static let all = NSHashTable<PageDocument>.weakObjects()

    init(
        noteRecent: @escaping @MainActor (URL, Place) -> Void,
        indexSaved: @escaping @MainActor (URL) -> Void
    ) {
        self.noteRecent = noteRecent
        self.indexSaved = indexSaved
        Self.all.add(self)
    }

    var name: String {
        file?.deletingPathExtension().lastPathComponent ?? "Untitled"
    }

    /// `place` is the window's (`DocumentEffects` decides what a machine's
    /// notebook may reach, #740).
    func update(_ message: DocumentMessage, in place: Place = .thisDevice) {
        let effects = DocumentEffects.of(message, previousFile: file, wasDirty: dirty, in: place)
        if let opened = effects.noteRecent { noteRecent(opened, place) }
        if let saved = effects.indexSaved { indexSaved(saved) }
        self.place = place
        file = message.file
        dirty = message.dirty
        syncWindow()
    }

    /// The window this document is shown in; installs a single-document close
    /// guard when `installCloseGuard` is true (tabbed windows install one
    /// window-level guard via `WorkspaceTabController`).
    func attach(to window: NSWindow, installCloseGuard: Bool = true) {
        if self.window !== window {
            self.window = window
        }
        if installCloseGuard, closeGuard == nil {
            let closeGuard = CloseGuard(document: self, original: window.delegate)
            window.delegate = closeGuard
            self.closeGuard = closeGuard
        }
        syncWindow()
    }

    /// Detaches this document when its tab is removed or closed so it no longer
    /// affects quit prompts for the old window.
    func detach(from window: NSWindow) {
        guard self.window === window else { return }
        self.window = nil
        isActiveInWindow = false
    }

    func syncWindow() {
        guard isActiveInWindow else { return }
        window?.isDocumentEdited = dirty
        // The proxy icon: drag the file, ⌘-click for its folder.
        window?.representedURL = DocumentEffects.representedURL(for: file, in: place)
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

    /// Downloads a copy of the notebook and waits until its save panel closes (#808).
    func downloadCopy() async {
        guard let webView else { return }
        if let window {
            WorkspaceTabs.select(pageDocument: self, in: window)
            window.makeKeyAndOrderFront(nil)
        }
        await DownloadWaiter.triggerDownload(in: webView)
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
                    if let window = document.window {
                        WorkspaceTabs.select(pageDocument: document, in: window)
                        window.makeKeyAndOrderFront(nil)
                    }
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

    /// Every open document window or tab with unsaved edits (#808).
    static var openUnsaved: [PageDocument] {
        all.allObjects.filter { doc in
            guard doc.dirty, let window = doc.window else { return false }
            return window.isVisible || window.tabGroup?.windows.contains(window) == true
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

/// Puts the view's window among the app's tabs (#247).
struct WorkspaceTab: ViewModifier {
    func body(content: Content) -> some View {
        content.background(WindowReader { WorkspaceTabs.join($0) })
    }
}

extension View {
    func workspaceTab() -> some View {
        modifier(WorkspaceTab())
    }
}
#endif
