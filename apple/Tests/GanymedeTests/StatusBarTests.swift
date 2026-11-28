import XCTest

/// Mac status bar text, visibility, memory watcher and contrast (#882).
final class StatusBarTests: XCTestCase {
    private func notebookState(
        path: String? = "notes/Io.ipynb",
        dirty: Bool = false,
        locked: Bool? = false,
        version: String? = "cdp-kernel 0.16.0 · node 24.11.0",
        memory: Double? = 212 * 1024 * 1024
    ) -> PageState {
        var state = PageState()
        state.path = path
        state.dirty = dirty
        state.locked = locked
        state.kernelDisplayName = "TypeScript"
        state.kernelVersionLine = version
        if let path {
            state.running = [
                PageState.Session(
                    id: "other", path: "notes/Other.ipynb", kernel: "Python 3",
                    state: "idle", kernelID: "k0", memory: 99 * 1024 * 1024),
                PageState.Session(
                    id: "s1", path: path, kernel: "TypeScript",
                    state: "idle", kernelID: "k1", memory: memory),
            ]
        }
        return state
    }

    private func header(for state: PageState, savedOn: String = "This Mac") -> HeaderStatus? {
        HeaderStatus.make(state: state, savedOn: savedOn, runsOn: "This Mac")
    }

    func testSavedEditedAndLockedText() {
        let saved = notebookState()
        let savedContent = StatusBarContent.make(header: header(for: saved), state: saved)
        XCTAssertEqual(savedContent.save, "Saved on This Mac")
        XCTAssertEqual(savedContent.version, "cdp-kernel 0.16.0 · node 24.11.0")
        XCTAssertEqual(savedContent.memory, saved.sessions[1].memoryLabel)

        let machine = StatusBarContent.make(header: header(for: saved, savedOn: "m4mini"), state: saved)
        XCTAssertEqual(machine.save, "Saved on m4mini")

        let edited = notebookState(dirty: true)
        XCTAssertEqual(StatusBarContent.make(header: header(for: edited), state: edited).save, "Edited")

        let locked = notebookState(locked: true)
        XCTAssertEqual(
            StatusBarContent.make(header: header(for: locked), state: locked).save,
            "Locked: changed on disk")

        let editedAndLocked = notebookState(dirty: true, locked: true)
        XCTAssertEqual(
            StatusBarContent.make(header: header(for: editedAndLocked), state: editedAndLocked).save,
            "Edited · Locked: changed on disk")
    }

    func testOmitsUnknownVersionAndMemory() {
        let noVersion = notebookState(version: nil)
        let noVersionContent = StatusBarContent.make(header: header(for: noVersion), state: noVersion)
        XCTAssertEqual(noVersionContent.save, "Saved on This Mac")
        XCTAssertNil(noVersionContent.version)
        XCTAssertNotNil(noVersionContent.memory)

        let blankVersion = notebookState(version: "   ")
        XCTAssertNil(StatusBarContent.make(header: header(for: blankVersion), state: blankVersion).version)

        let noMemory = notebookState(memory: nil)
        let noMemoryContent = StatusBarContent.make(header: header(for: noMemory), state: noMemory)
        XCTAssertEqual(noMemoryContent.save, "Saved on This Mac")
        XCTAssertEqual(noMemoryContent.version, "cdp-kernel 0.16.0 · node 24.11.0")
        XCTAssertNil(noMemoryContent.memory)

        var noSession = notebookState(memory: nil)
        noSession.running = [
            PageState.Session(
                id: "other", path: "notes/Other.ipynb", kernel: "Python 3",
                state: "idle", kernelID: "k0", memory: 64 * 1024 * 1024)
        ]
        XCTAssertNil(StatusBarContent.make(header: header(for: noSession), state: noSession).memory)
    }

    func testNonNotebooksShowNothing() {
        let folder = notebookState(path: nil)
        XCTAssertTrue(StatusBarContent.make(header: nil, state: folder).isEmpty)

        for dataPath in ["data/table.csv", "data/a.parquet"] {
            var data = notebookState(path: dataPath)
            data.kernelVersionLine = "cdp-kernel 0.16.0"
            XCTAssertTrue(StatusBarContent.make(header: nil, state: data).isEmpty, dataPath)
        }
    }

    func testMenuTitleAndVisibilityRules() {
        XCTAssertEqual(StatusBarContent.menuTitle(shown: true), "Hide Status Bar")
        XCTAssertEqual(StatusBarContent.menuTitle(shown: false), "Show Status Bar")

        XCTAssertTrue(StatusBarContent.showsContent(barShown: true, showsNotebook: true, filled: nil))
        XCTAssertTrue(StatusBarContent.showsContent(barShown: true, showsNotebook: true, filled: .notebook))
        XCTAssertFalse(StatusBarContent.showsContent(barShown: false, showsNotebook: true, filled: nil))
        XCTAssertFalse(StatusBarContent.showsContent(barShown: true, showsNotebook: false, filled: nil))
        XCTAssertFalse(StatusBarContent.showsContent(barShown: true, showsNotebook: true, filled: .panel))
        XCTAssertFalse(StatusBarContent.showsContent(barShown: true, showsNotebook: true, filled: .inspector))
    }

