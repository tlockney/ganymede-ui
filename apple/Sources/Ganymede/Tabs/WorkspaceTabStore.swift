#if os(macOS)
import AppKit
import Observation
import WebKit

/// Type-erased handle to a `PageTabState`'s live macOS `PageWebViewStore`
/// (`WebView.swift`) so `WorkspaceTabStore` stays decoupled from `WebView`
/// and compiles cleanly in `GanymedeTests` (#905).
@MainActor
protocol PageWebViewRetiring: AnyObject {
    var pagePlace: WorkspacePagePlace { get }
    func retire()
}

/// Per-tab state for a notebook, console, folder, or machine page inside a
/// window's `WorkspaceTabController` (#904).
@MainActor
@Observable
final class PageTabState: Identifiable {
    let id: UUID
    /// The notebook, console, or folder this tab shows, following the page;
    /// nil only for a window's initial blank tab until its page opens something
    /// or `OpenRequests` takes it.
    var target: WindowTarget?
    /// What the page was loaded for.
    var loaded: WindowTarget
    /// The place this tab's page was loaded with (#883).
    var loadedPlace: Place?
    /// What this tab's web view is made for (#883).
    var pagePlace: WorkspacePagePlace
    /// The folder the sidebar lists and New Notebook uses when this tab is active.
    var sidebarRoot: URL
    /// Whether the page has said what it shows outside its initial load.
    var pageReported: Bool
    /// What the page shows, and the commands it runs.
    let page: PageModel
    /// The open notebook's file and unsaved edits.
    let document: PageDocument
    /// Live `WKWebView` + coordinator store preserved across cross-window tab transfers (#905).
    @ObservationIgnored var webViewStore: (any PageWebViewRetiring)?

    func retireWebView() {
        webViewStore?.retire()
        webViewStore = nil
    }

    init(
        id: UUID = UUID(),
        target: WindowTarget?,
        loaded: WindowTarget,
        loadedPlace: Place?,
        pagePlace: WorkspacePagePlace,
        sidebarRoot: URL,
        pageReported: Bool = false,
        page: PageModel? = nil,
        document: PageDocument? = nil
    ) {
        self.id = id
        self.target = target
        self.loaded = loaded
        self.loadedPlace = loadedPlace
        self.pagePlace = pagePlace
        self.sidebarRoot = sidebarRoot
        self.pageReported = pageReported
        self.page = page ?? PageModel()
        self.document = document ?? PageDocument(noteRecent: { _, _ in }, indexSaved: { _ in })
    }

    var effectiveTarget: WindowTarget { target ?? loaded }

    func currentPlace(using resolver: (WindowTarget) -> Place) -> Place {
        resolver(loaded)
    }

    func place(using resolver: (WindowTarget) -> Place) -> Place {
        Place.window(loaded: loadedPlace, current: currentPlace(using: resolver))
    }

    /// Shows `shown` in this tab: the page loads it.
    func show(
        _ shown: WindowTarget,
        placeResolver: (WindowTarget) -> Place,
        thisMacRoot: (Place) -> URL?
    ) {
        target = shown
        loaded = shown
        let nextPlace = placeResolver(shown)
        loadedPlace = nextPlace
        pagePlace = WorkspacePagePlace(place: nextPlace, root: thisMacRoot(nextPlace)?.path)
        sidebarRoot = shown.folder
    }

    /// The page loaded (#883): its place is read again so a verified server
    /// applies on this load.
    func readPlace(currentPlace: Place, thisMacRoot: (Place) -> URL?) {
        if loadedPlace != currentPlace { loadedPlace = currentPlace }
        let made = WorkspacePagePlace(place: currentPlace, root: thisMacRoot(currentPlace)?.path)
        if pagePlace != made { pagePlace = made }
    }

    /// A downgrade applies immediately without rebuilding the web view (#883).
    func applyDowngradeIfNeeded(currentPlace: Place) {
        guard let held = loadedPlace, held.isThisMac, !currentPlace.isThisMac else { return }
        loadedPlace = currentPlace
    }

    /// The page opened another notebook, closed it, or moved to another folder.
    func follow(
        _ url: URL?,
        place: Place,
        placeResolver: (WindowTarget) -> Place
    ) {
        guard let url else { return }
        let shown = WindowTarget(page: url)
        if shown?.url.standardizedFileURL.path != loaded.url.standardizedFileURL.path {
            pageReported = true
        }
        guard let shown, placeResolver(shown) == place else { return }
        if let target, target.shows(shown) { return }
        if target == nil, case .folder = shown, shown.url.path == loaded.url.path { return }
        target = shown
    }

