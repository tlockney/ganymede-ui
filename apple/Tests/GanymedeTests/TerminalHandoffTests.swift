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
        handoff.unregister(id, transport: transport)
        XCTAssertFalse(arrived, "the new place waits for the view to leave")
        let view = NSObject(), coordinator = NSObject()
        var closed = false
        handoff.park(id, view: view, coordinator: coordinator) { closed = true }
        XCTAssertFalse(arrived, "not during the update that parked it")
        let turn = expectation(description: "next turn")
        DispatchQueue.main.async { turn.fulfill() }
        wait(for: [turn], timeout: 2)
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
        let first = EchoTransport()
        handoff.register(id, target: here, transport: first, title: "")
        // A late unregister from another place with the same id is ignored.
        handoff.unregister(id, transport: EchoTransport())
        XCTAssertTrue(handoff.canMove(id))
        handoff.unregister(id, transport: first)
        XCTAssertFalse(handoff.canMove(id), "a closed or ended terminal can't move")
    }

    /// A timer from an earlier move never ends a later one (#609 review).
    func testAnEarlierMovesTimerLeavesALaterMoveAlone() {
        let handoff = TerminalHandoff()
        handoff.timeout = 0.2
        let id = UUID()
        let view = NSObject(), coordinator = NSObject()
        handoff.register(id, target: here, transport: EchoTransport(), title: "")
        XCTAssertTrue(handoff.move(id) {})
        var closed = false
        handoff.park(id, view: view, coordinator: coordinator) { closed = true }
        XCTAssertTrue(handoff.takeView(id) === view)
        // Moved back with the same view, its first timer still pending.
        let later = expectation(description: "first timer passed")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            XCTAssertTrue(handoff.move(id) {})
            handoff.park(id, view: view, coordinator: coordinator) { closed = true }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { later.fulfill() }
        }
        wait(for: [later], timeout: 2)
        XCTAssertFalse(closed, "the first move's timer closed the second move's terminal")
        XCTAssertTrue(handoff.takeView(id) === view)
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
