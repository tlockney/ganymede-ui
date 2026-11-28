#if os(macOS)
import AppKit
import SwiftUI

/// Renders all window tab sessions inside a single `ZStack` (preserving
/// per-tab `WKWebView`, editor, and terminal lifetimes across tab switches,
/// in-strip reordering, and cross-window handoff) (#904, #905).
struct WorkspaceTabHost: View {
    var controller: WorkspaceTabController
    let onOpenFile: (String, Place) -> Void
    let onOpenTabRequest: (TabRequest) -> Void

    @State private var hostWindow = WeakWindow()

    var body: some View {
        ZStack {
            ForEach(controller.sessions) { session in
                sessionView(session)
                    .id(session.id)
                    .opacity(session.id == controller.selectedID ? 1 : 0)
                    .allowsHitTesting(session.id == controller.selectedID)
                    .accessibilityHidden(session.id != controller.selectedID)
            }
        }
        .background(
            WindowReader { window in
                hostWindow.window = window
                registerHost(window)
            }
        )
        .onChange(of: controller.selectedID) { oldID, newID in
            guard oldID != newID, let window = hostWindow.window else { return }
            handleTabSwitchFocus(from: oldID, to: newID, in: window)
        }
        .onDisappear {
            if let window = hostWindow.window {
                WorkspaceTabs.unregisterCustomTabHost(for: window)
            }
        }
    }

    @ViewBuilder
    private func sessionView(_ session: WorkspaceTabController.Session) -> some View {
        switch session.payload {
        case .page(let tab):
            PageTabContentView(
                tab: tab,
                onOpenFile: onOpenFile,
                onOpenTabRequest: onOpenTabRequest,
                onSyncDescriptor: { place, machineName in
                    controller.syncPageTab(id: session.id, place: place, machineName: machineName)
                }
            )
        case .terminal(let tab):
            let selected = session.id == controller.selectedID
            TerminalWindow(
                target: tab.target,
                inPanel: false,
                onTitle: { controller.updateTerminalTitle(id: session.id, title: $0) },
                focused: selected,
                handoff: tab.handoffID,
                reveal: {
                    controller.select(session.id)
                },
                shutDown: {
                    controller.closeTab(session.id, in: hostWindow.window)
                },
                ownWindow: false,
                onAvailabilityChange: { connected, ended in
                    controller.updateTerminalAvailability(id: session.id, connected: connected, ended: ended)
                }
            )
            .background(TerminalTabSurface())
        case .editor(let tab):
            EditorTabContentView(
                tab: tab,
                onSyncDescriptor: { machineName in
                    controller.syncEditorTab(id: session.id, machineName: machineName)
                }
            )
        }
    }

    private func registerHost(_ window: NSWindow) {
        WorkspaceTabs.registerCustomTabHost(
            for: window,
            actions: WorkspaceTabs.CustomTabActions(
                closeActiveTab: {
                    guard controller.canCloseInPlace else { return false }
                    controller.closeTab(controller.selectedID, in: window)
                    return true
                },
                openNewTab: { newTarget in
                    openTargetInWindow(newTarget, reuseExisting: false)
                },
                selectNextTab: { controller.selectNext() },
                selectPreviousTab: { controller.selectPrevious() },
                openTab: { newTarget, reuseExisting in
                    openTargetInWindow(newTarget, reuseExisting: reuseExisting)
                },
                openEditor: { request in
                    openEditorInWindow(request)
                },
                openTerminal: { request in
                    openTerminalInWindow(request)
                },
                newNotebook: { serverFolder in
                    openNewNotebookInWindow(serverFolder: serverFolder)
                }
            )
        )
    }

    private func openTargetInWindow(_ target: WindowTarget, reuseExisting: Bool) -> Bool {
        let model = AppModel.shared
        let place = model.place(for: target)
        let machineName = place.machineID.flatMap(model.machineName(_:))
        controller.addPageTab(
            target: target,
            place: place,
            machineName: machineName,
            thisMacRoot: model.thisMacRoot(for: place)?.path,
            reuseExisting: reuseExisting
        )
        return true
    }