    var shownTitle: String? {
        WindowTarget.shownTitle(
            target: effectiveTarget,
            pagePath: page.state.path,
            metadataTitle: page.state.title
        )
    }

    func windowTitle(machineName: String?) -> String {
        effectiveTarget.tabTitle(
            consoleName: page.state.console?.name,
            machineName: machineName,
            metadataTitle: shownTitle
        )
    }

    func notebookTitle(machineName: String?) -> String {
        effectiveTarget.displayTitle(
            machineName: machineName,
            metadataTitle: page.state.title
        )
    }

    var showsNotebook: Bool {
        InspectorController.showsNotebook(
            state: page.state,
            pageReported: page.ready,
            target: effectiveTarget
        )
    }

    func headerStatus(place: Place, machineName: String?, locations: KernelLocations) -> HeaderStatus? {
        let names = HeaderStatus.places(
            place: place,
            machineName: machineName,
            deviceName: Places.deviceName,
            locations: locations,
            kernel: page.state.kernel
        )
        return HeaderStatus.make(state: page.state, savedOn: names.savedOn, runsOn: names.runsOn)
    }

    func windowTerminal(place: Place, remotes: [Remote]) -> TerminalTarget? {
        WindowScope(place: place, serverFolder: FolderEntry.serverPath(sidebarRoot))
            .terminalTarget(notebook: page.state.path, remotes: remotes)
    }

    func descriptor(place: Place, machineName: String?) -> WorkspaceTabDescriptor {
        WorkspaceTabDescriptor.fromTarget(
            id: id,
            target: effectiveTarget,
            state: page.state,
            place: place,
            machineName: machineName,
            metadataTitle: shownTitle,
            isPrimary: false,
            isCloseable: true
        )
    }
}

/// Per-tab state for a standalone terminal tab inside `WorkspaceTabController` (#904).
@MainActor
@Observable
final class TerminalTabState: Identifiable {
    let id: UUID
    let handoffID: UUID
    let target: TerminalTarget
    var title: String
    var sidebarRoot: URL
    var isConnected = false
    var isEnded = false

    init(
        id: UUID = UUID(),
        handoffID: UUID = UUID(),
        target: TerminalTarget,
        title: String = "",
        sidebarRoot: URL
    ) {
        self.id = id
        self.handoffID = handoffID
        self.target = target
        self.title = title
        self.sidebarRoot = sidebarRoot
    }

    var canMoveToPanel: Bool {
        isConnected && !isEnded
    }

    func updateTitle(_ raw: String) {
        title = raw.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    func windowTitle(defaultTitle: String) -> String {
        title.isEmpty ? defaultTitle : title
    }

    func descriptor() -> WorkspaceTabDescriptor {
        WorkspaceTabDescriptor.terminal(
            id: id,
            title: title,
            toolTip: title.isEmpty ? "Terminal: zsh" : "Terminal: \(title)"
        )
    }
}

/// Per-tab state for a text editor tab inside `WorkspaceTabController` (#904).
@MainActor
@Observable
final class EditorTabState: Identifiable {
    let id: UUID
    let request: EditorRequest
    let document: EditorDocument
    var sidebarRoot: URL

    init(
        id: UUID = UUID(),
        request: EditorRequest,
        document: EditorDocument,
        sidebarRoot: URL
    ) {
        self.id = id
        self.request = request
        self.document = document
        self.sidebarRoot = sidebarRoot
    }

    func windowTitle(machineName: String?) -> String {
        guard let machine = request.machine else { return document.name }
        return "\(document.name) · \(machineName ?? machine)"
    }

    func descriptor(machineName: String?) -> WorkspaceTabDescriptor {
        WorkspaceTabDescriptor.editor(
            id: id,
            path: request.path,
            machineName: machineName
        )
    }
}

/// Unified window-owned tab store (#904). Holds every tab in `sessions` without
/// special-casing Tab 0, manages per-tab document attachment and window chrome,
/// installs a single window-level `WorkspaceWindowCloseGuard`, and exposes clean
/// selection/reordering/detach/adopt operations for cross-window tab actions.
@MainActor
@Observable
final class WorkspaceTabController {
    enum SessionPayload {
        case page(PageTabState)
        case terminal(TerminalTabState)
        case editor(EditorTabState)
    }

    struct Session: Identifiable {
        let id: UUID
        var descriptor: WorkspaceTabDescriptor
        var payload: SessionPayload

        var pageTab: PageTabState? {
            if case .page(let tab) = payload { return tab }
            return nil
        }

