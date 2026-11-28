#if os(macOS)
import AppKit
import WebKit

/// Notebooks, text files and terminals as tabs of one window (#247), with
/// AppKit's own window tabs: every app window shares one tabbing
/// identifier and prefers tabs, so a new one joins the front window as a
/// tab. AppKit gives the tab bar, dragging a tab out into a window,
/// Window › Merge All Windows and Move Tab to New Window, and each tab
/// keeps its own toolbar, so the toolbar follows the active tab. This
/// holds whatever System Settings › Desktop & Dock › "Prefer tabs when
/// opening documents" says.
///
/// Step 6 (#844, #903) investigated `NSWindowTab` (`NSWindowTab.h`): it
/// exposes only `title`, `attributedTitle`, `toolTip`, and a right-aligned
/// `accessoryView`, so it cannot render a taller page-joined active tab,
/// a 1.5pt colored top edge, or distinct silhouettes for notebook chips,
/// outlined machine capsules, and dark mono terminal chips. When
/// Developer Settings' `SettingsTab.customTabsKey` prototype toggle is on
/// (off by default), `WorkspaceTabs` opts windows out of `NSWindowTabGroup`
/// and routes `⌘T` / `⌘W` and tab opens to the front window's
/// `WorkspaceTabController`.
@MainActor
enum WorkspaceTabs {
    static let identifier = "ganymede.workspace"
    /// The notebook window group's id, so File › New Tab and New Window
    /// can always open a new window (by value, SwiftUI brings forward one
    /// already showing that value instead).
    static let sceneID = "workspace"

    /// Defaults store checked for the Step 6 custom tab strip toggle
    /// (swappable in tests).
    static var defaults: UserDefaults = .standard

    /// Whether the experimental Step 6 custom tab strip is enabled (#903);
    /// false by default so AppKit window tabs remain unchanged.
    static var isCustomStripEnabled: Bool {
        defaults.bool(forKey: SettingsTab.customTabsKey)
    }

    struct CustomTabActions {
        var closeActiveTab: @MainActor () -> Bool
        var openNewTab: @MainActor (WindowTarget) -> Bool
        var selectNextTab: @MainActor () -> Void
        var selectPreviousTab: @MainActor () -> Void
        var openTab: @MainActor (WindowTarget, Bool) -> Bool
        var openEditor: @MainActor (EditorRequest) -> Bool
        var openTerminal: @MainActor (TerminalRequest) -> Bool
        var newNotebook: @MainActor (String) -> Bool

        init(
            closeActiveTab: @escaping @MainActor () -> Bool,
            openNewTab: @escaping @MainActor (WindowTarget) -> Bool,
            selectNextTab: @escaping @MainActor () -> Void,
            selectPreviousTab: @escaping @MainActor () -> Void,
            openTab: (@MainActor (WindowTarget, Bool) -> Bool)? = nil,
            openEditor: @escaping @MainActor (EditorRequest) -> Bool = { _ in false },
            openTerminal: @escaping @MainActor (TerminalRequest) -> Bool = { _ in false },
            newNotebook: @escaping @MainActor (String) -> Bool = { _ in false }
        ) {
            self.closeActiveTab = closeActiveTab
            self.openNewTab = openNewTab
            self.selectNextTab = selectNextTab
            self.selectPreviousTab = selectPreviousTab
            self.openTab = openTab ?? { target, _ in openNewTab(target) }
            self.openEditor = openEditor
            self.openTerminal = openTerminal
            self.newNotebook = newNotebook
        }
    }

    private final class CustomTabBox {
        let actions: CustomTabActions
        init(_ actions: CustomTabActions) { self.actions = actions }
    }

    private static let customHosts = NSMapTable<NSWindow, CustomTabBox>.weakToStrongObjects()
    private static let controllers = NSMapTable<NSWindow, WorkspaceTabController>.weakToWeakObjects()

    static func registerCustomTabHost(for window: NSWindow, actions: CustomTabActions) {
        customHosts.setObject(CustomTabBox(actions), forKey: window)
    }

    static func unregisterCustomTabHost(for window: NSWindow) {
        if customHosts.object(forKey: window) != nil {
            customHosts.removeObject(forKey: window)
        }
    }

    static func registerController(_ controller: WorkspaceTabController, for window: NSWindow) {
        if controllers.object(forKey: window) === controller { return }
        controllers.setObject(controller, forKey: window)
    }

