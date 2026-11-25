@testable import DeviceBridge
import XCTest

/// A folder grant is for the notebook's file as the app last saw it (#584),
/// by the same rules as the ledger's answers.
@MainActor
final class FolderStampTests: XCTestCase {
    /// The files' stamps, as the test sets them: a path with none has no file.
    private final class Files {
        var stamps: [String: String] = [:]
        func stamp(_ path: String) -> String? { stamps[path] }
    }

    @MainActor private final class CountingStore: FolderStore {
        var saves = 0
        var saved: [FolderGrant] = []
        func load() -> [FolderGrant] { saved }
        func save(_ grants: [FolderGrant]) {
            saves += 1
            saved = grants
        }
    }

    private let store = MemoryFolderStore()
    private let files = Files()

    private func folders(_ store: FolderStore? = nil, log: ServerWriteLog? = nil) -> FolderGrants {
        FolderGrants(store: store ?? self.store, stamp: files.stamp, log: log)
    }

    private func grant(_ id: String, notebook: String = "/n.ipynb", stamp: String? = nil) -> FolderGrant {
        FolderGrant(id: id, notebook: notebook, name: "Data", writable: false, bookmark: Data([1]), stamp: stamp)
    }

    func testAGrantIsForgottenWhenTheNotebookChangesOutsideTheApp() {
        files.stamps["/n.ipynb"] = "1:1:1"
        let grants = folders()
        grants.keep(grant("F1"))
        XCTAssertEqual(store.saved.map(\.stamp), ["1:1:1"], "kept with the file's stamp")
        XCTAssertEqual(grants.grants(for: "/n.ipynb").map(\.id), ["F1"])
        // Replaced by rename: the same size and time, another inode.
        files.stamps["/n.ipynb"] = "1:1:2"
        XCTAssertNil(grants.grant("F1", notebook: "/n.ipynb"))
        XCTAssertTrue(grants.grants.isEmpty)
        XCTAssertTrue(store.saved.isEmpty, "dropped from the store too")
    }

    func testAnUnchangedNotebookKeepsItsGrantsAndSavesNothing() {
        let counting = CountingStore()
        files.stamps["/n.ipynb"] = "1:1:1"
        let grants = folders(counting)
        grants.keep(grant("F1"))
        XCTAssertEqual(counting.saves, 1)
        _ = grants.grants
        _ = grants.grants(for: "/n.ipynb")
        _ = grants.grant("F1", notebook: "/n.ipynb")
        grants.serverWrote(path: "/other.ipynb", before: "1:1:1", after: "2:2:2")
        grants.serverWrote(path: "/n.ipynb", before: "1:1:1", after: nil)
        XCTAssertEqual(counting.saves, 1, "nothing changed, nothing saved")
    }

    func testAGrantWithNoStampTakesTheFilesAndAMissingFileLeavesIt() {
        store.saved = [grant("F1")]
        let grants = folders()
        XCTAssertEqual(grants.grants.map(\.id), ["F1"], "no file: kept")
        XCTAssertNil(store.saved.first?.stamp)
        files.stamps["/n.ipynb"] = "1:1:1"
        XCTAssertEqual(grants.grants.map(\.id), ["F1"], "the file appeared: trusted")
        XCTAssertEqual(store.saved.first?.stamp, "1:1:1")
        files.stamps["/n.ipynb"] = "1:1:2"
        XCTAssertTrue(grants.grants.isEmpty, "stamped, so now it can go stale")
    }

    func testAMissingFileKeepsAStampedGrantAndADifferentFileAtItsPathForgetsIt() {
        files.stamps["/n.ipynb"] = "1:1:1"
        let grants = folders()
        grants.keep(grant("F1"))
        files.stamps["/n.ipynb"] = nil
        XCTAssertEqual(grants.grants.map(\.id), ["F1"])
        files.stamps["/n.ipynb"] = "1:1:222"
        XCTAssertTrue(grants.grants.isEmpty)
    }

    func testARenameCarriesTheGrantsWithTheirStamp() {
        files.stamps["/old.ipynb"] = "4:4:4"
        let grants = folders()
        grants.keep(grant("F1", notebook: "/old.ipynb"))
        // The server renamed the file before the app moved the grants.
        files.stamps["/old.ipynb"] = nil
        files.stamps["/new.ipynb"] = "4:4:4"
        grants.move(from: "/old.ipynb", to: "/new.ipynb")
        XCTAssertEqual(store.saved.map(\.notebook), ["/new.ipynb"])
        XCTAssertEqual(store.saved.map(\.stamp), ["4:4:4"])
        XCTAssertEqual(grants.grants(for: "/new.ipynb").map(\.id), ["F1"], "the renamed file is the same file")
        files.stamps["/new.ipynb"] = "5:5:5"
        XCTAssertTrue(grants.grants.isEmpty)
    }

