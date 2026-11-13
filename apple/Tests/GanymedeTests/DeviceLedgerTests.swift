import DeviceBridge
import XCTest

/// Keeps answers in memory, as UserDefaults would.
@MainActor
final class MemoryLedgerStore: LedgerStore {
    var saved: [LedgerGrant] = []
    func load() -> [LedgerGrant] { saved }
    func save(_ grants: [LedgerGrant]) { saved = grants }
}

/// Keeps folder grants in memory, as UserDefaults would.
@MainActor
final class MemoryFolderStore: FolderStore {
    var saved: [FolderGrant] = []
    func load() -> [FolderGrant] { saved }
    func save(_ grants: [FolderGrant]) { saved = grants }
}

/// Records each dialog and holds its `done`, for a test to answer.
@MainActor
final class RecordingPresenter: DialogPresenter {
    var shown: [Dialog] = []
    var answers: [(DialogResult) -> Void] = []
    var closed = 0
    var unavailable = false

    func present(_ dialog: Dialog, on host: DialogHost?, done: @escaping (DialogResult) -> Void) throws -> Close {
        if unavailable { throw DialogUnavailable(description: "no window") }
        shown.append(dialog)
        answers.append(done)
        return { [weak self] gone in
            self?.closed += 1
            gone()
        }
    }

    func answer(_ result: DialogResult, at index: Int? = nil) {
        answers[index ?? answers.count - 1](result)
    }

    func options(_ index: Int) -> [String] {
        if case let .actionSheet(_, _, options, _, _) = shown[index] { return options }
        return []
    }
}

/// The app's ledger prompt and Settings › Device (#383).
@MainActor
final class DeviceLedgerTests: XCTestCase {
    func testTheCallPromptMapsEachChoice() {
        let presenter = RecordingPresenter()
        let prompter = AppLedgerPrompter(presenter: presenter, host: { nil })
        var got: [LedgerAnswer?] = []
        for (id, result) in [DialogResult.option(0), .option(1), .option(2), .dismissed].enumerated() {
            prompter.askPermission("location", notebook: "/n/Trip.ipynb", id: id + 1) { got.append($0) }
            presenter.answer(result)
        }
        XCTAssertEqual(got, [.once, .always, .deny, nil])
        XCTAssertEqual(presenter.options(0), ["Allow Once", "Always Allow", "Don’t Allow"])
        guard case let .actionSheet(title, _, _, _, _) = presenter.shown[0] else { return XCTFail() }
        XCTAssertEqual(title, "“Trip.ipynb” wants to use your location")
    }

    func testAShortcutsPromptAndRowNameTheShortcut() {
        let capability = DeviceBridge.shortcutCapability("Log Day")
        XCTAssertEqual(AppLedgerPrompter.title(capability, notebook: "/n/Journal.ipynb"), "“Journal.ipynb” wants to run the Shortcut “Log Day”")
        XCTAssertEqual(DeviceGrants.name(capability), "Shortcut “Log Day”")
        XCTAssertEqual(DeviceGrants.name("shortcuts"), "Shortcuts")
    }

    func testPromptsShowOneAtATimeInOrder() {
        let presenter = RecordingPresenter()
        let prompter = AppLedgerPrompter(presenter: presenter, host: { nil })
        var got: [String] = []
        prompter.askPermission("location", notebook: "/a.ipynb", id: 1) { _ in got.append("a") }
        prompter.askPermission("contacts", notebook: "/b.ipynb", id: 2) { _ in got.append("b") }
        XCTAssertEqual(presenter.shown.count, 1, "the second waits")
        presenter.answer(.option(1))
        XCTAssertEqual(presenter.shown.count, 2)
        presenter.answer(.option(2))
        XCTAssertEqual(got, ["a", "b"])
    }

    func testDismissClosesTheShowingPromptOrDropsAWaitingOne() {
        let presenter = RecordingPresenter()
        let prompter = AppLedgerPrompter(presenter: presenter, host: { nil })
        var got: [String] = []
        prompter.askPermission("location", notebook: "/a.ipynb", id: 1) { _ in got.append("a") }
        prompter.askPermission("contacts", notebook: "/b.ipynb", id: 2) { _ in got.append("b") }
        prompter.askPermission("camera", notebook: "/c.ipynb", id: 3) { _ in got.append("c") }

        prompter.dismissPermission(2)
        prompter.dismissPermission(1)
        XCTAssertEqual(presenter.closed, 1)
        XCTAssertEqual(presenter.shown.count, 2, "the next one shows once the first has gone")
        presenter.answer(.option(0), at: 0)
        presenter.answer(.option(0), at: 1)
        XCTAssertEqual(got, ["c"], "a dismissed prompt's late answer is ignored; b never showed")
    }

