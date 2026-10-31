import XCTest

@MainActor
final class TerminalTransportTests: XCTestCase {
    func testEchoTurnsReturnIntoNewline() {
        let echo = EchoTransport()
        var out: [UInt8] = []
        echo.onOutput = { out += $0 }
        echo.send(Array("ignored".utf8)[...])
        XCTAssertTrue(out.isEmpty, "nothing is sent before start")
        echo.start()
        echo.send(Array("ls\r".utf8)[...])
        XCTAssertEqual(String(decoding: out, as: UTF8.self), "ls\r\n")
    }

    func testResizeAndHangUp() {
        let echo = EchoTransport()
        var reasons: [String?] = []
        echo.onClose = { reasons.append($0) }
        echo.start()
        echo.resize(cols: 120, rows: 40)
        XCTAssertEqual(echo.size?.cols, 120)
        XCTAssertEqual(echo.size?.rows, 40)
        echo.hangUp(reason: "exited")
        echo.hangUp(reason: "again")
        XCTAssertEqual(reasons, ["exited"])
        var out: [UInt8] = []
        echo.onOutput = { out += $0 }
        echo.send(Array("x".utf8)[...])
        XCTAssertTrue(out.isEmpty, "nothing is sent after the end")
    }

    func testCloseFromHereDoesNotReportAnEnd() {
        let echo = EchoTransport()
        var ended = false
        echo.onClose = { _ in ended = true }
        echo.start()
        echo.close()
        echo.hangUp()
        XCTAssertFalse(ended)
    }
}
