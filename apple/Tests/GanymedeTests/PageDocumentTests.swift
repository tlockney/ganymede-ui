#if os(macOS)
import XCTest

@MainActor
final class PageDocumentTests: XCTestCase {
    func testDataFileDoesNotCallRecentsOrSpotlight() {
        var recents: [(URL, Place)] = []
        var spotlight: [URL] = []
        let document = PageDocument(
            noteRecent: { recents.append(($0, $1)) },
            indexSaved: { spotlight.append($0) }
        )

        let opened = DocumentMessage(body: ["path": "Users/me/moons.csv", "dirty": false])!
        document.update(opened, in: .thisDevice)

        XCTAssertTrue(recents.isEmpty)
        XCTAssertTrue(spotlight.isEmpty)
        XCTAssertEqual(document.file, URL(fileURLWithPath: "/Users/me/moons.csv"))
        XCTAssertEqual(document.name, "moons")

        // Saving edits to a non-notebook never touches Recents or Spotlight either.
        document.update(DocumentMessage(body: ["path": "Users/me/moons.csv", "dirty": true])!, in: .thisDevice)
        document.update(opened, in: .thisDevice)
        XCTAssertTrue(recents.isEmpty)
        XCTAssertTrue(spotlight.isEmpty)
    }

    func testNotebookOpenAndSaveCallRecentsAndSpotlight() {
        var recents: [(URL, Place)] = []
        var spotlight: [URL] = []
        let document = PageDocument(
            noteRecent: { recents.append(($0, $1)) },
            indexSaved: { spotlight.append($0) }
        )

        let clean = DocumentMessage(body: ["path": "Users/me/Io.ipynb", "dirty": false])!
        let dirty = DocumentMessage(body: ["path": "Users/me/Io.ipynb", "dirty": true])!
        let expected = URL(fileURLWithPath: "/Users/me/Io.ipynb")

        document.update(clean, in: .thisDevice)
        XCTAssertEqual(recents.count, 1)
        XCTAssertEqual(recents.first?.0, expected)
        XCTAssertEqual(recents.first?.1, .thisDevice)
        XCTAssertTrue(spotlight.isEmpty)

        document.update(dirty, in: .thisDevice)
        document.update(clean, in: .thisDevice)
        XCTAssertEqual(recents.count, 1)
        XCTAssertEqual(spotlight, [expected])
    }

    func testMachineNotebookDoesNotCallRecentsOrSpotlight() {
        var recents: [(URL, Place)] = []
        var spotlight: [URL] = []
        let document = PageDocument(
            noteRecent: { recents.append(($0, $1)) },
            indexSaved: { spotlight.append($0) }
        )

        let clean = DocumentMessage(
            body: ["path": "Users/me/Io.ipynb", "dirty": false],
            place: .machine("m1")
        )!
        let dirty = DocumentMessage(
            body: ["path": "Users/me/Io.ipynb", "dirty": true],
            place: .machine("m1")
        )!

        document.update(clean, in: .machine("m1"))
        document.update(dirty, in: .machine("m1"))
        document.update(clean, in: .machine("m1"))
        XCTAssertTrue(recents.isEmpty)
        XCTAssertTrue(spotlight.isEmpty)
    }
}
#endif