    func testNoWindowAnswersAsDismissed() {
        let presenter = RecordingPresenter()
        presenter.unavailable = true
        let prompter = AppLedgerPrompter(presenter: presenter, host: { nil })
        var got: [LedgerAnswer?] = [.once]
        prompter.askPermission("location", notebook: "/a.ipynb", id: 1) { got = [$0] }
        XCTAssertEqual(got, [nil])
    }

    func testTheOpenPromptAllowsOrDeniesFromNowOn() {
        let presenter = RecordingPresenter()
        let prompter = AppLedgerPrompter(presenter: presenter, host: { nil })
        var got: [LedgerAnswer?] = []
        for result in [DialogResult.option(0), .option(1), .dismissed] {
            prompter.askAtOpen("location", notebook: "/a.ipynb") { got.append($0) }
            presenter.answer(result)
        }
        XCTAssertEqual(got, [.always, .deny, nil])
        XCTAssertEqual(presenter.options(0), ["Allow", "Don’t Allow"])
    }

    func testSettingsListsByNotebookAndRevokes() {
        let store = MemoryLedgerStore()
        let ledger = PermissionLedger(store: store)
        ledger.record(.always, notebook: "/b/Trip.ipynb", capability: "location")
        ledger.record(.deny, notebook: "/b/Trip.ipynb", capability: "contacts")
        ledger.record(.always, notebook: "/a/Alarm.ipynb", capability: "notifications")

        let grants = DeviceGrants(ledger: PermissionLedger(store: store), folders: FolderGrants(store: MemoryFolderStore()))
        XCTAssertEqual(grants.notebooks.map(\.path), ["/a/Alarm.ipynb", "/b/Trip.ipynb"])
        XCTAssertEqual(grants.notebooks[1].grants.map(\.capability), ["contacts", "location"])
        XCTAssertEqual(grants.notebooks[1].name, "Trip.ipynb")

        grants.revoke("/b/Trip.ipynb", "location")
        XCTAssertNil(ledger.answer(notebook: "/b/Trip.ipynb", capability: "location"), "the windows' ledgers see it")
        XCTAssertEqual(ledger.answer(notebook: "/b/Trip.ipynb", capability: "contacts"), .deny)

        ledger.record(.always, notebook: "/c.ipynb", capability: "camera")
        grants.reload()
        XCTAssertEqual(grants.notebooks.count, 3)
        grants.revokeAll()
        XCTAssertTrue(grants.notebooks.isEmpty)
        XCTAssertTrue(ledger.grants.isEmpty)
    }

    func testSettingsListsFoldersAndRevokesThem() {
        let ledgerStore = MemoryLedgerStore()
        let folderStore = MemoryFolderStore()
        PermissionLedger(store: ledgerStore).record(.always, notebook: "/b/Trip.ipynb", capability: "location")
        folderStore.saved = [
            FolderGrant(id: "F1", notebook: "/b/Trip.ipynb", name: "Data", writable: true, bookmark: Data()),
            FolderGrant(id: "F2", notebook: "/c/Photos.ipynb", name: "Shots", writable: false, bookmark: Data()),
        ]
        let grants = DeviceGrants(ledger: PermissionLedger(store: ledgerStore), folders: FolderGrants(store: folderStore))
        XCTAssertEqual(grants.notebooks.map(\.path), ["/b/Trip.ipynb", "/c/Photos.ipynb"], "a notebook with only a folder is listed")
        XCTAssertEqual(grants.notebooks[0].folders.map(\.name), ["Data"])
        XCTAssertTrue(grants.notebooks[1].grants.isEmpty)

        grants.revokeFolder("F1")
        XCTAssertEqual(folderStore.saved.map(\.id), ["F2"])
        XCTAssertEqual(grants.notebooks[0].folders.count, 0)

        // Another window keeps a folder after the last reload: Revoke All
        // takes it too.
        folderStore.saved.append(
            FolderGrant(id: "F3", notebook: "/d/New.ipynb", name: "Late", writable: false, bookmark: Data()))
        grants.revokeAll()
        XCTAssertTrue(folderStore.saved.isEmpty)
        XCTAssertTrue(grants.notebooks.isEmpty)
    }

    #if os(macOS)
    func testAFolderRowSaysWhereTheFolderIs() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: dir) }
        let bookmark = try dir.bookmarkData()
        let folder = FolderGrant(id: "F1", notebook: "/b/Trip.ipynb", name: dir.lastPathComponent, writable: false, bookmark: bookmark)
        let detail = DeviceGrants.detail(folder)
        XCTAssertTrue(detail.hasPrefix("Folder, read only · "), detail)
        XCTAssertTrue(detail.hasSuffix(dir.lastPathComponent), detail)
        let unknown = FolderGrant(id: "F2", notebook: "/b/Trip.ipynb", name: "Gone", writable: true, bookmark: Data([1, 2, 3]))
        XCTAssertEqual(DeviceGrants.detail(unknown), "Folder, read and write")
    }
    #endif
}
