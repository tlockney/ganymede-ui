import CoreGraphics
import XCTest

/// Tab model classification, language badges, accessibility labels, and
/// geometric layout at 1280 and 1728 wide for the Mac tabs spike (#903).
final class TabStripTests: XCTestCase {
    func testLanguageBadgeResolvesKnownLanguagesAndFallbacks() {
        XCTAssertEqual(TabLanguageBadge.resolve(language: "typescript"), TabLanguageBadge(code: "TS", palette: .typescript))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "Python"), TabLanguageBadge(code: "PY", palette: .python))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "javascript"), TabLanguageBadge(code: "JS", palette: .javascript))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "sql"), TabLanguageBadge(code: "SQL", palette: .sql))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "julia"), TabLanguageBadge(code: "JL", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "r"), TabLanguageBadge(code: "R", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "rust"), TabLanguageBadge(code: "RS", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "go"), TabLanguageBadge(code: "GO", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "bash"), TabLanguageBadge(code: "SH", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: "wolfram"), TabLanguageBadge(code: "WO", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: nil, isConsole: true), TabLanguageBadge(code: "SQL", palette: .sql))
        XCTAssertEqual(TabLanguageBadge.resolve(language: nil, pathExtension: "ipynb"), TabLanguageBadge(code: "NB", palette: .neutral))
        XCTAssertEqual(TabLanguageBadge.resolve(language: nil, pathExtension: "py"), TabLanguageBadge(code: "PY", palette: .python))
    }

    func testDescriptorClassificationDisplayTitleAndTooltip() throws {
        var state = PageState()
        state.path = "Users/me/work/2026-11-09-fremont-bridge.ipynb"
        state.kernelLanguage = "typescript"
        state.status = "idle"
        state.kernelDisplayName = "TypeScript"

        let dated = WindowTarget.file(URL(fileURLWithPath: "/Users/me/work/2026-11-09-fremont-bridge.ipynb"))
        let notebook = WorkspaceTabDescriptor.fromTarget(
            id: UUID(),
            target: dated,
            state: state,
            place: .thisDevice,
            machineName: nil,
            metadataTitle: "Fremont Bridge"
        )
        XCTAssertEqual(notebook.kind, .notebook)
        XCTAssertEqual(notebook.group, .document)
        XCTAssertEqual(notebook.topEdgeTone, .orange)
        XCTAssertEqual(notebook.title, "Fremont Bridge")
        XCTAssertEqual(notebook.toolTip, "2026-11-09-fremont-bridge.ipynb")
        XCTAssertEqual(notebook.badge?.code, "TS")
        XCTAssertEqual(notebook.kernelKind, .idle)
        XCTAssertEqual(notebook.kernelLabel, "Kernel idle")

        // Without metadataTitle, drops the YYYY-MM-DD- prefix in the tab title
        // while keeping the full dated filename in the tooltip (#867).
        let stripped = WorkspaceTabDescriptor.fromTarget(
            id: UUID(),
            target: dated,
            state: state,
            place: .thisDevice,
            machineName: nil,
            metadataTitle: nil
        )
        XCTAssertEqual(stripped.title, "fremont-bridge")
        XCTAssertEqual(stripped.toolTip, "2026-11-09-fremont-bridge.ipynb")

        // Connected machine folder -> machine silhouette with blue top edge.
        let machineID = "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB"
        let machineTarget = try XCTUnwrap(WindowTarget.machine(machineID, path: "/", isFolder: true))
        let machine = WorkspaceTabDescriptor.fromTarget(
            id: UUID(),
            target: machineTarget,
            state: PageState(),
            place: .machine(machineID),
            machineName: "m4mini",
            metadataTitle: nil
        )
        XCTAssertEqual(machine.kind, .machine)
        XCTAssertEqual(machine.group, .environment)
        XCTAssertEqual(machine.topEdgeTone, .blue)
        XCTAssertEqual(machine.title, "m4mini")
        XCTAssertEqual(machine.machineSymbol, "desktopcomputer")

        let laptop = WorkspaceTabDescriptor.machine(id: UUID(), name: "workmbp")
        XCTAssertEqual(laptop.machineSymbol, "laptopcomputer")
        XCTAssertEqual(laptop.topEdgeTone, .blue)

        // Terminal -> dark mono chip with neutral top edge.
        let terminal = WorkspaceTabDescriptor.terminal(id: UUID(), title: "")
        XCTAssertEqual(terminal.kind, .terminal)
        XCTAssertEqual(terminal.group, .environment)
        XCTAssertEqual(terminal.topEdgeTone, .neutral)
        XCTAssertEqual(terminal.title, "zsh")

        // Text file editor -> document group with orange active top edge.
        let editor = WorkspaceTabDescriptor.editor(id: UUID(), path: "/Users/me/work/fremont.ts")
        XCTAssertEqual(editor.kind, .editor)
        XCTAssertEqual(editor.group, .document)
        XCTAssertEqual(editor.topEdgeTone, .orange)
        XCTAssertEqual(editor.badge?.code, "TS")
    }

    func testKernelDotAccessibilityLabelsMatchHeaderStatus() {
        let cases: [(String?, Bool, String)] = [
            ("idle", false, "Kernel idle"),
            ("none", false, "Kernel idle"),
            ("busy", false, "Kernel busy"),
            ("starting", false, "Kernel starting"),
            ("restarting", false, "Kernel busy"),
            ("connecting", false, "Kernel busy"),
            ("terminating", false, "Kernel stopping"),
            ("dead", false, "Kernel stopped"),
            ("idle", true, "Kernel not installed"),
        ]
        let target = WindowTarget.file(URL(fileURLWithPath: "/Users/me/a.ipynb"))
        for (status, missing, expectedLabel) in cases {
            var state = PageState()
            state.path = "Users/me/a.ipynb"
            state.status = status
            state.kernelMissing = missing
            let tab = WorkspaceTabDescriptor.fromTarget(
                id: UUID(),
                target: target,
                state: state,
                place: .thisDevice,
                machineName: nil,
                metadataTitle: nil
            )
            XCTAssertEqual(tab.kernelLabel, expectedLabel, "status=\(status ?? "nil") missing=\(missing)")
            XCTAssertEqual(tab.accessibilityValue, expectedLabel)
        }
    }

    func testSampleAddonsDoNotDuplicateExistingTabs() {
        let primary = WorkspaceTabDescriptor(
            id: UUID(),
            kind: .notebook,
            title: "Fremont Bridge",
            toolTip: "2026-11-09-fremont-bridge.ipynb",
            badge: TabLanguageBadge(code: "TS", palette: .typescript),
            kernelKind: .idle,
            kernelLabel: "Kernel idle",
            isPrimary: true
        )
        let addons = WorkspaceTabDescriptor.sampleAddons(for: [primary])
        XCTAssertEqual(addons.map(\.title), ["DuckDB console", "m4mini", "workmbp", "zsh"])
        XCTAssertTrue(addons.allSatisfy(\.isSample))
        // Running again with addons included produces no duplicates.
        XCTAssertTrue(WorkspaceTabDescriptor.sampleAddons(for: [primary] + addons).isEmpty)
    }

    func testLayoutAt1280And1728FitsMockupTabSetWithoutOverflow() {
        let activeID = UUID()
        let tabs: [WorkspaceTabDescriptor] = [
            WorkspaceTabDescriptor(
                id: activeID,
                kind: .notebook,
                title: "Fremont Bridge",
                toolTip: "2026-11-09-fremont-bridge.ipynb",
                badge: TabLanguageBadge(code: "TS", palette: .typescript),
                kernelKind: .idle,
                kernelLabel: "Kernel idle",
                isPrimary: true
            ),
            WorkspaceTabDescriptor(
                id: UUID(),
                kind: .notebook,
                title: "DuckDB console",
                toolTip: "duckdb-console.ipynb",
                badge: TabLanguageBadge(code: "SQL", palette: .sql),
                kernelKind: .working,
                kernelLabel: "Kernel busy"
            ),
            .machine(id: UUID(), name: "m4mini"),
            .machine(id: UUID(), name: "workmbp"),
            .terminal(id: UUID(), title: "zsh"),
        ]

        for windowWidth in [CGFloat(1280), CGFloat(1728)] {
            for sidebarShown in [true, false] {
                let detail = TabStripLayout.detailWidth(windowWidth: windowWidth, sidebarShown: sidebarShown)
                let layout = TabStripLayout.compute(tabs: tabs, selectedID: activeID, containerWidth: detail)
                XCTAssertFalse(layout.overflows, "unexpected overflow at \(windowWidth) sidebar=\(sidebarShown)")
                XCTAssertEqual(layout.separatorAfterIndex, 1)
                XCTAssertEqual(layout.items.count, 5)
                XCTAssertTrue(layout.items.allSatisfy { !$0.truncatesTitle })
                XCTAssertLessThanOrEqual(
                    layout.scrollAreaWidth + TabStripLayout.tabSpacing + TabStripLayout.newTabButtonSize,
                    layout.availableWidth + 0.5
                )
            }
        }
    }

    func testLongNotebookTitleClampsAndTruncatesWhilePreservingSiblings() {
        let activeID = UUID()
        let tabs: [WorkspaceTabDescriptor] = [
            WorkspaceTabDescriptor(
                id: activeID,
                kind: .notebook,
                title: "Have bike commutes over the Fremont Bridge come back since 2019?",
                toolTip: "2026-11-09-fremont-bridge.ipynb",
                badge: TabLanguageBadge(code: "TS", palette: .typescript),
                kernelKind: .idle,
                kernelLabel: "Kernel idle",
                isPrimary: true
            ),
            .machine(id: UUID(), name: "m4mini"),
            .terminal(id: UUID(), title: "zsh"),
        ]

        let width1280 = TabStripLayout.detailWidth(windowWidth: 1280, sidebarShown: true)
        let layout1280 = TabStripLayout.compute(tabs: tabs, selectedID: activeID, containerWidth: width1280)
        let activeItem = layout1280.item(for: activeID)
        XCTAssertEqual(activeItem?.width, TabStripLayout.activeMaxWidth)
        XCTAssertEqual(activeItem?.truncatesTitle, true)
        XCTAssertFalse(layout1280.overflows)
        XCTAssertEqual(layout1280.item(for: tabs[1].id)?.truncatesTitle, false)

        let width1728 = TabStripLayout.detailWidth(windowWidth: 1728, sidebarShown: true, inspectorShown: true)
        let layout1728 = TabStripLayout.compute(tabs: tabs, selectedID: activeID, containerWidth: width1728)
        XCTAssertEqual(layout1728.item(for: activeID)?.width, TabStripLayout.activeMaxWidth)
        XCTAssertFalse(layout1728.overflows)
    }

    func testManyTabsOverflowCleanlyAt1280WhileKeepingPlusVisible() {
        let activeID = UUID()
        var tabs: [WorkspaceTabDescriptor] = [
            WorkspaceTabDescriptor(
                id: activeID,
                kind: .notebook,
                title: "Fremont Bridge",
                toolTip: "2026-11-09-fremont-bridge.ipynb",
                badge: TabLanguageBadge(code: "TS", palette: .typescript),
                kernelKind: .idle,
                kernelLabel: "Kernel idle"
            ),
        ]
        for i in 1...12 {
            tabs.append(
                WorkspaceTabDescriptor(
                    id: UUID(),
                    kind: .notebook,
                    title: "Analysis notebook \(i)",
                    toolTip: "analysis-\(i).ipynb",
                    badge: TabLanguageBadge(code: "PY", palette: .python),
                    kernelKind: .idle,
                    kernelLabel: "Kernel idle"
                )
            )
        }
        tabs.append(.terminal(id: UUID(), title: "zsh"))

        let detail1280 = TabStripLayout.detailWidth(windowWidth: 1280, sidebarShown: true)
        let layout = TabStripLayout.compute(tabs: tabs, selectedID: activeID, containerWidth: detail1280)
        XCTAssertTrue(layout.overflows)
        XCTAssertEqual(
            layout.scrollAreaWidth + TabStripLayout.tabSpacing + TabStripLayout.newTabButtonSize,
            layout.availableWidth,
            accuracy: 0.5
        )
        for item in layout.items {
            XCTAssertGreaterThanOrEqual(item.width, item.minWidth)
        }
    }

    func testDeveloperSettingsCustomTabKeysDefaultToOff() {
        let suiteName = "TabStripTests.\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }

        XCTAssertFalse(defaults.bool(forKey: SettingsTab.customTabsKey))
        XCTAssertFalse(defaults.bool(forKey: SettingsTab.customTabsSamplesKey))
    }
}