        var terminalTab: TerminalTabState? {
            if case .terminal(let tab) = payload { return tab }
            return nil
        }

        var editorTab: EditorTabState? {
            if case .editor(let tab) = payload { return tab }
            return nil
        }

        @MainActor
        var sidebarRoot: URL {
            switch payload {
            case .page(let tab): tab.sidebarRoot
            case .editor(let tab): tab.sidebarRoot
            case .terminal(let tab): tab.sidebarRoot
            }
        }

        @MainActor
        var isDirty: Bool {
            switch payload {
            case .page(let tab): tab.document.dirty
            case .editor(let tab): tab.document.dirty
            case .terminal: false
            }
        }

        @MainActor
        func retireResources() {
            if case .page(let tab) = payload {
                tab.retireWebView()
            }
        }
    }

    @MainActor
    enum UnsavedDocument {
        case page(sessionID: UUID, document: PageDocument)
        case editor(sessionID: UUID, document: EditorDocument)

        var sessionID: UUID {
            switch self {
            case .page(let id, _), .editor(let id, _): id
            }
        }

        var name: String {
            switch self {
            case .page(_, let doc): doc.name
            case .editor(_, let doc): doc.name
            }
        }

        func save() async -> Bool {
            switch self {
            case .page(_, let doc): await doc.save()
            case .editor(_, let doc): await doc.save()
            }
        }

        func attach(to window: NSWindow, active: Bool) {
            switch self {
            case .page(_, let doc):
                doc.isActiveInWindow = active
                doc.attach(to: window, installCloseGuard: false)
            case .editor(_, let doc):
                doc.isActiveInWindow = active
                doc.attach(to: window, installCloseGuard: false)
            }
        }

        func detach(from window: NSWindow) {
            switch self {
            case .page(_, let doc): doc.detach(from: window)
            case .editor(_, let doc): doc.detach(from: window)
            }
        }
    }

    private(set) var sessions: [Session] = []
    private(set) var selectedID: UUID
    /// Whether the in-window `Show All Tabs` (`⇧⌘\`) grid overlay is visible (#905).
    var isShowingOverview = false

    @ObservationIgnored private(set) weak var hostWindow: NSWindow?
    @ObservationIgnored private var closeGuard: WorkspaceWindowCloseGuard?
    @ObservationIgnored private(set) weak var inspectedVariablesPage: PageModel?
    @ObservationIgnored private let pageDocumentFactory: @MainActor () -> PageDocument
    @ObservationIgnored private let editorDocumentFactory: @MainActor (EditorRequest) -> EditorDocument

    /// Optional overrides for unit tests to inspect close prompts without running sheets.
    @ObservationIgnored var onWindowClosePrompt: ((NSWindow, [UnsavedDocument]) -> Void)?
    @ObservationIgnored var onTabClosePrompt: ((NSWindow, UnsavedDocument, @MainActor @escaping () -> Void) -> Void)?

    init(
        sessions: [Session],
        selectedID: UUID,
        pageDocumentFactory: @escaping @MainActor () -> PageDocument = {
            PageDocument(noteRecent: { _, _ in }, indexSaved: { _ in })
        },
        editorDocumentFactory: @escaping @MainActor (EditorRequest) -> EditorDocument = {
            EditorDocument($0, local: { nil })
        }
    ) {
        self.pageDocumentFactory = pageDocumentFactory
        self.editorDocumentFactory = editorDocumentFactory
        self.sessions = sessions
        if sessions.contains(where: { $0.id == selectedID }) {
            self.selectedID = selectedID
        } else {
            self.selectedID = sessions.first?.id ?? selectedID
        }
    }

    convenience init(
        initialPage: PageTabState,
        pageDocumentFactory: @escaping @MainActor () -> PageDocument = {
            PageDocument(noteRecent: { _, _ in }, indexSaved: { _ in })
        },
        editorDocumentFactory: @escaping @MainActor (EditorRequest) -> EditorDocument = {
            EditorDocument($0, local: { nil })
        }
    ) {
        let descriptor = initialPage.descriptor(
            place: initialPage.loadedPlace ?? initialPage.effectiveTarget.place,
            machineName: nil
        )
        let session = Session(id: initialPage.id, descriptor: descriptor, payload: .page(initialPage))
        self.init(
            sessions: [session],
            selectedID: initialPage.id,
            pageDocumentFactory: pageDocumentFactory,
            editorDocumentFactory: editorDocumentFactory
        )
    }

