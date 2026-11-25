@testable import DeviceBridge
import XCTest

/// The stamp that tells whether a notebook's file is the one an answer was
/// kept for (#584), on real files.
final class FileStampTests: XCTestCase {
    private var folder: URL!
    private let fixed = Date(timeIntervalSince1970: 1_700_000_000)

    override func setUpWithError() throws {
        folder = FileManager.default.temporaryDirectory.appendingPathComponent("FileStampTests-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: folder)
    }

    private func write(_ text: String, to name: String, modified: Date? = nil) throws -> String {
        let url = folder.appendingPathComponent(name)
        try Data(text.utf8).write(to: url)
        if let modified {
            try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: url.path)
        }
        return url.path
    }

    /// The server's `file_stamp` (ganymede `fileid.rs`) makes this exact
    /// string, and the app compares its write reports with it.
    func testTheFormatIsSizeMtimeNanosecondsInode() throws {
        let path = try write("{}", to: "a.ipynb", modified: fixed)
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        let inode = try XCTUnwrap((attributes[.systemFileNumber] as? NSNumber)?.uint64Value)
        XCTAssertEqual(FileStamp.of(path), "2:1700000000000000000:\(inode)")
    }

    func testATimeBeforeTheEpochIsZeroAsTheServerHasIt() throws {
        let path = try write("{}", to: "a.ipynb", modified: Date(timeIntervalSince1970: -100))
        let fields = try XCTUnwrap(FileStamp.of(path)).split(separator: ":").map(String.init)
        XCTAssertEqual(fields.count, 3)
        XCTAssertEqual(fields[1], "0")
    }

    func testCanonicalResolvesLinksAndKeepsAMissingPathAsGiven() throws {
        let path = try write("{}", to: "a.ipynb")
        let link = folder.appendingPathComponent("link.ipynb").path
        try FileManager.default.createSymbolicLink(atPath: link, withDestinationPath: path)
        XCTAssertEqual(FileStamp.canonical(link), FileStamp.canonical(path))
        XCTAssertTrue(FileStamp.canonical(link).hasSuffix("/a.ipynb"), "the link is gone from the name")
        let missing = folder.appendingPathComponent("none.ipynb").path
        XCTAssertEqual(FileStamp.canonical(missing), URL(fileURLWithPath: missing).standardizedFileURL.path)
    }

    func testTheSameFileHasTheSameStamp() throws {
        let path = try write("{}", to: "a.ipynb")
        let stamp = try XCTUnwrap(FileStamp.of(path))
        XCTAssertEqual(FileStamp.of(path), stamp)
        XCTAssertEqual(stamp.split(separator: ":").count, 3, "size, mtime, inode")
        XCTAssertTrue(stamp.hasPrefix("2:"), "the size comes first")
    }

    func testARewriteInPlaceWithAnotherSizeChangesIt() throws {
        let path = try write("{}", to: "a.ipynb", modified: fixed)
        let before = FileStamp.of(path)
        _ = try write("{ }", to: "a.ipynb", modified: fixed)
        XCTAssertNotNil(FileStamp.of(path))
        XCTAssertNotEqual(FileStamp.of(path), before)
    }

    func testARewriteInPlaceWithAnotherTimeChangesIt() throws {
        let path = try write("{}", to: "a.ipynb", modified: fixed)
        let before = FileStamp.of(path)
        _ = try write("[]", to: "a.ipynb", modified: fixed.addingTimeInterval(1.5))
        XCTAssertNotEqual(FileStamp.of(path), before, "same size, later mtime")
    }

    /// How git and most editors save: a temp file moved over the path. With
    /// the size and mtime the same, only the inode tells.
    func testAReplaceByRenameChangesItEvenWithTheSameSizeAndTime() throws {
        let path = try write("{}", to: "a.ipynb", modified: fixed)
        let replacement = try write("[]", to: "a.ipynb.tmp", modified: fixed)
        let before = try XCTUnwrap(FileStamp.of(path))
        XCTAssertEqual(rename(replacement, path), 0)
        let after = try XCTUnwrap(FileStamp.of(path))
        XCTAssertNotEqual(after, before)
        let fields = { (stamp: String) in stamp.split(separator: ":").map(String.init) }
        XCTAssertEqual(Array(fields(after).prefix(2)), Array(fields(before).prefix(2)), "size and mtime are the same")
    }

    func testAMovedFileKeepsItsStamp() throws {
        let path = try write("{}", to: "a.ipynb")
        let before = FileStamp.of(path)
        let moved = folder.appendingPathComponent("b.ipynb").path
        XCTAssertEqual(rename(path, moved), 0)
        XCTAssertNil(FileStamp.of(path))
        XCTAssertEqual(FileStamp.of(moved), before, "a rename keeps the size, mtime and inode")
    }

    func testAMissingFileHasNone() {
        XCTAssertNil(FileStamp.of(folder.appendingPathComponent("none.ipynb").path))
    }

    func testALinkIsFollowed() throws {
        let path = try write("{}", to: "a.ipynb")
        let link = folder.appendingPathComponent("link.ipynb")
        try FileManager.default.createSymbolicLink(at: link, withDestinationURL: URL(fileURLWithPath: path))
        XCTAssertEqual(FileStamp.of(link.path), FileStamp.of(path))
        XCTAssertNotNil(FileStamp.of(link.path))
        try FileManager.default.removeItem(atPath: path)
        XCTAssertNil(FileStamp.of(link.path), "a link to nothing has no file")
    }
}
