#if os(macOS)
import AppKit
import Observation
import SwiftUI

/// In-window tab session manager for the Step 6 custom tab strip spike (#903).
/// Holds the primary `ContentView` tab plus any extra notebook, console,
/// machine, or terminal tabs opened inside the strip.
@MainActor
@Observable
final class WorkspaceTabController {
    enum SessionPayload {
        case primary
        case page(target: WindowTarget, page: PageModel, document: PageDocument)
        case terminal(target: TerminalTarget, title: String)
        case sampleConsole
        case sampleMachine(name: String)
        case sampleTerminal
    }

    struct Session: Identifiable {
        let id: UUID
        var descriptor: WorkspaceTabDescriptor
        var payload: SessionPayload
    }

    let primaryID = UUID()
    private(set) var sessions: [Session] = []
    var selectedID: UUID

    init() {
        selectedID = primaryID
        sessions = [
            Session(
                id: primaryID,
                descriptor: WorkspaceTabDescriptor(
                    id: primaryID,
                    kind: .notebook,
                    title: "Ganymede",
                    toolTip: "",
                    isPrimary: true,
                    isCloseable: false
                ),
                payload: .primary
            ),
        ]
    }

    var activeSession: Session? {
        sessions.first { $0.id == selectedID }
    }

    var descriptors: [WorkspaceTabDescriptor] {
        sessions.map(\.descriptor)
    }

    var isPrimarySelected: Bool {
        selectedID == primaryID
    }

    var canCloseInPlace: Bool {
        sessions.count > 1
    }

    /// Keeps Tab 0 synchronized with `ContentView`'s primary target and page state.
    func syncPrimary(
        target: WindowTarget,
        state: PageState,
        place: Place,
        machineName: String?,
        metadataTitle: String?
    ) {
        let updated = WorkspaceTabDescriptor.fromTarget(
            id: primaryID,
            target: target,
            state: state,
            place: place,
            machineName: machineName,
            metadataTitle: metadataTitle,
            isPrimary: true,
            isCloseable: false
        )
        if let index = sessions.firstIndex(where: { $0.id == primaryID }) {
            if sessions[index].descriptor != updated {
                sessions[index].descriptor = updated
            }
        }
    }

    /// Updates an extra page tab's descriptor from its own `PageModel`.
    func syncPageTab(
        id: UUID,
        target: WindowTarget,
        state: PageState,
        place: Place,
        machineName: String?
    ) {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else { return }
        let updated = WorkspaceTabDescriptor.fromTarget(
            id: id,
            target: target,
            state: state,
            place: place,
            machineName: machineName,
            metadataTitle: state.title,
            isPrimary: false,
            isCloseable: true
        )
        if sessions[index].descriptor != updated {
            sessions[index].descriptor = updated
        }
    }