    convenience init(
        target: WindowTarget? = nil,
        root: URL = FileManager.default.homeDirectoryForCurrentUser,
        pageDocumentFactory: @escaping @MainActor () -> PageDocument = {
            PageDocument(noteRecent: { _, _ in }, indexSaved: { _ in })
        },
        editorDocumentFactory: @escaping @MainActor (EditorRequest) -> EditorDocument = {
            EditorDocument($0, local: { nil })
        }
    ) {
        let loaded = target ?? .folder(root)
        let place = loaded.place
        let page = PageTabState(
            target: target,
            loaded: loaded,
            loadedPlace: place,
            pagePlace: WorkspacePagePlace(place: place, root: nil),
            sidebarRoot: loaded.folder,
            document: pageDocumentFactory()
        )
        self.init(
            initialPage: page,
            pageDocumentFactory: pageDocumentFactory,
            editorDocumentFactory: editorDocumentFactory
        )
    }

    var activeSession: Session? {
        sessions.first { $0.id == selectedID }
    }

    var activeIndex: Int? {
        sessions.firstIndex { $0.id == selectedID }
    }

    var activePage: PageTabState? {
        activeSession?.pageTab
    }

    var activeTerminal: TerminalTabState? {
        activeSession?.terminalTab
    }

    var activeEditor: EditorTabState? {
        activeSession?.editorTab
    }

    var activeWebView: WKWebView? {
        activePage?.page.webView
    }

    var descriptors: [WorkspaceTabDescriptor] {
        sessions.map(\.descriptor)
    }

    var canCloseInPlace: Bool {
        sessions.count > 1
    }

    var unsavedDocuments: [UnsavedDocument] {
        sessions.compactMap { session in
            switch session.payload {
            case .page(let tab) where tab.document.dirty:
                return .page(sessionID: session.id, document: tab.document)
            case .editor(let tab) where tab.document.dirty:
                return .editor(sessionID: session.id, document: tab.document)
            default:
                return nil
            }
        }
    }

    var hasUnsavedChanges: Bool {
        !unsavedDocuments.isEmpty
    }

    // MARK: - Selection

    func select(_ id: UUID) {
        guard sessions.contains(where: { $0.id == id }) else { return }
        if selectedID != id {
            selectedID = id
        }
        syncWindowDocumentAttachments()
    }

    func select(at index: Int) {
        guard sessions.indices.contains(index) else { return }
        select(sessions[index].id)
    }

    func selectShortcutDigit(_ digit: Int) {
        guard let index = TabShortcutResolver.targetIndex(forDigit: digit, tabCount: sessions.count) else {
            return
        }
        isShowingOverview = false
        select(at: index)
    }

    func toggleOverview() {
        isShowingOverview.toggle()
    }

    var overviewItems: [TabOverviewItem] {
        sessions.enumerated().map { index, session in
            TabOverviewItem(
                id: session.id,
                descriptor: session.descriptor,
                isDirty: session.isDirty,
                isSelected: session.id == selectedID,
                index: index
            )
        }
    }

    /// Snapshot of all tabs in order for `@SceneStorage("window.tabs")` (#905).
    var restorableTabSet: RestorableTabSet {
        let saved: [RestorableTabSet.SavedTab] = sessions.map { session in
            switch session.payload {
            case .page(let tab):
                return .page(
                    target: tab.effectiveTarget,
                    sidebarRoot: FolderEntry.storageKey(tab.sidebarRoot)
                )
            case .editor(let tab):
                return .editor(
                    request: tab.request,
                    sidebarRoot: FolderEntry.storageKey(tab.sidebarRoot)
                )
            case .terminal(let tab):
                return .terminal(
                    target: tab.target,
                    sidebarRoot: FolderEntry.storageKey(tab.sidebarRoot)
                )
            }
        }
        return RestorableTabSet(tabs: saved, selectedIndex: activeIndex ?? 0)
    }