    func testPreferenceDefaultsToOnAndPersists() throws {
        let suite = "StatusBarTests.\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        XCTAssertTrue(StatusBarContent.isShown(in: defaults))
        defaults.set(false, forKey: StatusBarContent.shownKey)
        XCTAssertFalse(StatusBarContent.isShown(in: defaults))
        defaults.set(true, forKey: StatusBarContent.shownKey)
        XCTAssertTrue(StatusBarContent.isShown(in: defaults))
    }

    @MainActor
    func testWatchesMemoryOnlyWhileShown() {
        let page = PageModel()
        var watcher = MemoryWatcher()

        // Hidden or non-notebook on appear does not register a watcher.
        watcher.update(visible: false) { page.watchMemory($0) }
        XCTAssertFalse(watcher.isWatching)
        XCTAssertEqual(page.memoryWatchers, 0)
        XCTAssertEqual(page.pendingCount, 0)

        // Showing on a notebook registers once; redundant updates do not double-count.
        watcher.update(visible: true) { page.watchMemory($0) }
        watcher.update(visible: true) { page.watchMemory($0) }
        XCTAssertTrue(watcher.isWatching)
        XCTAssertEqual(page.memoryWatchers, 1)
        XCTAssertEqual(page.pendingCount, 1)

        // Hiding or leaving the notebook unregisters once.
        watcher.update(visible: false) { page.watchMemory($0) }
        watcher.update(visible: false) { page.watchMemory($0) }
        XCTAssertFalse(watcher.isWatching)
        XCTAssertEqual(page.memoryWatchers, 0)
        XCTAssertEqual(page.pendingCount, 2)

        // A concurrent watcher (Running list or popover) is unaffected when an
        // already-hidden bar disappears, or when a shown bar hides while the other stays.
        page.watchMemory(true)
        XCTAssertEqual(page.memoryWatchers, 1)
        watcher.update(visible: false) { page.watchMemory($0) }
        XCTAssertEqual(page.memoryWatchers, 1, "unwatched bar must not decrement another watcher")
        watcher.update(visible: true) { page.watchMemory($0) }
        XCTAssertEqual(page.memoryWatchers, 2)
        watcher.update(visible: false) { page.watchMemory($0) }
        XCTAssertEqual(page.memoryWatchers, 1)
        XCTAssertEqual(page.pendingCount, 3, "other watcher keeps watch-memory on")
        page.watchMemory(false)
        XCTAssertEqual(page.memoryWatchers, 0)
        XCTAssertEqual(page.pendingCount, 4)
    }

    #if os(macOS)
    private struct ColorSet: Decodable {
        struct Entry: Decodable {
            struct Appearance: Decodable {
                var appearance: String
                var value: String
            }
            struct ColorValue: Decodable {
                struct Components: Decodable {
                    var red: String
                    var green: String
                    var blue: String
                    var alpha: String
                }
                var components: Components
            }
            var appearances: [Appearance]?
            var color: ColorValue
        }
        var colors: [Entry]
    }

    private struct RGBA {
        var r: Double
        var g: Double
        var b: Double
        var a: Double

        func over(_ bg: RGBA) -> RGBA {
            RGBA(
                r: r * a + bg.r * (1 - a),
                g: g * a + bg.g * (1 - a),
                b: b * a + bg.b * (1 - a),
                a: 1
            )
        }

        var luminance: Double {
            func linear(_ v: Double) -> Double {
                v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
        }

        func contrast(with other: RGBA) -> Double {
            let hi = max(luminance, other.luminance)
            let lo = min(luminance, other.luminance)
            return (hi + 0.05) / (lo + 0.05)
        }
    }

    private func colors(in url: URL) throws -> (light: RGBA, dark: RGBA) {
        let decoded = try JSONDecoder().decode(ColorSet.self, from: Data(contentsOf: url))
        func rgba(_ entry: ColorSet.Entry) throws -> RGBA {
            let c = entry.color.components
            return RGBA(
                r: try XCTUnwrap(Double(c.red)),
                g: try XCTUnwrap(Double(c.green)),
                b: try XCTUnwrap(Double(c.blue)),
                a: try XCTUnwrap(Double(c.alpha))
            )
        }
        let light = try XCTUnwrap(decoded.colors.first { $0.appearances == nil })
        let dark = try XCTUnwrap(decoded.colors.first {
            $0.appearances?.contains { $0.value == "dark" } == true
        })
        return (try rgba(light), try rgba(dark))
    }

    func testStatusBarTextContrastMeetsAAInLightAndDark() throws {
        let assets = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // GanymedeTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // apple
            .appending(path: "Resources/macOS/Assets.xcassets")
        let fg = try colors(in: assets.appending(path: "StatusBarText.colorset/Contents.json"))
        let bg = try colors(in: assets.appending(path: "WindowBackground.colorset/Contents.json"))
        let lightRatio = fg.light.over(bg.light).contrast(with: bg.light)
        let darkRatio = fg.dark.over(bg.dark).contrast(with: bg.dark)
        XCTAssertGreaterThanOrEqual(lightRatio, 4.5, "light contrast \(lightRatio)")
        XCTAssertGreaterThanOrEqual(darkRatio, 4.5, "dark contrast \(darkRatio)")
    }
    #endif
}
