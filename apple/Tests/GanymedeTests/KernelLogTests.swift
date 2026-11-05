import XCTest

/// The bottom panel's Kernel Log (#248), from ganymede's
/// `GET /api/kernels/{id}/log`.
final class KernelLogTests: XCTestCase {
    private func page(_ json: String) -> KernelLog.Page? {
        KernelLog.Page(json: Data(json.utf8))
    }

    func testReadsAPage() throws {
        let page = try XCTUnwrap(page("""
        {"kernel_id": "k1", "lines": [
          {"seq": 1, "time": "2026-11-04T16:41:02Z", "source": "host", "text": "started process 41234"},
          {"seq": 2, "time": "2026-11-04T16:41:09Z", "source": "stderr", "text": "MemoryError"}],
         "last_seq": 2}
        """))
        XCTAssertEqual(page.lines.map(\.seq), [1, 2])
        XCTAssertEqual(page.lines.last?.source, "stderr")
        XCTAssertEqual(page.lines.last?.text, "MemoryError")
        XCTAssertEqual(page.lastSeq, 2)
        XCTAssertNil(page.reason)
        XCTAssertNil(self.page("<html>Not Found</html>"))
    }

    func testFollowsFromTheLastLineRead() throws {
        var log = KernelLog()
        let first = try XCTUnwrap(page("""
        {"lines": [{"seq": 1, "source": "stdout", "text": "a"}, {"seq": 2, "source": "stdout", "text": "b"}],
         "last_seq": 3}
        """))
        XCTAssertTrue(log.append(first), "line 3 is still to read")
        XCTAssertEqual(log.after, 2)
        // A repeated line is not added twice.
        let second = try XCTUnwrap(page("""
        {"lines": [{"seq": 2, "source": "stdout", "text": "b"}, {"seq": 3, "source": "stdout", "text": "c"}],
         "last_seq": 3}
        """))
        XCTAssertFalse(log.append(second))
        XCTAssertEqual(log.lines.map(\.text), ["a", "b", "c"])
        XCTAssertEqual(log.after, 3)
        XCTAssertEqual(log.status, .following)
    }

    func testKeepsTheLastLines() {
        var log = KernelLog()
        var page = KernelLog.Page(json: Data(#"{"lines": [], "last_seq": 0}"#.utf8))!
        page.lines = (1...(KernelLog.limit + 5)).map {
            KernelLog.Line(seq: $0, time: "", source: "stdout", text: "\($0)")
        }
        page.lastSeq = KernelLog.limit + 5
        log.append(page)
        XCTAssertEqual(log.lines.count, KernelLog.limit)
        XCTAssertEqual(log.lines.first?.seq, 6)
    }

    func testAKernelWithNoProcessHasNoLog() throws {
        var log = KernelLog()
        let page = try XCTUnwrap(page(#"{"kernel_id": "k1", "lines": [], "last_seq": 0, "reason": "no_process"}"#))
        XCTAssertFalse(log.append(page))
        XCTAssertEqual(log.status, .noProcess)
    }

    func testAsksForTheLinesAfterTheLastOneWithTheToken() throws {
        let server = ServerEndpoint(base: URL(string: "http://127.0.0.1:8888/base")!, token: "abc")
        let request = KernelLog.request(kernel: "k1", after: 7, on: server)
        let url = try XCTUnwrap(request.url)
        XCTAssertEqual(url.path, "/base/api/kernels/k1/log")
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        XCTAssertEqual(query, [
            URLQueryItem(name: "after", value: "7"),
            URLQueryItem(name: "lines", value: String(KernelLog.limit)),
        ])
        XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "token abc")
    }
}
