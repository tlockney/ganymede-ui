import XCTest

/// What the page tells a Mac window about its notebook.
final class DocumentMessageTests: XCTestCase {
    func testReadsTheNotebookAndItsEdits() {
        let body: [String: Any] = ["path": "Users/me/Moons & rings/Io.ipynb", "dirty": NSNumber(value: true)]
        XCTAssertEqual(
            DocumentMessage(body: body),
            DocumentMessage(file: URL(fileURLWithPath: "/Users/me/Moons & rings/Io.ipynb"), dirty: true)
        )
    }

    func testNoNotebookOpen() {
        let body: [String: Any] = ["path": NSNull(), "dirty": false]
        XCTAssertEqual(DocumentMessage(body: body), DocumentMessage(file: nil, dirty: false))
    }

    func testPathsAreFromTheServersRoot() {
        let root = URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)
        XCTAssertEqual(
            DocumentMessage(body: ["path": "Io.ipynb", "dirty": false], root: root)?.file,
            URL(fileURLWithPath: "/Users/me/notes/Io.ipynb")
        )
    }

    /// Only a notebook goes to Open Recent and Spotlight; a data file the
    /// page shows (#671) doesn't.
    func testOnlyANotebookIsANotebook() {
        let message = { (path: String) in DocumentMessage(body: ["path": path, "dirty": false])! }
        XCTAssertTrue(message("Users/me/Io.ipynb").isNotebook)
        XCTAssertTrue(message("Users/me/Io.IPYNB").isNotebook)
        for path in ["Users/me/moons.csv", "Users/me/moons.tsv", "Users/me/moons.json", "Users/me/moons.parquet"] {
            XCTAssertFalse(message(path).isNotebook, path)
        }
        XCTAssertFalse(DocumentMessage(file: nil, dirty: false).isNotebook)
    }

    func testIgnoresOtherMessages() {
        XCTAssertNil(DocumentMessage(body: "saved"))
        XCTAssertNil(DocumentMessage(body: ["path": "Io.ipynb"]))
    }
}