    /// Replaces the controller's sessions with a restored `RestorableTabSet`
    /// across relaunch (#905), reusing an already-created initial blank/matching
    /// `PageTabState` when its target matches so it never loads twice.
    func restore(
        from tabSet: RestorableTabSet,
        placeResolver: (WindowTarget) -> Place,
        machineNameResolver: (Place) -> String?,
        thisMacRootResolver: (Place) -> URL?,
        fallbackRoot: URL
    ) {
        guard !tabSet.tabs.isEmpty else { return }
        let existingInitial = sessions.count == 1 ? sessions[0].pageTab : nil
        var reusedInitial = false
        var restored: [Session] = []

        func resolvedSidebar(_ key: String, in place: Place, fallback: URL) -> URL {
            if let loc = FolderEntry.location(storageKey: key),
               FolderEntry.isLocation(loc, in: place) {
                return loc
            }
            return fallback
        }

        for saved in tabSet.tabs {
            switch saved {
            case .page(let target, let sidebarKey):
                let place = placeResolver(target)
                let machineName = machineNameResolver(place)
                let sidebarRoot = resolvedSidebar(sidebarKey, in: place, fallback: target.folder)
                if !reusedInitial, let initial = existingInitial,
                   initial.effectiveTarget == target {
                    reusedInitial = true
                    initial.target = target
                    initial.loaded = target
                    initial.loadedPlace = place
                    initial.pagePlace = WorkspacePagePlace(place: place, root: thisMacRootResolver(place)?.path)
                    initial.sidebarRoot = sidebarRoot
                    let descriptor = initial.descriptor(place: place, machineName: machineName)
                    restored.append(Session(id: initial.id, descriptor: descriptor, payload: .page(initial)))
                } else {
                    let pageTab = PageTabState(
                        target: target,
                        loaded: target,
                        loadedPlace: place,
                        pagePlace: WorkspacePagePlace(place: place, root: thisMacRootResolver(place)?.path),
                        sidebarRoot: sidebarRoot,
                        document: pageDocumentFactory()
                    )
                    let descriptor = pageTab.descriptor(place: place, machineName: machineName)
                    restored.append(Session(id: pageTab.id, descriptor: descriptor, payload: .page(pageTab)))
                }
            case .editor(let request, let sidebarKey):
                let place: Place = request.machine.flatMap {
                    WindowTarget.machine($0, path: "/", isFolder: true).map(placeResolver)
                } ?? .thisDevice
                let machineName = machineNameResolver(place)
                let sidebarRoot = resolvedSidebar(sidebarKey, in: place, fallback: fallbackRoot)
                let document = editorDocumentFactory(request)
                let editorTab = EditorTabState(
                    request: request,
                    document: document,
                    sidebarRoot: sidebarRoot
                )
                restored.append(Session(
                    id: editorTab.id,
                    descriptor: editorTab.descriptor(machineName: machineName),
                    payload: .editor(editorTab)
                ))
            case .terminal(let target, let sidebarKey):
                let place: Place = {
                    if case .server(let id, _) = target,
                       let machineTarget = WindowTarget.machine(id.uuidString, path: "/", isFolder: true) {
                        return placeResolver(machineTarget)
                    }
                    return .thisDevice
                }()
                let defaultFolder: URL = {
                    if case .local(let folder) = target, let folder { return folder }
                    return fallbackRoot
                }()
                let sidebarRoot = resolvedSidebar(sidebarKey, in: place, fallback: defaultFolder)
                let terminalTab = TerminalTabState(target: target, sidebarRoot: sidebarRoot)
                restored.append(Session(
                    id: terminalTab.id,
                    descriptor: terminalTab.descriptor(),
                    payload: .terminal(terminalTab)
                ))
            }
        }

        guard !restored.isEmpty else { return }
        if let window = hostWindow {
            for old in sessions where !(reusedInitial && old.id == existingInitial?.id) {
                detachSessionDocument(old, from: window)
                old.retireResources()
            }
        }
        sessions = restored
        selectedID = restored[tabSet.clampedSelectedIndex].id
        syncWindowDocumentAttachments()
    }

    func selectNext() {
        guard sessions.count > 1, let index = activeIndex else { return }
        select(sessions[(index + 1) % sessions.count].id)
    }

    func selectPrevious() {
        guard sessions.count > 1, let index = activeIndex else { return }
        select(sessions[(index - 1 + sessions.count) % sessions.count].id)
    }

    func select(pageDocument: PageDocument) {
        if let match = sessions.first(where: { $0.pageTab?.document === pageDocument }) {
            select(match.id)
        }
    }

    func select(editorDocument: EditorDocument) {
        if let match = sessions.first(where: { $0.editorTab?.document === editorDocument }) {
            select(match.id)
        }
    }

    // MARK: - Adding & Syncing Tabs

