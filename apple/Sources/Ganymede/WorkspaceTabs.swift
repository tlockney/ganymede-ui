#if os(macOS)
import AppKit

/// Notebooks, text files and terminals as tabs of one window (#247), with
/// AppKit's own window tabs: every app window shares one tabbing
/// identifier and prefers tabs, so a new one joins the front window as a
/// tab. AppKit gives the tab bar, dragging a tab out into a window,
/// Window › Merge All Windows and Move Tab to New Window, and each tab
/// keeps its own toolbar, so the toolbar follows the active tab. This
/// holds whatever System Settings › Desktop & Dock › "Prefer tabs when
/// opening documents" says.
@MainActor
enum WorkspaceTabs {
    static let identifier = "ganymede.workspace"
    /// The notebook window group's id, so File › New Tab and New Window
    /// can always open a new window (by value, SwiftUI brings forward one
    /// already showing that value instead).
    static let sceneID = "workspace"

    /// A new notebook window asked for by File › New Tab or New Window: the
    /// folder it shows, and whether it opens as a window of its own.
    struct Request: Equatable {
        var id = UUID()
        var folder: URL
        var alone: Bool
    }

    /// The request the next notebook window opened on nothing takes. It
    /// lapses after a moment if no window takes it.
    private(set) static var pending: Request?

    /// True until shortly after launch, while the system restores windows:
    /// they come back as they were, tabbed or not, so none is added to
    /// another by hand.
    static var launching = true

    /// Opens a new notebook window on `folder`, as a tab of the front
    /// window or, with `alone`, a window of its own.
    static func open(folder: URL, alone: Bool, with openWindow: (String) -> Void) {
        let request = Request(folder: folder, alone: alone)
        pending = request
        openWindow(sceneID)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if pending == request { pending = nil }
        }
    }

    /// Hands the pending request to the window that takes it.
    static func take(_ request: Request) {
        if pending == request { pending = nil }
    }

    /// Makes `window` one of the app's tabbable windows. Called once the
    /// window exists; if AppKit hasn't already made it a tab of the front
    /// window, it is added as one, unless `alone`.
    static func join(_ window: NSWindow, alone: Bool = false) {
        windows.add(window)
        guard window.tabbingIdentifier != identifier else { return }
        window.tabbingIdentifier = identifier
        if alone {
            window.tabbingMode = .disallowed
            // Later windows may still join this one as tabs.
            DispatchQueue.main.async { window.tabbingMode = .preferred }
            return
        }
        window.tabbingMode = .preferred
        guard !launching else { return }
        // SwiftUI may show the window before this runs, which is too late
        // for AppKit to tab it; then add it to the front window by hand.
        // The front window is taken now, before the new one becomes main.
        guard let host = host(for: window) else { return }
        DispatchQueue.main.async { [weak host] in
            guard let host, (window.tabbedWindows?.count ?? 1) <= 1,
                  host.tabbedWindows?.contains(window) != true
            else { return }
            host.addTabbedWindow(window, ordered: .above)
            window.makeKeyAndOrderFront(nil)
        }
    }

    /// File › Close (⌘W, #407): closes `window`, which is the active tab
    /// of its window when it has tabs, never the other tabs. Its delegate
    /// still asks to save unsaved edits first.
    static func close(_ window: NSWindow?) {
        window?.performClose(nil)
    }

    /// Closing the last tab leaves the app running, as Mac document apps
    /// do (#407), and a new window opens on the start screen instead.
    static let quitsAfterLastTab = false

    /// Opens a window by scene id, from the app's menus, which exist with
    /// no window open. Set by `NewCommands`. By id, not by value as
    /// `OpenRequests.useFallback` opens, so the window that is closing,
    /// which may still show the same folder, is never brought back.
    private(set) static var openByID: ((String) -> Void)?

    static func useOpener(_ open: ((String) -> Void)?) {
        openByID = open
    }

    /// The app's notebook, text file and terminal windows that are open.
    static let windows = OpenWindows()

    /// Notes what `window` shows: its folder, and whether that is the
    /// start screen (#416).
    static func note(_ window: NSWindow, folder: URL?, start: Bool) {
        windows.note(window, folder: folder, start: start)
    }

    /// Whether any of the app's windows is open.
    static var anyOpen: Bool { windows.any }

    /// After the last tab closed (#407): a new window on `folder`, which
    /// shows the start screen (New Notebook) until a notebook is chosen.
    static func openStart(folder: URL) {
        guard let openByID else { return }
        open(folder: folder, alone: true, with: openByID)
    }

    /// Marks `window`'s tab with a dot while its notebook's kernel is busy
    /// (#247), so a run in a background tab shows. Nothing while idle.
    static func markBusy(_ window: NSWindow, _ busy: Bool) {
        let marked = window.tab.accessoryView != nil
        guard busy != marked else { return }
        window.tab.accessoryView = busy ? busyDot() : nil
    }

    private static func busyDot() -> NSView {
        let image = NSImage(systemSymbolName: "circle.fill", accessibilityDescription: "Kernel running")
        let view = NSImageView(image: image ?? NSImage())
        view.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 7, weight: .regular)
        view.contentTintColor = .controlAccentColor
        view.toolTip = "Kernel running"
        return view
    }

    /// The window a new one joins: the main window, if it is another of
    /// ours and visible.
    private static func host(for window: NSWindow) -> NSWindow? {
        guard let app = NSApp as NSApplication?,
              let main = app.mainWindow ?? app.keyWindow,
              main !== window,
              main.isVisible,
              main.tabbingIdentifier == identifier
        else { return nil }
        return main
    }
}

/// The app's notebook, text file and terminal windows that are open,
/// hidden, minimized or not: added as each joins, removed as it closes.
/// AppKit's own window list can't say: `isVisible` is false for every
/// window while the app is hidden (#416).
@MainActor
final class OpenWindows {
    /// What one window shows.
    private final class Place {
        /// The folder a start window opens on; nil for the default folder.
        var folder: URL?
        /// Whether it shows the start screen: a folder, no notebook.
        var start = false
    }

    private let places = NSMapTable<NSWindow, Place>.weakToStrongObjects()

    func add(_ window: NSWindow) {
        if places.object(forKey: window) == nil { places.setObject(Place(), forKey: window) }
    }

    func note(_ window: NSWindow, folder: URL?, start: Bool) {
        add(window)
        let place = places.object(forKey: window)
        place?.folder = folder
        place?.start = start
    }

    var any: Bool {
        places.keyEnumerator().nextObject() != nil
    }

    /// `window` is closing. If it was the app's last window, the folder for
    /// a start window to open on (an inner nil meaning the default
    /// folder); `.none` if none should open: another window is still open,
    /// the window isn't ours, or it showed the start screen already, so
    /// closing it leaves the app with no window, as Mac document apps
    /// allow (#416).
    func closing(_ window: NSWindow) -> URL?? {
        guard let place = places.object(forKey: window) else { return .none }
        places.removeObject(forKey: window)
        guard !any, !place.start else { return .none }
        return .some(place.folder)
    }
}

#endif
