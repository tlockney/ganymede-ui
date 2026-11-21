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

    // MARK: What a document message reaches outside its window (#740)

    private func message(_ place: Place, path: String = "a/Io.ipynb", dirty: Bool = false) -> DocumentMessage {
        DocumentMessage(body: ["path": path, "dirty": dirty], place: place)!
    }

    func testAnOpenedNotebookIsNotedInRecentsOnlyOnThisDevice() {
        let local = message(.thisDevice)
        XCTAssertEqual(
            DocumentEffects.of(local, previousFile: nil, wasDirty: false, in: .thisDevice),
            DocumentEffects(noteRecent: local.file, indexSaved: nil))
        let machine = message(.machine("m1"))
        XCTAssertEqual(
            DocumentEffects.of(machine, previousFile: nil, wasDirty: false, in: .machine("m1")),
            DocumentEffects())
        // A machine URL under this device's place still isn't a file to note.
        XCTAssertEqual(
            DocumentEffects.of(machine, previousFile: nil, wasDirty: false, in: .thisDevice), DocumentEffects())
        // Not a notebook: a data file.
        XCTAssertEqual(
            DocumentEffects.of(message(.thisDevice, path: "a.csv"), previousFile: nil, wasDirty: false, in: .thisDevice),
            DocumentEffects())
    }

    func testASavedNotebookIsIndexedOnlyOnThisDevice() {
        let local = message(.thisDevice)
        XCTAssertEqual(
            DocumentEffects.of(local, previousFile: local.file, wasDirty: true, in: .thisDevice),
            DocumentEffects(noteRecent: nil, indexSaved: local.file))
        XCTAssertEqual(
            DocumentEffects.of(local, previousFile: local.file, wasDirty: false, in: .thisDevice), DocumentEffects())
        let machine = message(.machine("m1"))
        XCTAssertEqual(
            DocumentEffects.of(machine, previousFile: machine.file, wasDirty: true, in: .machine("m1")),
            DocumentEffects())
    }

    /// The kept answers check a notebook when an edit starts (#584), so an
    /// outside change the window loaded is seen before the app's next save.
    func testAnEditStartingIsNotedOnlyForTheSameLocalNotebook() {
        let edited = message(.thisDevice, dirty: true)
        XCTAssertEqual(
            DocumentEffects.of(edited, previousFile: edited.file, wasDirty: false, in: .thisDevice),
            DocumentEffects(editStarted: edited.file))
        // Already edited: the check was made when the first edit came.
        XCTAssertEqual(
            DocumentEffects.of(edited, previousFile: edited.file, wasDirty: true, in: .thisDevice), DocumentEffects())
        // A notebook just opened that already has edits is a new file: noted for Recents only.
        XCTAssertEqual(
            DocumentEffects.of(edited, previousFile: nil, wasDirty: false, in: .thisDevice),
            DocumentEffects(noteRecent: edited.file))
        let other = URL(fileURLWithPath: "/elsewhere/Europa.ipynb")
        XCTAssertEqual(
            DocumentEffects.of(edited, previousFile: other, wasDirty: false, in: .thisDevice),
            DocumentEffects(noteRecent: edited.file))
        // A saved notebook is not an edit starting.
        let saved = message(.thisDevice, dirty: false)
        XCTAssertNil(DocumentEffects.of(saved, previousFile: saved.file, wasDirty: false, in: .thisDevice).editStarted)
        XCTAssertNil(DocumentEffects.of(saved, previousFile: saved.file, wasDirty: true, in: .thisDevice).editStarted)
        // A data file isn't a notebook.
        let data = message(.thisDevice, path: "a.csv", dirty: true)
        XCTAssertEqual(
            DocumentEffects.of(data, previousFile: data.file, wasDirty: false, in: .thisDevice), DocumentEffects())
        // A machine's notebook isn't a file here.
        let machine = message(.machine("m1"), dirty: true)
        XCTAssertEqual(
            DocumentEffects.of(machine, previousFile: machine.file, wasDirty: false, in: .machine("m1")),
            DocumentEffects())
        XCTAssertEqual(
            DocumentEffects.of(machine, previousFile: machine.file, wasDirty: false, in: .thisDevice),
            DocumentEffects())
    }

    func testOnlyAFileOnThisDeviceHasAProxyIcon() {
        let local = message(.thisDevice)
        XCTAssertEqual(DocumentEffects.representedURL(for: local.file, in: .thisDevice), local.file)
        let machine = message(.machine("m1"))
        XCTAssertNil(DocumentEffects.representedURL(for: machine.file, in: .machine("m1")))
        XCTAssertNil(DocumentEffects.representedURL(for: machine.file, in: .thisDevice))
        XCTAssertNil(DocumentEffects.representedURL(for: local.file, in: .machine("m1")))
        XCTAssertNil(DocumentEffects.representedURL(for: nil, in: .thisDevice))
    }
}
