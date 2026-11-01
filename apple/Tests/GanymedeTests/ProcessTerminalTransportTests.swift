import XCTest

// iOS apps cannot start processes.
#if os(macOS)
/// ProcessTerminalTransport with /bin/sh standing in for ssh: output,
/// input, the window size the program sees, and how it ends.
@MainActor
final class ProcessTerminalTransportTests: XCTestCase {
    private func run(
        _ script: String, input: String? = nil, cols: Int = 0, rows: Int = 0
    ) async throws -> (output: String, reason: String??) {
        let transport = ProcessTerminalTransport(executable: "/bin/sh", arguments: ["-c", script])
        var output: [UInt8] = []
        var reason: String??
        transport.onOutput = { output += $0 }
        transport.onClose = { reason = .some($0) }
        transport.resize(cols: cols, rows: rows)
        transport.start()
        transport.resize(cols: cols, rows: rows)
        if let input {
            transport.send(Array(input.utf8)[...])
        }
        for _ in 0..<100 {
            if reason != nil { break }
            try await Task.sleep(nanoseconds: 50_000_000)
        }
        XCTAssertNotNil(reason, "the program did not end")
        return (String(decoding: output, as: UTF8.self), reason)
    }

    func testOutputAndANormalExit() async throws {
        let result = try await run("echo hello")
        XCTAssertTrue(result.output.contains("hello"), result.output)
        XCTAssertEqual(result.reason, .some(nil))
    }

    func testInputReachesTheProgram() async throws {
        let result = try await run("read line; echo got:$line", input: "abc\r")
        XCTAssertTrue(result.output.contains("got:abc"), result.output)
    }

    func testTheProgramSeesTheWindowSize() async throws {
        let result = try await run("sleep 0.3; stty size", cols: 101, rows: 33)
        XCTAssertTrue(result.output.contains("33 101"), result.output)
    }

    func testAFailingExitIsReported() async throws {
        let result = try await run("exit 3")
        XCTAssertEqual(result.reason, .some("sh exited with status 3."))
    }

    func testCloseEndsTheProgramWithoutReporting() async throws {
        let transport = ProcessTerminalTransport(executable: "/bin/sh", arguments: ["-c", "sleep 30"])
        var closed = false
        transport.onClose = { _ in closed = true }
        transport.start()
        transport.close()
        try await Task.sleep(nanoseconds: 300_000_000)
        XCTAssertFalse(closed)
    }

    func testSSHArguments() {
        XCTAssertEqual(Remote.SSH(host: "box").arguments, ["--", "box"])
        XCTAssertEqual(
            Remote.SSH(host: "box", user: "me", port: 2222).arguments,
            ["-p", "2222", "-l", "me", "--", "box"]
        )
    }
}
#endif
