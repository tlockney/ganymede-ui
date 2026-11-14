#if os(macOS)
import XCTest

/// Moving a live terminal between the bottom panel and a tab (#248): the
/// session parks while its view leaves, and the new place takes it back.
@MainActor
final class TerminalHandoffTests: XCTestCase {
    private let here = TerminalTarget.local(folder: URL(fileURLWithPath: "/Users/me/Jupiter"))

    func testAMovedTerminalArrivesWithItsSession() {
        let handoff = TerminalHandoff()
        let id = UUID()
        let transport = EchoTransport()
        handoff.register(id, target: here, transport: transport, title: "zsh")
        XCTAssertNil(handoff.arriving(id), "nothing is on its way before a move")
        var arrived = false
        XCTAssertTrue(handoff.move(id) { arrived = true })
        XCTAssertFalse(handoff.canMove(id), "one move at a time")
        XCTAssertTrue(handoff.isLeaving(id))
        // Its old place goes away; the session stays listed.
        handoff.unregister(id)
        XCTAssertFalse(arrived, "the new place waits for the view to leave")
        let view = NSObject(), coordinator = NSObject()
        var closed = false
        handoff.park(id, view: view, coordinator: coordinator) { closed = true }
        XCTAssertTrue(arrived)
        let arriving = handoff.arriving(id)
        XCTAssertTrue(arriving?.transport === transport)
        XCTAssertEqual(arriving?.title, "zsh")
        XCTAssertTrue(handoff.coordinator(id) === coordinator)
        XCTAssertTrue(handoff.takeView(id) === view)
        XCTAssertFalse(handoff.isLeaving(id), "taking the view ends the move")
        XCTAssertNil(handoff.takeView(id))
        XCTAssertFalse(closed)
        XCTAssertFalse(transport.closed)
    }

    func testOnlyATerminalOnShowCanMove() {
        let handoff = TerminalHandoff()
        let id = UUID()
        XCTAssertFalse(handoff.move(id) {})
        handoff.register(id, target: here, transport: EchoTransport(), title: "")
        handoff.unregister(id)
        XCTAssertFalse(handoff.canMove(id), "a closed terminal is gone")
    }

    func testAParkedTerminalNoPlaceTakesIsClosed() {
        let handoff = TerminalHandoff()
        handoff.timeout = 0.05
        let id = UUID()
        handoff.register(id, target: here, transport: EchoTransport(), title: "")
        XCTAssertTrue(handoff.move(id) {})
        let closed = expectation(description: "closed")
        handoff.park(id, view: NSObject(), coordinator: NSObject()) { closed.fulfill() }
        wait(for: [closed], timeout: 2)
        XCTAssertNil(handoff.takeView(id))
        XCTAssertFalse(handoff.isLeaving(id))
        XCTAssertNil(handoff.arriving(id))
    }

    func testAMoveWhoseViewNeverLeavesLapses() {
        let handoff = TerminalHandoff()
        handoff.timeout = 0.05
        let id = UUID()
        handoff.register(id, target: here, transport: EchoTransport(), title: "")
        var arrived = false
        XCTAssertTrue(handoff.move(id) { arrived = true })
        let lapsed = expectation(description: "lapsed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { lapsed.fulfill() }
        wait(for: [lapsed], timeout: 2)
        XCTAssertFalse(handoff.isLeaving(id))
        XCTAssertTrue(handoff.canMove(id), "it can move again")
        XCTAssertFalse(arrived)
    }
}
#endif
