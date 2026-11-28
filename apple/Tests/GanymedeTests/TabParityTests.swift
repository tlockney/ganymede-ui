import CoreGraphics
import Foundation
import XCTest
#if os(macOS)
import AppKit
#endif

/// Unit tests for Mac custom tab parity (#905): drag-reorder/detach/docking
/// geometry, Show All Tabs filtering & keyboard navigation, `⌘1`–`⌘9` /
/// `⌃Tab` shortcut resolution, multi-tab session restoration, and cross-window
/// live session handoff & window merging.
final class TabParityTests: XCTestCase {
    // MARK: - Drag Geometry (Cross-Platform)

    func testInsertionSlotAndReorderDestinationIndex() {
        let idA = UUID()
        let idB = UUID()
        let idC = UUID()
        let slots = [
            TabDragGeometry.TabSlot(id: idA, frame: CGRect(x: 100, y: 500, width: 120, height: 40)),
            TabDragGeometry.TabSlot(id: idB, frame: CGRect(x: 224, y: 500, width: 120, height: 40)),
            TabDragGeometry.TabSlot(id: idC, frame: CGRect(x: 348, y: 500, width: 120, height: 40)),
        ]

        // Pointer before first midpoint -> slot 0.
        let s0 = TabDragGeometry.insertionSlot(pointerX: 120, in: slots, leadingEdgeFallback: 100)
        XCTAssertEqual(s0.index, 0)
        XCTAssertEqual(s0.indicatorX, 100)

        // Pointer between A and B -> slot 1.
        let s1 = TabDragGeometry.insertionSlot(pointerX: 250, in: slots, leadingEdgeFallback: 100)
        XCTAssertEqual(s1.index, 1)
        XCTAssertEqual(s1.indicatorX, 222)

        // Pointer past last midpoint -> slot 3 (trailing).
        let s3 = TabDragGeometry.insertionSlot(pointerX: 460, in: slots, leadingEdgeFallback: 100)
        XCTAssertEqual(s3.index, 3)
        XCTAssertEqual(s3.indicatorX, 470)

        // Empty strip uses fallback leading edge.
        let empty = TabDragGeometry.insertionSlot(pointerX: 120, in: [], leadingEdgeFallback: 42)
        XCTAssertEqual(empty.index, 0)
        XCTAssertEqual(empty.indicatorX, 42)

        // Post-removal destination index accounts for removing the source item first.
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 0, insertionIndex: 0, count: 3), 0)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 0, insertionIndex: 1, count: 3), 0)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 0, insertionIndex: 2, count: 3), 1)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 0, insertionIndex: 3, count: 3), 2)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 2, insertionIndex: 0, count: 3), 0)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 2, insertionIndex: 1, count: 3), 1)
        XCTAssertEqual(TabDragGeometry.reorderDestinationIndex(from: 2, insertionIndex: 3, count: 3), 2)
    }

    func testDragResolveHandlesReorderDetachSingleTabGuardAndCrossWindowDocking() {
        let idA = UUID()
        let idB = UUID()
        let idOther = UUID()

        let sourceStrip = TabDragGeometry.TargetStrip(
            windowID: 1,
            stripFrame: CGRect(x: 100, y: 700, width: 600, height: 46),
            tabFrames: [
                TabDragGeometry.TabSlot(id: idA, frame: CGRect(x: 112, y: 700, width: 150, height: 40)),
                TabDragGeometry.TabSlot(id: idB, frame: CGRect(x: 266, y: 700, width: 150, height: 40)),
            ]
        )
        let otherStrip = TabDragGeometry.TargetStrip(
            windowID: 2,
            stripFrame: CGRect(x: 800, y: 700, width: 600, height: 46),
            tabFrames: [
                TabDragGeometry.TabSlot(id: idOther, frame: CGRect(x: 812, y: 700, width: 150, height: 40)),
            ]
        )

        // Dragging horizontally inside source strip -> reorder.
        let reorder = TabDragGeometry.resolve(
            pointer: CGPoint(x: 380, y: 720),
            sourceWindowID: 1,
            sourceTabID: idA,
            sourceTabCount: 2,
            strips: [sourceStrip, otherStrip]
        )
        if case .reorder(let dest, let insertion, _) = reorder {
            XCTAssertEqual(dest, 1)
            XCTAssertEqual(insertion, 2)
        } else {
            XCTFail("Expected reorder outcome, got \(reorder)")
        }

        // Pulling vertically past threshold with 2 tabs -> detach.
        let detach = TabDragGeometry.resolve(
            pointer: CGPoint(x: 300, y: 600),
            sourceWindowID: 1,
            sourceTabID: idA,
            sourceTabCount: 2,
            strips: [sourceStrip, otherStrip]
        )
        XCTAssertEqual(detach, .detach(screenPoint: CGPoint(x: 300, y: 600)))

        // Pulling vertically past threshold with only 1 tab -> none (no pointless detach).
        let singleNoDetach = TabDragGeometry.resolve(
            pointer: CGPoint(x: 300, y: 600),
            sourceWindowID: 1,
            sourceTabID: idA,
            sourceTabCount: 1,
            strips: [sourceStrip, otherStrip]
        )
        XCTAssertEqual(singleNoDetach, .none)

        // Dragging over another window's strip -> dock (even when source has only 1 tab!).
        let dock = TabDragGeometry.resolve(
            pointer: CGPoint(x: 920, y: 720),
            sourceWindowID: 1,
            sourceTabID: idA,
            sourceTabCount: 1,
            strips: [sourceStrip, otherStrip]
        )
        if case .dock(let targetWindowID, let insertionIndex, _) = dock {
            XCTAssertEqual(targetWindowID, 2)
            XCTAssertEqual(insertionIndex, 1)
        } else {
            XCTFail("Expected dock outcome, got \(dock)")
        }

        // Overlapping target strips respect front-to-back window ordering.
        let frontStrip = TabDragGeometry.TargetStrip(
            windowID: 3,
            stripFrame: CGRect(x: 800, y: 700, width: 600, height: 46),
            tabFrames: []
        )
        let frontWins = TabDragGeometry.resolve(
            pointer: CGPoint(x: 920, y: 720),
            sourceWindowID: 1,
            sourceTabID: idA,
            sourceTabCount: 2,
            strips: [frontStrip, otherStrip, sourceStrip]
        )
        if case .dock(let targetWindowID, let insertionIndex, _) = frontWins {
            XCTAssertEqual(targetWindowID, 3)
            XCTAssertEqual(insertionIndex, 0)
        } else {
            XCTFail("Expected frontmost strip to win cross-window hit test")
        }
    }

    func testDetachedWindowOriginClampsWithinVisibleScreen() {
        let visible = CGRect(x: 0, y: 25, width: 1440, height: 875)
        let size = CGSize(width: 900, height: 600)

        let centered = TabDragGeometry.detachedWindowOrigin(
            dropPoint: CGPoint(x: 720, y: 700),
            windowSize: size,
            visibleFrame: visible
        )
        XCTAssertEqual(centered.x, 270)
        XCTAssertEqual(centered.y, 156)

        // Drop near bottom-left edge clamps inside visible frame.
        let clampedLow = TabDragGeometry.detachedWindowOrigin(
            dropPoint: CGPoint(x: 20, y: 40),
            windowSize: size,
            visibleFrame: visible
        )
        XCTAssertEqual(clampedLow.x, 0)
        XCTAssertEqual(clampedLow.y, 25)

        // Drop near top-right edge clamps inside visible frame.
        let clampedHigh = TabDragGeometry.detachedWindowOrigin(
            dropPoint: CGPoint(x: 1430, y: 895),
            windowSize: size,
            visibleFrame: visible
        )
        XCTAssertEqual(clampedHigh.x, 540)
        XCTAssertEqual(clampedHigh.y, 300)
    }

    // MARK: - Overview Filtering, Grid Navigation & Shortcut Resolution (Cross-Platform)

    func testOverviewFilteringAndKeyboardGridNavigation() {
        let id1 = UUID()
        let id2 = UUID()
        let id3 = UUID()
        let id4 = UUID()
        let items: [TabOverviewItem] = [
            TabOverviewItem(
                id: id1,
                descriptor: WorkspaceTabDescriptor(
                    id: id1,
                    kind: .notebook,
                    title: "Fremont Bridge",
                    toolTip: "2026-11-09-fremont-bridge.ipynb",
                    badge: TabLanguageBadge(code: "TS", palette: .typescript),
                    kernelKind: .idle,
                    kernelLabel: "Kernel idle"
                ),
                isDirty: true,
                isSelected: true,
                index: 0
            ),
            TabOverviewItem(
                id: id2,
                descriptor: WorkspaceTabDescriptor(
                    id: id2,
                    kind: .notebook,
                    title: "DuckDB console",
                    toolTip: "duckdb-console",
                    badge: TabLanguageBadge(code: "SQL", palette: .sql),
                    kernelKind: .working,
                    kernelLabel: "Kernel busy"
                ),
                isDirty: false,
                isSelected: false,
                index: 1
            ),
            TabOverviewItem(
                id: id3,
                descriptor: .machine(id: id3, name: "m4mini"),
                isDirty: false,
                isSelected: false,
                index: 2
            ),
            TabOverviewItem(
                id: id4,
                descriptor: .terminal(id: id4, title: "zsh"),
                isDirty: false,
                isSelected: false,
                index: 3
            ),
        ]

        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "  ").map(\.id), [id1, id2, id3, id4])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "fremont").map(\.id), [id1])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "SQL").map(\.id), [id2])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "busy").map(\.id), [id2])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "machine").map(\.id), [id3])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "terminal").map(\.id), [id4])
        XCTAssertEqual(TabOverviewNavigation.filter(items, query: "edited").map(\.id), [id1])
        XCTAssertTrue(TabOverviewNavigation.filter(items, query: "nonexistent").isEmpty)

        // Responsive columns.
        XCTAssertEqual(TabOverviewNavigation.columnCount(forWidth: 260), 1)
        XCTAssertEqual(TabOverviewNavigation.columnCount(forWidth: 560), 2)
        XCTAssertEqual(TabOverviewNavigation.columnCount(forWidth: 860), 3)
        XCTAssertEqual(TabOverviewNavigation.columnCount(forWidth: 1200), 4)

        // 2-column grid navigation over 4 items:
        // [id1, id2]
        // [id3, id4]
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: nil, in: items, direction: .right, columns: 2), id1)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id1, in: items, direction: .right, columns: 2), id2)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id1, in: items, direction: .down, columns: 2), id3)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id3, in: items, direction: .right, columns: 2), id4)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id4, in: items, direction: .up, columns: 2), id2)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id1, in: items, direction: .left, columns: 2), id1)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id1, in: items, direction: .up, columns: 2), id1)
        XCTAssertEqual(TabOverviewNavigation.moveSelection(current: id4, in: items, direction: .down, columns: 2), id4)
    }

    func testTabShortcutResolverAndCycleMatcher() {
        XCTAssertNil(TabShortcutResolver.targetIndex(forDigit: 1, tabCount: 0))
        XCTAssertNil(TabShortcutResolver.targetIndex(forDigit: 9, tabCount: 0))
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 1, tabCount: 3), 0)
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 2, tabCount: 3), 1)
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 3, tabCount: 3), 2)
        XCTAssertNil(TabShortcutResolver.targetIndex(forDigit: 4, tabCount: 3))
        // ⌘9 selects the last tab regardless of count.
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 9, tabCount: 3), 2)
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 9, tabCount: 12), 11)
        XCTAssertEqual(TabShortcutResolver.targetIndex(forDigit: 8, tabCount: 12), 7)
        XCTAssertNil(TabShortcutResolver.targetIndex(forDigit: 0, tabCount: 5))

        // Control-Tab / Control-Shift-Tab matching.
        XCTAssertEqual(
            TabShortcutResolver.matchTabCycle(keyCode: 48, control: true, shift: false, command: false, option: false),
            .next
        )
        XCTAssertEqual(
            TabShortcutResolver.matchTabCycle(keyCode: 48, control: true, shift: true, command: false, option: false),
            .previous
        )
        XCTAssertNil(
            TabShortcutResolver.matchTabCycle(keyCode: 48, control: true, shift: false, command: true, option: false)
        )
        XCTAssertNil(
            TabShortcutResolver.matchTabCycle(keyCode: 48, control: true, shift: false, command: false, option: true)
        )
        XCTAssertNil(
            TabShortcutResolver.matchTabCycle(keyCode: 48, control: false, shift: false, command: false, option: false)
        )
        XCTAssertNil(
            TabShortcutResolver.matchTabCycle(keyCode: 18, control: true, shift: false, command: false, option: false)
        )
    }

    // MARK: - RestorableTabSet (Cross-Platform)

    func testRestorableTabSetRoundTripClampingLegacyFallbackAndCorruptJSON() throws {
        let dir = URL(fileURLWithPath: "/Users/me/work", isDirectory: true)
        let nb = dir.appendingPathComponent("Analysis.ipynb")
        let consoleID = UUID()
        let machineID = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
        let machineTarget = try XCTUnwrap(WindowTarget.machine(machineID, path: "/notes", isFolder: true))

        let set = RestorableTabSet(
            tabs: [
                .page(target: .file(nb), sidebarRoot: dir.path),
                .page(target: .console(folder: dir, id: consoleID), sidebarRoot: dir.path),
                .page(target: machineTarget, sidebarRoot: FolderEntry.storageKey(machineTarget.folder)),
                .editor(request: EditorRequest(path: "/Users/me/work/script.py", machine: nil), sidebarRoot: dir.path),
                .terminal(target: .local(folder: dir), sidebarRoot: dir.path),
            ],
            selectedIndex: 3
        )

        let encoded = set.encoded()
        XCTAssertFalse(encoded.isEmpty)
        let decoded = try XCTUnwrap(RestorableTabSet(saved: encoded))
        XCTAssertEqual(decoded, set)
        XCTAssertEqual(decoded.clampedSelectedIndex, 3)

        // Out-of-bounds selectedIndex clamps safely on decode.
        let outOfRange = RestorableTabSet(tabs: set.tabs, selectedIndex: 99)
        let decodedClamped = try XCTUnwrap(RestorableTabSet(saved: outOfRange.encoded()))
        XCTAssertEqual(decodedClamped.selectedIndex, 4)

        let negative = RestorableTabSet(tabs: set.tabs, selectedIndex: -5)
        let decodedNeg = try XCTUnwrap(RestorableTabSet(saved: negative.encoded()))
        XCTAssertEqual(decodedNeg.selectedIndex, 0)

        // Corrupt JSON or empty tabs return nil cleanly.
        XCTAssertNil(RestorableTabSet(saved: ""))
        XCTAssertNil(RestorableTabSet(saved: "{not valid json"))
        XCTAssertNil(RestorableTabSet(saved: #"{"tabs":[],"selectedIndex":0}"#))

        // Legacy fallback when savedTabs is empty or corrupt.
        let legacyTarget = WindowTarget.saved(.file(nb))
        let fromLegacy = try XCTUnwrap(
            RestorableTabSet.resolve(savedTabs: "", legacyTarget: legacyTarget, legacySidebar: dir.path)
        )
        XCTAssertEqual(fromLegacy.tabs, [.page(target: .file(nb), sidebarRoot: dir.path)])
        XCTAssertEqual(fromLegacy.selectedIndex, 0)

        let fromCorrupt = try XCTUnwrap(
            RestorableTabSet.resolve(savedTabs: "corrupt", legacyTarget: legacyTarget, legacySidebar: dir.path)
        )
        XCTAssertEqual(fromCorrupt, fromLegacy)

        // Multi-tab snapshot takes precedence over legacy target.
        let multiWins = try XCTUnwrap(
            RestorableTabSet.resolve(savedTabs: encoded, legacyTarget: legacyTarget, legacySidebar: dir.path)
        )
        XCTAssertEqual(multiWins, set)

        // Both empty returns nil.
        XCTAssertNil(RestorableTabSet.resolve(savedTabs: "", legacyTarget: "", legacySidebar: ""))
    }

    // MARK: - macOS Live Handoff, Restoration & Window Merging

    #if os(macOS)
    @MainActor
    private final class MockWebViewStore: PageWebViewRetiring {
        let pagePlace: WorkspacePagePlace
        var retiredCount = 0

        init(pagePlace: WorkspacePagePlace = WorkspacePagePlace(place: .thisDevice, root: nil)) {
            self.pagePlace = pagePlace
        }

        func retire() {
            retiredCount += 1
        }
    }

    @MainActor
    private func makeWindow() -> NSWindow {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        w.isReleasedWhenClosed = false
        return w
    }

    @MainActor
    func testShortcutDigitsAndOverviewStateOnController() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let controller = WorkspaceTabController(target: .file(root.appendingPathComponent("A.ipynb")), root: root)
        let idA = controller.sessions[0].id
        let idB = controller.addPageTab(target: .file(root.appendingPathComponent("B.ipynb")), place: .thisDevice, machineName: nil)
        let idTerm = controller.addTerminalTab(target: .local(folder: root), sidebarRoot: root)

        controller.toggleOverview()
        XCTAssertTrue(controller.isShowingOverview)
        XCTAssertEqual(controller.overviewItems.count, 3)

        controller.selectShortcutDigit(1)
        XCTAssertEqual(controller.selectedID, idA)
        XCTAssertFalse(controller.isShowingOverview, "⌘1 dismisses overview when switching tabs")

        controller.selectShortcutDigit(9)
        XCTAssertEqual(controller.selectedID, idTerm, "⌘9 selects the last tab")

        controller.selectShortcutDigit(2)
        XCTAssertEqual(controller.selectedID, idB)

        // Out-of-range digit leaves selection unchanged.
        controller.selectShortcutDigit(7)
        XCTAssertEqual(controller.selectedID, idB)
    }

    @MainActor
    func testControllerRestorePreservesOrderSidebarRootsAndSelection() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let sub = root.appendingPathComponent("sub", isDirectory: true)
        let nbA = root.appendingPathComponent("A.ipynb")
        let nbB = sub.appendingPathComponent("B.ipynb")

        let controller = WorkspaceTabController(target: .file(nbA), root: root)
        let initialPage = controller.activePage

        let saved = RestorableTabSet(
            tabs: [
                .page(target: .file(nbA), sidebarRoot: root.path),
                .page(target: .file(nbB), sidebarRoot: sub.path),
                .editor(request: EditorRequest(path: "/Users/tester/Project/notes.md", machine: nil), sidebarRoot: sub.path),
                .terminal(target: .local(folder: sub), sidebarRoot: sub.path),
            ],
            selectedIndex: 2
        )

        controller.restore(
            from: saved,
            placeResolver: { $0.place },
            machineNameResolver: { _ in nil },
            thisMacRootResolver: { _ in nil },
            fallbackRoot: root
        )

        XCTAssertEqual(controller.sessions.count, 4)
        XCTAssertTrue(controller.sessions[0].pageTab === initialPage, "matching initial page tab is reused without reloading")
        XCTAssertEqual(controller.sessions[1].pageTab?.sidebarRoot.path, sub.path)
        XCTAssertEqual(controller.sessions[2].editorTab?.request.path, "/Users/tester/Project/notes.md")
        XCTAssertEqual(controller.sessions[3].terminalTab?.target, .local(folder: sub))
        XCTAssertEqual(controller.activeIndex, 2)
        XCTAssertEqual(controller.restorableTabSet, saved)
    }

    @MainActor
    func testDetachTransferAndMergePreserveLiveWebViewStoreAndCloseEmptiedWindow() {
        let root = URL(fileURLWithPath: "/Users/tester/Project", isDirectory: true)
        let nbA = root.appendingPathComponent("A.ipynb")
        let nbB = root.appendingPathComponent("B.ipynb")
        let nbC = root.appendingPathComponent("C.ipynb")

        let win1 = makeWindow()
        let win2 = makeWindow()
        let c1 = WorkspaceTabController(target: .file(nbA), root: root)
        let idA = c1.sessions[0].id
        let storeA = MockWebViewStore()
        c1.sessions[0].pageTab?.webViewStore = storeA

        let idB = c1.addPageTab(target: .file(nbB), place: .thisDevice, machineName: nil)
        let storeB = MockWebViewStore()
        c1.sessions.first(where: { $0.id == idB })?.pageTab?.webViewStore = storeB

        let c2 = WorkspaceTabController(target: .file(nbC), root: root)
        let idC = c2.sessions[0].id
        let storeC = MockWebViewStore()
        c2.sessions[0].pageTab?.webViewStore = storeC

        c1.attach(to: win1)
        c2.attach(to: win2)
        WorkspaceTabs.join(win1)
        WorkspaceTabs.join(win2)
        WorkspaceTabs.registerController(c1, for: win1)
        WorkspaceTabs.registerController(c2, for: win2)
        defer {
            WorkspaceTabs.unregisterController(c1, for: win1)
            WorkspaceTabs.unregisterController(c2, for: win2)
            _ = WorkspaceTabs.windows.closing(win1)
            _ = WorkspaceTabs.windows.closing(win2)
        }

        XCTAssertGreaterThanOrEqual(WorkspaceTabs.registryState.windowCount, 2)

        // 1. Detach tab B into a new window via handoff: live store is NOT retired.
        var openedScenes: [String] = []
        let handoff = WorkspaceTabHandoff()
        let drop = CGPoint(x: 420, y: 500)
        XCTAssertTrue(handoff.detachToNewWindow(sessionID: idB, from: c1, dropPoint: drop) {
            openedScenes.append($0)
        })
        XCTAssertEqual(openedScenes, [WorkspaceTabs.sceneID])
        XCTAssertEqual(c1.sessions.map(\.id), [idA])
        XCTAssertEqual(storeB.retiredCount, 0, "detaching to a new window must preserve live WKWebView")
        let pending = handoff.pending
        XCTAssertEqual(pending?.sessions.map(\.id), [idB])
        XCTAssertEqual(pending?.dropPoint, drop)
        if let pending { handoff.take(pending) }
        XCTAssertNil(handoff.pending)

        // Detach refuses when only 1 tab remains.
        XCTAssertFalse(handoff.detachToNewWindow(sessionID: idA, from: c1) { _ in })

        // 2. Cross-window transfer of the last tab from win2 into win1 closes win2 cleanly without retiring storeC.
        win2.orderFront(nil)
        XCTAssertTrue(handoff.transferSession(
            sessionID: idC,
            from: c2,
            sourceWindow: win2,
            to: c1,
            targetWindow: win1,
            at: 0
        ))
        XCTAssertEqual(c1.sessions.map(\.id), [idC, idA])
        XCTAssertEqual(c1.selectedID, idC)
        XCTAssertEqual(storeC.retiredCount, 0, "docking into another window must preserve live WKWebView")
        XCTAssertFalse(win2.isVisible, "emptied source window closes cleanly")
        XCTAssertNil(WorkspaceTabs.controller(for: win2))

        // 3. Merge All Windows adopts all tabs from secondary window into destination and closes secondary.
        let win3 = makeWindow()
        let c3 = WorkspaceTabController(target: .folder(root), root: root)
        let editorID = c3.addEditorTab(
            request: EditorRequest(path: "/Users/tester/Project/readme.md", machine: nil),
            machineName: nil,
            sidebarRoot: root
        )
        c3.activeEditor?.document.edited("unsaved edit")
        c3.attach(to: win3)
        WorkspaceTabs.join(win3)
        WorkspaceTabs.registerController(c3, for: win3)
        win3.orderFront(nil)

        c1.select(idA)
        XCTAssertTrue(handoff.mergeAllWindows(into: win1))
        XCTAssertEqual(c1.selectedID, idA, "destination window preserves its active tab across merge")
        XCTAssertTrue(c1.sessions.contains(where: { $0.id == editorID }))
        XCTAssertEqual(c1.sessions.first(where: { $0.id == editorID })?.editorTab?.document.dirty, true)
        XCTAssertFalse(win3.isVisible)
        XCTAssertNil(WorkspaceTabs.controller(for: win3))

        // 4. Closing a tab in place retires its live web view store.
        XCTAssertTrue(c1.removeSession(idC))
        XCTAssertEqual(storeC.retiredCount, 1, "closing a tab retires its live WKWebView")
    }
    #endif
}
