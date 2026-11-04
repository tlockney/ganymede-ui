#if os(macOS)
import AppKit

/// Notebooks, text files and terminals as tabs of one window (#247), with
/// AppKit's own window tabs: every app window shares one tabbing
/// identifier and prefers tabs, so a new one joins the front window as a
/// tab. AppKit gives the tab bar, dragging a tab out into a window,
/// Window › Merge All Windows and Move Tab to New Window, and each tab
/// keeps its own toolbar, so the toolbar follows the active tab.
@MainActor
enum WorkspaceTabs {
    static let identifier = "ganymede.workspace"

    /// Set before opening a window that should stand alone (File › New
    /// Window); the next window to join takes it and opens untabbed.
    static var nextOpensAlone = false

    /// Makes `window` one of the app's tabbable windows. Called once the
    /// window exists; if AppKit hasn't already made it a tab of the front
    /// window, it is added as one.
    static func join(_ window: NSWindow) {
        guard window.tabbingIdentifier != identifier else { return }
        window.tabbingIdentifier = identifier
        if nextOpensAlone {
            nextOpensAlone = false
            window.tabbingMode = .disallowed
            // Later windows may still join this one as tabs.
            DispatchQueue.main.async { window.tabbingMode = .preferred }
            return
        }
        window.tabbingMode = .preferred
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
