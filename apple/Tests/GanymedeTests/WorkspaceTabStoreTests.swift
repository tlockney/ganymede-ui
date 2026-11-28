#if os(macOS)
import AppKit
import WebKit
import XCTest

@MainActor
final class WorkspaceTabStoreTests: XCTestCase {
    private var readyPageState: PageState {
        var state = PageState()
        state.backend = PageState.Backend(label: "Ganymede", detail: "local server")
        return state
    }

    private func makeWindow() -> NSWindow {
        NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
    }

    func testTabZeroIsUnifiedInSessionsAndClosableWhenMultipleTabsExist() {
        let root = URL(fileURLWithPath: "/Users/tester/Notebooks", isDirectory: true)
        let first = root.appendingPathComponent("Alpha.ipynb")
        let second = root.appendingPathComponent("Beta.ipynb")
        let controller = WorkspaceTabController(target: .file(first), root: root)

        XCTAssertEqual(controller.sessions.count, 1)
        XCTAssertEqual(controller.activeIndex, 0)
        XCTAssertFalse(controller.canCloseInPlace)
        XCTAssertFalse(controller.descriptors[0].isPrimary)
        XCTAssertTrue(controller.descriptors[0].isCloseable)

        let tab0ID = controller.sessions[0].id
        let tab1ID = controller.addPageTab(target: .file(second), place: .thisDevice, machineName: nil)

        XCTAssertEqual(controller.sessions.count, 2)
        XCTAssertEqual(controller.selectedID, tab1ID)
        XCTAssertEqual(controller.activeIndex, 1)
        XCTAssertTrue(controller.canCloseInPlace)

        // Tab 0 can be closed directly whenever another tab remains open.
        controller.closeTab(tab0ID)
        XCTAssertEqual(controller.sessions.count, 1)
        XCTAssertEqual(controller.sessions[0].id, tab1ID)
        XCTAssertEqual(controller.selectedID, tab1ID)
        XCTAssertFalse(controller.canCloseInPlace)
    }

    func testLastTabCloseDelegatesToWindowPerformClose() {
        final class CloseSpyWindow: NSWindow {
            var performCloseCount = 0
            override func performClose(_ sender: Any?) {
                performCloseCount += 1
            }
        }

        let root = URL(fileURLWithPath: "/Users/tester/Notebooks", isDirectory: true)
        let controller = WorkspaceTabController(target: .folder(root), root: root)
        let window = CloseSpyWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 480),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        let tab0ID = controller.sessions[0].id

        XCTAssertFalse(controller.removeSession(tab0ID))
        XCTAssertEqual(controller.sessions.count, 1)