    /// Updates a terminal tab's title when its shell sets OSC 0/2.
    func updateTerminalTitle(id: UUID, title: String) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              case .terminal(let target, _) = sessions[index].payload
        else { return }
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let shown = trimmed.isEmpty ? "zsh" : trimmed
        sessions[index].payload = .terminal(target: target, title: shown)
        sessions[index].descriptor = WorkspaceTabDescriptor.terminal(
            id: id,
            title: shown,
            toolTip: "Terminal: \(shown)"
        )
    }

    /// Adds or drops sample tabs when Developer Settings' sample toggle changes.
    func syncSampleTabs(enabled: Bool) {
        if !enabled {
            let hadSelectedSample = sessions.first(where: { $0.id == selectedID })?.descriptor.isSample == true
            sessions.removeAll { $0.descriptor.isSample }
            if hadSelectedSample { selectedID = primaryID }
            return
        }
        let existing = sessions.map(\.descriptor)
        let addons = WorkspaceTabDescriptor.sampleAddons(for: existing)
        for descriptor in addons {
            guard !sessions.contains(where: { $0.id == descriptor.id }) else { continue }
            let payload: SessionPayload = switch descriptor.kind {
            case .machine: .sampleMachine(name: descriptor.title)
            case .terminal: .sampleTerminal
            case .notebook, .editor: .sampleConsole
            }
            insertOrdered(Session(id: descriptor.id, descriptor: descriptor, payload: payload))
        }
    }

    @discardableResult
    func addPageTab(
        target: WindowTarget,
        place: Place,
        machineName: String?
    ) -> UUID {
        // Bring forward an existing matching tab instead of duplicating.
        if let existing = sessions.first(where: {
            if case .page(let t, _, _) = $0.payload { return t.shows(target) }
            return false
        }) {
            selectedID = existing.id
            return existing.id
        }
        let id = UUID()
        let page = PageModel()
        let document = PageDocument()
        let descriptor = WorkspaceTabDescriptor.fromTarget(
            id: id,
            target: target,
            state: page.state,
            place: place,
            machineName: machineName,
            metadataTitle: nil,
            isPrimary: false,
            isCloseable: true
        )
        insertOrdered(Session(id: id, descriptor: descriptor, payload: .page(target: target, page: page, document: document)))
        selectedID = id
        return id
    }

    @discardableResult
    func addTerminalTab(target: TerminalTarget) -> UUID {
        let id = UUID()
        let descriptor = WorkspaceTabDescriptor.terminal(id: id, title: "zsh")
        insertOrdered(Session(id: id, descriptor: descriptor, payload: .terminal(target: target, title: "zsh")))
        selectedID = id
        return id
    }

    func select(_ id: UUID) {
        guard sessions.contains(where: { $0.id == id }) else { return }
        selectedID = id
    }

    func selectNext() {
        guard sessions.count > 1, let index = sessions.firstIndex(where: { $0.id == selectedID }) else { return }
        selectedID = sessions[(index + 1) % sessions.count].id
    }

    func selectPrevious() {
        guard sessions.count > 1, let index = sessions.firstIndex(where: { $0.id == selectedID }) else { return }
        selectedID = sessions[(index - 1 + sessions.count) % sessions.count].id
    }

    /// Closes `id` when more than one tab is open. Returns `false` if this is
    /// the last tab (so the caller can fall back to `NSWindow.performClose`).
    @discardableResult
    func close(_ id: UUID) -> Bool {
        guard sessions.count > 1, let index = sessions.firstIndex(where: { $0.id == id }) else {
            return false
        }
        // Keep the primary slot intact as the window's anchor if closed while
        // other tabs exist? No, if an extra tab is open, closing the primary
        // slot falls back to window close only if it has unsaved changes or
        // let non-primary tabs close directly.
        if id == primaryID {
            return false
        }
        sessions.remove(at: index)
        if selectedID == id {
            selectedID = sessions[min(index, sessions.count - 1)].id
        }
        return true
    }

    func closeOthers(keeping id: UUID) {
        guard sessions.contains(where: { $0.id == id }) else { return }
        sessions.removeAll { $0.id != id && $0.id != primaryID }
        selectedID = sessions.contains(where: { $0.id == id }) ? id : primaryID
    }

    private func insertOrdered(_ session: Session) {
        if session.descriptor.group == .document,
           let firstEnv = sessions.firstIndex(where: { $0.descriptor.group == .environment }) {
            sessions.insert(session, at: firstEnv)
        } else {
            sessions.append(session)
        }
    }
}

/// Wraps `ContentView`'s detail `workspace` with the experimental custom tab
/// strip when enabled in Developer Settings (#903). When disabled (the default),
/// renders `content()` directly with zero extra views or window changes.
struct WorkspaceTabHost<Primary: View>: View {
    let enabled: Bool
    let samples: Bool
    let target: WindowTarget
    let place: Place
    let machineName: String?
    let metadataTitle: String?
    let windowTitle: String
    var page: PageModel
    var document: PageDocument
    let sidebarRoot: URL
    let windowTerminal: TerminalTarget?
    let onOpenFile: (String) -> Void
    let onOpenTabRequest: (TabRequest) -> Void
    @ViewBuilder let content: () -> Primary

    @Environment(AppModel.self) private var model
    @Environment(\.colorScheme) private var colorScheme
    @State private var controller = WorkspaceTabController()
    @State private var hostWindow = WeakWindow()