    private func openEditorInWindow(_ request: EditorRequest) -> Bool {
        let model = AppModel.shared
        let machineName = request.machine.flatMap(model.machineName(_:))
        let sidebarRoot = controller.activePage?.sidebarRoot
            ?? controller.activeEditor?.sidebarRoot
            ?? controller.activeTerminal?.sidebarRoot
            ?? model.root
        controller.addEditorTab(request: request, machineName: machineName, sidebarRoot: sidebarRoot)
        return true
    }

    private func openTerminalInWindow(_ request: TerminalRequest) -> Bool {
        let model = AppModel.shared
        let sidebarRoot: URL = switch request.target {
        case .local(let folder):
            folder ?? controller.activePage?.sidebarRoot ?? model.root
        case .server(let id, let folder):
            WindowTarget.machine(id.uuidString, path: folder ?? "/", isFolder: true)?.folder
                ?? controller.activePage?.sidebarRoot
                ?? model.root
        case .ssh:
            controller.activePage?.sidebarRoot ?? model.root
        }
        controller.addTerminalTab(target: request.target, handoffID: request.id, sidebarRoot: sidebarRoot)
        return true
    }

    private func openNewNotebookInWindow(serverFolder: String) -> Bool {
        let model = AppModel.shared
        let basePlace = controller.activePage.map { $0.place(using: { model.place(for: $0) }) } ?? .thisDevice
        let baseFolder = controller.activePage?.sidebarRoot
            ?? controller.activeEditor?.sidebarRoot
            ?? controller.activeTerminal?.sidebarRoot
            ?? model.root
        let nextTarget = WindowTarget.newTab(place: basePlace, folder: baseFolder, root: model.root)
        let resolvedPlace = model.place(for: nextTarget)
        let machineName = resolvedPlace.machineID.flatMap(model.machineName(_:))
        let id = controller.addPageTab(
            target: nextTarget,
            place: resolvedPlace,
            machineName: machineName,
            thisMacRoot: model.thisMacRoot(for: resolvedPlace)?.path,
            reuseExisting: false
        )
        if let page = controller.sessions.first(where: { $0.id == id })?.pageTab?.page {
            page.run("new-notebook", arg: serverFolder)
        }
        return true
    }

    private func handleTabSwitchFocus(from oldID: UUID, to newID: UUID, in window: NSWindow) {
        if WorkspaceTabs.isFindFieldResponder(in: window) { return }
        guard let newSession = controller.sessions.first(where: { $0.id == newID }) else { return }
        let responder = window.firstResponder
        let shouldMoveFocus: Bool = {
            if responder == nil || responder === window { return true }
            if let oldSession = controller.sessions.first(where: { $0.id == oldID }),
               sessionOwnsResponder(oldSession, responder: responder) {
                return true
            }
            if let view = responder as? NSView,
               !(view is NSTableView || view is NSOutlineView
                 || String(describing: type(of: view)).contains("TerminalView")) {
                if let tv = view as? NSTextView, tv.delegate is FindNSTextField {
                    return false
                }
                return !(view is FindNSTextField)
            }
            return false
        }()
        guard shouldMoveFocus else { return }
        DispatchQueue.main.async {
            guard controller.selectedID == newID,
                  !WorkspaceTabs.isFindFieldResponder(in: window)
            else { return }
            switch newSession.payload {
            case .page(let tab):
                window.makeFirstResponder(tab.page.webView)
            case .editor(let tab):
                window.makeFirstResponder(tab.document.textView)
            case .terminal:
                break
            }
        }
    }

    private func sessionOwnsResponder(_ session: WorkspaceTabController.Session, responder: NSResponder?) -> Bool {
        guard let view = responder as? NSView else { return false }
        switch session.payload {
        case .page(let tab):
            guard let web = tab.page.webView else { return false }
            return view === web || view.isDescendant(of: web)
        case .editor(let tab):
            guard let textView = tab.document.textView else { return false }
            return view === textView || view.isDescendant(of: textView)
        case .terminal:
            return String(describing: type(of: view)).contains("TerminalView")
        }
    }
}

private struct TerminalTabSurface: View {
    @Environment(\.colorScheme) private var colorScheme
    var body: some View {
        TabStripPalette(colorScheme: colorScheme).activeSurface(for: .terminal)
    }
}

