@testable import DeviceBridge
import XCTest

/// The server's reported writes, kept so a check can tell the server's own
/// write from a change made outside the app (#584).
final class ServerWriteLogTests: XCTestCase {
    private let path = "/n/a.ipynb"

    func testASingleWriteLeadsFromItsBeforeToItsAfter() {
        let log = ServerWriteLog()
        log.record(path: path, before: "1:1:1", after: "2:2:2")
        XCTAssertTrue(log.leads(path: path, from: "1:1:1", to: "2:2:2"))
        XCTAssertFalse(log.leads(path: path, from: "2:2:2", to: "1:1:1"), "not backwards")
        XCTAssertFalse(log.leads(path: path, from: "9:9:9", to: "2:2:2"), "from a stamp it didn't start at")
        XCTAssertFalse(log.leads(path: "/n/b.ipynb", from: "1:1:1", to: "2:2:2"), "another file")
    }

    func testWritesBackToBackAreFollowedInAChain() {
        let log = ServerWriteLog()
        log.record(path: path, before: "1:1:1", after: "2:2:2")
        log.record(path: path, before: "2:2:2", after: "3:3:3")
        log.record(path: path, before: "3:3:3", after: "4:4:4")
        XCTAssertTrue(log.leads(path: path, from: "1:1:1", to: "4:4:4"))
        XCTAssertTrue(log.leads(path: path, from: "2:2:2", to: "4:4:4"))
        XCTAssertFalse(log.leads(path: path, from: "1:1:1", to: "5:5:5"))
    }

    func testAGapInTheChainBreaksIt() {
        let log = ServerWriteLog()
        // An outside change took the file from 2 to 7 between the writes.
        log.record(path: path, before: "1:1:1", after: "2:2:2")
        log.record(path: path, before: "7:7:7", after: "8:8:8")
        XCTAssertFalse(log.leads(path: path, from: "1:1:1", to: "8:8:8"))
        XCTAssertTrue(log.leads(path: path, from: "1:1:1", to: "2:2:2"))
    }

    func testAFileCreatedByTheServerLeadsFromNothingNotFromAStamp() {
        let log = ServerWriteLog()
        log.record(path: path, before: nil, after: "5:5:5")
        XCTAssertFalse(log.leads(path: path, from: "1:1:1", to: "5:5:5"))
        // A write that couldn't be read afterwards leads nowhere.
        log.record(path: path, before: "5:5:5", after: nil)
        XCTAssertFalse(log.leads(path: path, from: "5:5:5", to: "6:6:6"))
    }

    func testACycleEndsAndStillFindsTheWayOut() {
        let log = ServerWriteLog()
        log.record(path: path, before: "1:1:1", after: "2:2:2")
        log.record(path: path, before: "2:2:2", after: "1:1:1")
        log.record(path: path, before: "1:1:1", after: "3:3:3")
        XCTAssertTrue(log.leads(path: path, from: "1:1:1", to: "3:3:3"))
        XCTAssertFalse(log.leads(path: path, from: "1:1:1", to: "4:4:4"), "returns instead of looping")
    }

    func testTheSameStampIsReachedWithoutAWrite() {
        XCTAssertTrue(ServerWriteLog().leads(path: path, from: "1:1:1", to: "1:1:1"))
    }

    func testOnlyTheLastTransitionsOfAFileAreKept() {
        let log = ServerWriteLog()
        for step in 0..<(ServerWriteLog.perPath + 5) {
            log.record(path: path, before: "\(step)", after: "\(step + 1)")
        }
        let last = ServerWriteLog.perPath + 5
        XCTAssertTrue(log.leads(path: path, from: "5", to: "\(last)"), "the last \(ServerWriteLog.perPath) are there")
        XCTAssertFalse(log.leads(path: path, from: "0", to: "\(last)"), "the first ones were dropped")
    }

    func testOnlyTheLatestFilesAreKept() {
        let log = ServerWriteLog()
        for index in 0..<(ServerWriteLog.paths + 1) {
            log.record(path: "/n/\(index).ipynb", before: "1", after: "2")
        }
        XCTAssertFalse(log.leads(path: "/n/0.ipynb", from: "1", to: "2"), "the oldest file was dropped")
        XCTAssertTrue(log.leads(path: "/n/1.ipynb", from: "1", to: "2"))
        XCTAssertTrue(log.leads(path: "/n/\(ServerWriteLog.paths).ipynb", from: "1", to: "2"))
    }

    /// `record` runs on the server's threads and `leads` on the main actor.
    func testRecordingFromManyThreadsLosesNothing() {
        let log = ServerWriteLog()
        let writers = 8
        DispatchQueue.concurrentPerform(iterations: writers) { index in
            log.record(path: "/n/\(index).ipynb", before: "1", after: "2")
            _ = log.leads(path: "/n/\(index).ipynb", from: "1", to: "2")
        }
        for index in 0..<writers {
            XCTAssertTrue(log.leads(path: "/n/\(index).ipynb", from: "1", to: "2"))
        }
    }
}