    @discardableResult
    func addPageTab(
        target: WindowTarget,
        place: Place,
        machineName: String?,
        thisMacRoot: String? = nil,
        reuseExisting: Bool = true
    ) -> UUID {
        if reuseExisting, let existing = sessions.first(where: {
            $0.pageTab?.effectiveTarget.matchesOpenTarget(target) == true
        }) {
            select(existing.id)
            return existing.id
        }
        let pageTab = PageTabState(
            target: target,
            loaded: target,
            loadedPlace: place,
            pagePlace: WorkspacePagePlace(place: place, root: thisMacRoot),
            sidebarRoot: target.folder,
            document: pageDocumentFactory()
        )
        let descriptor = pageTab.descriptor(place: place, machineName: machineName)
        let session = Session(id: pageTab.id, descriptor: descriptor, payload: .page(pageTab))
        insert(session, at: nil)
        select(pageTab.id)
        return pageTab.id
    }

    @discardableResult
    func addTerminalTab(
        target: TerminalTarget,
        handoffID: UUID = UUID(),
        sidebarRoot: URL
    ) -> UUID {
        let terminalTab = TerminalTabState(
            handoffID: handoffID,
            target: target,
            sidebarRoot: sidebarRoot
        )
        let session = Session(
            id: terminalTab.id,
            descriptor: terminalTab.descriptor(),
            payload: .terminal(terminalTab)
        )
        insert(session, at: nil)
        select(terminalTab.id)
        return terminalTab.id
    }

    @discardableResult
    func addEditorTab(
        request: EditorRequest,
        machineName: String?,
        sidebarRoot: URL
    ) -> UUID {
        if let existing = sessions.first(where: {
            $0.editorTab?.request == request
        }) {
            select(existing.id)
            return existing.id
        }
        let document = editorDocumentFactory(request)
        let editorTab = EditorTabState(
            request: request,
            document: document,
            sidebarRoot: sidebarRoot
        )
        let session = Session(
            id: editorTab.id,
            descriptor: editorTab.descriptor(machineName: machineName),
            payload: .editor(editorTab)
        )
        insert(session, at: nil)
        select(editorTab.id)
        return editorTab.id
    }

    func syncPageTab(id: UUID, place: Place, machineName: String?) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              let pageTab = sessions[index].pageTab
        else { return }
        let updated = pageTab.descriptor(place: place, machineName: machineName)
        if sessions[index].descriptor != updated {
            sessions[index].descriptor = updated
        }
    }

