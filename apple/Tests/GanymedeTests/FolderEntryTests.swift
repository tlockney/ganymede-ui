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

    func testListsASymlinkedFolderAsAFolder() throws {
        let fm = FileManager.default
        let dir = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try fm.createDirectory(at: dir.appendingPathComponent("real"), withIntermediateDirectories: true)
        try fm.createSymbolicLink(
            at: dir.appendingPathComponent("linked"), withDestinationURL: dir.appendingPathComponent("real")
        )
        defer { try? fm.removeItem(at: dir) }

        let entries = try FolderEntry.list(dir)
        XCTAssertEqual(entries.map(\.name), ["linked", "real"])
        XCTAssertEqual(entries.map(\.isDirectory), [true, true])
    }

    func testServerPathsUnderTheIPadsNotebookFolder() {
        let root = URL(fileURLWithPath: "/tmp/notebooks", isDirectory: true)
        XCTAssertEqual(FolderEntry.serverPath(root.appendingPathComponent("moons/Io.ipynb"), root: root), "moons/Io.ipynb")
        XCTAssertEqual(FolderEntry.serverPath(root, root: root), "")
        XCTAssertEqual(
            FolderEntry.serverPath(URL(fileURLWithPath: "/tmp/notebooks/"), root: root), ""
        )
        // Outside the folder: the absolute path without its slash, which the
        // server reads under its own root, where it won't exist.
        XCTAssertEqual(FolderEntry.serverPath(URL(fileURLWithPath: "/etc/hosts"), root: root), "etc/hosts")
    }

    /// iOS can hand over a folder as `/var/…` and list its items under
    /// `/private/var/…`: a root reached through a symlink still gives
    /// relative paths.
    func testServerPathsThroughASymlinkedRoot() throws {
        let fm = FileManager.default
        let base = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let real = base.appendingPathComponent("real")
        try fm.createDirectory(at: real.appendingPathComponent("moons"), withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: base) }
        let link = base.appendingPathComponent("link")
        try fm.createSymbolicLink(at: link, withDestinationURL: real)
        let file = real.appendingPathComponent("moons/Io.ipynb")
        try Data("{}".utf8).write(to: file)

        XCTAssertEqual(FolderEntry.serverPath(file, root: link), "moons/Io.ipynb")
        XCTAssertEqual(FolderEntry.serverPath(link.appendingPathComponent("moons/Io.ipynb"), root: real), "moons/Io.ipynb")
        XCTAssertEqual(FolderEntry.serverPath(real, root: link), "")
    }
}
