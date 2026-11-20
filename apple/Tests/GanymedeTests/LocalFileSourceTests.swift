import XCTest

/// This device's files behind `FileSource` (#737): what the sidebar did
/// with `FileManager`, unchanged.
final class LocalFileSourceTests: XCTestCase {
    private var root: URL!
    private let source = LocalFileSource()

    override func setUpWithError() throws {
        root = FileManager.default.temporaryDirectory
            .appendingPathComponent("LocalFileSourceTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func exists(_ name: String) -> Bool {
        FileManager.default.fileExists(atPath: root.appendingPathComponent(name).path)
    }

    func testListsFoldersFirstInFinderOrderWithoutHiddenFiles() async throws {
        let fm = FileManager.default
        try fm.createDirectory(at: root.appendingPathComponent("moons"), withIntermediateDirectories: true)
        for name in ["Orbit 10.ipynb", "Orbit 9.ipynb", "notes.md", ".hidden"] {
            try Data().write(to: root.appendingPathComponent(name))
        }
        let entries = try await source.list(root)
        XCTAssertEqual(entries.map(\.name), ["moons", "notes.md", "Orbit 9.ipynb", "Orbit 10.ipynb"])
        XCTAssertEqual(entries.map(\.isDirectory), [true, false, false, false])
    }

    func testNewFolderIsNamedUntitledFolderThenNumbered() async throws {
        let first = try await source.newFolder(in: root)
        let second = try await source.newFolder(in: root)
        let third = try await source.newFolder(in: root)
        XCTAssertEqual([first, second, third].map(\.lastPathComponent),
                       ["untitled folder", "untitled folder 2", "untitled folder 3"])
        XCTAssertTrue(exists("untitled folder 3"))
    }

    func testRenameMovesTheItemInItsFolder() async throws {
        try Data("x".utf8).write(to: root.appendingPathComponent("Io.ipynb"))
        let moved = try await source.rename(root.appendingPathComponent("Io.ipynb"), to: "Europa.ipynb")
        XCTAssertEqual(moved.lastPathComponent, "Europa.ipynb")
        XCTAssertFalse(exists("Io.ipynb"))
        XCTAssertTrue(exists("Europa.ipynb"))
    }

    func testRenameRefusesABadNameAndAnExistingTarget() async throws {
        try Data().write(to: root.appendingPathComponent("Io.ipynb"))
        try Data().write(to: root.appendingPathComponent("Europa.ipynb"))
        do {
            _ = try await source.rename(root.appendingPathComponent("Io.ipynb"), to: "a/b")
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? FileSourceError, .badName("a/b"))
        }
        do {
            _ = try await source.rename(root.appendingPathComponent("Io.ipynb"), to: "Europa.ipynb")
            XCTFail("expected an error")
        } catch {
            XCTAssertTrue(exists("Io.ipynb"), "nothing is overwritten")
        }
    }

    func testDuplicateNamesCopiesAsFinderDoes() async throws {
        try Data("x".utf8).write(to: root.appendingPathComponent("Io.ipynb"))
        let first = try await source.duplicate(root.appendingPathComponent("Io.ipynb"))
        let second = try await source.duplicate(root.appendingPathComponent("Io.ipynb"))
        XCTAssertEqual(first.lastPathComponent, "Io copy.ipynb")
        XCTAssertEqual(second.lastPathComponent, "Io copy 2.ipynb")
        XCTAssertEqual(try String(contentsOf: second, encoding: .utf8), "x")
        try FileManager.default.createDirectory(at: root.appendingPathComponent("moons"), withIntermediateDirectories: true)
        let folder = try await source.duplicate(root.appendingPathComponent("moons"))
        XCTAssertEqual(folder.lastPathComponent, "moons copy")
    }

    /// On a Mac the item must end up in the Trash. On iOS the move can be
    /// refused in a test sandbox, which leaves the item where it was.
    func testDeleteMovesTheItemToTheTrash() async throws {
        let file = root.appendingPathComponent("Io.ipynb")
        try Data("x".utf8).write(to: file)
        #if os(macOS)
        let trashed = try XCTUnwrap(try source.trash(file))
        defer { try? FileManager.default.removeItem(at: trashed) }
        XCTAssertFalse(exists("Io.ipynb"), "gone from the folder")
        XCTAssertTrue(FileManager.default.fileExists(atPath: trashed.path), "in the Trash")
        XCTAssertTrue(trashed.path.contains(".Trash"), trashed.path)
        let other = root.appendingPathComponent("Europa.ipynb")
        try Data().write(to: other)
        try await source.delete(other)
        XCTAssertFalse(exists("Europa.ipynb"))
        #else
        do {
            try await source.delete(file)
            XCTAssertFalse(exists("Io.ipynb"))
        } catch {
            XCTAssertTrue(exists("Io.ipynb"), "a refused delete leaves the item")
        }
        #endif
    }

    func testNamesOfDotAndDotDotAreRefused() async throws {
        for bad in [".", "..", "", "a/b"] {
            XCTAssertFalse(FileSourceError.isValidName(bad), bad)
        }
        XCTAssertTrue(FileSourceError.isValidName(".hidden"))
    }

    func testReadsTextAndMapsServerPaths() async throws {
        let file = root.appendingPathComponent("a.txt")
        try Data("héllo".utf8).write(to: file)
        let text = try await source.readText(file)
        XCTAssertEqual(text, "héllo")
        try Data([0xFF, 0xFE, 0x00]).write(to: root.appendingPathComponent("bin"))
        let binary = try await source.readText(root.appendingPathComponent("bin"))
        XCTAssertNil(binary, "not UTF-8")
        XCTAssertEqual(source.serverPath(file), FolderEntry.serverPath(file))
        XCTAssertEqual(source.serverPath(URL(fileURLWithPath: "/Users/me/Io.ipynb")), "Users/me/Io.ipynb")
    }
}
