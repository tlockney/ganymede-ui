#if os(macOS)
import AppKit
import Observation
import WebKit

/// Notebooks, text files, connected machines, and terminals as tabs of one
/// workspace window (#247, #844, #904, #905).
///
/// Each macOS workspace window owns a `WorkspaceTabController` and opts out of
/// AppKit's `NSWindowTabGroup` (`window.tabbingMode = .disallowed`) so the
/// custom page-joined `WorkspaceTabStrip` renders distinct silhouettes for
/// notebooks/editors, connected machines, and terminals while supporting
/// drag-reorder, drag-detach, cross-window docking, `Merge All Windows`,
/// `Move Tab to New Window`, `Show All Tabs` (`⇧⌘\`), `⌘1`–`⌘9`, `⌃Tab`/
/// `⌃⇧Tab`, and multi-tab session restoration across relaunch.
@MainActor
enum WorkspaceTabs {
    static let identifier = "ganymede.workspace"
    /// The notebook window group's id, so File › New Tab, New Window, and
    /// detached windows can always open a fresh window.
    static let sceneID = "workspace"

    /// Observable window-registry state so Window menu commands (`Merge All
    /// Windows`) reactively enable/disable as workspace windows open and close.
    @MainActor
    @Observable
    final class RegistryState {
        var windowCount = 0
        var revision = 0
    }

    static let registryState = RegistryState()

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
    private static var keyMonitor: Any?

    static func registerCustomTabHost(for window: NSWindow, actions: CustomTabActions) {
        customHosts.setObject(CustomTabBox(actions), forKey: window)
    }

    static func unregisterCustomTabHost(for window: NSWindow) {
        customHosts.removeObject(forKey: window)
    }

    static func registerController(_ controller: WorkspaceTabController, for window: NSWindow) {
        controllers.setObject(controller, forKey: window)
        refreshRegistryState()
    }

    static func unregisterController(_ controller: WorkspaceTabController, for window: NSWindow) {
        if controllers.object(forKey: window) === controller {
            controllers.removeObject(forKey: window)
        }
        refreshRegistryState()
    }

    static func controller(for window: NSWindow) -> WorkspaceTabController? {
        controllers.object(forKey: window)
    }

    static func frontController() -> WorkspaceTabController? {
        if let app = NSApp as NSApplication? {
            for candidate in [app.keyWindow, app.mainWindow].compactMap({ $0 }) {
                if let controller = controllers.object(forKey: candidate) {
                    return controller
                }
            }
        }
        return allControllers.first?.controller
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

    private static func refreshRegistryState() {
        let count = allControllers.count
        if registryState.windowCount != count {
            registryState.windowCount = count
        }
        registryState.revision &+= 1
    }

    /// Closes a window whose remaining tab(s) were transferred to another
    /// window (cross-window docking or `Merge All Windows`) without prompting
    /// for unsaved edits or opening a stray start window (#905).
    static func closeEmptiedWindow(_ window: NSWindow, controller: WorkspaceTabController) {
        controller.detachAll(from: window, retireResources: false)
        unregisterController(controller, for: window)
        unregisterCustomTabHost(for: window)
        _ = windows.closing(window)
        window.close()
    }

    /// Installs a lightweight local key monitor so `⌃Tab` / `⌃⇧Tab` reliably
    /// cycle workspace tabs even when `WKWebView` or `TerminalView` has focus
    /// (preventing AppKit's key-view loop from intercepting Control-Tab) (#905).
    static func installKeyMonitor() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            guard let cycle = TabShortcutResolver.matchTabCycle(
                keyCode: event.keyCode,
                control: flags.contains(.control),
                shift: flags.contains(.shift),
                command: flags.contains(.command),
                option: flags.contains(.option)
            ) else {
                return event
            }
            let eventWindowNumber = event.windowNumber
            let handled = MainActor.assumeIsolated { () -> Bool in
                guard let app = NSApp as NSApplication?,
                      app.modalWindow == nil
                else { return false }
                let targetWindow = app.window(withWindowNumber: eventWindowNumber) ?? app.keyWindow
                guard let window = targetWindow,
                      window.attachedSheet == nil,
                      let controller = WorkspaceTabs.controller(for: window),
                      controller.sessions.count > 1
                else { return false }
                switch cycle {
                case .next:
                    controller.selectNext()
                case .previous:
                    controller.selectPrevious()
                }
                return true
            }
            return handled ? nil : event
        }
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

    /// True until shortly after launch, while the system restores windows.
    static var launching = true

