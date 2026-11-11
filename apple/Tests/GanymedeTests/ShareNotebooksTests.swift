import DeviceBridge
import XCTest

// The share extension's notebook list and input (#435, a spike).
final class ShareNotebooksTests: XCTestCase {
    private var folder: URL!

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("share-\(UUID().uuidString)")
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: folder)
    }

    func testOffersACopyKeyedByTheOriginalPath() throws {
        let original = folder.appendingPathComponent("src/Tidy Text.ipynb")
        try FileManager.default.createDirectory(at: original.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("one".utf8).write(to: original)
        let store = ShareNotebooks(folder: folder.appendingPathComponent("Share"))

        let entry = try store.add(original)
        XCTAssertEqual(entry.name, "Tidy Text")
        XCTAssertEqual(entry.path, original.standardizedFileURL.path)
        XCTAssertEqual(store.list(), [entry])

        // Offering it again refreshes the copy, not the list.
        try Data("two".utf8).write(to: original)
        XCTAssertEqual(try store.add(original), entry)
        XCTAssertEqual(store.list().count, 1)
        XCTAssertEqual(try store.data(for: entry), Data("two".utf8))

        try store.remove(entry.id)
        XCTAssertEqual(store.list(), [])
        XCTAssertThrowsError(try store.data(for: entry))
    }

    func testInputTakesTheFirstTextAndLinkAndEveryFile() {
        let input = ShareInput.input([
            .text("first"), .link(URL(string: "https://a.test")!), .text("second"),
            .file(name: "a.txt", type: "text/plain", data: Data("a".utf8)),
            .link(URL(string: "https://b.test")!),
            .file(name: "b.png", type: "image/png", data: Data([1])),
            .file(name: "big", type: "", data: Data(count: DeviceBridge.maxBinaryBytes + 1)),
        ])
        XCTAssertEqual(input.text, "first")
        XCTAssertEqual(input.url, URL(string: "https://a.test"))
        XCTAssertEqual(input.files.map(\.name), ["a.txt", "b.png"])
    }

    func testFilesTogetherStayWithin16MiB() {
        let half = Data(count: DeviceBridge.maxBinaryBytes / 2)
        let input = ShareInput.input([
            .file(name: "1", type: "", data: half), .file(name: "2", type: "", data: half),
            .file(name: "3", type: "", data: Data([1])),
        ])
        XCTAssertEqual(input.files.map(\.name), ["1", "2"])
    }

    func testReadsAFileOnlyWithinTheBudget() throws {
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let file = folder.appendingPathComponent("photo.png")
        try Data(count: 10).write(to: file)
        XCTAssertEqual(ShareInput.file(at: file, budget: 10), .file(name: "photo.png", type: "image/png", data: Data(count: 10)))
        XCTAssertNil(ShareInput.file(at: file, budget: 9))
        XCTAssertNil(ShareInput.file(at: folder.appendingPathComponent("missing"), budget: 10))
    }

    func testTheLedgerMovesToTheGroupOnce() throws {
        let appSuite = "app-\(UUID().uuidString)", groupSuite = "group-\(UUID().uuidString)"
        let app = try XCTUnwrap(UserDefaults(suiteName: appSuite))
        let group = try XCTUnwrap(UserDefaults(suiteName: groupSuite))
        defer {
            app.removePersistentDomain(forName: appSuite)
            group.removePersistentDomain(forName: groupSuite)
        }
        let rows = [["notebook": "/n.ipynb", "capability": "location", "answer": "always"]]
        app.set(rows, forKey: AppGroup.ledgerKey)

        AppGroup.copyOnce(AppGroup.ledgerKey, from: app, to: group)
        XCTAssertEqual(group.array(forKey: AppGroup.ledgerKey) as? [[String: String]], rows)
        XCTAssertNil(app.object(forKey: AppGroup.ledgerKey))

        // A revoke in the group isn't undone by rows the app kept since.
        group.set([[String: String]](), forKey: AppGroup.ledgerKey)
        app.set(rows, forKey: AppGroup.ledgerKey)
        AppGroup.copyOnce(AppGroup.ledgerKey, from: app, to: group)
        XCTAssertEqual(group.array(forKey: AppGroup.ledgerKey)?.count, 0)
        XCTAssertNil(app.object(forKey: AppGroup.ledgerKey))
    }

    func testABuildWithNoTeamHasNoGroup() {
        let app = "com.ganymede-server.Ganymede"
        XCTAssertNil(AppGroup.usable(app, bundleID: app))
        XCTAssertNil(AppGroup.usable("", bundleID: app))
        XCTAssertNil(AppGroup.usable(nil, bundleID: app))
        XCTAssertEqual(AppGroup.usable("group.\(app)", bundleID: app), "group.\(app)")
        #if os(macOS)
        XCTAssertNil(AppGroup.usable(app, bundleID: "\(app).Share"))
        XCTAssertEqual(AppGroup.usable("ABCDE12345.\(app)", bundleID: app), "ABCDE12345.\(app)")
        #endif
    }

    @MainActor
    func testNoGroupInATestBundle() {
        XCTAssertNil(AppGroup.id)
        XCTAssertNil(AppGroup.ledgerStore())
    }
}