    var body: some View {
        Group {
            if enabled {
                VStack(spacing: 0) {
                    WorkspaceTabStrip(
                        tabs: controller.descriptors,
                        selectedID: controller.selectedID,
                        newMenu: newMenuItems,
                        onSelect: { controller.select($0) },
                        onClose: { closeTab($0) },
                        onCloseOthers: { controller.closeOthers(keeping: $0) }
                    )
                    ZStack {
                        VStack(spacing: 0) {
                            if controller.isPrimarySelected,
                               controller.activeSession?.descriptor.kind == .machine {
                                MachineSurfaceHeader(
                                    name: machineName ?? controller.activeSession?.descriptor.title ?? "Machine",
                                    reachable: PlaceReachability.shared.isReachable(place),
                                    isSample: false
                                )
                            }
                            content()
                        }
                        .opacity(controller.isPrimarySelected ? 1 : 0)
                        .allowsHitTesting(controller.isPrimarySelected)
                        .accessibilityHidden(!controller.isPrimarySelected)

                        ForEach(controller.sessions) { session in
                            if session.id != controller.primaryID {
                                extraSessionView(session)
                                    .opacity(session.id == controller.selectedID ? 1 : 0)
                                    .allowsHitTesting(session.id == controller.selectedID)
                                    .accessibilityHidden(session.id != controller.selectedID)
                            }
                        }
                    }
                }
            } else {
                content()
            }
        }
        .background(
            WindowReader { window in
                hostWindow.window = window
                syncWindowRegistration(window)
            }
        )
        .onChange(of: enabled, initial: true) { _, active in
            if active {
                syncPrimary()
                controller.syncSampleTabs(enabled: samples)
            } else {
                controller.syncSampleTabs(enabled: false)
                controller.select(controller.primaryID)
            }
            if let window = hostWindow.window { syncWindowRegistration(window) }
        }
        .onChange(of: samples) { _, show in
            if enabled { controller.syncSampleTabs(enabled: show) }
        }
        .onChange(of: target) { _, _ in if enabled { syncPrimary() } }
        .onChange(of: place) { _, _ in if enabled { syncPrimary() } }
        .onChange(of: page.state) { _, _ in if enabled { syncPrimary() } }
        .onChange(of: metadataTitle) { _, _ in if enabled { syncPrimary() } }
        .onChange(of: windowTitle) { _, _ in if enabled { syncPrimary() } }
        .onChange(of: machineName) { _, _ in if enabled { syncPrimary() } }
        .onDisappear {
            if let window = hostWindow.window {
                WorkspaceTabs.unregisterCustomTabHost(for: window)
            }
        }
    }

    private var newMenuItems: TabNewMenuItems {
        let machines = model.places.filter { !$0.place.isLocalPlace }
        return TabNewMenuItems(
            machines: machines,
            onNewNotebook: {
                let nextTarget = model.routeLocalTarget(
                    WindowTarget.newTab(place: place, folder: sidebarRoot, root: model.root)
                )
                let nextPlace = model.place(for: nextTarget)
                let nextMachineName = nextPlace.machineID.flatMap { model.machineName($0) }
                controller.addPageTab(target: nextTarget, place: nextPlace, machineName: nextMachineName)
            },
            onNewConsole: {
                let consoleTarget = WindowTarget.console(folder: sidebarRoot, id: UUID())
                controller.addPageTab(target: consoleTarget, place: .thisDevice, machineName: nil)
            },
            onNewTerminal: {
                let terminalTarget = windowTerminal ?? .local(folder: sidebarRoot)
                controller.addTerminalTab(target: terminalTarget)
            },
            onOpenMachine: { entry in
                guard let target = WindowTarget.root(of: entry.place, device: model.root) else { return }
                controller.addPageTab(target: target, place: entry.place, machineName: entry.title)
            }
        )
    }

    @ViewBuilder
    private func extraSessionView(_ session: WorkspaceTabController.Session) -> some View {
        switch session.payload {
        case .primary:
            EmptyView()
        case .page(let tabTarget, let tabPage, let tabDocument):
            TabPagePane(
                id: session.id,
                initialTarget: tabTarget,
                page: tabPage,
                document: tabDocument,
                onOpenFile: onOpenFile,
                onOpenTabRequest: onOpenTabRequest,
                onUpdate: { currentTarget, currentPlace, currentMachine in
                    controller.syncPageTab(
                        id: session.id,
                        target: currentTarget,
                        state: tabPage.state,
                        place: currentPlace,
                        machineName: currentMachine
                    )
                }
            )
        case .terminal(let terminalTarget, _):
            let selected = session.id == controller.selectedID
            TerminalWindow(
                target: terminalTarget,
                inPanel: true,
                onTitle: { controller.updateTerminalTitle(id: session.id, title: $0) },
                focused: selected,
                reveal: {
                    controller.select(session.id)
                },
                shutDown: {
                    closeTab(session.id)
                }
            )
            .background(TabStripPalette(colorScheme: colorScheme).activeSurface(for: .terminal))
        case .sampleConsole:
            SampleConsoleSurface()
        case .sampleMachine(let name):
            SampleMachineSurface(name: name)
        case .sampleTerminal:
            SampleTerminalSurface()
        }
    }

    private func syncPrimary() {
        controller.syncPrimary(
            target: target,
            state: page.state,
            place: place,
            machineName: machineName,
            metadataTitle: metadataTitle
        )
    }

