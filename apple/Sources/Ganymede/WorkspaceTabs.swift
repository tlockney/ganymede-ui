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

#endif