        controller.closeTab(tab0ID, in: window)
        XCTAssertEqual(window.performCloseCount, 1)
        XCTAssertEqual(controller.sessions.count, 1)
    }

    func testSelectionNavigationReorderingAndCrossWindowTransfer() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let notebookA = root.appendingPathComponent("A.ipynb")
        let notebookB = root.appendingPathComponent("B.ipynb")

        let source = WorkspaceTabController(target: .file(notebookA), root: root)
        let idA = source.sessions[0].id
        let idTerm = source.addTerminalTab(target: .local(folder: root), sidebarRoot: root)
        // Document tabs added later still insert ahead of trailing environment tabs.
        let idB = source.addPageTab(target: .file(notebookB), place: .thisDevice, machineName: nil)

        XCTAssertEqual(source.sessions.map { $0.id }, [idA, idB, idTerm])
        XCTAssertEqual(source.selectedID, idB)

        source.selectNext()
        XCTAssertEqual(source.selectedID, idTerm)
        source.selectNext()
        XCTAssertEqual(source.selectedID, idA)
        source.selectPrevious()
        XCTAssertEqual(source.selectedID, idTerm)
        source.select(at: 1)
        XCTAssertEqual(source.selectedID, idB)
        source.select(at: 99)
        XCTAssertEqual(source.selectedID, idB, "out-of-bounds index leaves selection unchanged")

        source.moveSession(id: idA, toIndex: 1)
        XCTAssertEqual(source.sessions.map { $0.id }, [idB, idA, idTerm])

        // Detach/adopt handoff preserves session identity and updates document attachment.
        let sourceWindow = makeWindow()
        let destWindow = makeWindow()
        source.attach(to: sourceWindow)

        let destination = WorkspaceTabController(target: .folder(root), root: root)
        destination.attach(to: destWindow)

        let detached = source.detachSession(idA)
        XCTAssertNotNil(detached)
        XCTAssertNil(detached?.pageTab?.document.window)
        XCTAssertEqual(source.sessions.map { $0.id }, [idB, idTerm])

        if let detached {
            destination.adoptSession(detached, at: 0)
        }
        XCTAssertEqual(destination.sessions.first?.id, idA)
        XCTAssertEqual(destination.selectedID, idA)
        XCTAssertTrue(detached?.pageTab?.document.window === destWindow)
        XCTAssertTrue(detached?.pageTab?.document.isActiveInWindow == true)

        source.detachAll(from: sourceWindow)
        destination.detachAll(from: destWindow)
    }

    func testTerminalAndEditorTabsShareStoreAndReuseEditorRequests() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let controller = WorkspaceTabController(target: .folder(root), root: root)

        let termID = controller.addTerminalTab(target: .local(folder: root), sidebarRoot: root)
        XCTAssertNotNil(controller.activeTerminal?.handoffID)
        XCTAssertFalse(controller.activeTerminal?.canMoveToPanel ?? true)

        controller.updateTerminalAvailability(id: termID, connected: true, ended: false)
        XCTAssertTrue(controller.activeTerminal?.canMoveToPanel ?? false)
        controller.updateTerminalTitle(id: termID, title: "  python3 -m http.server \n")
        XCTAssertEqual(controller.activeTerminal?.title, "python3 -m http.server")
        XCTAssertEqual(controller.sessions.first(where: { $0.id == termID })?.descriptor.title, "python3 -m http.server")

        let reqLocal = EditorRequest(path: "/Users/tester/Project/notes.md", machine: nil)
        let reqRemote = EditorRequest(path: "/Users/tester/Project/notes.md", machine: "mac-studio")
        let editorID1 = controller.addEditorTab(request: reqLocal, machineName: nil, sidebarRoot: root)
        let editorID2 = controller.addEditorTab(request: reqLocal, machineName: nil, sidebarRoot: root)
        let editorRemoteID = controller.addEditorTab(request: reqRemote, machineName: "Mac Studio", sidebarRoot: root)

        XCTAssertEqual(editorID1, editorID2, "duplicate EditorRequest selects existing editor tab")
        XCTAssertNotEqual(editorID1, editorRemoteID)
        XCTAssertEqual(controller.activeEditor?.windowTitle(machineName: "Mac Studio"), "notes.md · Mac Studio")
    }

    func testSingleCloseGuardAndBackgroundDocumentsDoNotClobberWindowChrome() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let notebookURL = root.appendingPathComponent("Analysis.ipynb")
        let editorPath = "/Users/tester/Project/helpers.py"
        let editorURL = URL(fileURLWithPath: editorPath)

        let controller = WorkspaceTabController(target: .file(notebookURL), root: root)
        let window = makeWindow()
        controller.attach(to: window)

        guard let closeGuard = window.delegate as? WorkspaceWindowCloseGuard else {
            return XCTFail("Expected window delegate to be WorkspaceWindowCloseGuard")
        }
        XCTAssertTrue(closeGuard.windowShouldClose(window), "clean window closes immediately")

        let pageTabID = controller.sessions[0].id
        guard let pageTab = controller.activePage else {
            return XCTFail("Expected Tab 0 to be PageTabState")
        }
        pageTab.document.update(DocumentMessage(file: notebookURL, dirty: true), in: .thisDevice)
        XCTAssertTrue(pageTab.document.window === window)
        XCTAssertTrue(window.delegate === closeGuard, "document attach must not replace window close guard")
        XCTAssertTrue(window.isDocumentEdited)
        XCTAssertEqual(window.representedURL?.standardizedFileURL.path, notebookURL.standardizedFileURL.path)

        let editorTabID = controller.addEditorTab(
            request: EditorRequest(path: editorPath, machine: nil),
            machineName: nil,
            sidebarRoot: root
        )
        guard let editorTab = controller.activeEditor else {
            return XCTFail("Expected active tab to be EditorTabState")
        }
        XCTAssertFalse(pageTab.document.isActiveInWindow)
        XCTAssertTrue(editorTab.document.isActiveInWindow)
        XCTAssertFalse(window.isDocumentEdited, "clean editor tab must reset edited indicator")
        XCTAssertEqual(window.representedURL?.standardizedFileURL.path, editorURL.standardizedFileURL.path)

        // Updating a background page tab keeps dirty state without overwriting active window chrome.
        pageTab.document.update(DocumentMessage(file: notebookURL, dirty: false), in: .thisDevice)
        pageTab.document.update(DocumentMessage(file: notebookURL, dirty: true), in: .thisDevice)
        XCTAssertTrue(editorTab.document.isActiveInWindow)
        XCTAssertFalse(window.isDocumentEdited)
        XCTAssertEqual(window.representedURL?.standardizedFileURL.path, editorURL.standardizedFileURL.path)

        // Switching to a terminal clears document chrome cleanly.
        let termID = controller.addTerminalTab(target: .local(folder: root), sidebarRoot: root)
        XCTAssertFalse(editorTab.document.isActiveInWindow)
        XCTAssertFalse(window.isDocumentEdited)
        XCTAssertNil(window.representedURL)

        // Aggregated unsaved tracking spans all .page and .editor tabs in the window,
        // and PageDocument.openUnsaved includes background dirty page tabs (#938).
        window.isReleasedWhenClosed = false
        window.orderFront(nil)
        defer { window.close() }
        XCTAssertTrue(PageDocument.openUnsaved.contains(where: { $0 === pageTab.document }))
        editorTab.document.edited("print('unsaved')\n")
        XCTAssertEqual(controller.unsavedDocuments.count, 2)
        XCTAssertTrue(controller.hasUnsavedChanges)

        var promptedCount = 0
        controller.onWindowClosePrompt = { (_: NSWindow, unsaved: [WorkspaceTabController.UnsavedDocument]) in
            promptedCount = unsaved.count
        }
        XCTAssertFalse(closeGuard.windowShouldClose(window))
        XCTAssertEqual(promptedCount, 2)

        // Closing a dirty individual tab triggers the tab prompt hook before removal.
        var tabPrompted = false
        controller.onTabClosePrompt = { (_: NSWindow, _: WorkspaceTabController.UnsavedDocument, proceed: @MainActor @escaping () -> Void) in
            tabPrompted = true
            proceed()
        }
        controller.closeTab(editorTabID, in: window)
        XCTAssertTrue(tabPrompted)
        XCTAssertNil(editorTab.document.window, "closed tab document detaches from window")
        XCTAssertFalse(controller.sessions.contains(where: { $0.id == editorTabID }))

        controller.select(pageTabID)
        XCTAssertTrue(window.isDocumentEdited)
        XCTAssertEqual(window.representedURL?.standardizedFileURL.path, notebookURL.standardizedFileURL.path)

        controller.select(termID)
        controller.detachAll(from: window)
        XCTAssertNil(pageTab.document.window)
    }

    func testWindowRegistryActiveResponderAndFindFieldGuard() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let controller = WorkspaceTabController(target: .folder(root), root: root)
        let window = makeWindow()
        WorkspaceTabs.registerController(controller, for: window)
        defer { WorkspaceTabs.unregisterController(controller, for: window) }

        let webView0 = WKWebView(frame: NSRect(x: 0, y: 0, width: 300, height: 300))
        let webView1 = WKWebView(frame: NSRect(x: 0, y: 0, width: 300, height: 300))
        let sentinel = WKWebView(frame: NSRect(x: 0, y: 0, width: 100, height: 100))

        controller.activePage?.page.webView = webView0
        XCTAssertTrue(WorkspaceTabs.activeWebView(for: window) === webView0)
        XCTAssertTrue(WorkspaceTabs.pageResponder(for: window, fallback: { sentinel }) === webView0)

        let tab1ID = controller.addPageTab(
            target: .file(root.appendingPathComponent("Two.ipynb")),
            place: .thisDevice,
            machineName: nil
        )
        controller.activePage?.page.webView = webView1
        XCTAssertTrue(WorkspaceTabs.activeWebView(for: window) === webView1)
        XCTAssertTrue(WorkspaceTabs.pageResponder(for: window, fallback: { sentinel }) === webView1)

        // Switching to terminal clears page responder so hidden ZStack web views never steal focus.
        _ = controller.addTerminalTab(target: .local(folder: root), sidebarRoot: root)
        XCTAssertNil(WorkspaceTabs.activeWebView(for: window))
        XCTAssertNil(WorkspaceTabs.pageResponder(for: window, fallback: { sentinel }))

        controller.select(tab1ID)
        WorkspaceTabs.unregisterController(controller, for: window)
        XCTAssertTrue(WorkspaceTabs.pageResponder(for: window, fallback: { sentinel }) === sentinel)

        // FindField responder check isolates FindNSTextField from other controls.
        let findField = FindNSTextField(frame: NSRect(x: 0, y: 0, width: 180, height: 22))
        let otherField = NSTextField(frame: NSRect(x: 0, y: 30, width: 180, height: 22))
        window.contentView?.addSubview(findField)
        window.contentView?.addSubview(otherField)

        XCTAssertTrue(window.makeFirstResponder(findField))
        XCTAssertTrue(WorkspaceTabs.isFindFieldResponder(in: window))
        XCTAssertTrue(window.makeFirstResponder(otherField))
        XCTAssertFalse(WorkspaceTabs.isFindFieldResponder(in: window))
    }

    func testVariablesInspectionAndKernelRefreshAcrossPageTabs() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let controller = WorkspaceTabController(
            target: .file(root.appendingPathComponent("One.ipynb")),
            root: root
        )
        guard let tab0 = controller.activePage else {
            return XCTFail("Expected initial PageTabState")
        }
        tab0.page.update(readyPageState)

        let tab1ID = controller.addPageTab(
            target: .file(root.appendingPathComponent("Two.ipynb")),
            place: .thisDevice,
            machineName: nil
        )
        guard let tab1 = controller.activePage else {
            return XCTFail("Expected second PageTabState")
        }
        tab1.page.update(readyPageState)

        // Activate variables inspector on Tab 1 first.
        controller.syncVariablesInspection(wantsVariables: true)
        XCTAssertTrue(controller.inspectedVariablesPage === tab1.page)
        XCTAssertEqual(tab1.page.pendingCount, 1)
        XCTAssertEqual(tab0.page.pendingCount, 0)

        // Switching to Tab 0 sends "off" to Tab 1 and "on" to Tab 0.
        controller.select(controller.sessions[0].id)
        controller.syncVariablesInspection(wantsVariables: true)
        XCTAssertTrue(controller.inspectedVariablesPage === tab0.page)
        XCTAssertEqual(tab1.page.pendingCount, 2)
        XCTAssertEqual(tab0.page.pendingCount, 1)

        // Switching to a terminal turns variables inspection off without sending to terminal.
        _ = controller.addTerminalTab(target: .local(folder: root), sidebarRoot: root)
        controller.syncVariablesInspection(wantsVariables: true)
        XCTAssertNil(controller.inspectedVariablesPage)
        XCTAssertEqual(tab0.page.pendingCount, 2)

        // Kernel refresh dispatches across all ready .page tabs.
        controller.select(tab1ID)
        controller.refreshKernels()
        XCTAssertEqual(tab0.page.pendingCount, 3)
        XCTAssertEqual(tab1.page.pendingCount, 3)
    }

    func testCustomStripFocusesExistingInWindowTabAndFallsBackWhenNoPageActive() throws {
        let fm = FileManager.default
        let base = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let realDir = base.appendingPathComponent("real", isDirectory: true)
        let linkDir = base.appendingPathComponent("link", isDirectory: true)
        try fm.createDirectory(at: realDir, withIntermediateDirectories: true)
        try fm.createSymbolicLink(at: linkDir, withDestinationURL: realDir)
        defer { try? fm.removeItem(at: base) }

        let alpha = realDir.appendingPathComponent("Alpha.ipynb")
        let alphaViaLink = linkDir.appendingPathComponent("Alpha.ipynb")
        let beta = realDir.appendingPathComponent("Beta.ipynb")
        let gamma = realDir.appendingPathComponent("Gamma.ipynb")
        try Data("{}".utf8).write(to: alpha)
        try Data("{}".utf8).write(to: beta)

        let controller = WorkspaceTabController(target: .file(alpha), root: realDir)
        let alphaID = controller.sessions[0].id
        let betaID = controller.addPageTab(target: .file(beta), place: .thisDevice, machineName: nil)
        let termID = controller.addTerminalTab(target: .local(folder: realDir), sidebarRoot: realDir)

        let window = makeWindow()
        WorkspaceTabs.registerController(controller, for: window)
        defer { WorkspaceTabs.unregisterController(controller, for: window) }

        var openedFallbackPaths: [String] = []
        var openedWindowTargets: [WindowTarget] = []

        // While a terminal tab is active, opening an already-open notebook (even via symlink)
        // focuses its existing in-window tab instead of triggering fallback.
        WorkspaceTabs.openOrFocus(
            .file(alphaViaLink),
            serverPath: "tmp/Alpha.ipynb",
            in: nil,
            fallback: { openedFallbackPaths.append($0) }
        )
        XCTAssertEqual(controller.selectedID, alphaID)
        XCTAssertTrue(openedFallbackPaths.isEmpty)

        // Switching back to terminal and opening an unopened notebook routes to fallback.
        controller.select(termID)
        WorkspaceTabs.openOrFocus(
            .file(gamma),
            serverPath: "tmp/Gamma.ipynb",
            in: nil,
            fallback: { openedFallbackPaths.append($0) }
        )
        XCTAssertEqual(openedFallbackPaths, ["tmp/Gamma.ipynb"])
        XCTAssertEqual(controller.selectedID, termID)

        // openOrFocusTab focuses existing tab across controllers and never opens a duplicate window.
        WorkspaceTabs.openOrFocusTab(.file(beta)) { openedWindowTargets.append($0) }
        XCTAssertEqual(controller.selectedID, betaID)
        XCTAssertTrue(openedWindowTargets.isEmpty)
    }
}
#endif