    private func closeTab(_ id: UUID) {
        if let session = controller.sessions.first(where: { $0.id == id }),
           case .page(_, _, let tabDocument) = session.payload,
           tabDocument.dirty,
           let window = hostWindow.window {
            let alert = NSAlert()
            alert.messageText = "Do you want to save the changes you made to “\(tabDocument.name)”?"
            alert.informativeText = "Your changes will be lost if you don’t save them."
            alert.addButton(withTitle: "Save")
            alert.addButton(withTitle: "Cancel")
            let discard = alert.addButton(withTitle: "Don’t Save")
            discard.keyEquivalent = "d"
            discard.keyEquivalentModifierMask = [.command]
            alert.beginSheetModal(for: window) { response in
                Task { @MainActor in
                    switch response {
                    case .alertFirstButtonReturn:
                        if await tabDocument.save() { _ = controller.close(id) }
                    case .alertThirdButtonReturn:
                        _ = controller.close(id)
                    default:
                        break
                    }
                }
            }
            return
        }
        if !controller.close(id) {
            hostWindow.window?.performClose(nil)
        }
    }

    private func syncWindowRegistration(_ window: NSWindow) {
        if enabled {
            WorkspaceTabs.registerCustomTabHost(
                for: window,
                actions: WorkspaceTabs.CustomTabActions(
                    closeActiveTab: {
                        guard controller.canCloseInPlace else { return false }
                        let active = controller.selectedID
                        if active == controller.primaryID { return false }
                        closeTab(active)
                        return true
                    },
                    openNewTab: { newTarget in
                        let newPlace = model.place(for: newTarget)
                        let newMachine = newPlace.machineID.flatMap(model.machineName(_:))
                        controller.addPageTab(target: newTarget, place: newPlace, machineName: newMachine)
                        return true
                    },
                    selectNextTab: { controller.selectNext() },
                    selectPreviousTab: { controller.selectPrevious() }
                )
            )
        } else {
            WorkspaceTabs.unregisterCustomTabHost(for: window)
        }
    }
}

/// Live web-view pane for an extra notebook, console, or machine tab inside
/// `WorkspaceTabHost` (#903).
private struct TabPagePane: View {
    let id: UUID
    let initialTarget: WindowTarget
    var page: PageModel
    var document: PageDocument
    let onOpenFile: (String) -> Void
    let onOpenTabRequest: (TabRequest) -> Void
    let onUpdate: (WindowTarget, Place, String?) -> Void

    @Environment(AppModel.self) private var model
    @State private var currentTarget: WindowTarget

    init(
        id: UUID,
        initialTarget: WindowTarget,
        page: PageModel,
        document: PageDocument,
        onOpenFile: @escaping (String) -> Void,
        onOpenTabRequest: @escaping (TabRequest) -> Void,
        onUpdate: @escaping (WindowTarget, Place, String?) -> Void
    ) {
        self.id = id
        self.initialTarget = initialTarget
        self.page = page
        self.document = document
        self.onOpenFile = onOpenFile
        self.onOpenTabRequest = onOpenTabRequest
        self.onUpdate = onUpdate
        _currentTarget = State(initialValue: initialTarget)
    }

    private var place: Place { model.place(for: currentTarget) }
    private var machineName: String? { place.machineID.flatMap(model.machineName(_:)) }
    private var showsMachineHeader: Bool {
        guard place.isMachine else { return false }
        if case .machineFolder = currentTarget { return !page.state.hasNotebook }
        return false
    }

    var body: some View {
        VStack(spacing: 0) {
            if showsMachineHeader {
                MachineSurfaceHeader(
                    name: machineName ?? "Machine",
                    reachable: PlaceReachability.shared.isReachable(place),
                    isSample: false
                )
            }
            if let url = model.page(for: currentTarget) {
                WebView(
                    url: url,
                    onNavigate: { navURL in
                        guard let navURL, let shown = WindowTarget(page: navURL),
                              model.place(for: shown) == place
                        else { return }
                        if !currentTarget.shows(shown) {
                            currentTarget = shown
                        }
                    },
                    document: document,
                    page: page,
                    onOpenTab: onOpenTabRequest,
                    onOpenFile: onOpenFile,
                    place: place,
                    sharesName: model.sharesName(for: place),
                    usesDevice: model.usesDevice(for: place),
                    pageRoot: model.pageRoot(for: place)
                )
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onChange(of: page.state, initial: true) { _, _ in
            onUpdate(currentTarget, place, machineName)
        }
        .onChange(of: currentTarget) { _, _ in
            onUpdate(currentTarget, place, machineName)
        }
    }
}
#endif