    func testTheServersWriteKeepsTheGrantsOfThatNotebookOnly() {
        files.stamps = ["/n.ipynb": "1:1:1", "/other.ipynb": "9:9:9"]
        let grants = folders()
        grants.keep(grant("F1"))
        grants.keep(grant("F2", notebook: "/other.ipynb"))
        files.stamps["/n.ipynb"] = "2:2:2"
        grants.serverWrote(path: "/n.ipynb", before: "1:1:1", after: "2:2:2")
        XCTAssertEqual(store.saved.first { $0.id == "F1" }?.stamp, "2:2:2")
        XCTAssertEqual(store.saved.first { $0.id == "F2" }?.stamp, "9:9:9", "other notebooks are left alone")
        XCTAssertEqual(grants.grants.map(\.id), ["F1", "F2"])
        files.stamps["/n.ipynb"] = "3:3:3"
        XCTAssertEqual(grants.grants.map(\.id), ["F2"], "an outside change after it is seen")
    }

    func testACheckBeforeTheMainActorHearsOfTheServersWriteKeepsTheGrant() {
        let log = ServerWriteLog()
        files.stamps["/n.ipynb"] = "1:1:1"
        let grants = folders(log: log)
        grants.keep(grant("F1"))
        log.record(path: "/n.ipynb", before: "1:1:1", after: "2:2:2")
        log.record(path: "/n.ipynb", before: "2:2:2", after: "3:3:3")
        files.stamps["/n.ipynb"] = "3:3:3"
        XCTAssertEqual(grants.grants.map(\.id), ["F1"], "A to B to C, the grant at A")
        XCTAssertEqual(store.saved.first?.stamp, "3:3:3")
        files.stamps["/n.ipynb"] = "4:4:4"
        XCTAssertTrue(grants.grants.isEmpty, "not in the log: outside")
    }

    func testAServerWriteAfterAnOutsideChangeOrOfANewFileDoesNotRestamp() {
        let log = ServerWriteLog()
        files.stamps["/n.ipynb"] = "1:1:1"
        let grants = folders(log: log)
        grants.keep(grant("F1"))
        // git replaced the file (9), then the server autosaved it (8).
        files.stamps["/n.ipynb"] = "8:8:8"
        log.record(path: "/n.ipynb", before: "9:9:9", after: "8:8:8")
        grants.serverWrote(path: "/n.ipynb", before: "9:9:9", after: "8:8:8")
        XCTAssertEqual(store.saved.first?.stamp, "1:1:1", "not restamped")
        XCTAssertTrue(grants.grants.isEmpty)
        // A file the server made (before nil) doesn't keep a stamped grant.
        files.stamps["/m.ipynb"] = "1:1:1"
        grants.keep(grant("F2", notebook: "/m.ipynb"))
        files.stamps["/m.ipynb"] = "5:5:5"
        log.record(path: "/m.ipynb", before: nil, after: "5:5:5")
        grants.serverWrote(path: "/m.ipynb", before: nil, after: "5:5:5")
        XCTAssertTrue(grants.grants.isEmpty)
    }

    func testAServerWriteGivesAGrantWithNoStampTheNewOne() {
        store.saved = [grant("F1")]
        folders().serverWrote(path: "/n.ipynb", before: nil, after: "5:5:5")
        XCTAssertEqual(store.saved.first?.stamp, "5:5:5")
    }

    /// The row spells the notebook as the app's root does; the server
    /// reports the file by `realpath`. Real files, for the links.
    func testAReportIsMatchedToAGrantWhateverTheLinksSpelling() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("FolderStampTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: folder) }
        let real = folder.appendingPathComponent("real.ipynb").path
        try Data("{}".utf8).write(to: URL(fileURLWithPath: real))
        let link = folder.appendingPathComponent("link.ipynb").path
        try FileManager.default.createSymbolicLink(atPath: link, withDestinationPath: real)
        files.stamps[link] = "1:1:1"
        let grants = folders()
        grants.keep(grant("F1", notebook: link))
        files.stamps[link] = "2:2:2"
        grants.serverWrote(path: FileStamp.canonical(real), before: "1:1:1", after: "2:2:2")
        XCTAssertEqual(store.saved.first?.stamp, "2:2:2")
        XCTAssertEqual(grants.grants.map(\.id), ["F1"])
    }

    func testTheUserDefaultsStoreKeepsTheStampAndLoadsRowsWithoutOne() throws {
        let suite = "ganymede.device.folders.stamp.test"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defaults.removePersistentDomain(forName: suite)
        defer { defaults.removePersistentDomain(forName: suite) }
        let store = UserDefaultsFolderStore(defaults: defaults)
        let grants = [grant("F1", stamp: "1:2:3"), grant("F2", notebook: "/b.ipynb")]
        store.save(grants)
        XCTAssertEqual(store.load(), grants)
        XCTAssertEqual(store.load().map(\.stamp), ["1:2:3", nil])
        // Rows written before stamps have no such key.
        defaults.set([["id": "F3", "notebook": "/c.ipynb", "name": "Old", "writable": true, "bookmark": Data([2])] as [String: Any]], forKey: store.key)
        XCTAssertEqual(store.load(), [FolderGrant(id: "F3", notebook: "/c.ipynb", name: "Old", writable: true, bookmark: Data([2]))])
    }
}
