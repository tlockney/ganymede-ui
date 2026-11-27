#if os(macOS)
import XCTest

/// What the app keeps of a this-Mac check (#883): the remotes whose server
/// it verified, what a window's target is as a place, and the folder a
/// this-Mac window's notebooks are under. `AppModel` keeps one of these and
/// asks it for all three; its own file isn't in this test target.
final class ThisMacServersTests: XCTestCase {
    private func server(
        port: Int = 8888, token: String = "a-token", root: String = "/Users/me/work", pid: Int32 = 42
    ) -> ThisMacServer {
        ThisMacServer(
            pid: pid, url: URL(string: "http://127.0.0.1:\(port)/")!, token: token,
            root: URL(fileURLWithPath: root, isDirectory: true), version: "0.17.0")
    }

    /// The mapping a check's result is applied by: each remote that names
    /// the verified server, by its id, with the server it was verified by.
    func testTheCheckKeepsTheRemotesThatNameTheVerifiedServer() {
        let here = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        let other = Remote(name: "mini", serverURL: "http://mini:8888")
        let elsewhere = Remote(name: "elsewhere", serverURL: "http://127.0.0.1:9999")
        let servers = ThisMacServers(
            [server()], remotes: [here, other, elsewhere], token: { _ in "a-token" })
        XCTAssertEqual(servers.ids, [here.id.uuidString])
        XCTAssertEqual(servers.server(here.id.uuidString), server())
        XCTAssertFalse(servers.isEmpty)
        // Another token names no server the check verified: the app would
        // send a server it didn't check its token.
        XCTAssertTrue(ThisMacServers([server()], remotes: [here], token: { _ in "another" }).isEmpty)
        XCTAssertTrue(ThisMacServers([server()], remotes: [here], token: { _ in nil }).isEmpty)
        // Nothing verified: nothing kept.
        XCTAssertTrue(ThisMacServers([], remotes: [here], token: { _ in "a-token" }).isEmpty)
        XCTAssertTrue(ThisMacServers().isEmpty)
    }

    func testAWindowsTargetIsThisMacsOwnPlaceOnceItsServerVerifies() throws {
        let remote = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        let id = remote.id.uuidString
        let target = try XCTUnwrap(WindowTarget.machine(id, path: "/notes", isFolder: true))
        XCTAssertEqual(target.place, .machine(id))
        let verified = ThisMacServers([server()], remotes: [remote], token: { _ in "a-token" })
        XCTAssertEqual(verified.place(for: target), .thisMac(id))
        // Unverified, the window is the machine's it was opened as.
        XCTAssertEqual(ThisMacServers().place(for: target), .machine(id))
        // This device's own windows are unchanged either way.
        let folder = WindowTarget.folder(URL(fileURLWithPath: "/Users/me"))
        XCTAssertEqual(verified.place(for: folder), .thisDevice)
        XCTAssertEqual(ThisMacServers().place(for: folder), .thisDevice)
    }

    func testAThisMacWindowsRootIsItsServersRootDir() {
        let remote = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        let id = remote.id.uuidString
        let verified = ThisMacServers(
            [server(root: "/Users/me/work")], remotes: [remote], token: { _ in "a-token" })
        XCTAssertEqual(verified.root(for: .thisMac(id))?.path, "/Users/me/work")
        // Every other place has none: its notebooks aren't under a server's
        // `root_dir`.
        XCTAssertNil(verified.root(for: .machine(id)))
        XCTAssertNil(verified.root(for: .thisDevice))
        XCTAssertNil(ThisMacServers().root(for: .thisMac(id)))
    }

    /// The verified process ended: its remote is a machine again, at once,
    /// with no folder of this Mac's own (#883).
    func testAServerWhoseProcessEndsIsDropped() throws {
        let remote = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        let id = remote.id.uuidString
        let target = try XCTUnwrap(WindowTarget.machine(id, path: "/", isFolder: true))
        let verified = ThisMacServers([server()], remotes: [remote], token: { _ in "a-token" })
        let gone = verified.removing(id)
        XCTAssertTrue(gone.isEmpty)
        XCTAssertEqual(gone.place(for: target), .machine(id))
        XCTAssertNil(gone.root(for: .thisMac(id)))
        // Another remote's server stays.
        let other = Remote(name: "other", serverURL: "http://127.0.0.1:8888")
        let two = ThisMacServers([server()], remotes: [remote, other], token: { _ in "a-token" })
        XCTAssertEqual(two.removing(id).ids, [other.id.uuidString])
    }
}
#endif
