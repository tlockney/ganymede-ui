import XCTest

/// Where a terminal's shell runs (#858): a machine's terminal starts in a
/// folder on the machine, and a terminal saved before it still opens.
final class TerminalTargetTests: XCTestCase {
    private let id = UUID(uuidString: "3F2B8C1E-AAAA-4BBB-8CCC-0123456789AB")!

    func testATerminalSavedBeforeItsStartFolderStillOpens() throws {
        // What `.server` saved before #858, when it carried the remote alone.
        let saved = Data(#"{"server":{"_0":"\#(id.uuidString)"}}"#.utf8)
        XCTAssertEqual(try JSONDecoder().decode(TerminalTarget.self, from: saved), .server(id, folder: nil))
        // A whole request, as a restored terminal window's panel has it: the
        // request's own id, then the target as it was.
        let request = Data(#"{"id":"1E5D2C90-BBBB-4CCC-8DDD-0123456789AB","target":{"server":{"_0":"\#(id.uuidString)"}}}"#.utf8)
        XCTAssertEqual(
            try JSONDecoder().decode(TerminalRequest.self, from: request),
            TerminalRequest(id: UUID(uuidString: "1E5D2C90-BBBB-4CCC-8DDD-0123456789AB")!, target: .server(id)))
    }

    func testATerminalsStartFolderRoundTrips() throws {
        let targets: [TerminalTarget] = [
            .server(id),
            .server(id, folder: "notes/Io"),
            .server(id, folder: "/notes"),
            .local(folder: URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)),
            .local(folder: nil),
            .ssh(id),
        ]
        for target in targets {
            let data = try JSONEncoder().encode(target)
            XCTAssertEqual(try JSONDecoder().decode(TerminalTarget.self, from: data), target, "\(target)")
        }
        // A folderless terminal saves what it always did, so an older build
        // reads a terminal this one saved.
        XCTAssertEqual(
            String(decoding: try JSONEncoder().encode(TerminalTarget.server(id)), as: UTF8.self),
            #"{"server":{"_0":"\#(id.uuidString)"}}"#)
    }
}