    static func unregisterController(_ controller: WorkspaceTabController, for window: NSWindow) {
        if controllers.object(forKey: window) === controller {
            controllers.removeObject(forKey: window)
        }
    }

    static func controller(for window: NSWindow) -> WorkspaceTabController? {
        controllers.object(forKey: window)
    }

    static var allControllers: [(window: NSWindow, controller: WorkspaceTabController)] {
        var result: [(window: NSWindow, controller: WorkspaceTabController)] = []
        var seen = Set<ObjectIdentifier>()
        if let app = NSApp as NSApplication? {
            for window in app.orderedWindows {
                if let controller = controllers.object(forKey: window) {
                    seen.insert(ObjectIdentifier(window))
                    result.append((window, controller))
                }
            }
        }
        let enumerator = controllers.keyEnumerator()
        while let window = enumerator.nextObject() as? NSWindow {
            let id = ObjectIdentifier(window)
            if !seen.contains(id), let controller = controllers.object(forKey: window) {
                seen.insert(id)
                result.append((window, controller))
            }
        }
        return result
    }

    /// Returns the active `.page` tab's `WKWebView` for `window`, or `nil` if
    /// the active tab is a terminal/editor or no controller is registered (#904).
    static func activeWebView(for window: NSWindow) -> WKWebView? {
        controller(for: window)?.activeWebView
    }

    /// Returns the keyboard target when leaving a terminal in `window`: the
    /// active `.page` tab's `WKWebView` when a tab controller is registered
    /// (returning `nil` if the active tab is not `.page` so hidden background
    /// web views in the `ZStack` never capture focus), or `fallback()` when no
    /// controller is registered for `window`.
    static func pageResponder(
        for window: NSWindow,
        fallback: () -> NSResponder?
    ) -> NSResponder? {
        if let controller = controller(for: window) {
            return controller.activeWebView
        }
        return fallback()
    }

    /// Returns the active `.page` tab's `PageModel` when attached to `window`,
    /// or `nil` when the active tab is not a `.page` (#904).
    static func activePage(for window: NSWindow) -> PageModel? {
        guard let page = controller(for: window)?.activePage?.page,
              page.webView?.window === window
        else { return nil }
        return page
    }

    static func select(pageDocument: PageDocument, in window: NSWindow) {
        controller(for: window)?.select(pageDocument: pageDocument)
    }

    static func select(editorDocument: EditorDocument, in window: NSWindow) {
        controller(for: window)?.select(editorDocument: editorDocument)
    }

    /// Whether the sidebar's `FindField` currently owns keyboard input in `window`.
    static func isFindFieldResponder(in window: NSWindow) -> Bool {
        if window.firstResponder is FindNSTextField { return true }
        if let textView = window.firstResponder as? NSTextView,
           textView.delegate is FindNSTextField {
            return true
        }
        return false
    }

    /// A new notebook window asked for by File › New Tab or New Window: what
    /// it shows (a folder here, or a machine's), and whether it opens
    /// as a window of its own.
    struct Request: Equatable {
        var id = UUID()
        var target: WindowTarget
        var alone: Bool
    }

    /// The request the next notebook window opened on nothing takes. It
    /// lapses after a moment if no window takes it.
    private(set) static var pending: Request?

    /// True until shortly after launch, while the system restores windows:
    /// they come back as they were, tabbed or not, so none is added to
    /// another by hand.
    static var launching = true

