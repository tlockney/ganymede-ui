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

    /// A machine's terminal opens the server's transport, in its folder
    /// (#860): the switch from a target to what runs it, in a file the tests
    /// compile, rather than the view's alone.
    @MainActor
    func testAServerTargetOpensTheServersTransportInItsFolder() throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:9", token: "t"))
        let host = TestTerminalHost(servers: [id: endpoint])
        let transport = try XCTUnwrap(TerminalTarget.server(id, folder: "sub").transport(on: host))
        let server = try XCTUnwrap(transport as? JupyterTerminalTransport)
        XCTAssertEqual(server.endpoint, endpoint)
        XCTAssertEqual(server.cwd, "sub")
        // A machine whose remote is gone, or one the app doesn't know, has no
        // server to run a shell on.
        XCTAssertNil(TerminalTarget.server(UUID()).transport(on: host))
    }

    /// SSH is the host's to open, which differs by platform: the target
    /// hands its remote over and returns what the host made.
    @MainActor
    func testAnSSHTargetOpensTheHostsTransport() {
        let ssh = TestTransport()
        let host = TestTerminalHost(ssh: [id: ssh])
        XCTAssertTrue(TerminalTarget.ssh(id).transport(on: host) === ssh)
        XCTAssertNil(TerminalTarget.ssh(UUID()).transport(on: host))
    }

    #if os(macOS)
    /// This Mac's terminal runs on the app's own server, rooted at `/`: its
    /// cwd is the folder's absolute path, else the app's root, and there is
    /// none before that server listens.
    @MainActor
    func testALocalTargetOpensTheAppsServerInItsFolder() throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:9", token: "t"))
        let root = URL(fileURLWithPath: "/Users/me/notes", isDirectory: true)
        let host = TestTerminalHost(localServer: endpoint, root: root)
        let folder = URL(fileURLWithPath: "/Users/me/notes/Io", isDirectory: true)
        let inFolder = try XCTUnwrap(
            TerminalTarget.local(folder: folder).transport(on: host) as? JupyterTerminalTransport)
        XCTAssertEqual(inFolder.endpoint, endpoint)
        XCTAssertEqual(inFolder.cwd, folder.path)
        let atRoot = try XCTUnwrap(
            TerminalTarget.local(folder: nil).transport(on: host) as? JupyterTerminalTransport)
        XCTAssertEqual(atRoot.cwd, root.path)
        XCTAssertNil(TerminalTarget.local(folder: nil).transport(on: TestTerminalHost(root: root)))
    }
    #else
    /// The iPad and iPhone server starts no shell.
    @MainActor
    func testALocalTargetHasNoTransportOnIOS() throws {
        let endpoint = try XCTUnwrap(ServerEndpoint(string: "http://127.0.0.1:9", token: "t"))
        XCTAssertNil(TerminalTarget.local(folder: nil).transport(on: TestTerminalHost(localServer: endpoint)))
    }
    #endif
}

/// A transport that does nothing, for a host to hand back.
private final class TestTransport: TerminalTransport {
    var onOutput: ((ArraySlice<UInt8>) -> Void)?
    var onClose: ((String?) -> Void)?
    func start() {}
    func send(_ data: ArraySlice<UInt8>) {}
    func resize(cols: Int, rows: Int) {}
    func close() {}
}

/// A terminal's host for the tests: the servers and SSH transports they give it.
@MainActor
private struct TestTerminalHost: TerminalHost {
    var localServer: ServerEndpoint?
    var root = URL(fileURLWithPath: "/", isDirectory: true)
    var servers: [UUID: ServerEndpoint] = [:]
    var ssh: [UUID: TerminalTransport] = [:]

    func server(of id: UUID) -> ServerEndpoint? { servers[id] }
    func sshTransport(for id: UUID) -> TerminalTransport? { ssh[id] }
}