    /// Opens `target` as a new tab of the front workspace window or, when
    /// `alone` is true (or no workspace window is open), as a window of its own.
    static func open(target: WindowTarget, alone: Bool, with openWindow: (String) -> Void) {
        if !alone,
           let host = frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openNewTab(target) {
            host.makeKeyAndOrderFront(nil)
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

    /// Opens a `WindowTarget` as an in-window tab, reusing an existing tab
    /// matching `target` across open windows when `reuseExisting` is true, or
    /// opens a new workspace window via `fallback`.
    static func openTarget(
        _ target: WindowTarget,
        preferredWindow: NSWindow? = nil,
        reuseExisting: Bool = true,
        fallback: (WindowTarget) -> Void
    ) {
        if reuseExisting, focus(target) {
            return
        }
        if let host = preferredWindow ?? frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openTab(target, reuseExisting) {
            host.makeKeyAndOrderFront(nil)
            return
        }
        fallback(target)
    }

    /// Opens a text file in an `.editor` tab (reusing an existing tab for the
    /// same file across open windows), or falls back to `EditorWindow`.
    static func openEditor(
        _ request: EditorRequest,
        preferredWindow: NSWindow? = nil,
        fallback: (EditorRequest) -> Void
    ) {
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
        fallback(request)
    }

    /// Opens a terminal in a `.terminal` tab of the front workspace window,
    /// or opens a new standalone workspace window with that terminal tab when
    /// no workspace window is open.
    static func openTerminal(
        _ request: TerminalRequest,
        preferredWindow: NSWindow? = nil,
        fallback: (TerminalRequest) -> Void
    ) {
        if let host = preferredWindow ?? frontCustomHostWindow(),
           let box = customHosts.object(forKey: host),
           box.actions.openTerminal(request) {
            host.makeKeyAndOrderFront(nil)
            return
        }
        if let openByID {
            let root: URL = switch request.target {
            case .local(let folder):
                folder ?? FileManager.default.homeDirectoryForCurrentUser
            case .server(let id, let folder):
                WindowTarget.machine(id.uuidString, path: folder ?? "/", isFolder: true)?.folder
                    ?? FileManager.default.homeDirectoryForCurrentUser
            case .ssh:
                FileManager.default.homeDirectoryForCurrentUser
            }
            let tab = TerminalTabState(handoffID: request.id, target: request.target, sidebarRoot: root)
            let session = WorkspaceTabController.Session(
                id: tab.id,
                descriptor: tab.descriptor(),
                payload: .terminal(tab)
            )
            WorkspaceTabHandoff.shared.openWindow(
                sessions: [session],
                selectedID: session.id,
                with: openByID
            )
            return
        }
        fallback(request)
    }

    /// Opens a new notebook in `folderPath` in the front workspace window when
    /// no `.page` tab is currently focused, or falls back otherwise.
    static func newNotebook(
        in folderPath: String,
        preferredWindow: NSWindow? = nil,
        fallback: () -> Void
    ) {
        if let host = preferredWindow ?? frontCustomHostWindow(),
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

    /// Registers `window` among the app's workspace windows and disables
    /// AppKit's native window tabbing so the custom `WorkspaceTabStrip` owns
    /// all window tabs without a duplicate native tab bar (#903, #905).
    static func join(_ window: NSWindow, alone: Bool = false) {
        windows.add(window)
        window.tabbingMode = .disallowed
    }

    /// File › Close (⌘W, #407): closes the front window's active tab when
    /// multiple tabs are open, or closes the window on its last tab (prompting
    /// for unsaved edits first).
    static func close(_ window: NSWindow?) {
        if let window,
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
    /// no window open. Set by `NewCommands`.
    private(set) static var openByID: ((String) -> Void)?

    static func useOpener(_ open: ((String) -> Void)?) {
        openByID = open
    }

    /// The app's workspace windows that are open.
    static let windows = OpenWindows()

    /// Notes what `window` shows: its target, its folder, and whether that
    /// is the start screen (#416, #884).
    static func note(_ window: NSWindow, target: WindowTarget? = nil, folder: URL?, start: Bool) {
        windows.note(window, target: target, folder: folder, start: start)
    }

    /// Brings forward an open window or tab already showing `target` (#884,
    /// #931), searching all open `WorkspaceTabController` stores first and
    /// falling back to `OpenWindows`.
    @discardableResult
    static func focus(_ target: WindowTarget) -> Bool {
        let app = NSApp as NSApplication?
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

    /// Clears any legacy AppKit window-tab accessory view; kernel status marks
    /// render directly on each tab chip in `WorkspaceTabStrip` (#903, #905).
    static func markBusy(_ window: NSWindow, _ busy: Bool) {
        if window.tab.accessoryView != nil {
            window.tab.accessoryView = nil
        }
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
