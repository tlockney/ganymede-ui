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

    // MARK: trust failure notices (#887)

    private func failingEntry(
        url: String = "http://127.0.0.1:8888/",
        hostname: String? = "127.0.0.1",
        port: Int = 8888,
        token: String = "a-token",
        isRunning: Bool = true,
        failure: ThisMacTrustFailure
    ) -> ThisMacScanEntry {
        ThisMacScanEntry(
            url: URL(string: url)!, hostname: hostname, port: port,
            token: token, isRunning: isRunning, failure: failure)
    }

    func testEveryFailureReasonHasAConciseOneLineNotice() {
        let allCases: [ThisMacTrustFailure] = [
            .unsignedApp,
            .missingBundledHelper,
            .localhostURL,
            .noServerInfo,
            .processNotRunning,
            .wrongExecutablePath,
            .wrongSignature,
            .wildcardBind,
            .infoFileUsesLocalhost,
            .nonLoopbackAddress,
            .notListening,
            .missingToken,
            .incompleteServerInfo,
            .bundledVersionUnavailable,
            .versionMismatch(server: "0.16.0", app: "0.17.0"),
            .addressMismatch(serverHost: "::1"),
            .addressMismatch(serverHost: "127.0.0.1"),
            .tokenMismatch,
        ]
        for failure in allCases {
            let text = failure.notice
            XCTAssertFalse(text.isEmpty, "\(failure)")
            XCTAssertFalse(text.contains("\n"), "notice must be one line: \(text)")
            XCTAssertTrue(text.contains("This Mac"), "notice should explain why not This Mac: \(text)")
        }
        // Specific wording checks for the primary scenarios (#887).
        XCTAssertTrue(ThisMacTrustFailure.versionMismatch(server: "0.16.0", app: "0.17.0").notice.contains("0.16.0"))
        XCTAssertTrue(ThisMacTrustFailure.versionMismatch(server: "0.16.0", app: "0.17.0").notice.contains("0.17.0"))
        XCTAssertTrue(ThisMacTrustFailure.wildcardBind.notice.contains("--ip 127.0.0.1"))
        XCTAssertTrue(ThisMacTrustFailure.localhostURL.notice.contains("localhost"))
        XCTAssertTrue(ThisMacTrustFailure.unsignedApp.notice.contains("signed"))
        XCTAssertTrue(ThisMacTrustFailure.addressMismatch(serverHost: "::1").notice.contains("[::1]"))
    }

    func testNonLoopbackServersShowNoNotice() {
        let remotes = [
            Remote(name: "mini", serverURL: "http://mac-mini:8888"),
            Remote(name: "lan", serverURL: "http://192.168.1.5:8888"),
            Remote(name: "nip", serverURL: "http://127.0.0.1.nip.io:8888"),
            Remote(name: "tailnet", serverURL: "https://box.example.ts.net"),
        ]
        // Even on an unsigned build or with no info files, another computer shows no notice.
        for scan in [ThisMacScanResult(appFailure: .unsignedApp), ThisMacScanResult()] {
            let servers = ThisMacServers(scan: scan, remotes: remotes, token: { _ in "a-token" })
            for remote in remotes {
                let id = remote.id.uuidString
                XCTAssertNil(servers.failure(for: .machine(id)), remote.serverURL)
                XCTAssertNil(servers.notice(for: .machine(id)), remote.serverURL)
            }
            XCTAssertNil(servers.failure(for: .thisDevice))
            XCTAssertNil(servers.notice(for: .thisDevice))
        }
    }

    func testLoopbackRemoteReportsEachFailureReasonAndClearsOnUpgrade() {
        let loopback = Remote(name: "here", serverURL: "http://127.0.0.1:8888")
        let loopbackID = loopback.id.uuidString
        let localhost = Remote(name: "named", serverURL: "http://localhost:8888")
        let localhostID = localhost.id.uuidString
        let ipv6 = Remote(name: "v6", serverURL: "http://[::1]:8888")
        let ipv6ID = ipv6.id.uuidString

        // 1. Unsigned app build affects all loopback remotes (127.0.0.1, ::1, localhost).
        let unsigned = ThisMacServers(
            scan: ThisMacScanResult(appFailure: .unsignedApp),
            remotes: [loopback, localhost, ipv6], token: { _ in "a-token" })
        XCTAssertEqual(unsigned.failure(for: .machine(loopbackID)), .unsignedApp)
        XCTAssertEqual(unsigned.failure(for: .machine(localhostID)), .unsignedApp)
        XCTAssertEqual(unsigned.failure(for: .machine(ipv6ID)), .unsignedApp)
        XCTAssertNotNil(unsigned.notice(for: .machine(loopbackID)))

        // 2. Missing bundled helper.
        let missingHelper = ThisMacServers(
            scan: ThisMacScanResult(appFailure: .missingBundledHelper),
            remotes: [loopback], token: { _ in "a-token" })
        XCTAssertEqual(missingHelper.failure(for: .machine(loopbackID)), .missingBundledHelper)

        // 3. Remote URL uses localhost (any case, or with trailing dot).
        for url in ["http://localhost:8888", "http://LOCALHOST:8888", "http://localhost.:8888"] {
            let remote = Remote(name: "local", serverURL: url)
            let servers = ThisMacServers(
                scan: ThisMacScanResult(verified: [server()]), remotes: [remote], token: { _ in "a-token" })
            XCTAssertEqual(servers.failure(for: .machine(remote.id.uuidString)), .localhostURL, url)
        }

        // 4. Each scan-level failure reason matches the loopback remote on that port.
        let scanFailures: [ThisMacTrustFailure] = [
            .processNotRunning,
            .wrongExecutablePath,
            .wrongSignature,
            .wildcardBind,
            .infoFileUsesLocalhost,
            .nonLoopbackAddress,
            .notListening,
            .missingToken,
            .incompleteServerInfo,
            .bundledVersionUnavailable,
            .versionMismatch(server: "0.16.0", app: "0.17.0"),
        ]
        for reason in scanFailures {
            let entry = failingEntry(
                url: reason == .wildcardBind ? "http://localhost:8888/" : "http://127.0.0.1:8888/",
                hostname: reason == .wildcardBind ? "0.0.0.0" : "127.0.0.1",
                isRunning: reason != .processNotRunning,
                failure: reason)
            let servers = ThisMacServers(
                scan: ThisMacScanResult(entries: [entry]), remotes: [loopback], token: { _ in "a-token" })
            XCTAssertEqual(servers.failure(for: .machine(loopbackID)), reason, "\(reason)")
            XCTAssertEqual(servers.notice(for: .machine(loopbackID)), reason.notice, "\(reason)")
        }

        // 5. Verified server on port, but remote token doesn't match -> `.tokenMismatch`.
        let wrongToken = ThisMacServers(
            scan: ThisMacScanResult(verified: [server()]), remotes: [loopback], token: { _ in "wrong" })
        XCTAssertEqual(wrongToken.failure(for: .machine(loopbackID)), .tokenMismatch)

        // 6. Verified server on 127.0.0.1, remote points at [::1] with matching token -> `.addressMismatch`.
        let wrongFamily = ThisMacServers(
            scan: ThisMacScanResult(verified: [server()]), remotes: [ipv6], token: { _ in "a-token" })
        XCTAssertEqual(wrongFamily.failure(for: .machine(ipv6ID)), .addressMismatch(serverHost: "127.0.0.1"))

        // 7. No matching info file on that port -> `.noServerInfo`.
        let noInfo = ThisMacServers(
            scan: ThisMacScanResult(entries: []), remotes: [loopback], token: { _ in "a-token" })
        XCTAssertEqual(noInfo.failure(for: .machine(loopbackID)), .noServerInfo)

        // 8. Live failure entry beats a stale dead-process entry on the same port.
        let staleAndLive = ThisMacServers(
            scan: ThisMacScanResult(entries: [
                failingEntry(isRunning: false, failure: .processNotRunning),
                failingEntry(isRunning: true, failure: .versionMismatch(server: "0.16.0", app: "0.17.0")),
            ]),
            remotes: [loopback], token: { _ in "a-token" })
        XCTAssertEqual(
            staleAndLive.failure(for: .machine(loopbackID)),
            .versionMismatch(server: "0.16.0", app: "0.17.0"))

        // 9. Notice clears once verified / upgraded to `.thisMac`.
        let verified = ThisMacServers(
            scan: ThisMacScanResult(verified: [server()]), remotes: [loopback], token: { _ in "a-token" })
        XCTAssertEqual(verified.ids, [loopbackID])
        XCTAssertNil(verified.failure(for: .thisMac(loopbackID)))
        XCTAssertNil(verified.notice(for: .thisMac(loopbackID)))
        XCTAssertNil(verified.failure(for: .machine(loopbackID)))
        XCTAssertNil(verified.notice(for: .machine(loopbackID)))
        // Even if a failure existed for an id, `.thisMac` never displays one.
        XCTAssertNil(unsigned.failure(for: .thisMac(loopbackID)))
        XCTAssertNil(unsigned.notice(for: .thisMac(loopbackID)))
    }
}
#endif