/// Live web-view pane for every `.page` tab inside `WorkspaceTabHost` (#904, #905).
/// Backed by a `PageWebViewStore` owned by `PageTabState` so cross-window
/// detaching, docking, and merging reparent the live `WKWebView` without reloading.
private struct PageTabContentView: View {
    let tab: PageTabState
    let onOpenFile: (String, Place) -> Void
    let onOpenTabRequest: (TabRequest) -> Void
    let onSyncDescriptor: (Place, String?) -> Void

    @Environment(AppModel.self) private var model

    private var currentPlace: Place {
        tab.currentPlace(using: { model.place(for: $0) })
    }

    private var place: Place {
        tab.place(using: { model.place(for: $0) })
    }

    private var machineName: String? {
        place.machineID.flatMap(model.machineName(_:))
    }

    private var pageURL: URL? {
        model.page(for: tab.loaded)
    }

    private var showsMachineHeader: Bool {
        guard place.isMachine else { return false }
        if case .machineFolder = tab.effectiveTarget { return !tab.page.state.hasNotebook }
        return false
    }

    private var webViewStore: PageWebViewStore {
        if let existing = tab.webViewStore as? PageWebViewStore,
           existing.pagePlace == tab.pagePlace {
            return existing
        }
        tab.retireWebView()
        let created = PageWebViewStore(
            pagePlace: tab.pagePlace,
            place: place,
            sharesName: model.sharesName(for: place),
            usesDevice: model.usesDevice(for: place),
            pageRoot: model.pageRoot(for: place)
        )
        tab.webViewStore = created
        return created
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsMachineHeader {
                MachineSurfaceHeader(
                    name: machineName ?? "Machine",
                    reachable: PlaceReachability.shared.isReachable(place)
                )
            }
            Group {
                if let url = pageURL {
                    WebView(
                        url: url,
                        onNavigate: { navURL in
                            tab.follow(navURL, place: place, placeResolver: { model.place(for: $0) })
                        },
                        document: tab.document,
                        page: tab.page,
                        onOpenTab: onOpenTabRequest,
                        onOpenFile: { path in onOpenFile(path, place) },
                        place: place,
                        sharesName: model.sharesName(for: place),
                        usesDevice: model.usesDevice(for: place),
                        pageRoot: model.pageRoot(for: place),
                        onLoad: {
                            tab.readPlace(currentPlace: currentPlace, thisMacRoot: { model.thisMacRoot(for: $0) })
                        },
                        store: webViewStore
                    )
                    .id(tab.pagePlace)
                } else if model.error != nil {
                    startProblem
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .task { model.startIfNeeded() }
            .onAppear { model.refreshThisMac() }
            .onChange(of: currentPlace) { _, now in
                tab.applyDowngradeIfNeeded(currentPlace: now)
            }
        }
        .onChange(of: tab.page.state, initial: true) { _, _ in
            onSyncDescriptor(place, machineName)
        }
        .onChange(of: tab.target) { _, _ in
            onSyncDescriptor(place, machineName)
        }
        .onChange(of: place) { _, _ in
            onSyncDescriptor(place, machineName)
        }
        .onChange(of: machineName) { _, _ in
            onSyncDescriptor(place, machineName)
        }
    }

    @ViewBuilder
    private var startProblem: some View {
        VStack(spacing: 12) {
            Text("Ganymede could not start").font(.headline)
            Text(model.error ?? "")
                .textSelection(.enabled)
                .multilineTextAlignment(.center)
            Button("Try Again") { model.start() }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// Live text editor pane for an `.editor` tab inside `WorkspaceTabHost` (#904).
private struct EditorTabContentView: View {
    let tab: EditorTabState
    let onSyncDescriptor: (String?) -> Void

    @Environment(AppModel.self) private var model

    private var machineName: String? {
        tab.request.machine.flatMap(model.machineName(_:))
    }

    var body: some View {
        EditorWindow(document: tab.document, ownWindow: false)
            .onChange(of: machineName, initial: true) { _, newName in
                onSyncDescriptor(newName)
            }
    }
}
#endif