    /// Opens a new notebook window on `target`, as a tab of the front
    /// window or, with `alone`, a window of its own.
    static func open(target: WindowTarget, alone: Bool, with openWindow: (String) -> Void) {
        if isCustomStripEnabled, !alone,
           let host = frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openNewTab(target) {
            return
        }
        let request = Request(target: target, alone: alone)
        pending = request
        openWindow(sceneID)
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            if pending == request { pending = nil }
        }
    }

    /// Opens a `WindowTarget` as an in-window tab when the custom tab strip is
    /// active, reusing an existing tab matching `target` across open windows
    /// when `reuseExisting` is true, or falls back to SwiftUI's `openWindow(value:)`.
    static func openTarget(
        _ target: WindowTarget,
        preferredWindow: NSWindow? = nil,
        reuseExisting: Bool = true,
        fallback: (WindowTarget) -> Void
    ) {
        if reuseExisting, focus(target) {
            return
        }
        if isCustomStripEnabled,
           let host = preferredWindow ?? frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openTab(target, reuseExisting) {
            host.makeKeyAndOrderFront(nil)
            return
        }
        fallback(target)
    }

    /// Opens a text file in an `.editor` tab when the custom tab strip is active,
    /// or falls back to `EditorWindow` via `openWindow(value:)`.
    static func openEditor(
        _ request: EditorRequest,
        preferredWindow: NSWindow? = nil,
        fallback: (EditorRequest) -> Void
    ) {
        if isCustomStripEnabled {
            for pair in allControllers {
                if let existing = pair.controller.sessions.first(where: {
                    $0.editorTab?.request == request
                }) {
                    pair.controller.select(existing.id)
                    pair.window.makeKeyAndOrderFront(nil)
                    return
                }
            }
            if let host = preferredWindow ?? frontCustomHostWindow(),
               let box = customHosts.object(forKey: host),
               box.actions.openEditor(request) {
                host.makeKeyAndOrderFront(nil)
                return
            }
        }
        fallback(request)
    }

    /// Opens a terminal in a `.terminal` tab when the custom tab strip is active,
    /// or falls back to `TerminalWindow` via `openWindow(value:)`.
    static func openTerminal(
        _ request: TerminalRequest,
        preferredWindow: NSWindow? = nil,
        fallback: (TerminalRequest) -> Void
    ) {
        if isCustomStripEnabled,
           let host = preferredWindow ?? frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openTerminal(request) {
            host.makeKeyAndOrderFront(nil)
            return
        }
        fallback(request)
    }

    /// Opens a new notebook in `folderPath` in the front custom-tab window when
    /// no `.page` tab is currently focused, or falls back otherwise.
    static func newNotebook(
        in folderPath: String,
        preferredWindow: NSWindow? = nil,
        fallback: () -> Void
    ) {
        if isCustomStripEnabled,
           let host = preferredWindow ?? frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.newNotebook(folderPath) {
            host.makeKeyAndOrderFront(nil)
            return
        }
        fallback()
    }

    private static func frontCustomHostWindow() -> NSWindow? {
        if let app = NSApp as NSApplication? {
            for candidate in [app.keyWindow, app.mainWindow].compactMap({ $0 }) {
                if customHosts.object(forKey: candidate) != nil { return candidate }
            }
            for candidate in app.orderedWindows {
                if customHosts.object(forKey: candidate) != nil { return candidate }
            }
        }
        return allControllers.first { customHosts.object(forKey: $0.window) != nil }?.window
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
        if isCustomStripEnabled {
            if window.tabbingMode != .disallowed {
                window.tabbingMode = .disallowed
            }
            return
        }
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
        if isCustomStripEnabled, let window,
           let box = customHosts.object(forKey: window),
           box.actions.closeActiveTab() {
            return
        }
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

    /// Notes what `window` shows: its target, its folder, and whether that
    /// is the start screen (#416, #884).
    static func note(_ window: NSWindow, target: WindowTarget? = nil, folder: URL?, start: Bool) {
        windows.note(window, target: target, folder: folder, start: start)
    }

    /// Brings forward an open window or tab already showing `target` (#884),
    /// searching both custom-tab `WorkspaceTabController` stores and native
    /// AppKit `OpenWindows`, and returning whether one was found.
    @discardableResult
    static func focus(_ target: WindowTarget) -> Bool {
        let app = NSApp as NSApplication?
        if isCustomStripEnabled {
            if let preferred = app?.keyWindow ?? app?.mainWindow,
               let controller = controller(for: preferred),
               focus(target, in: controller, window: preferred) {
                return true
            }
            for pair in allControllers {
                if focus(target, in: pair.controller, window: pair.window) {
                    return true
                }
            }
        }
        guard let window = windows.window(
            showing: target,
            preferring: app?.keyWindow ?? app?.mainWindow,
            ordered: app?.orderedWindows ?? []
        ) else { return false }
        focus(window)
        return true
    }

    private static func focus(
        _ target: WindowTarget,
        in controller: WorkspaceTabController,
        window: NSWindow
    ) -> Bool {
        guard let existing = controller.sessions.first(where: {
            $0.pageTab?.effectiveTarget.matchesOpenTarget(target) == true
        }) else {
            return false
        }
        if window.isMiniaturized { window.deminiaturize(nil) }
        controller.select(existing.id)
        window.makeKeyAndOrderFront(nil)
        return true
    }

    /// Focuses an open tab showing `target` if one exists, otherwise opens
    /// `serverPath` in `page` (or invokes `fallback` when no `.page` tab is active, #884, #904).
    static func openOrFocus(
        _ target: WindowTarget?,
        serverPath: String,
        in page: PageModel?,
        fallback onOpenNotebook: ((String) -> Void)? = nil
    ) {
        if let target, focus(target) { return }
        if let page {
            page.run("open", arg: serverPath)
        } else {
            onOpenNotebook?(serverPath)
        }
    }

    /// Focuses an open tab showing `target` if one exists, otherwise opens
    /// a new tab in `preferredWindow` or via `openWindow` (#884, #904).
    static func openOrFocusTab(
        _ target: WindowTarget,
        preferredWindow: NSWindow? = nil,
        with openWindow: (WindowTarget) -> Void
    ) {
        openTarget(target, preferredWindow: preferredWindow, reuseExisting: true, fallback: openWindow)
    }

    private static func focus(_ window: NSWindow) {
        if window.isMiniaturized { window.deminiaturize(nil) }
        window.tabGroup?.selectedWindow = window
        window.makeKeyAndOrderFront(nil)
    }

    /// Whether any of the app's windows is open.
    static var anyOpen: Bool { windows.any }

    /// After the last tab closed (#407): a new window on `folder`, which
    /// shows the start screen (New Notebook) until a notebook is chosen.
    static func openStart(folder: URL) {
        guard let openByID else { return }
        open(target: .folder(folder), alone: true, with: openByID)
    }

    /// Focuses an existing workspace window, or opens a new one on `folder`
    /// when none is open (#924). Used by the menu bar's Open Window item.
    static func focusOrOpen(folder: URL, with openWindow: (String) -> Void) {
        NSApp.activate()
        if let existing = windows.frontmost {
            if existing.isMiniaturized { existing.deminiaturize(nil) }
            existing.makeKeyAndOrderFront(nil)
            return
        }
        open(target: .folder(folder), alone: true, with: openWindow)
    }

    /// Marks `window`'s tab with a dot while its notebook's kernel is busy
    /// (#247), so a run in a background tab shows. Nothing while idle.
    static func markBusy(_ window: NSWindow, _ busy: Bool) {
        if isCustomStripEnabled {
            if window.tab.accessoryView != nil {
                window.tab.accessoryView = nil
            }
            return
        }
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
        /// What the window currently shows (#884).
        var target: WindowTarget?
        /// The folder a start window opens on; nil for the default folder.
        var folder: URL?
        /// Whether it shows the start screen: a folder, no notebook.
        var start = false
    }

    private let places = NSMapTable<NSWindow, Place>.weakToStrongObjects()

    func add(_ window: NSWindow) {
        if places.object(forKey: window) == nil { places.setObject(Place(), forKey: window) }
    }

    func note(_ window: NSWindow, target: WindowTarget? = nil, folder: URL?, start: Bool) {
        add(window)
        let place = places.object(forKey: window)
        if let target { place?.target = target }
        place?.folder = folder
        place?.start = start
    }

    /// The open window showing `target` (#884), preferring `preferred`, then
    /// the frontmost match in `ordered`.
    func window(
        showing target: WindowTarget,
        preferring preferred: NSWindow? = nil,
        ordered: [NSWindow] = []
    ) -> NSWindow? {
        var candidates: [NSWindow] = []
        let enumerator = places.keyEnumerator()
        while let window = enumerator.nextObject() as? NSWindow {
            guard let recorded = places.object(forKey: window)?.target,
                  recorded.matchesOpenTarget(target)
            else { continue }
            candidates.append(window)
        }
        guard !candidates.isEmpty else { return nil }
        if let preferred, candidates.contains(where: { $0 === preferred }) {
            return preferred
        }
        for window in ordered {
            if candidates.contains(where: { $0 === window }) {
                return window
            }
        }
        return candidates.first
    }

    var any: Bool {
        places.keyEnumerator().nextObject() != nil
    }

    /// A tracked workspace window to bring to front (#924): prefers the
    /// current key or main window, then any visible window, then any tracked
    /// (minimized or hidden) window.
    var frontmost: NSWindow? {
        var tracked: [NSWindow] = []
        let enumerator = places.keyEnumerator()
        while let window = enumerator.nextObject() as? NSWindow {
            tracked.append(window)
        }
        if let app = NSApp as NSApplication? {
            if let key = app.keyWindow, tracked.contains(key) { return key }
            if let main = app.mainWindow, tracked.contains(main) { return main }
        }
        return tracked.first(where: \.isVisible) ?? tracked.first
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
