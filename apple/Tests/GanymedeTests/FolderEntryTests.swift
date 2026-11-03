import XCTest

/// What the Mac app's native sidebar lists (#207).
final class FolderEntryTests: XCTestCase {
    func testListsFoldersFirstInFinderOrderWithoutHiddenFiles() throws {
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let fm = FileManager.default
        try fm.createDirectory(at: dir.appendingPathComponent("moons"), withIntermediateDirectories: true)
        for name in ["Orbit 10.ipynb", "Orbit 9.ipynb", "notes.md", ".hidden"] {
            try Data().write(to: dir.appendingPathComponent(name))
        }
        defer { try? fm.removeItem(at: dir) }

        let entries = try FolderEntry.list(dir)
        XCTAssertEqual(entries.map(\.name), ["moons", "notes.md", "Orbit 9.ipynb", "Orbit 10.ipynb"])
        XCTAssertEqual(entries.map(\.isDirectory), [true, false, false, false])
        XCTAssertEqual(entries[2].title, "Orbit 9")
        XCTAssertTrue(entries[2].isNotebook)
        XCTAssertFalse(entries[1].isNotebook)
    }

    func testServerPathsAreFromTheRoot() {
        XCTAssertEqual(
            FolderEntry.serverPath(URL(fileURLWithPath: "/Users/me/Moons & rings/Io.ipynb")),
            "Users/me/Moons & rings/Io.ipynb"
        )
    }

    func testDuplicatesAreNamedAsFinderNamesThem() {
        let io = URL(fileURLWithPath: "/moons/Io.ipynb")
        var taken: Set<String> = []
        XCTAssertEqual(FolderEntry.duplicateURL(for: io) { taken.contains($0.path) }.path, "/moons/Io copy.ipynb")
        taken = ["/moons/Io copy.ipynb", "/moons/Io copy 2.ipynb"]
        XCTAssertEqual(FolderEntry.duplicateURL(for: io) { taken.contains($0.path) }.path, "/moons/Io copy 3.ipynb")
        let folder = URL(fileURLWithPath: "/moons/rings")
        XCTAssertEqual(FolderEntry.duplicateURL(for: folder) { _ in false }.path, "/moons/rings copy")
    }

    func testTheOpenNotebookFollowsAMoveOfItOrItsFolder() {
        XCTAssertTrue(FolderEntry.path("moons/Io.ipynb", isAt: "moons"))
        XCTAssertFalse(FolderEntry.path("moonshot/Io.ipynb", isAt: "moons"))
        XCTAssertFalse(FolderEntry.path(nil, isAt: "moons"))
        XCTAssertEqual(
            FolderEntry.path("moons/Io.ipynb", movedFrom: "moons/Io.ipynb", to: "moons/Europa.ipynb"),
            "moons/Europa.ipynb"
        )
        XCTAssertEqual(FolderEntry.path("moons/Io.ipynb", movedFrom: "moons", to: "satellites"), "satellites/Io.ipynb")
        XCTAssertNil(FolderEntry.path("rings/A.ipynb", movedFrom: "moons", to: "satellites"))
    }
}