    func updateTerminalTitle(id: UUID, title: String) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              let terminalTab = sessions[index].terminalTab
        else { return }
        terminalTab.updateTitle(title)
        let updated = terminalTab.descriptor()
        if sessions[index].descriptor != updated {
            sessions[index].descriptor = updated
        }
    }

    func updateTerminalAvailability(id: UUID, connected: Bool, ended: Bool) {
        guard let terminalTab = sessions.first(where: { $0.id == id })?.terminalTab else { return }
        terminalTab.isConnected = connected
        terminalTab.isEnded = ended
    }

    func syncEditorTab(id: UUID, machineName: String?) {
        guard let index = sessions.firstIndex(where: { $0.id == id }),
              let editorTab = sessions[index].editorTab
        else { return }
        let updated = editorTab.descriptor(machineName: machineName)
        if sessions[index].descriptor != updated {
            sessions[index].descriptor = updated
        }
    }

    func refreshKernels() {
        for session in sessions {
            session.pageTab?.page.refreshKernels()
        }
    }

    func syncVariablesInspection(wantsVariables: Bool) {
        let desired = wantsVariables ? activePage?.page : nil
        if inspectedVariablesPage !== desired {
            inspectedVariablesPage?.run("inspect-variables", arg: "off")
            desired?.run("inspect-variables", arg: "on")
            inspectedVariablesPage = desired
        }
    }

    func ensureVariablesInspectionOnReload(wantsVariables: Bool) {
        guard wantsVariables,
              let page = activePage?.page,
              page.state.variables == nil,
              inspectedVariablesPage === page
        else { return }
        page.run("inspect-variables", arg: "on")
    }

    // MARK: - Store Mutations (#905-ready)

    func insert(_ session: Session, at index: Int?) {
        guard !sessions.contains(where: { $0.id == session.id }) else { return }
        if let index {
            let clamped = max(0, min(index, sessions.count))
            sessions.insert(session, at: clamped)
        } else {
            insertOrdered(session)
        }
        if let window = hostWindow {
            attachSessionDocument(session, to: window, active: session.id == selectedID)
        }
    }

    func moveSession(id: UUID, toIndex targetIndex: Int) {
        guard let from = sessions.firstIndex(where: { $0.id == id }), sessions.count > 1 else { return }
        let clamped = max(0, min(targetIndex, sessions.count - 1))
        guard from != clamped else { return }
        let session = sessions.remove(at: from)
        sessions.insert(session, at: clamped)
    }

    @discardableResult
    func detachSession(_ id: UUID) -> Session? {
        guard let index = sessions.firstIndex(where: { $0.id == id }) else { return nil }
        let removed = sessions.remove(at: index)
        if let page = removed.pageTab?.page, inspectedVariablesPage === page {
            inspectedVariablesPage = nil
        }
        if let window = hostWindow {
            detachSessionDocument(removed, from: window)
        }
        if selectedID == id, !sessions.isEmpty {
            selectedID = sessions[min(index, sessions.count - 1)].id
        }
        syncWindowDocumentAttachments()
        return removed
    }

    func adoptSession(_ session: Session, at index: Int? = nil) {
        insert(session, at: index)
        select(session.id)
    }

    // MARK: - Closing

    /// Removes `id` directly when more than one tab is open. Returns `false` on the last tab.
    @discardableResult
    func removeSession(_ id: UUID) -> Bool {
        guard sessions.count > 1, sessions.contains(where: { $0.id == id }) else {
            return false
        }
        if let removed = detachSession(id) {
            removed.retireResources()
        }
        return true
    }

    /// Closes `id` when more than one tab is open (prompting first if dirty), or
    /// falls back to `window.performClose(nil)` on the last tab.
    func closeTab(_ id: UUID, in window: NSWindow? = nil) {
        let targetWindow = window ?? hostWindow
        guard sessions.count > 1 else {
            targetWindow?.performClose(nil)
            return
        }
        guard let session = sessions.first(where: { $0.id == id }) else { return }
        if let unsaved = unsavedDocument(for: session), let targetWindow {
            if let onTabClosePrompt {
                onTabClosePrompt(targetWindow, unsaved) { [weak self] in
                    _ = self?.removeSession(id)
                }
                return
            }
            confirmTabClose(unsaved, id: id, in: targetWindow)
            return
        }
        _ = removeSession(id)
    }

    func closeOthers(keeping id: UUID, in window: NSWindow? = nil) {
        guard sessions.contains(where: { $0.id == id }) else { return }
        let targetWindow = window ?? hostWindow
        let others = sessions.filter { $0.id != id }
        let dirtyOthers = others.compactMap(unsavedDocument(for:))
        if !dirtyOthers.isEmpty, let targetWindow {
            confirmMultipleClose(dirtyOthers, in: targetWindow, saveAllAction: { [weak self] in
                guard let self else { return }
                for other in others {
                    self.detachSession(other.id)?.retireResources()
                }
                self.select(id)
            }, discardAction: { [weak self] in
                guard let self else { return }
                for other in others {
                    self.detachSession(other.id)?.retireResources()
                }
                self.select(id)
            })
            return
        }
        for other in others {
            detachSession(other.id)?.retireResources()
        }
        select(id)
    }

    // MARK: - Window Attachment & Close Guard

    func attach(to window: NSWindow) {
        hostWindow = window
        if closeGuard == nil || window.delegate !== closeGuard {
            if let existing = window.delegate as? WorkspaceWindowCloseGuard,
               existing.controller === self {
                closeGuard = existing
            } else {
                let original = (window.delegate is WorkspaceWindowCloseGuard) ? nil : window.delegate
                let guardDelegate = WorkspaceWindowCloseGuard(controller: self, original: original)
                window.delegate = guardDelegate
                closeGuard = guardDelegate
            }
        }
        syncWindowDocumentAttachments()
    }

    func detachAll(from window: NSWindow, retireResources: Bool = false) {
        for session in sessions {
            detachSessionDocument(session, from: window)
            if retireResources {
                session.retireResources()
            }
        }
        if hostWindow === window {
            hostWindow = nil
        }
    }

    func syncWindowDocumentAttachments() {
        guard let window = hostWindow else { return }
        for session in sessions {
            attachSessionDocument(session, to: window, active: session.id == selectedID)
        }
        syncWindowChrome(window)
    }

    func syncWindowChrome(_ window: NSWindow? = nil) {
        guard let window = window ?? hostWindow else { return }
        switch activeSession?.payload {
        case .page(let tab):
            tab.document.isActiveInWindow = true
            tab.document.syncWindow()
        case .editor(let tab):
            tab.document.isActiveInWindow = true
            tab.document.syncWindow()
        case .terminal, nil:
            window.isDocumentEdited = false
            window.representedURL = nil
        }
    }

    func confirmWindowClose(_ window: NSWindow) {
        let unsaved = unsavedDocuments
        guard !unsaved.isEmpty else {
            detachAll(from: window, retireResources: true)
            window.close()
            return
        }
        if let onWindowClosePrompt {
            onWindowClosePrompt(window, unsaved)
            return
        }
        if unsaved.count == 1 {
            let doc = unsaved[0]
            select(doc.sessionID)
            let alert = Self.savePrompt(
                "Do you want to save the changes you made to “\(doc.name)”?",
                save: "Save"
            )
            alert.beginSheetModal(for: window) { response in
                Task { @MainActor in
                    switch response {
                    case .alertFirstButtonReturn:
                        if await doc.save() {
                            self.detachAll(from: window, retireResources: true)
                            window.close()
                        }
                    case .alertThirdButtonReturn:
                        self.detachAll(from: window, retireResources: true)
                        window.close()
                    default:
                        break
                    }
                }
            }
            return
        }
        confirmMultipleClose(
            unsaved,
            in: window,
            saveAllAction: { [weak self] in
                self?.detachAll(from: window, retireResources: true)
                window.close()
            },
            discardAction: { [weak self] in
                self?.detachAll(from: window, retireResources: true)
                window.close()
            }
        )
    }

    // MARK: - Helpers

    private func insertOrdered(_ session: Session) {
        if session.descriptor.group == .document,
           let firstEnv = sessions.firstIndex(where: { $0.descriptor.group == .environment }) {
            sessions.insert(session, at: firstEnv)
        } else {
            sessions.append(session)
        }
    }

    private func unsavedDocument(for session: Session) -> UnsavedDocument? {
        switch session.payload {
        case .page(let tab) where tab.document.dirty:
            return .page(sessionID: session.id, document: tab.document)
        case .editor(let tab) where tab.document.dirty:
            return .editor(sessionID: session.id, document: tab.document)
        default:
            return nil
        }
    }

    private func attachSessionDocument(_ session: Session, to window: NSWindow, active: Bool) {
        switch session.payload {
        case .page(let tab):
            tab.document.isActiveInWindow = active
            tab.document.attach(to: window, installCloseGuard: false)
        case .editor(let tab):
            tab.document.isActiveInWindow = active
            tab.document.attach(to: window, installCloseGuard: false)
        case .terminal:
            break
        }
    }

    private func detachSessionDocument(_ session: Session, from window: NSWindow) {
        switch session.payload {
        case .page(let tab):
            tab.document.detach(from: window)
        case .editor(let tab):
            tab.document.detach(from: window)
        case .terminal:
            break
        }
    }

    private func confirmTabClose(_ doc: UnsavedDocument, id: UUID, in window: NSWindow) {
        let alert = Self.savePrompt(
            "Do you want to save the changes you made to “\(doc.name)”?",
            save: "Save"
        )
        alert.beginSheetModal(for: window) { response in
            Task { @MainActor in
                switch response {
                case .alertFirstButtonReturn:
                    if await doc.save() { _ = self.removeSession(id) }
                case .alertThirdButtonReturn:
                    _ = self.removeSession(id)
                default:
                    break
                }
            }
        }
    }

    private func confirmMultipleClose(
        _ unsaved: [UnsavedDocument],
        in window: NSWindow,
        saveAllAction: @escaping @MainActor () -> Void,
        discardAction: @escaping @MainActor () -> Void
    ) {
        let alert = unsaved.count == 1
            ? Self.savePrompt(
                "Do you want to save the changes you made to “\(unsaved[0].name)”?",
                save: "Save"
            )
            : Self.savePrompt(
                "You have \(unsaved.count) tabs with unsaved changes. Do you want to save them before closing?",
                save: "Save All"
            )
        alert.beginSheetModal(for: window) { response in
            Task { @MainActor in
                switch response {
                case .alertFirstButtonReturn:
                    for doc in unsaved {
                        if !(await doc.save()) {
                            self.select(doc.sessionID)
                            return
                        }
                    }
                    saveAllAction()
                case .alertThirdButtonReturn:
                    discardAction()
                default:
                    break
                }
            }
        }
    }

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

/// Window-level close guard checking all dirty `.page` and `.editor` tabs in a
/// `WorkspaceTabController` (#904), forwarding all other delegate methods to SwiftUI's delegate.
@MainActor
final class WorkspaceWindowCloseGuard: NSObject, NSWindowDelegate {
    weak var controller: WorkspaceTabController?
    nonisolated(unsafe) private weak var original: NSWindowDelegate?

    init(controller: WorkspaceTabController, original: NSWindowDelegate?) {
        self.controller = controller
        self.original = original
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        if let controller, controller.hasUnsavedChanges {
            controller.confirmWindowClose(sender)
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
