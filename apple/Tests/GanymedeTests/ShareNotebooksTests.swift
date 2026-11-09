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
}
